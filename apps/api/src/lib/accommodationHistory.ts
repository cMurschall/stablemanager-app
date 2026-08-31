import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { accommodations, horseAccommodationHistory } from "../db/schema";
import { id, nowIso } from "./crypto";

/** Close open period and open a new one when accommodation changes. */
export async function recordAccommodationChange(
  db: Db,
  opts: {
    tenantId: string;
    horseId: string;
    fromAccommodationId: string | null | undefined;
    toAccommodationId: string | null | undefined;
    changedBy: string | null;
    at?: string;
  },
) {
  const from = opts.fromAccommodationId ?? null;
  const to = opts.toAccommodationId ?? null;
  if (from === to) return;

  const at = opts.at ?? nowIso();

  const open = await db
    .select()
    .from(horseAccommodationHistory)
    .where(
      and(
        eq(horseAccommodationHistory.horseId, opts.horseId),
        isNull(horseAccommodationHistory.endedAt),
      ),
    )
    .get();

  if (open) {
    await db
      .update(horseAccommodationHistory)
      .set({ endedAt: at })
      .where(eq(horseAccommodationHistory.id, open.id));
  }

  await db.insert(horseAccommodationHistory).values({
    id: id(),
    tenantId: opts.tenantId,
    horseId: opts.horseId,
    accommodationId: to,
    startedAt: at,
    endedAt: null,
    changedBy: opts.changedBy,
  });
}

export async function listAccommodationHistory(db: Db, horseId: string) {
  return db
    .select({
      id: horseAccommodationHistory.id,
      horseId: horseAccommodationHistory.horseId,
      accommodationId: horseAccommodationHistory.accommodationId,
      accommodationName: accommodations.name,
      accommodationKind: accommodations.kind,
      startedAt: horseAccommodationHistory.startedAt,
      endedAt: horseAccommodationHistory.endedAt,
      changedBy: horseAccommodationHistory.changedBy,
    })
    .from(horseAccommodationHistory)
    .leftJoin(
      accommodations,
      eq(horseAccommodationHistory.accommodationId, accommodations.id),
    )
    .where(eq(horseAccommodationHistory.horseId, horseId))
    .orderBy(desc(horseAccommodationHistory.startedAt))
    .all();
}
