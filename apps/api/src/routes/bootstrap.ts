import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { BootstrapSchema } from "@stablemanager/shared";
import type { Env } from "../env";
import { createDb } from "../db/client";
import { memberships, tenants, users } from "../db/schema";
import { id, slugify } from "../lib/crypto";

/** Dev-only: create an otherwise empty first tenant and its requested admin. */
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

  const tenantName = body.data.tenantName ?? "Kjoelavik";
  const adminEmail = body.data.adminEmail ?? "admin@example.com";
  const adminName = body.data.adminName ?? "Hof Admin";
  const db = createDb(c.env);
  const existing = await db.select().from(tenants).limit(1).get();
  if (existing) {
    return c.json({ error: "Bereits initialisiert", tenantId: existing.id }, 409);
  }

  const tenantId = id();
  const userId = id();
  let slug = slugify(tenantName) || "hof";
  const slugTaken = await db.select().from(tenants).where(eq(tenants.slug, slug)).get();
  if (slugTaken) slug = `${slug}-${tenantId.slice(0, 8)}`;

  await db.insert(tenants).values({
    id: tenantId,
    name: tenantName,
    slug,
    timezone: "Europe/Berlin",
  });
  await db.insert(users).values({ id: userId, email: adminEmail, name: adminName });
  await db.insert(memberships).values({
    id: id(),
    userId,
    tenantId,
    role: "hof_admin",
  });

  return c.json({
    ok: true,
    tenantId,
    adminEmail,
    hint: "In Dev: GET /api/auth/dev-users und POST /api/auth/dev-login { email }.",
  });
});
