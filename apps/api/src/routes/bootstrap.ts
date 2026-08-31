import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { BootstrapSchema } from "@stablemanager/shared";
import type { Env } from "../env";
import { createDb } from "../db/client";
import {
  memberships,
  resources,
  accommodations,
  horses,
  tenants,
  users,
} from "../db/schema";
import { id, slugify } from "../lib/crypto";
import { DEMO_ACCOMMODATIONS } from "../lib/demoAccommodations";
import { DEMO_HORSES } from "../lib/demoHorses";
import { DEMO_RESOURCES } from "../lib/demoResources";
import { DEMO_ADMIN, DEMO_USERS } from "../lib/demoUsers";
import { DEMO_TENANT } from "../lib/demoTenant";

/** Dev-only: first tenant + hof_admin + sample resources. */
export const bootstrapRoutes = new Hono<{ Bindings: Env }>();

bootstrapRoutes.post("/", async (c) => {
  if (c.env.ENVIRONMENT === "production") {
    return c.json({ error: "Nicht verfügbar" }, 404);
  }

  const body = BootstrapSchema.safeParse(
    (await c.req.json().catch(() => ({}))) ?? {},
  );
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage", details: body.error.flatten() }, 400);
  }

  const tenantName = body.data.tenantName ?? DEMO_TENANT.name;
  const adminEmail = body.data.adminEmail ?? DEMO_ADMIN.email;
  const adminName = body.data.adminName ?? DEMO_ADMIN.name;
  const db = createDb(c.env);
  const existing = await db.select().from(tenants).limit(1).get();
  if (existing) {
    return c.json(
      { error: "Bereits initialisiert", tenantId: existing.id },
      409,
    );
  }

  const tenantId = id();
  const userId = id();
  let slug = slugify(tenantName) || "hof";
  const slugTaken = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .get();
  if (slugTaken) {
    slug = `${slug}-${tenantId.slice(0, 8)}`;
  }

  await db.insert(tenants).values({
    id: tenantId,
    name: tenantName,
    slug,
    timezone: "Europe/Berlin",
  });

  await db.insert(users).values({
    id: userId,
    email: adminEmail,
    name: adminName,
  });

  await db.insert(memberships).values({
    id: id(),
    userId,
    tenantId,
    role: "hof_admin",
  });

  await db.insert(resources).values(
    DEMO_RESOURCES.map((r) => ({
      id: id(),
      tenantId,
      name: r.name,
      kind: r.kind,
    })),
  );

  await db.insert(accommodations).values(
    DEMO_ACCOMMODATIONS.map((a) => ({
      id: id(),
      tenantId,
      name: a.name,
      kind: a.kind,
      capacity: a.capacity,
      notes: null,
    })),
  );

  // Demo accounts for "Login as" (skip adminEmail if already inserted above)
  const extraUsers = DEMO_USERS.filter(
    (u) =>
      u.role !== "hof_admin" &&
      u.email.toLowerCase() !== adminEmail.toLowerCase(),
  );
  for (const u of extraUsers) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, u.email))
      .get();
    const userIdForMember = existingUser?.id ?? id();
    if (!existingUser) {
      await db.insert(users).values({
        id: userIdForMember,
        email: u.email,
        name: u.name,
      });
    }
    await db.insert(memberships).values({
      id: id(),
      userId: userIdForMember,
      tenantId,
      role: u.role,
    });
  }

  // Sample sale horses for the demo yard
  await db.insert(horses).values(
    DEMO_HORSES.map((h) => ({
      id: id(),
      tenantId,
      name: h.name,
      feifId: h.feifId,
      sex: h.sex,
      birthYear: h.birthYear,
      ownerUserId: null,
      accommodationId: null,
      notes: null,
    })),
  );

  return c.json({
    ok: true,
    tenantId,
    adminEmail,
    horsesSeeded: DEMO_HORSES.length,
    usersSeeded: DEMO_USERS.length,
    demoUsers: DEMO_USERS.map((u) => ({ email: u.email, role: u.role })),
    hint: "In Dev: GET /api/auth/dev-users und POST /api/auth/dev-login { email }.",
  });
});

/** Dev-only: seed demo sale horses into the first tenant (idempotent by FEIF-ID). */
bootstrapRoutes.post("/seed-horses", async (c) => {
  if (c.env.ENVIRONMENT === "production") {
    return c.json({ error: "Nicht verfügbar" }, 404);
  }

  const db = createDb(c.env);
  const tenant = await db.select().from(tenants).limit(1).get();
  if (!tenant) {
    return c.json({ error: "Kein Hof vorhanden — zuerst /api/bootstrap aufrufen" }, 400);
  }

  const existing = await db
    .select({ feifId: horses.feifId })
    .from(horses)
    .where(eq(horses.tenantId, tenant.id))
    .all();
  const have = new Set(existing.map((r) => r.feifId).filter(Boolean));

  const toInsert = DEMO_HORSES.filter((h) => !have.has(h.feifId));
  if (toInsert.length) {
    await db.insert(horses).values(
      toInsert.map((h) => ({
        id: id(),
        tenantId: tenant.id,
        name: h.name,
        feifId: h.feifId,
        sex: h.sex,
        birthYear: h.birthYear,
        ownerUserId: null,
        accommodationId: null,
        notes: null,
      })),
    );
  }

  return c.json({
    ok: true,
    tenantId: tenant.id,
    inserted: toInsert.length,
    skipped: DEMO_HORSES.length - toInsert.length,
    horses: DEMO_HORSES.map((h) => h.name),
  });
});
