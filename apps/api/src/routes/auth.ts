import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import {
  AcceptInviteSchema,
  MagicLinkRequestSchema,
  PasswordLoginSchema,
  SetPasswordSchema,
  SwitchTenantSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  invites,
  loginTokens,
  memberships,
  passwordTokens,
  sessions,
  tenants,
  users,
} from "../db/schema";
import {
  addDays,
  addMinutes,
  id,
  nowIso,
  randomToken,
  sha256Hex,
} from "../lib/crypto";
import { sendMagicLinkEmail } from "../lib/email";
import { hashPassword, verifyPassword } from "../lib/password";
import { routeParam } from "../lib/params";
import { SESSION_COOKIE, authMiddleware } from "../middleware/auth";

const SESSION_DAYS = 30;

export const authRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

async function issueSession(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  userId: string,
  tenantId: string,
) {
  const db = createDb(c.env);
  const sessionToken = randomToken();
  const sessionHash = await sha256Hex(sessionToken);
  await db.insert(sessions).values({
    id: id(),
    userId,
    tenantId,
    tokenHash: sessionHash,
    expiresAt: addDays(SESSION_DAYS),
  });
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

function isDev(env: Env) {
  return env.ENVIRONMENT !== "production";
}

async function listDevUsers(env: Env) {
  const db = createDb(env);
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      tenantId: memberships.tenantId,
      tenantName: tenants.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .orderBy(asc(tenants.name), asc(users.name))
    .all();
}

/** Dev only: list users for "Login as". */
authRoutes.get("/dev-users", async (c) => {
  if (!isDev(c.env)) {
    return c.json({ error: "Nicht verfügbar" }, 404);
  }

  const list = await listDevUsers(c.env);
  return c.json({ users: list, environment: c.env.ENVIRONMENT });
});

/** Local/dev only: create session immediately (no magic link). */
authRoutes.post("/dev-login", async (c) => {
  if (!isDev(c.env)) {
    return c.json({ error: "Nicht verfügbar" }, 404);
  }

  const body = MagicLinkRequestSchema.safeParse(
    (await c.req.json().catch(() => ({}))) ?? {},
  );
  const devUsers = await listDevUsers(c.env);
  const email = body.success
    ? body.data.email
    : devUsers.find((user) => user.role === "hof_admin")?.email;
  if (!email) {
    return c.json({ error: "Kein Hof-Admin vorhanden. Zuerst einen Hof anlegen." }, 404);
  }

  const db = createDb(c.env);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user) {
    return c.json(
      {
        error:
          "Kein User mit dieser E-Mail. Zuerst Demo-Hof anlegen oder andere E-Mail.",
      },
      404,
    );
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1)
    .get();

  if (!membership) {
    return c.json({ error: "User hat keine Hof-Mitgliedschaft" }, 403);
  }

  await issueSession(c, user.id, membership.tenantId);

  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    tenantId: membership.tenantId,
    role: membership.role,
  });
});

authRoutes.post("/magic-link", async (c) => {
  const body = MagicLinkRequestSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige E-Mail" }, 400);
  }

  const email = body.data.email;
  const db = createDb(c.env);

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!existingUser) {
    return c.json({
      ok: true,
      message: "Falls ein Konto existiert, wurde ein Link gesendet.",
    });
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, existingUser.id))
    .limit(1)
    .get();

  if (!membership) {
    return c.json({
      ok: true,
      message: "Falls ein Konto existiert, wurde ein Link gesendet.",
    });
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await db.insert(loginTokens).values({
    id: id(),
    email,
    tokenHash,
    expiresAt: addMinutes(15),
  });

  const origin = new URL(c.req.url).origin;
  const link = `${origin}/api/auth/callback?token=${token}`;
  const result = await sendMagicLinkEmail(c.env, email, link);

  return c.json({
    ok: true,
    message: "Falls ein Konto existiert, wurde ein Link gesendet.",
    ...(c.env.ENVIRONMENT !== "production" && !result.delivered
      ? { devLink: result.link }
      : {}),
  });
});

authRoutes.post("/login", async (c) => {
  const body = PasswordLoginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anmeldung" }, 400);
  }

  const db = createDb(c.env);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, body.data.email))
    .get();

  if (!user) {
    return c.json({ error: "E-Mail oder Passwort ungültig" }, 401);
  }

  if (!user.passwordHash) {
    return c.json(
      {
        error:
          "Noch kein Passwort gesetzt. Bitte den Hof-Admin um einen Willkommenslink.",
      },
      401,
    );
  }

  const ok = await verifyPassword(body.data.password, user.passwordHash);
  if (!ok) {
    return c.json({ error: "E-Mail oder Passwort ungültig" }, 401);
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1)
    .get();

  if (!membership) {
    return c.json({ error: "Kein Hof-Zugang" }, 403);
  }

  await issueSession(c, user.id, membership.tenantId);
  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    tenantId: membership.tenantId,
    role: membership.role,
  });
});

authRoutes.get("/password/:token", async (c) => {
  const token = routeParam(c, "token");
  const db = createDb(c.env);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const row = await db
    .select({
      purpose: passwordTokens.purpose,
      expiresAt: passwordTokens.expiresAt,
      usedAt: passwordTokens.usedAt,
      email: users.email,
      name: users.name,
    })
    .from(passwordTokens)
    .innerJoin(users, eq(passwordTokens.userId, users.id))
    .where(eq(passwordTokens.tokenHash, tokenHash))
    .get();

  if (!row || row.usedAt || row.expiresAt < now) {
    return c.json({ error: "Link ungültig oder abgelaufen" }, 404);
  }

  return c.json({
    email: row.email,
    name: row.name,
    purpose: row.purpose,
  });
});

