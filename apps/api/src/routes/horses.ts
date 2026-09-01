import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  CreateHorseSchema,
  PaginationSchema,
  UpdateHorseSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { horseOwners, horses } from "../db/schema";
import {
  listAccommodationHistory,
  recordAccommodationChange,
} from "../lib/accommodationHistory";
import { id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { canWriteStaff, isBoarderOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";
import { horseOwnerAccess, horseOwnerIds, isHorseOwner, ownersAreTenantMembers } from "../lib/horseOwnership";

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
    conditions.push(horseOwnerAccess(horses.id, tenantId, userId));
  }

  const rows = await db
    .select()
    .from(horses)
    .where(and(...conditions))
    .orderBy(asc(horses.name))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const ownerIds = await horseOwnerIds(db, tenantId, rows.map((horse) => horse.id));

  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(horses)
    .where(and(...conditions))
    .get();

  return c.json({
    horses: rows.map((horse) => ({ ...horse, ownerUserIds: ownerIds.get(horse.id) ?? [] })),
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

  if (isBoarderOnly(c.get("role")) && !(await isHorseOwner(db, c.get("tenantId"), horse.id, c.get("userId")))) {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }

  const accommodationHistory = await listAccommodationHistory(db, horse.id);
  const ownerIds = await horseOwnerIds(db, c.get("tenantId"), [horse.id]);
  return c.json({ horse: { ...horse, ownerUserIds: ownerIds.get(horse.id) ?? [] }, accommodationHistory });
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

  if (isBoarderOnly(c.get("role")) && !(await isHorseOwner(db, c.get("tenantId"), horse.id, c.get("userId")))) {
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
    accommodationId: body.data.accommodationId ?? null,
    notes: body.data.notes ?? null,
  };

  const ownerUserIds = [...new Set(body.data.ownerUserIds)];
  if (!(await ownersAreTenantMembers(db, row.tenantId, ownerUserIds))) {
    return c.json({ error: "Besitzer muss Mitglied dieses Hofs sein" }, 400);
  }

  try {
    await db.insert(horses).values(row);
    if (ownerUserIds.length) {
      await db.insert(horseOwners).values(ownerUserIds.map((userId) => ({ horseId: row.id, tenantId: row.tenantId, userId })));
    }
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

  return c.json({ horse: { ...row, ownerUserIds } }, 201);
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
  const ownerUserIds = body.data.ownerUserIds === undefined
    ? undefined
    : [...new Set(body.data.ownerUserIds)];
  if (ownerUserIds && !(await ownersAreTenantMembers(db, existing.tenantId, ownerUserIds))) {
    return c.json({ error: "Besitzer muss Mitglied dieses Hofs sein" }, 400);
  }
  const { ownerUserIds: _ownerUserIds, ...horsePatch } = body.data;
  try {
    await db
      .update(horses)
      .set({ ...horsePatch, updatedAt })
      .where(eq(horses.id, existing.id));
    if (ownerUserIds !== undefined) {
      await db.delete(horseOwners).where(eq(horseOwners.horseId, existing.id));
      if (ownerUserIds.length) {
        await db.insert(horseOwners).values(ownerUserIds.map((userId) => ({ horseId: existing.id, tenantId: existing.tenantId, userId })));
      }
    }
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

  const responseOwnerIds = ownerUserIds ?? (await horseOwnerIds(db, existing.tenantId, [existing.id])).get(existing.id) ?? [];
  return c.json({ horse: { ...existing, ...horsePatch, ownerUserIds: responseOwnerIds, updatedAt } });
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
