import { and, eq, gt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import { memberships, sessions, users } from "../db/schema";
import { sha256Hex } from "../lib/crypto";

export const SESSION_COOKIE = "sm_session";

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) {
    return c.json({ error: "Nicht angemeldet" }, 401);
  }

  const db = createDb(c.env);
  const tokenHash = await sha256Hex(raw);
  const now = new Date().toISOString();

  const row = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .get();

  if (!row) {
    return c.json({ error: "Sitzung abgelaufen" }, 401);
  }

  let tenantId = row.tenantId;
  let role: AppVariables["role"] | null = null;

  if (tenantId) {
    const membership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, row.userId),
          eq(memberships.tenantId, tenantId),
        ),
      )
      .get();
    if (membership) {
      role = membership.role;
    } else {
      tenantId = null;
    }
  }

  if (!tenantId || !role) {
    const first = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, row.userId))
      .limit(1)
      .get();

    if (!first) {
      return c.json({ error: "Kein Hof zugeordnet" }, 403);
    }

    tenantId = first.tenantId;
    role = first.role;
    await db
      .update(sessions)
      .set({ tenantId })
      .where(eq(sessions.id, row.sessionId));
  }

  c.set("userId", row.userId);
  c.set("tenantId", tenantId);
  c.set("role", role);
  c.set("email", row.email);
  c.set("name", row.name);

  await next();
});
