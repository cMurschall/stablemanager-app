import { env, exports } from "cloudflare:workers";
import { createDb } from "../src/db/client";
import { memberships, sessions, tenants, users } from "../src/db/schema";
import { sha256Hex } from "../src/lib/crypto";
import type { Role } from "@stablemanager/shared";

export const ids = {
  tenantA: "00000000-0000-4000-8000-000000000001",
  tenantB: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000011",
  staff: "00000000-0000-4000-8000-000000000012",
  boarder: "00000000-0000-4000-8000-000000000013",
  otherBoarder: "00000000-0000-4000-8000-000000000014",
};

export function db() {
  return createDb(env);
}

export async function seedTenant(id: string, name: string) {
  await db().insert(tenants).values({ id, name, slug: name.toLowerCase().replaceAll(" ", "-") });
}

export async function seedMember(
  id: string,
  email: string,
  tenantId: string,
  role: Role,
) {
  await db().insert(users).values({ id, email, name: email.split("@")[0] ?? email });
  await db().insert(memberships).values({
    id: crypto.randomUUID(),
    userId: id,
    tenantId,
    role,
  });
}

export async function createSession(userId: string, tenantId: string) {
  const token = crypto.randomUUID();
  await db().insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tenantId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  return token;
}

export async function request(
  path: string,
  options: RequestInit = {},
  session?: string,
) {
  const headers = new Headers(options.headers);
  if (session) headers.set("Cookie", `sm_session=${session}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return exports.default.fetch(
    new Request(`https://stablemanager.test${path}`, { ...options, headers }),
  );
}

export function cookieFrom(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("Expected a session cookie");
  const match = /sm_session=([^;]+)/.exec(header);
  if (!match) throw new Error("Expected sm_session cookie");
  return match[1];
}
