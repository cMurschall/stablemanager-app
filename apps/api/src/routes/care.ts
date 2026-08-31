import { Hono } from "hono";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  CompleteCareEventSchema,
  CreateCareEventSchema,
  PaginationSchema,
  UpdateCareEventSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { careEvents, horses } from "../db/schema";
import { addDays, id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { isOwnerOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const careRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

careRoutes.use("*", authMiddleware);

careRoutes.get("/", async (c) => {
  const pagination = PaginationSchema.parse({
    limit: c.req.query("limit") ?? 50,
    offset: c.req.query("offset") ?? 0,
  });
  const status = c.req.query("status") ?? "open";
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const conditions = [eq(careEvents.tenantId, tenantId)];
  if (status === "open") {
    conditions.push(isNull(careEvents.doneAt));
  } else if (status === "done") {
    conditions.push(sql`${careEvents.doneAt} IS NOT NULL`);
  }

  if (isOwnerOnly(role)) {
    conditions.push(eq(horses.ownerUserId, userId));
  }

  const rows = await db
    .select({
      id: careEvents.id,
      tenantId: careEvents.tenantId,
      horseId: careEvents.horseId,
      type: careEvents.type,
      dueAt: careEvents.dueAt,
      doneAt: careEvents.doneAt,
      intervalDays: careEvents.intervalDays,
      notes: careEvents.notes,
      createdAt: careEvents.createdAt,
      horseName: horses.name,
    })
    .from(careEvents)
    .innerJoin(horses, eq(careEvents.horseId, horses.id))
    .where(and(...conditions))
    .orderBy(asc(careEvents.dueAt))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  return c.json({
    careEvents: rows,
    limit: pagination.limit,
    offset: pagination.offset,
  });
});

careRoutes.post("/", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CreateCareEventSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const horse = await db
    .select()
    .from(horses)
    .where(
      and(
        eq(horses.id, body.data.horseId),
        eq(horses.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!horse) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  const row = {
    id: id(),
    tenantId: c.get("tenantId"),
    horseId: body.data.horseId,
    type: body.data.type,
    dueAt: body.data.dueAt,
    intervalDays: body.data.intervalDays ?? null,
    notes: body.data.notes ?? null,
  };
  await db.insert(careEvents).values(row);
  return c.json({ careEvent: row }, 201);
});

careRoutes.patch("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const body = UpdateCareEventSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const eventId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(careEvents)
    .where(
      and(
        eq(careEvents.id, eventId),
        eq(careEvents.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Termin nicht gefunden" }, 404);
  }

  await db
    .update(careEvents)
    .set(body.data)
    .where(eq(careEvents.id, existing.id));

  return c.json({ careEvent: { ...existing, ...body.data } });
});

careRoutes.post(
  "/:id/complete",
  requireRoles("hof_admin", "staff"),
  async (c) => {
    const body = CompleteCareEventSchema.safeParse(
      (await c.req.json().catch(() => ({}))) ?? {},
    );
    if (!body.success) {
      return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
    }

    const eventId = routeParam(c, "id");
    const db = createDb(c.env);
    const existing = await db
      .select()
      .from(careEvents)
      .where(
        and(
          eq(careEvents.id, eventId),
          eq(careEvents.tenantId, c.get("tenantId")),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Termin nicht gefunden" }, 404);
    }

    const doneAt = body.data.doneAt ?? nowIso();
    await db
      .update(careEvents)
      .set({ doneAt })
      .where(eq(careEvents.id, existing.id));

    let next = null;
    if (body.data.createNext && existing.intervalDays) {
      next = {
        id: id(),
        tenantId: existing.tenantId,
        horseId: existing.horseId,
        type: existing.type,
        dueAt: addDays(existing.intervalDays, new Date(doneAt)),
        intervalDays: existing.intervalDays,
        notes: existing.notes,
      };
      await db.insert(careEvents).values(next);
    }

    return c.json({
      careEvent: { ...existing, doneAt },
      next,
    });
  },
);

careRoutes.delete("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const eventId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(careEvents)
    .where(
      and(
        eq(careEvents.id, eventId),
        eq(careEvents.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Termin nicht gefunden" }, 404);
  }

  await db.delete(careEvents).where(eq(careEvents.id, existing.id));
  return c.json({ ok: true });
});
