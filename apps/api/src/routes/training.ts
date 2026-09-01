import { Hono } from "hono";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  CreateTrainingLogSchema,
  UpdateTrainingLogSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { horses, trainingLogs, users } from "../db/schema";
import { id } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { isBoarderOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";
import { horseOwnerAccess } from "../lib/horseOwnership";

const LocalDateRe = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export const trainingRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

trainingRoutes.use("*", authMiddleware);

trainingRoutes.get("/", async (c) => {
  const date = c.req.query("date");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const horseId = c.req.query("horseId");

  let rangeFrom: string;
  let rangeTo: string;

  if (date) {
    if (!LocalDateRe.test(date)) {
      return c.json({ error: "Ungültiges Datum" }, 400);
    }
    rangeFrom = date;
    rangeTo = date;
  } else if (from && to) {
    if (!LocalDateRe.test(from) || !LocalDateRe.test(to)) {
      return c.json({ error: "Ungültiger Zeitraum" }, 400);
    }
    if (from > to) {
      return c.json({ error: "Von-Datum muss vor Bis-Datum liegen" }, 400);
    }
    if (daysBetween(from, to) > 31) {
      return c.json({ error: "Zeitraum maximal 31 Tage" }, 400);
    }
    rangeFrom = from;
    rangeTo = to;
  } else {
    return c.json({ error: "date oder from+to angeben" }, 400);
  }

  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const conditions = [
    eq(trainingLogs.tenantId, tenantId),
    gte(trainingLogs.date, rangeFrom),
    lte(trainingLogs.date, rangeTo),
  ];

  if (horseId) {
    conditions.push(eq(trainingLogs.horseId, horseId));
  }

  if (isBoarderOnly(role)) {
    conditions.push(horseOwnerAccess(horses.id, tenantId, userId));
  }

  const rows = await db
    .select({
      id: trainingLogs.id,
      tenantId: trainingLogs.tenantId,
      horseId: trainingLogs.horseId,
      date: trainingLogs.date,
      type: trainingLogs.type,
      notes: trainingLogs.notes,
      createdBy: trainingLogs.createdBy,
      createdAt: trainingLogs.createdAt,
      horseName: horses.name,
      createdByName: users.name,
    })
    .from(trainingLogs)
    .innerJoin(horses, eq(trainingLogs.horseId, horses.id))
    .leftJoin(users, eq(trainingLogs.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(asc(trainingLogs.date), asc(horses.name), desc(trainingLogs.createdAt))
    .all();

  return c.json({ trainingLogs: rows });
});

trainingRoutes.post("/", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CreateTrainingLogSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const horse = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, body.data.horseId), eq(horses.tenantId, tenantId)))
    .get();

  if (!horse) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  const row = {
    id: id(),
    tenantId,
    horseId: body.data.horseId,
    date: body.data.date,
    type: body.data.type,
    notes: body.data.notes ?? null,
    createdBy: c.get("userId"),
  };
  await db.insert(trainingLogs).values(row);

  return c.json(
    {
      trainingLog: {
        ...row,
        horseName: horse.name,
        createdByName: c.get("name") ?? null,
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});

trainingRoutes.patch("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const body = UpdateTrainingLogSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const logId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(trainingLogs)
    .where(
      and(
        eq(trainingLogs.id, logId),
        eq(trainingLogs.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Eintrag nicht gefunden" }, 404);
  }

  const patch = {
    ...(body.data.date !== undefined ? { date: body.data.date } : {}),
    ...(body.data.type !== undefined ? { type: body.data.type } : {}),
    ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
  };

  await db.update(trainingLogs).set(patch).where(eq(trainingLogs.id, existing.id));

  return c.json({ trainingLog: { ...existing, ...patch } });
});

trainingRoutes.delete("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const logId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(trainingLogs)
    .where(
      and(
        eq(trainingLogs.id, logId),
        eq(trainingLogs.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Eintrag nicht gefunden" }, 404);
  }

  await db.delete(trainingLogs).where(eq(trainingLogs.id, existing.id));
  return c.json({ ok: true });
});
