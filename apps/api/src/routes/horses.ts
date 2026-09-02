import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  CreateHorseSchema,
  PaginationSchema,
  UpdateHorseSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { accommodations, horseOwners, horses, users } from "../db/schema";
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

  const activeParam = c.req.query("active");
  const conditions = [eq(horses.tenantId, tenantId)];

  if (activeParam === "0" || activeParam === "false") {
    if (role !== "hof_admin") {
      return c.json({ error: "Keine Berechtigung" }, 403);
    }
    conditions.push(eq(horses.active, false));
  } else {
    conditions.push(eq(horses.active, true));
  }

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

  if (!horse.active && c.get("role") !== "hof_admin") {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  const accommodationHistory = await listAccommodationHistory(db, horse.id);
  const ownerIds = await horseOwnerIds(db, c.get("tenantId"), [horse.id]);
  const ownerNames = await db
    .select({ name: users.name })
    .from(horseOwners)
    .innerJoin(users, eq(horseOwners.userId, users.id))
    .where(and(eq(horseOwners.horseId, horse.id), eq(horseOwners.tenantId, c.get("tenantId"))))
    .orderBy(asc(users.name))
    .all();
  return c.json({ horse: { ...horse, ownerUserIds: ownerIds.get(horse.id) ?? [], ownerNames: ownerNames.map((owner) => owner.name) }, accommodationHistory });
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

  if (!horse.active && c.get("role") !== "hof_admin") {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  const accommodationHistory = await listAccommodationHistory(db, horse.id);
  return c.json({ accommodationHistory });
});

horseRoutes.post("/", requireRoles("hof_admin"), async (c) => {
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
    active: true,
  };

  const ownerUserIds = [...new Set(body.data.ownerUserIds)];
  if (!(await ownersAreTenantMembers(db, row.tenantId, ownerUserIds))) {
    return c.json({ error: "Besitzer muss Mitglied dieses Hofs sein" }, 400);
  }
  if (row.accommodationId) {
    const accommodation = await db.select({ active: accommodations.active }).from(accommodations).where(and(eq(accommodations.id, row.accommodationId), eq(accommodations.tenantId, row.tenantId))).get();
    if (!accommodation?.active) return c.json({ error: "Unterbringung ist nicht aktiv" }, 400);
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
  const role = c.get("role");
  if (!canWriteStaff(role)) {
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

  if (role === "staff") {
    const keys = Object.keys(body.data).filter((key) => body.data[key as keyof typeof body.data] !== undefined);
    if (keys.length !== 1 || keys[0] !== "accommodationId") {
      return c.json({ error: "Mitarbeiter dürfen nur die Unterbringung ändern" }, 403);
    }
    if (!existing.active) {
      return c.json({ error: "Pferd nicht gefunden" }, 404);
    }
  }

  if (body.data.active !== undefined && role !== "hof_admin") {
    return c.json({ error: "Nur der Hof-Admin kann Pferde aktivieren oder deaktivieren" }, 403);
  }

  const updatedAt = nowIso();
  const ownerUserIds = body.data.ownerUserIds === undefined
    ? undefined
    : [...new Set(body.data.ownerUserIds)];
  if (ownerUserIds && !(await ownersAreTenantMembers(db, existing.tenantId, ownerUserIds))) {
    return c.json({ error: "Besitzer muss Mitglied dieses Hofs sein" }, 400);
  }

  const deactivating = body.data.active === false && existing.active;
  let nextAccommodationId =
    body.data.accommodationId !== undefined
      ? body.data.accommodationId
      : existing.accommodationId;

  if (deactivating) {
    nextAccommodationId = null;
  }

  if (
    nextAccommodationId &&
    nextAccommodationId !== existing.accommodationId
  ) {
    const accommodation = await db
      .select({ active: accommodations.active })
      .from(accommodations)
      .where(and(eq(accommodations.id, nextAccommodationId), eq(accommodations.tenantId, existing.tenantId)))
      .get();
    if (!accommodation?.active) return c.json({ error: "Unterbringung ist nicht aktiv" }, 400);
  }

  const { ownerUserIds: _ownerUserIds, ...horsePatch } = body.data;
  const patch = {
    ...horsePatch,
    ...(deactivating ? { accommodationId: null as string | null } : {}),
    updatedAt,
  };

  try {
    await db
      .update(horses)
      .set(patch)
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

  if (nextAccommodationId !== existing.accommodationId) {
    await recordAccommodationChange(db, {
      tenantId: existing.tenantId,
      horseId: existing.id,
      fromAccommodationId: existing.accommodationId,
      toAccommodationId: nextAccommodationId,
      changedBy: c.get("userId"),
      at: updatedAt,
    });
  }

  const responseOwnerIds = ownerUserIds ?? (await horseOwnerIds(db, existing.tenantId, [existing.id])).get(existing.id) ?? [];
  return c.json({
    horse: {
      ...existing,
      ...patch,
      ownerUserIds: responseOwnerIds,
      updatedAt,
    },
  });
});

horseRoutes.delete("/:id", requireRoles("hof_admin"), async (c) => {
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
