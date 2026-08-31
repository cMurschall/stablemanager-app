import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { PaginationSchema } from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { notifications } from "../db/schema";
import { nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { authMiddleware } from "../middleware/auth";

export const notificationRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

notificationRoutes.use("*", authMiddleware);

notificationRoutes.get("/", async (c) => {
  const pagination = PaginationSchema.parse({
    limit: c.req.query("limit") ?? 50,
    offset: c.req.query("offset") ?? 0,
  });
  const db = createDb(c.env);

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, c.get("tenantId")),
        eq(notifications.userId, c.get("userId")),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const unread = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, c.get("tenantId")),
        eq(notifications.userId, c.get("userId")),
        isNull(notifications.readAt),
      ),
    )
    .get();

  return c.json({
    notifications: rows,
    unreadCount: unread?.count ?? 0,
    limit: pagination.limit,
    offset: pagination.offset,
  });
});

notificationRoutes.post("/read-all", async (c) => {
  const db = createDb(c.env);
  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(
      and(
        eq(notifications.userId, c.get("userId")),
        eq(notifications.tenantId, c.get("tenantId")),
        isNull(notifications.readAt),
      ),
    );
  return c.json({ ok: true });
});

notificationRoutes.post("/:id/read", async (c) => {
  const notificationId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, c.get("userId")),
        eq(notifications.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Benachrichtigung nicht gefunden" }, 404);
  }

  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(eq(notifications.id, existing.id));

  return c.json({ ok: true });
});
