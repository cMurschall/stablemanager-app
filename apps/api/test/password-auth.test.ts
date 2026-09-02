import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cookieFrom, createSession, db, request, seedMember, seedTenant } from "./helpers";
import { users } from "../src/db/schema";

const ids = {
  tenant: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000011",
  staff: "10000000-0000-4000-8000-000000000012",
  boarder: "10000000-0000-4000-8000-000000000013",
  inviteTenant: "10000000-0000-4000-8000-000000000002",
  inviteAdmin: "10000000-0000-4000-8000-000000000021",
};

describe("password login and admin-generated links", () => {
  it("lets a member set a password from an admin welcome link and then log in", async () => {
    await seedTenant(ids.tenant, "Passwort Hof");
    await seedMember(ids.admin, "admin@password.test", ids.tenant, "hof_admin");
    await seedMember(ids.staff, "staff@password.test", ids.tenant, "staff");
    await seedMember(ids.boarder, "boarder@password.test", ids.tenant, "boarder");
    const admin = await createSession(ids.admin, ids.tenant);
    const staff = await createSession(ids.staff, ids.tenant);

    const created = await request(
      `/api/tenants/members/${ids.boarder}/password-link`,
      { method: "POST", body: JSON.stringify({ purpose: "welcome" }) },
      admin,
    );
    expect(created.status).toBe(200);
    const { link } = await created.json();
    const token = String(link).split("/set-password/").at(-1);
    expect(token).toBeTruthy();

    const preview = await request(`/api/auth/password/${token}`);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      email: "boarder@password.test",
      purpose: "welcome",
    });

    const set = await request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ token, password: "geheim123" }),
    });
    expect(set.status).toBe(200);
    expect(cookieFrom(set)).toBeTruthy();

    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "boarder@password.test", password: "geheim123" }),
    });
    expect(login.status).toBe(200);
    const me = await request("/api/auth/me", {}, cookieFrom(login));
    expect((await me.json()).user.email).toBe("boarder@password.test");

    const members = await request("/api/tenants/members", {}, admin);
    const boarder = (await members.json()).members.find(
      (row: { userId: string }) => row.userId === ids.boarder,
    );
    expect(boarder.hasPassword).toBe(true);

    expect(
      (
        await request(
          `/api/tenants/members/${ids.boarder}/password-link`,
          { method: "POST", body: JSON.stringify({ purpose: "reset" }) },
          staff,
        )
      ).status,
    ).toBe(403);

    const reset = await request(
      `/api/tenants/members/${ids.boarder}/password-link`,
      { method: "POST", body: JSON.stringify({ purpose: "reset" }) },
      admin,
    );
    const resetToken = String((await reset.json()).link).split("/set-password/").at(-1);
    await request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ token: resetToken, password: "neuespasswort" }),
    });

    expect(
      (
        await request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: "boarder@password.test", password: "geheim123" }),
        })
      ).status,
    ).toBe(401);

    const row = await db().select().from(users).where(eq(users.email, "boarder@password.test")).get();
    expect(row?.passwordHash).toBeTruthy();
  });

  it("returns a copyable invite link and requires a password on accept", async () => {
    await seedTenant(ids.inviteTenant, "Invite Hof");
    await seedMember(ids.inviteAdmin, "admin@invite.test", ids.inviteTenant, "hof_admin");
    const admin = await createSession(ids.inviteAdmin, ids.inviteTenant);

    const invite = await request(
      "/api/tenants/invites",
      {
        method: "POST",
        body: JSON.stringify({ email: "neu@invite.test", role: "boarder", name: "Neu" }),
      },
      admin,
    );
    expect(invite.status).toBe(200);
    const { inviteLink } = await invite.json();
    const token = String(inviteLink).split("/invite/").at(-1);

    expect(
      (
        await request("/api/auth/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token, name: "Neu" }),
        })
      ).status,
    ).toBe(400);

    const accepted = await request("/api/auth/invite/accept", {
      method: "POST",
      body: JSON.stringify({ token, name: "Neu", password: "willkommen1" }),
    });
    expect(accepted.status).toBe(200);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "neu@invite.test", password: "willkommen1" }),
    });
    expect(login.status).toBe(200);
  });
});
