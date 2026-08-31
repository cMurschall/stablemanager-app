import { Hono } from "hono";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  CreateBulletinPostSchema,
  PaginationSchema,
  UpdateBulletinPostSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { bulletinPosts } from "../db/schema";
import { id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const boardRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

boardRoutes.use("*", authMiddleware);

boardRoutes.get("/", async (c) => {
  const pagination = PaginationSchema.parse({
    limit: c.req.query("limit") ?? 50,
    offset: c.req.query("offset") ?? 0,
  });
  const db = createDb(c.env);
  const now = nowIso();

  const rows = await db
    .select()
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.tenantId, c.get("tenantId")),
        or(isNull(bulletinPosts.expiresAt), gt(bulletinPosts.expiresAt, now)),
      ),
    )
    .orderBy(desc(bulletinPosts.pinned), desc(bulletinPosts.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.tenantId, c.get("tenantId")),
        or(isNull(bulletinPosts.expiresAt), gt(bulletinPosts.expiresAt, now)),
      ),
    )
    .get();

  return c.json({
    posts: rows,
    total: countRow?.count ?? 0,
    limit: pagination.limit,
    offset: pagination.offset,
  });
});

boardRoutes.post("/", requireRoles("hof_admin", "staff"), async (c) => {
  const body = CreateBulletinPostSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const row = {
    id: id(),
    tenantId: c.get("tenantId"),
    title: body.data.title,
    body: body.data.body,
    pinned: body.data.pinned ?? false,
    expiresAt: body.data.expiresAt ?? null,
    createdBy: c.get("userId"),
  };
  await db.insert(bulletinPosts).values(row);
  return c.json({ post: row }, 201);
});

boardRoutes.patch("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const body = UpdateBulletinPostSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const postId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.id, postId),
        eq(bulletinPosts.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Beitrag nicht gefunden" }, 404);
  }

  await db
    .update(bulletinPosts)
    .set(body.data)
    .where(eq(bulletinPosts.id, existing.id));

  return c.json({ post: { ...existing, ...body.data } });
});

boardRoutes.delete("/:id", requireRoles("hof_admin", "staff"), async (c) => {
  const postId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.id, postId),
        eq(bulletinPosts.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Beitrag nicht gefunden" }, 404);
  }

  await db.delete(bulletinPosts).where(eq(bulletinPosts.id, existing.id));
  return c.json({ ok: true });
});
