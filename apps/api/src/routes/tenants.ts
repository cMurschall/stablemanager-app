import { Hono } from "hono";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import {
  CreateInviteSchema,
  CreatePasswordLinkSchema,
  CreateResourceSchema,
  CreateTrainingTypeSchema,
  TenantBackupV1Schema,
  UpdateResourceSchema,
  UpdateTenantSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  horseOwners,
  invites,
  memberships,
  passwordTokens,
  resources,
  sessions,
  tenants,
  trainingTypes,
  users,
} from "../db/schema";
import { addDays, id, nowIso, randomToken, sha256Hex } from "../lib/crypto";
import { sendInviteEmail } from "../lib/email";
import { routeParam } from "../lib/params";
import { requireRoles } from "../lib/rbac";
import { webOrigin } from "../lib/webOrigin";
import { exportTenantBackup, restoreTenantBackup } from "../lib/tenantBackup";
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

tenantRoutes.get("/training-types", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(trainingTypes)
    .where(eq(trainingTypes.tenantId, c.get("tenantId")))
    .orderBy(asc(trainingTypes.name))
    .all();
  return c.json({ trainingTypes: rows });
});

tenantRoutes.post("/training-types", requireRoles("hof_admin"), async (c) => {
  const body = CreateTrainingTypeSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "UngÃ¼ltige Anfrage" }, 400);
  const row = { id: id(), tenantId: c.get("tenantId"), name: body.data.name };
  try {
    await createDb(c.env).insert(trainingTypes).values(row);
  } catch {
    return c.json({ error: "Diese Trainingsart gibt es bereits" }, 409);
  }
  return c.json({ trainingType: row }, 201);
});

tenantRoutes.delete("/training-types/:id", requireRoles("hof_admin"), async (c) => {
  const db = createDb(c.env);
  const typeId = routeParam(c, "id");
  const existing = await db
    .select({ id: trainingTypes.id })
    .from(trainingTypes)
    .where(and(eq(trainingTypes.id, typeId), eq(trainingTypes.tenantId, c.get("tenantId"))))
    .get();
  if (!existing) return c.json({ error: "Trainingsart nicht gefunden" }, 404);
  await db.delete(trainingTypes).where(eq(trainingTypes.id, existing.id));
  return c.json({ ok: true });
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
  const tenantId = c.get("tenantId");
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      hasPassword: sql<number>`CASE WHEN ${users.passwordHash} IS NOT NULL THEN 1 ELSE 0 END`,
      horseCount: sql<number>`(
        select count(*) from horse_owners
        where horse_owners.tenant_id = ${tenantId}
          and horse_owners.user_id = ${users.id}
      )`,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, tenantId))
    .all();

  return c.json({
    members: rows.map((row) => ({
      ...row,
      hasPassword: Number(row.hasPassword ?? 0) === 1,
      horseCount: Number(row.horseCount ?? 0),
    })),
  });
});

tenantRoutes.delete("/members/:userId", requireRoles("hof_admin"), async (c) => {
  const targetUserId = routeParam(c, "userId");
  const tenantId = c.get("tenantId");
  const db = createDb(c.env);

  const membership = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, targetUserId)))
    .get();

  if (!membership) {
    return c.json({ error: "Mitglied nicht gefunden" }, 404);
  }

  if (membership.role === "hof_admin") {
    const adminCount = await db
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "hof_admin")))
      .get();
    if ((adminCount?.n ?? 0) <= 1) {
      return c.json({ error: "Der letzte Hof-Admin kann nicht entfernt werden" }, 400);
    }
  }

  await db
    .delete(horseOwners)
    .where(and(eq(horseOwners.tenantId, tenantId), eq(horseOwners.userId, targetUserId)));

  await db
    .delete(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, targetUserId)));

  await db
    .update(sessions)
    .set({ tenantId: null })
    .where(and(eq(sessions.userId, targetUserId), eq(sessions.tenantId, tenantId)));

  return c.json({ ok: true });
});

tenantRoutes.post(
  "/members/:userId/password-link",
  requireRoles("hof_admin"),
  async (c) => {
    const body = CreatePasswordLinkSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: "Ungültige Anfrage" }, 400);
    }

    const targetUserId = routeParam(c, "userId");
    const tenantId = c.get("tenantId");
    const db = createDb(c.env);

    const membership = await db
      .select({ userId: memberships.userId, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, targetUserId)))
      .get();

    if (!membership) {
      return c.json({ error: "Mitglied nicht gefunden" }, 404);
    }

    const now = nowIso();
    await db
      .update(passwordTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordTokens.userId, targetUserId), isNull(passwordTokens.usedAt)));

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const days = body.data.purpose === "welcome" ? 14 : 7;
    const expiresAt = addDays(days);
    await db.insert(passwordTokens).values({
      id: id(),
      userId: targetUserId,
      purpose: body.data.purpose,
      tokenHash,
      expiresAt,
    });

    const link = `${webOrigin(c)}/set-password/${token}`;
    return c.json({
      ok: true,
      link,
      expiresAt,
      purpose: body.data.purpose,
      email: membership.email,
      name: membership.name,
    });
  },
);

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
  const expiresAt = addDays(7);
  await db.insert(invites).values({
    id: id(),
    tenantId: tenant.id,
    email: body.data.email,
    role: body.data.role,
    name: body.data.name ?? null,
    tokenHash,
    expiresAt,
    invitedBy: c.get("userId"),
  });

  const link = `${webOrigin(c)}/invite/${token}`;
  await sendInviteEmail(c.env, body.data.email, link, tenant.name);

  return c.json({
    ok: true,
    inviteLink: link,
    expiresAt,
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

tenantRoutes.get("/backup", requireRoles("hof_admin"), async (c) => {
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  try {
    const backup = await exportTenantBackup(db, tenantId);
    const safeName = backup.tenant.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "hof";
    const day = backup.exportedAt.slice(0, 10);
    const filename = `${safeName}-${day}.json`;
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backup fehlgeschlagen";
    return c.json({ error: message }, 500);
  }
});

tenantRoutes.post("/restore", requireRoles("hof_admin"), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiges JSON" }, 400);
  }

  const parsed = TenantBackupV1Schema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Ungültiges Backup", details: parsed.error.flatten() },
      400,
    );
  }

  const db = createDb(c.env);
  try {
    const summary = await restoreTenantBackup(
      db,
      c.get("tenantId"),
      c.get("userId"),
      parsed.data,
    );
    return c.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Wiederherstellung fehlgeschlagen";
    return c.json({ error: message }, 500);
  }
});
