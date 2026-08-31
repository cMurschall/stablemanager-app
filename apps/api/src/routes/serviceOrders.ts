import { Hono } from "hono";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  CompleteServiceTaskSchema,
  CreateServiceOrderSchema,
  SetServiceSelfDaySchema,
  UpdateServiceOrderSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  farrierSignups,
  farrierVisits,
  horses,
  serviceOrderSelfDays,
  serviceOrders,
  serviceTaskCompletions,
  tenants,
} from "../db/schema";
import { id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { isOwnerOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const serviceOrderRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

serviceOrderRoutes.use("*", authMiddleware);

function isDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addLocalDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateInTimezone(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function findOrder(c: any, orderId: string) {
  const db = createDb(c.env);
  return db
    .select()
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, c.get("tenantId"))))
    .get();
}

async function canManageOrder(c: any, order: typeof serviceOrders.$inferSelect): Promise<boolean> {
  if (c.get("role") === "hof_admin") return true;
  if (!isOwnerOnly(c.get("role"))) return false;
  const db = createDb(c.env);
  const horse = await db
    .select({ ownerUserId: horses.ownerUserId })
    .from(horses)
    .where(and(eq(horses.id, order.horseId), eq(horses.tenantId, c.get("tenantId"))))
    .get();
  return horse?.ownerUserId === c.get("userId");
}

serviceOrderRoutes.get("/", async (c) => {
  if (c.get("role") === "staff") return c.json({ error: "Keine Berechtigung" }, 403);
  const db = createDb(c.env);
  const conditions = [eq(serviceOrders.tenantId, c.get("tenantId"))];
  if (isOwnerOnly(c.get("role"))) conditions.push(eq(horses.ownerUserId, c.get("userId")));
  const rows = await db
    .select({
      id: serviceOrders.id,
      tenantId: serviceOrders.tenantId,
      horseId: serviceOrders.horseId,
      title: serviceOrders.title,
      instructions: serviceOrders.instructions,
      startDate: serviceOrders.startDate,
      endDate: serviceOrders.endDate,
      dailyCount: serviceOrders.dailyCount,
      createdBy: serviceOrders.createdBy,
      cancelledAt: serviceOrders.cancelledAt,
      createdAt: serviceOrders.createdAt,
      horseName: horses.name,
    })
    .from(serviceOrders)
    .innerJoin(horses, eq(serviceOrders.horseId, horses.id))
    .where(and(...conditions))
    .orderBy(asc(serviceOrders.startDate))
    .all();
  const selfDays = await db.select().from(serviceOrderSelfDays).all();
  return c.json({
    serviceOrders: rows.map((order) => ({
      ...order,
      selfDays: selfDays.filter((day) => day.serviceOrderId === order.id).map((day) => day.date),
    })),
  });
});

serviceOrderRoutes.post("/", requireRoles("hof_admin", "horse_owner"), async (c) => {
  const body = CreateServiceOrderSchema.safeParse(await c.req.json());
  if (!body.success || !isDate(body.data?.startDate ?? "") || (body.data?.endDate && !isDate(body.data.endDate))) {
    return c.json({ error: "UngÃ¼ltige Anfrage", details: body.success ? undefined : body.error.flatten() }, 400);
  }
  const db = createDb(c.env);
  const horse = await db.select().from(horses).where(and(eq(horses.id, body.data.horseId), eq(horses.tenantId, c.get("tenantId")))).get();
  if (!horse) return c.json({ error: "Pferd nicht gefunden" }, 404);
  if (isOwnerOnly(c.get("role")) && horse.ownerUserId !== c.get("userId")) return c.json({ error: "Keine Berechtigung" }, 403);
  const tenant = await db.select().from(tenants).where(eq(tenants.id, c.get("tenantId"))).get();
  if (!tenant || body.data.dailyCount > tenant.maxDailyServiceTasks) return c.json({ error: "TÃ¤gliche HÃ¤ufigkeit Ã¼berschreitet das Hof-Limit" }, 400);
  const endDate = body.data.endDate ?? addLocalDays(body.data.startDate, body.data.durationDays! - 1);
  if (endDate < body.data.startDate) return c.json({ error: "Enddatum liegt vor dem Beginn" }, 400);
  const row = { id: id(), tenantId: c.get("tenantId"), horseId: horse.id, title: body.data.title, instructions: body.data.instructions, startDate: body.data.startDate, endDate, dailyCount: body.data.dailyCount, createdBy: c.get("userId"), cancelledAt: null };
  await db.insert(serviceOrders).values(row);
  return c.json({ serviceOrder: { ...row, horseName: horse.name, selfDays: [] } }, 201);
});

