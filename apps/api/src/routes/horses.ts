import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  CreateHorseSchema,
  PaginationSchema,
  UpdateHorseSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { horses } from "../db/schema";
import {
  listAccommodationHistory,
  recordAccommodationChange,
} from "../lib/accommodationHistory";
import { id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { canWriteStaff, isBoarderOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const horseRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

horseRoutes.use("*", authMiddleware);

horseRoutes.get("/", async (c) => {
  const pagination = PaginationSchema.parse({
    limit: c.req.query("limit") ?? 50,
    offset: c.req.query("offset") ?? 0,
  });
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const conditions = [eq(horses.tenantId, tenantId)];
  if (isBoarderOnly(role)) {
    conditions.push(eq(horses.ownerUserId, userId));
  }

  const rows = await db
    .select()
    .from(horses)
    .where(and(...conditions))
    .orderBy(asc(horses.name))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(horses)
    .where(and(...conditions))
    .get();

  return c.json({
    horses: rows,
    total: countRow?.count ?? 0,
    limit: pagination.limit,
    offset: pagination.offset,
  });
});

horseRoutes.get("/:id", async (c) => {
  const horseId = routeParam(c, "id");
  const db = createDb(c.env);
  const horse = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, horseId), eq(horses.tenantId, c.get("tenantId"))))
    .get();

  if (!horse) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  if (isBoarderOnly(c.get("role")) && horse.ownerUserId !== c.get("userId")) {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }

  const accommodationHistory = await listAccommodationHistory(db, horse.id);
  return c.json({ horse, accommodationHistory });
});

horseRoutes.get("/:id/accommodation-history", async (c) => {
  const horseId = routeParam(c, "id");
  const db = createDb(c.env);
  const horse = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, horseId), eq(horses.tenantId, c.get("tenantId"))))
    .get();

  if (!horse) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  if (isBoarderOnly(c.get("role")) && horse.ownerUserId !== c.get("userId")) {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }

  const accommodationHistory = await listAccommodationHistory(db, horse.id);
  return c.json({ accommodationHistory });
});

horseRoutes.post("/", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CreateHorseSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const row = {
    id: id(),
    tenantId: c.get("tenantId"),
    name: body.data.name,
    feifId: body.data.feifId ?? null,
    sex: body.data.sex ?? null,
    birthYear: body.data.birthYear ?? null,
    ownerUserId: body.data.ownerUserId ?? null,
    accommodationId: body.data.accommodationId ?? null,
    notes: body.data.notes ?? null,
  };

  try {
    await db.insert(horses).values(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return c.json({ error: "FEIF-ID bereits vergeben" }, 409);
    }
    throw e;
  }

  if (row.accommodationId) {
    await recordAccommodationChange(db, {
      tenantId: row.tenantId,
      horseId: row.id,
      fromAccommodationId: null,
      toAccommodationId: row.accommodationId,
      changedBy: c.get("userId"),
    });
  }

  return c.json({ horse: row }, 201);
});

horseRoutes.patch("/:id", async (c) => {
  if (!canWriteStaff(c.get("role"))) {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }

  const body = UpdateHorseSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const horseId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, horseId), eq(horses.tenantId, c.get("tenantId"))))
    .get();

  if (!existing) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  const updatedAt = nowIso();
  try {
    await db
      .update(horses)
      .set({ ...body.data, updatedAt })
      .where(eq(horses.id, existing.id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return c.json({ error: "FEIF-ID bereits vergeben" }, 409);
    }
    throw e;
  }

  if (
    body.data.accommodationId !== undefined &&
    body.data.accommodationId !== existing.accommodationId
  ) {
    await recordAccommodationChange(db, {
      tenantId: existing.tenantId,
      horseId: existing.id,
      fromAccommodationId: existing.accommodationId,
      toAccommodationId: body.data.accommodationId,
      changedBy: c.get("userId"),
      at: updatedAt,
    });
  }

  return c.json({ horse: { ...existing, ...body.data, updatedAt } });
});

horseRoutes.delete("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const horseId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, horseId), eq(horses.tenantId, c.get("tenantId"))))
    .get();

  if (!existing) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  await db.delete(horses).where(eq(horses.id, existing.id));
  return c.json({ ok: true });
});
