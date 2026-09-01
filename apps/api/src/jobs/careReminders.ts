import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Env } from "../env";
import { createDb } from "../db/client";
import {
  careEvents,
  horses,
  memberships,
  notifications,
} from "../db/schema";
import { id, nowIso } from "../lib/crypto";
import { horseOwnerIds } from "../lib/horseOwnership";

const TYPE_LABEL: Record<string, string> = {
  farrier: "Hufschmied",
  vaccination: "Impfung",
};

/**
 * Daily cron: create in-app notifications for due care events
 * that don't already have a notification for staff/admins/owners.
 */
export async function runCareReminders(env: Env): Promise<{ created: number }> {
  const db = createDb(env);
  const now = nowIso();

  const due = await db
    .select({
      id: careEvents.id,
      tenantId: careEvents.tenantId,
      horseId: careEvents.horseId,
      type: careEvents.type,
      dueAt: careEvents.dueAt,
      horseName: horses.name,
    })
    .from(careEvents)
    .innerJoin(horses, eq(careEvents.horseId, horses.id))
    .where(and(isNull(careEvents.doneAt), lte(careEvents.dueAt, now)))
    .limit(200)
    .all();

  let created = 0;

  for (const event of due) {
    const existing = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.careEventId, event.id),
          eq(notifications.kind, "care_due"),
        ),
      )
      .get();

    if ((existing?.count ?? 0) > 0) {
      continue;
    }

    const recipients = await db
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.tenantId, event.tenantId))
      .all();
    const ownerIds = (await horseOwnerIds(db, event.tenantId, [event.horseId])).get(event.horseId) ?? [];

    const label = TYPE_LABEL[event.type] ?? event.type;
    const title = `${label}: ${event.horseName}`;
    const body = `Fällig seit ${new Date(event.dueAt).toLocaleDateString("de-DE")}`;

    for (const member of recipients) {
      if (
        member.role === "boarder" &&
        !ownerIds.includes(member.userId)
      ) {
        continue;
      }

      await db.insert(notifications).values({
        id: id(),
        tenantId: event.tenantId,
        userId: member.userId,
        kind: "care_due",
        title,
        body,
        careEventId: event.id,
      });
      created += 1;
    }
  }

  return { created };
}