serviceOrderRoutes.patch("/:id", requireRoles("hof_admin", "horse_owner"), async (c) => {
  const body = UpdateServiceOrderSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "UngÃ¼ltige Anfrage", details: body.error.flatten() }, 400);
  const existing = await findOrder(c, routeParam(c, "id"));
  if (!existing) return c.json({ error: "Serviceauftrag nicht gefunden" }, 404);
  if (!(await canManageOrder(c, existing))) return c.json({ error: "Keine Berechtigung" }, 403);
  if (existing.cancelledAt) return c.json({ error: "Serviceauftrag wurde storniert" }, 400);
  const db = createDb(c.env);
  const tenant = await db.select().from(tenants).where(eq(tenants.id, c.get("tenantId"))).get();
  if (body.data.dailyCount && body.data.dailyCount > (tenant?.maxDailyServiceTasks ?? 3)) return c.json({ error: "TÃ¤gliche HÃ¤ufigkeit Ã¼berschreitet das Hof-Limit" }, 400);
  if (body.data.endDate && (!isDate(body.data.endDate) || body.data.endDate < existing.startDate)) return c.json({ error: "UngÃ¼ltiges Enddatum" }, 400);
  await db.update(serviceOrders).set(body.data).where(eq(serviceOrders.id, existing.id));
  return c.json({ serviceOrder: { ...existing, ...body.data } });
});

serviceOrderRoutes.post("/:id/cancel", requireRoles("hof_admin", "horse_owner"), async (c) => {
  const existing = await findOrder(c, routeParam(c, "id"));
  if (!existing) return c.json({ error: "Serviceauftrag nicht gefunden" }, 404);
  if (!(await canManageOrder(c, existing))) return c.json({ error: "Keine Berechtigung" }, 403);
  await createDb(c.env).update(serviceOrders).set({ cancelledAt: nowIso() }).where(eq(serviceOrders.id, existing.id));
  return c.json({ ok: true });
});

serviceOrderRoutes.put("/:id/self-days", requireRoles("hof_admin", "horse_owner"), async (c) => {
  const body = SetServiceSelfDaySchema.safeParse(await c.req.json());
  if (!body.success || !isDate(body.data?.date ?? "")) return c.json({ error: "UngÃ¼ltige Anfrage" }, 400);
  const existing = await findOrder(c, routeParam(c, "id"));
  if (!existing) return c.json({ error: "Serviceauftrag nicht gefunden" }, 404);
  if (!(await canManageOrder(c, existing))) return c.json({ error: "Keine Berechtigung" }, 403);
  if (existing.cancelledAt || body.data.date < existing.startDate || body.data.date > existing.endDate) return c.json({ error: "Datum liegt nicht im aktiven Auftragszeitraum" }, 400);
  await createDb(c.env).insert(serviceOrderSelfDays).values({ id: id(), serviceOrderId: existing.id, date: body.data.date }).onConflictDoNothing();
  return c.json({ ok: true });
});

serviceOrderRoutes.delete("/:id/self-days/:date", requireRoles("hof_admin", "horse_owner"), async (c) => {
  const existing = await findOrder(c, routeParam(c, "id"));
  if (!existing) return c.json({ error: "Serviceauftrag nicht gefunden" }, 404);
  if (!(await canManageOrder(c, existing))) return c.json({ error: "Keine Berechtigung" }, 403);
  await createDb(c.env).delete(serviceOrderSelfDays).where(and(eq(serviceOrderSelfDays.serviceOrderId, existing.id), eq(serviceOrderSelfDays.date, routeParam(c, "date"))));
  return c.json({ ok: true });
});

