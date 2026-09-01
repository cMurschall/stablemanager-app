import { describe, expect, it } from "vitest";
import { careEvents, farrierSignups, farrierVisits, horseOwners, horses, trainingLogs } from "../src/db/schema";
import { createSession, db, ids, request, seedMember, seedTenant } from "./helpers";

const horseA = "00000000-0000-4000-8000-000000000101";
const horseOther = "00000000-0000-4000-8000-000000000102";
const horseB = "00000000-0000-4000-8000-000000000103";

describe("tenant isolation and boarder ownership", () => {
  it("never exposes cross-tenant records and limits boarders to their horses", async () => {
    await seedTenant(ids.tenantA, "Hof Alpha");
    await seedTenant(ids.tenantB, "Hof Beta");
    await seedMember(ids.admin, "admin@tenant.test", ids.tenantA, "hof_admin");
    await seedMember(ids.boarder, "boarder@tenant.test", ids.tenantA, "boarder");
    await seedMember(ids.otherBoarder, "other@tenant.test", ids.tenantA, "boarder");
    const admin = await createSession(ids.admin, ids.tenantA);
    const boarder = await createSession(ids.boarder, ids.tenantA);

    await db().insert(horses).values([
      { id: horseA, tenantId: ids.tenantA, name: "Mein Pferd" },
      { id: horseOther, tenantId: ids.tenantA, name: "Fremdes Pferd" },
      { id: horseB, tenantId: ids.tenantB, name: "Pferd Beta" },
    ]);
    await db().insert(horseOwners).values({ horseId: horseA, tenantId: ids.tenantA, userId: ids.boarder });
    await db().insert(careEvents).values([
      { id: crypto.randomUUID(), tenantId: ids.tenantA, horseId: horseA, type: "farrier", dueAt: "2026-09-01T10:00:00.000Z" },
      { id: crypto.randomUUID(), tenantId: ids.tenantA, horseId: horseOther, type: "vaccination", dueAt: "2026-09-02T10:00:00.000Z" },
    ]);
    await db().insert(trainingLogs).values([
      { id: crypto.randomUUID(), tenantId: ids.tenantA, horseId: horseA, date: "2026-09-01", type: "Ritt" },
      { id: crypto.randomUUID(), tenantId: ids.tenantA, horseId: horseOther, date: "2026-09-01", type: "Longe" },
    ]);
    const visitId = crypto.randomUUID();
    await db().insert(farrierVisits).values({ id: visitId, tenantId: ids.tenantA, startsAt: "2026-09-01T10:00:00.000Z", status: "open" });
    await db().insert(farrierSignups).values([
      { id: crypto.randomUUID(), tenantId: ids.tenantA, visitId, horseId: horseA, shoeing: "trim", presentation: "owner" },
      { id: crypto.randomUUID(), tenantId: ids.tenantA, visitId, horseId: horseOther, shoeing: "trim", presentation: "owner" },
    ]);

    const adminHorses = await request("/api/horses", {}, admin);
    expect((await adminHorses.json()).horses.map((horse: { id: string }) => horse.id)).toEqual([horseOther, horseA]);
    for (const path of [`/api/horses/${horseB}`, `/api/horses/${horseB}/accommodation-history`]) {
      expect((await request(path, {}, admin)).status).toBe(404);
    }
    expect((await request(`/api/horses/${horseB}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "cross-tenant" }),
    }, admin)).status).toBe(404);
    expect((await request(`/api/horses/${horseB}`, { method: "DELETE" }, admin)).status).toBe(404);

    expect((await (await request("/api/horses", {}, boarder)).json()).horses.map((horse: { id: string }) => horse.id)).toEqual([horseA]);
    expect((await (await request("/api/care-events", {}, boarder)).json()).careEvents.map((event: { horseId: string }) => event.horseId)).toEqual([horseA]);
    expect((await (await request("/api/training-logs?date=2026-09-01", {}, boarder)).json()).trainingLogs.map((entry: { horseId: string }) => entry.horseId)).toEqual([horseA]);
    const visits = await (await request("/api/farrier/visits", {}, boarder)).json();
    expect(visits.visits[0].signups.map((signup: { horseId: string }) => signup.horseId)).toEqual([horseA]);
  });
});
