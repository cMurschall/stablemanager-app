import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  CreateInviteSchema,
  CreateResourceSchema,
  UpdateResourceSchema,
  UpdateTenantSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  invites,
  memberships,
  resources,
  tenants,
  users,
} from "../db/schema";
import { addDays, id, randomToken, sha256Hex } from "../lib/crypto";
import { sendInviteEmail } from "../lib/email";
import { routeParam } from "../lib/params";
import { requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const tenantRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

tenantRoutes.use("*", authMiddleware);

tenantRoutes.get("/current", async (c) => {
  const db = createDb(c.env);
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, c.get("tenantId")))
    .get();

  if (!tenant) {
    return c.json({ error: "Hof nicht gefunden" }, 404);
  }

  return c.json({ tenant, role: c.get("role") });
});

tenantRoutes.patch("/current", requireRoles("hof_admin"), async (c) => {
  const body = UpdateTenantSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  await db
    .update(tenants)
    .set(body.data)
    .where(eq(tenants.id, c.get("tenantId")));

  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, c.get("tenantId")))
    .get();

  return c.json({ tenant });
});

tenantRoutes.get("/members", requireRoles("hof_admin", "staff"), async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, c.get("tenantId")))
    .all();

  return c.json({ members: rows });
});

tenantRoutes.get("/invites", requireRoles("hof_admin"), async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      name: invites.name,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.tenantId, c.get("tenantId")),
        isNull(invites.acceptedAt),
      ),
    )
    .all();

  return c.json({ invites: rows });
});

tenantRoutes.post("/invites", requireRoles("hof_admin"), async (c) => {
  const body = CreateInviteSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, c.get("tenantId")))
    .get();

  if (!tenant) {
    return c.json({ error: "Hof nicht gefunden" }, 404);
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await db.insert(invites).values({
    id: id(),
    tenantId: tenant.id,
    email: body.data.email,
    role: body.data.role,
    name: body.data.name ?? null,
    tokenHash,
    expiresAt: addDays(7),
    invitedBy: c.get("userId"),
  });

  const origin = new URL(c.req.url).origin;
  const link = `${origin}/invite/${token}`;
  const result = await sendInviteEmail(c.env, body.data.email, link, tenant.name);

  return c.json({
    ok: true,
    ...(c.env.ENVIRONMENT !== "production" && !result.delivered
      ? { devLink: result.link }
      : {}),
  });
});

tenantRoutes.get("/resources", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(resources)
    .where(eq(resources.tenantId, c.get("tenantId")))
    .all();
  return c.json({ resources: rows });
});

tenantRoutes.post("/resources", requireRoles("hof_admin"), async (c) => {
  const body = CreateResourceSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const row = {
    id: id(),
    tenantId: c.get("tenantId"),
    name: body.data.name,
    kind: body.data.kind,
  };
  await db.insert(resources).values(row);
  return c.json({ resource: row }, 201);
});

tenantRoutes.patch("/resources/:id", requireRoles("hof_admin"), async (c) => {
  const body = UpdateResourceSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const resourceId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.id, resourceId),
        eq(resources.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Ressource nicht gefunden" }, 404);
  }

  await db
    .update(resources)
    .set(body.data)
    .where(eq(resources.id, existing.id));

  return c.json({ resource: { ...existing, ...body.data } });
});

tenantRoutes.delete("/resources/:id", requireRoles("hof_admin"), async (c) => {
  const resourceId = routeParam(c, "id");
  const db = createDb(c.env);
  const existing = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.id, resourceId),
        eq(resources.tenantId, c.get("tenantId")),
      ),
    )
    .get();

  if (!existing) {
    return c.json({ error: "Ressource nicht gefunden" }, 404);
  }

  await db.delete(resources).where(eq(resources.id, existing.id));
  return c.json({ ok: true });
});