authRoutes.post("/password", async (c) => {
  const body = SetPasswordSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Passwort mindestens 8 Zeichen" }, 400);
  }

  const db = createDb(c.env);
  const tokenHash = await sha256Hex(body.data.token);
  const now = nowIso();

  const row = await db
    .select()
    .from(passwordTokens)
    .where(
      and(
        eq(passwordTokens.tokenHash, tokenHash),
        gt(passwordTokens.expiresAt, now),
        isNull(passwordTokens.usedAt),
      ),
    )
    .get();

  if (!row) {
    return c.json({ error: "Link ungültig oder abgelaufen" }, 404);
  }

  const user = await db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user) {
    return c.json({ error: "Benutzer nicht gefunden" }, 404);
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1)
    .get();

  if (!membership) {
    return c.json({ error: "Kein Hof-Zugang" }, 403);
  }

  const passwordHash = await hashPassword(body.data.password);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  await db
    .update(passwordTokens)
    .set({ usedAt: now })
    .where(eq(passwordTokens.userId, user.id));

  if (row.purpose === "reset") {
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }

  await issueSession(c, user.id, membership.tenantId);
  return c.json({ ok: true });
});

authRoutes.get("/callback", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.redirect("/login?error=missing_token");
  }

  const db = createDb(c.env);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const login = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, tokenHash),
        gt(loginTokens.expiresAt, now),
        isNull(loginTokens.usedAt),
      ),
    )
    .get();

  if (!login) {
    return c.redirect("/login?error=invalid_token");
  }

  await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(eq(loginTokens.id, login.id));

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, login.email))
    .get();

  if (!user) {
    return c.redirect("/login?error=no_user");
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1)
    .get();

  if (!membership) {
    return c.redirect("/login?error=no_membership");
  }

  await issueSession(c, user.id, membership.tenantId);

  return c.redirect("/");
});

authRoutes.post("/logout", async (c) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const db = createDb(c.env);
    const tokenHash = await sha256Hex(raw);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", authMiddleware, async (c) => {
  const db = createDb(c.env);
  const userId = c.get("userId");

  const myMemberships = await db
    .select({
      tenantId: memberships.tenantId,
      role: memberships.role,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      timezone: tenants.timezone,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, userId))
    .all();

  return c.json({
    user: {
      id: userId,
      email: c.get("email"),
      name: c.get("name"),
    },
    currentTenantId: c.get("tenantId"),
    currentRole: c.get("role"),
    memberships: myMemberships,
  });
});

authRoutes.post("/switch-tenant", authMiddleware, async (c) => {
  const body = SwitchTenantSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage" }, 400);
  }

  const db = createDb(c.env);
  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, c.get("userId")),
        eq(memberships.tenantId, body.data.tenantId),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Kein Zugriff auf diesen Hof" }, 403);
  }

  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) {
    return c.json({ error: "Keine Sitzung" }, 401);
  }

  const tokenHash = await sha256Hex(raw);
  await db
    .update(sessions)
    .set({ tenantId: body.data.tenantId })
    .where(eq(sessions.tokenHash, tokenHash));

  return c.json({
    ok: true,
    tenantId: body.data.tenantId,
    role: membership.role,
  });
});

authRoutes.get("/invite/:token", async (c) => {
  const token = routeParam(c, "token");
  const db = createDb(c.env);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const invite = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      name: invites.name,
      tenantName: tenants.name,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
    })
    .from(invites)
    .innerJoin(tenants, eq(invites.tenantId, tenants.id))
    .where(eq(invites.tokenHash, tokenHash))
    .get();

  if (!invite || invite.acceptedAt || invite.expiresAt < now) {
    return c.json({ error: "Einladung ungültig oder abgelaufen" }, 404);
  }

  return c.json({
    email: invite.email,
    role: invite.role,
    name: invite.name,
    tenantName: invite.tenantName,
  });
});

authRoutes.post("/invite/accept", async (c) => {
  const body = AcceptInviteSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Ungültige Anfrage" }, 400);
  }

  const db = createDb(c.env);
  const tokenHash = await sha256Hex(body.data.token);
  const now = nowIso();

  const invite = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        gt(invites.expiresAt, now),
        isNull(invites.acceptedAt),
      ),
    )
    .get();

  if (!invite) {
    return c.json({ error: "Einladung ungültig oder abgelaufen" }, 404);
  }

  let user = await db
    .select()
    .from(users)
    .where(eq(users.email, invite.email))
    .get();

  if (!user) {
    const userId = id();
    const passwordHash = await hashPassword(body.data.password);
    await db.insert(users).values({
      id: userId,
      email: invite.email,
      name: body.data.name,
      passwordHash,
    });
    user = {
      id: userId,
      email: invite.email,
      name: body.data.name,
      passwordHash,
      createdAt: now,
    };
  } else {
    await db
      .update(users)
      .set({
        name: body.data.name,
        passwordHash: await hashPassword(body.data.password),
      })
      .where(eq(users.id, user.id));
  }

  const existing = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.tenantId, invite.tenantId),
      ),
    )
    .get();

  if (!existing) {
    await db.insert(memberships).values({
      id: id(),
      userId: user.id,
      tenantId: invite.tenantId,
      role: invite.role,
    });
  }

  await db
    .update(invites)
    .set({ acceptedAt: now })
    .where(eq(invites.id, invite.id));

  await issueSession(c, user.id, invite.tenantId);

  return c.json({ ok: true });
});