serviceOrderRoutes.get("/daily-tasks", requireRoles("hof_admin", "staff"), async (c) => {
  const date = c.req.query("date") ?? "";
  if (!isDate(date)) return c.json({ error: "UngÃ¼ltiges Datum" }, 400);
  const db = createDb(c.env);
  const orders = await db.select({ order: serviceOrders, horseName: horses.name }).from(serviceOrders).innerJoin(horses, eq(serviceOrders.horseId, horses.id)).where(and(eq(serviceOrders.tenantId, c.get("tenantId")), lte(serviceOrders.startDate, date), gte(serviceOrders.endDate, date))).all();
  const selfDays = await db.select().from(serviceOrderSelfDays).where(eq(serviceOrderSelfDays.date, date)).all();
  const completions = await db.select().from(serviceTaskCompletions).where(eq(serviceTaskCompletions.date, date)).all();
  const serviceTasks = orders.flatMap(({ order, horseName }) => selfDays.some((day) => day.serviceOrderId === order.id) ? [] : Array.from({ length: order.dailyCount }, (_, index) => {
    const completion = completions.find((item) => item.serviceOrderId === order.id && item.occurrence === index + 1);
    if (order.cancelledAt && !completion) return null;
    return { source: "service" as const, id: `${order.id}:${date}:${index + 1}`, serviceOrderId: order.id, horseId: order.horseId, horseName, title: order.title, instructions: order.instructions, occurrence: index + 1, completedAt: completion?.completedAt ?? null, completedBy: completion?.completedBy ?? null, note: completion?.note ?? null };
  }).filter((task): task is NonNullable<typeof task> => task !== null));
  const tenant = await db.select().from(tenants).where(eq(tenants.id, c.get("tenantId"))).get();
  const farrierRows = await db.select({ signup: farrierSignups, horseName: horses.name, startsAt: farrierVisits.startsAt }).from(farrierSignups).innerJoin(farrierVisits, eq(farrierSignups.visitId, farrierVisits.id)).innerJoin(horses, eq(farrierSignups.horseId, horses.id)).where(and(eq(farrierSignups.tenantId, c.get("tenantId")), eq(farrierSignups.presentation, "staff"))).all();
  const timezone = tenant?.timezone ?? "Europe/Berlin";
  const farrierTasks = farrierRows.filter(({ startsAt }) => dateInTimezone(startsAt, timezone) === date).map(({ signup, horseName }) => ({ source: "farrier" as const, id: signup.id, horseId: signup.horseId, horseName, title: "Pferd zum Hufschmied vorstellen", instructions: null, occurrence: 1, completedAt: signup.presentedAt, completedBy: signup.presentedBy, note: null }));
  return c.json({ date, tasks: [...serviceTasks, ...farrierTasks] });
});

serviceOrderRoutes.post("/:id/tasks/:date/:occurrence/complete", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CompleteServiceTaskSchema.safeParse((await c.req.json().catch(() => ({}))) ?? {});
  const date = routeParam(c, "date");
  const occurrence = Number(routeParam(c, "occurrence"));
  if (!body.success || !isDate(date) || !Number.isInteger(occurrence) || occurrence < 1) return c.json({ error: "UngÃ¼ltige Anfrage" }, 400);
  const existing = await findOrder(c, routeParam(c, "id"));
  if (!existing || existing.cancelledAt || date < existing.startDate || date > existing.endDate || occurrence > existing.dailyCount) return c.json({ error: "Aufgabe nicht gefunden" }, 404);
  const tenant = await createDb(c.env).select().from(tenants).where(eq(tenants.id, c.get("tenantId"))).get();
  if (date > todayIn(tenant?.timezone ?? "Europe/Berlin")) return c.json({ error: "ZukÃ¼nftige Aufgaben kÃ¶nnen nicht erledigt werden" }, 400);
  const db = createDb(c.env);
  const selfDay = await db.select().from(serviceOrderSelfDays).where(and(eq(serviceOrderSelfDays.serviceOrderId, existing.id), eq(serviceOrderSelfDays.date, date))).get();
  if (selfDay) return c.json({ error: "Diese Aufgabe Ã¼bernimmt der Einsteller" }, 400);
  const alreadyDone = await db.select().from(serviceTaskCompletions).where(and(eq(serviceTaskCompletions.serviceOrderId, existing.id), eq(serviceTaskCompletions.date, date), eq(serviceTaskCompletions.occurrence, occurrence))).get();
  if (alreadyDone) return c.json({ completion: alreadyDone });
  const completion = { id: id(), serviceOrderId: existing.id, date, occurrence, note: body.data.note ?? null, completedBy: c.get("userId"), completedAt: nowIso() };
  await db.insert(serviceTaskCompletions).values(completion);
  return c.json({ completion }, 201);
});
