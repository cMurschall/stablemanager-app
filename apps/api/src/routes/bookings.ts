import { Hono } from "hono";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { CreateBookingSchema, UpdateBookingSchema } from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  bookingParticipants,
  bookings,
  memberships,
  resources,
  users,
} from "../db/schema";
import { id } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const bookingRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

bookingRoutes.use("*", authMiddleware);

async function validateParticipants(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  participantUserIds: string[],
) {
  const ids = [...new Set(participantUserIds)];
  if (!ids.length) return ids;

  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        inArray(memberships.userId, ids),
        inArray(memberships.role, ["staff", "boarder"]),
      ),
    )
    .all();

  if (rows.length !== ids.length) return null;
  return ids;
}

bookingRoutes.get("/", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) {
    return c.json({ error: "from und to (ISO) erforderlich" }, 400);
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return c.json({ error: "Ungültiger Zeitraum" }, 400);
  }
  if (toDate.getTime() - fromDate.getTime() > 14 * 86_400_000) {
    return c.json({ error: "Zeitraum max. 14 Tage" }, 400);
  }

  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const resourceId = c.req.query("resourceId");

  const conditions = [
    eq(bookings.tenantId, tenantId),
    gte(bookings.startsAt, fromDate.toISOString()),
    lt(bookings.startsAt, toDate.toISOString()),
  ];
  if (resourceId) {
    conditions.push(eq(bookings.resourceId, resourceId));
  }

  const rows = await db
    .select({
      id: bookings.id,
      tenantId: bookings.tenantId,
      resourceId: bookings.resourceId,
      title: bookings.title,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      notes: bookings.notes,
      createdBy: bookings.createdBy,
      createdAt: bookings.createdAt,
      resourceName: resources.name,
      resourceKind: resources.kind,
    })
    .from(bookings)
    .innerJoin(resources, eq(bookings.resourceId, resources.id))
    .where(and(...conditions))
    .orderBy(asc(bookings.startsAt))
    .limit(200)
    .all();

  const participantRows = rows.length
    ? await db
        .select({
          bookingId: bookingParticipants.bookingId,
          userId: bookingParticipants.userId,
          name: users.name,
        })
        .from(bookingParticipants)
        .innerJoin(users, eq(bookingParticipants.userId, users.id))
        .where(inArray(bookingParticipants.bookingId, rows.map((row) => row.id)))
        .all()
    : [];
  const participantsByBooking = new Map<string, typeof participantRows>();
  for (const participant of participantRows) {
    const list = participantsByBooking.get(participant.bookingId) ?? [];
    list.push(participant);
    participantsByBooking.set(participant.bookingId, list);
  }

  const isBoarder = c.get("role") === "boarder";
  const userId = c.get("userId");
  return c.json({
    bookings: rows.map((row) => {
      const participants = participantsByBooking.get(row.id) ?? [];
      const isParticipant = participants.some((participant) => participant.userId === userId);
      const showDetails = !isBoarder || isParticipant;
      return {
        ...row,
        title: showDetails ? row.title : "Belegt",
        notes: showDetails ? row.notes : null,
        participantUserIds: showDetails
          ? participants.map((participant) => participant.userId)
          : [],
        participantNames: showDetails
          ? participants.map((participant) => participant.name)
          : [],
        isParticipant,
      };
    }),
  });
});

bookingRoutes.post("/", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CreateBookingSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  if (new Date(body.data.endsAt) <= new Date(body.data.startsAt)) {
    return c.json({ error: "Ende muss nach Start liegen" }, 400);
  }

  const db = createDb(c.env);
  const resource = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.id, body.data.resourceId),
        eq(resources.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!resource) {
    return c.json({ error: "Ressource nicht gefunden" }, 404);
  }

  const participantUserIds = await validateParticipants(
    db,
    c.get("tenantId"),
    body.data.participantUserIds,
  );
  if (!participantUserIds) {
    return c.json({ error: "Teilnehmende mÃ¼ssen Mitarbeiter oder Einsteller dieses Hofs sein" }, 400);
  }

  const overlap = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, c.get("tenantId")),
        eq(bookings.resourceId, body.data.resourceId),
        sql`${bookings.startsAt} < ${body.data.endsAt}`,
        sql`${bookings.endsAt} > ${body.data.startsAt}`,
      ),
    )
    .get();

  if ((overlap?.count ?? 0) > 0) {
    return c.json({ error: "Zeitraum bereits belegt" }, 409);
  }

  const row = {
    id: id(),
    tenantId: c.get("tenantId"),
    resourceId: body.data.resourceId,
    title: body.data.title,
    startsAt: body.data.startsAt,
    endsAt: body.data.endsAt,
    horseId: null,
    notes: body.data.notes ?? null,
    createdBy: c.get("userId"),
  };
  await db.insert(bookings).values(row);
  if (participantUserIds.length) {
    await db.insert(bookingParticipants).values(
      participantUserIds.map((userId) => ({ bookingId: row.id, userId })),
    );
  }
  return c.json({ booking: { ...row, participantUserIds } }, 201);
});

bookingRoutes.patch("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const body = UpdateBookingSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const bookingId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Buchung nicht gefunden" }, 404);
  }

  const startsAt = body.data.startsAt ?? existing.startsAt;
  const endsAt = body.data.endsAt ?? existing.endsAt;
  const resourceId = body.data.resourceId ?? existing.resourceId;

  if (new Date(endsAt) <= new Date(startsAt)) {
    return c.json({ error: "Ende muss nach Start liegen" }, 400);
  }

  const overlap = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, c.get("tenantId")),
        eq(bookings.resourceId, resourceId),
        ne(bookings.id, existing.id),
        sql`${bookings.startsAt} < ${endsAt}`,
        sql`${bookings.endsAt} > ${startsAt}`,
      ),
    )
    .get();

  if ((overlap?.count ?? 0) > 0) {
    return c.json({ error: "Zeitraum bereits belegt" }, 409);
  }

  const { participantUserIds, ...bookingPatch } = body.data;
  if (participantUserIds !== undefined) {
    const validParticipants = await validateParticipants(
      db,
      c.get("tenantId"),
      participantUserIds,
    );
    if (!validParticipants) {
      return c.json({ error: "Teilnehmende mÃ¼ssen Mitarbeiter oder Einsteller dieses Hofs sein" }, 400);
    }
    await db.delete(bookingParticipants).where(eq(bookingParticipants.bookingId, existing.id));
    if (validParticipants.length) {
      await db.insert(bookingParticipants).values(
        validParticipants.map((userId) => ({ bookingId: existing.id, userId })),
      );
    }
  }
  if (Object.keys(bookingPatch).length) {
    await db.update(bookings).set(bookingPatch).where(eq(bookings.id, existing.id));
  }
  return c.json({ booking: { ...existing, ...bookingPatch, participantUserIds } });
});

bookingRoutes.delete("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const bookingId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Buchung nicht gefunden" }, 404);
  }

  await db.delete(bookings).where(eq(bookings.id, existing.id));
  return c.json({ ok: true });
});
