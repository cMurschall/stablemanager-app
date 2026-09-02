import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  CreateAccommodationSchema,
  UpdateAccommodationSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { accommodations, horses } from "../db/schema";
import { id } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const housingRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

housingRoutes.use("*", authMiddleware);

function normalizeCapacity(
  kind: "box" | "paddock_box" | "paddock" | "pasture",
  capacity: number | null | undefined,
): number | null {
  if (kind === "box") return 1;
  return capacity ?? null;
}

housingRoutes.get("/accommodations", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(accommodations)
    .where(eq(accommodations.tenantId, c.get("tenantId")))
    .all();
  return c.json({ accommodations: rows });
});

housingRoutes.post(
  "/accommodations",
  requireRoles("hof_admin"),
  async (c) => {
    const body = CreateAccommodationSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json(
        { error: "Ungültige Anfrage", details: body.error.flatten() },
        400,
      );
    }
    if (body.data.active === false && c.get("role") !== "hof_admin") {
      return c.json({ error: "Nur der Hof-Admin kann Unterbringungen aktiv oder inaktiv anlegen" }, 403);
    }

    const db = createDb(c.env);
    const row = {
      id: id(),
      tenantId: c.get("tenantId"),
      name: body.data.name,
      kind: body.data.kind,
      capacity: normalizeCapacity(body.data.kind, body.data.capacity),
      active: body.data.active ?? true,
      notes: body.data.notes ?? null,
    };
    await db.insert(accommodations).values(row);
    return c.json({ accommodation: row }, 201);
  },
);

housingRoutes.patch(
  "/accommodations/:id",
  requireRoles("hof_admin"),
  async (c) => {
    const body = UpdateAccommodationSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json(
        { error: "Ungültige Anfrage", details: body.error.flatten() },
        400,
      );
    }

    const accommodationId = routeParam(c, "id");
    const db = createDb(c.env);
    const existing = await db
      .select()
      .from(accommodations)
      .where(
        and(
          eq(accommodations.id, accommodationId),
          eq(accommodations.tenantId, c.get("tenantId")),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Unterbringung nicht gefunden" }, 404);
    }

    if (body.data.active === false && existing.active) {
      const occupied = await db
        .select({ id: horses.id })
        .from(horses)
        .where(and(eq(horses.accommodationId, existing.id), eq(horses.active, true)))
        .get();
      if (occupied) {
        return c.json({ error: "Zuerst alle Pferde in eine andere Unterbringung umquartieren" }, 400);
      }
    }

    const kind = body.data.kind ?? existing.kind;
    const capacity =
      body.data.capacity !== undefined
        ? normalizeCapacity(kind, body.data.capacity)
        : body.data.kind
          ? normalizeCapacity(kind, existing.capacity)
          : existing.capacity;

    const patch = { ...body.data, capacity };
    await db
      .update(accommodations)
      .set(patch)
      .where(eq(accommodations.id, existing.id));
    return c.json({ accommodation: { ...existing, ...patch } });
  },
);

housingRoutes.delete(
  "/accommodations/:id",
  requireRoles("hof_admin"),
  async (c) => {
    const accommodationId = routeParam(c, "id");
    const db = createDb(c.env);
    const existing = await db
      .select()
      .from(accommodations)
      .where(
        and(
          eq(accommodations.id, accommodationId),
          eq(accommodations.tenantId, c.get("tenantId")),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Unterbringung nicht gefunden" }, 404);
    }

    await db
      .delete(accommodations)
      .where(eq(accommodations.id, existing.id));
    return c.json({ ok: true });
  },
);
