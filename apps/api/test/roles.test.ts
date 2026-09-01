import { describe, expect, it } from "vitest";
import { horses } from "../src/db/schema";
import { createSession, db, ids, request, seedMember, seedTenant } from "./helpers";

describe("role boundaries", () => {
  it("allows staff operational writes but reserves tenant settings for the admin", async () => {
    await seedTenant(ids.tenantA, "Role Testhof");
    await seedMember(ids.admin, "admin@roles.test", ids.tenantA, "hof_admin");
    await seedMember(ids.staff, "staff@roles.test", ids.tenantA, "staff");
    await seedMember(ids.boarder, "boarder@roles.test", ids.tenantA, "boarder");
    const [admin, staff, boarder] = await Promise.all([
      createSession(ids.admin, ids.tenantA),
      createSession(ids.staff, ids.tenantA),
      createSession(ids.boarder, ids.tenantA),
    ]);

    const horse = await request("/api/horses", {
      method: "POST",
      body: JSON.stringify({ name: "Staff Pferd", ownerUserIds: [ids.boarder] }),
    }, staff);
    expect(horse.status).toBe(201);
    const horseId = (await horse.json()).horse.id;
    expect((await request(`/api/horses/${horseId}`, { method: "PATCH", body: JSON.stringify({ notes: "bearbeitet" }) }, staff)).status).toBe(200);

    expect((await request("/api/housing/accommodations", {
      method: "POST",
      body: JSON.stringify({ name: "Paddock", kind: "paddock", capacity: 4 }),
    }, staff)).status).toBe(201);
    expect((await request("/api/tenants/current", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nicht erlaubt" }),
    }, staff)).status).toBe(403);
    expect((await request("/api/tenants/current", {
      method: "PATCH",
      body: JSON.stringify({ name: "Admin erlaubt" }),
    }, admin)).status).toBe(200);

    expect((await request("/api/horses", {
      method: "POST",
      body: JSON.stringify({ name: "Nicht erlaubt" }),
    }, boarder)).status).toBe(403);
    const visible = await request("/api/horses", {}, boarder);
    expect((await visible.json()).horses.map((entry: { id: string }) => entry.id)).toEqual([horseId]);
    expect((await db().select().from(horses).all())).toHaveLength(1);
  });
});
