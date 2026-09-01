import { describe, expect, it } from "vitest";
import { cookieFrom, db, request } from "./helpers";
import { sessions } from "../src/db/schema";
import { sha256Hex } from "../src/lib/crypto";

describe("authentication and bootstrap", () => {
  it("uses the explicit test environment bindings", async () => {
    const health = await request("/api/health");
    expect(await health.json()).toMatchObject({
      ok: true,
      name: "Stablemanager Test",
      env: "development",
    });
  });

  it("rejects missing, invalid, and expired sessions", async () => {
    expect((await request("/api/horses")).status).toBe(401);
    expect((await request("/api/horses", {}, "not-a-session")).status).toBe(401);

    await request("/api/bootstrap", {
      method: "POST",
      body: JSON.stringify({ adminEmail: "admin@test.example" }),
    });

    const token = "expired-session";
    const login = await request("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@test.example" }),
    });
    const session = cookieFrom(login);
    const me = await request("/api/auth/me", {}, session);
    const { user, currentTenantId } = await me.json();
    await db().insert(sessions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tenantId: currentTenantId,
      tokenHash: await sha256Hex(token),
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    expect((await request("/api/horses", {}, token)).status).toBe(401);
  });

  it("bootstraps once, then creates a dev session usable by /me", async () => {
    const conflict = await request("/api/bootstrap", { method: "POST", body: "{}" });
    expect(conflict.status).toBe(409);

    const login = await request("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@test.example" }),
    });
    expect(login.status).toBe(200);
    const me = await request("/api/auth/me", {}, cookieFrom(login));
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.user.email).toBe("admin@test.example");
    expect(body.currentRole).toBe("hof_admin");
    expect(body.memberships).toHaveLength(1);
  });
});
