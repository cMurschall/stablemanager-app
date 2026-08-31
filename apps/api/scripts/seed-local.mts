/**
 * Seed local D1 with the full demo yard snapshot:
 * tenant, users/memberships, resources, accommodations, horses.
 *
 *   pnpm seed
 *   pnpm seed:reset
 *
 * If no tenant exists, creates the Kjoelavik development fixture first.
 * `--reset` replaces demo rows for this tenant from the DEMO_* sources.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_ACCOMMODATIONS } from "../src/lib/demoAccommodations.ts";
import { DEMO_HORSES } from "../src/lib/demoHorses.ts";
import { DEMO_RESOURCES } from "../src/lib/demoResources.ts";
import { DEMO_TENANT } from "../src/lib/demoTenant.ts";
import { DEMO_USERS } from "../src/lib/demoUsers.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const reset = process.argv.includes("--reset");

function wranglerD1(extraArgs: string[]): string {
  const args = [
    "d1",
    "execute",
    "stablemanager",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--json",
    ...extraArgs,
  ]
    .map((a) => (/\s/.test(a) ? `"${a}"` : a))
    .join(" ");
  return execSync(`pnpm exec wrangler ${args}`, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runSql(sql: string) {
  const tmp = join(ROOT, `.seed-tmp-${randomUUID()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    return wranglerD1(["--file", tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function queryJson<T>(sql: string): T[] {
  const raw = wranglerD1(["--command", sql]);
  const start = raw.indexOf("[");
  if (start < 0) return [];
  const parsed = JSON.parse(raw.slice(start)) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function esc(s: string) {
  return s.replaceAll("'", "''");
}

function sqlList(values: string[]) {
  return values.map((v) => `'${esc(v)}'`).join(", ");
}

function ensureTenant(): string {
  const existing = queryJson<{ id: string }>("SELECT id FROM tenants LIMIT 1;");
  if (existing[0]?.id) return existing[0].id;

  const tenantId = randomUUID();
  runSql(`
BEGIN TRANSACTION;
INSERT INTO tenants (id, name, slug, timezone) VALUES (
  '${tenantId}',
  '${esc(DEMO_TENANT.name)}',
  '${esc(DEMO_TENANT.slug)}',
  '${esc(DEMO_TENANT.timezone)}'
);
COMMIT;
`);
  console.log(`Demo-Hof angelegt (${tenantId})`);
  return tenantId;
}

const LEGACY_ACCOMMODATION_NAMES = [
  "Box 1",
  "Paddockbox Nord",
  "Paddock Ost",
  "Außenweide Süd",
];

const tenantId = ensureTenant();

const feifIds = DEMO_HORSES.map((h) => h.feifId);
const userEmails = DEMO_USERS.map((u) => u.email);
const accNames = DEMO_ACCOMMODATIONS.map((a) => a.name);
const resourceNames = DEMO_RESOURCES.map((r) => r.name);

const lines: string[] = ["BEGIN TRANSACTION;"];

// Always drop legacy placeholder accommodations
lines.push(
  `UPDATE horses SET accommodation_id = NULL WHERE tenant_id = '${tenantId}' ` +
    `AND accommodation_id IN (SELECT id FROM accommodations WHERE tenant_id = '${tenantId}' AND name IN (${sqlList(LEGACY_ACCOMMODATION_NAMES)}));`,
);
lines.push(
  `DELETE FROM accommodations WHERE tenant_id = '${tenantId}' AND name IN (${sqlList(LEGACY_ACCOMMODATION_NAMES)});`,
);

if (reset) {
  lines.push(
    `UPDATE tenants SET name = '${esc(DEMO_TENANT.name)}', slug = '${esc(DEMO_TENANT.slug)}', timezone = '${esc(DEMO_TENANT.timezone)}' WHERE id = '${tenantId}';`,
  );
  lines.push(
    `DELETE FROM horse_accommodation_history WHERE tenant_id = '${tenantId}' ` +
      `AND horse_id IN (SELECT id FROM horses WHERE tenant_id = '${tenantId}' AND feif_id IN (${sqlList(feifIds)}));`,
  );
  lines.push(
    `DELETE FROM horses WHERE tenant_id = '${tenantId}' AND feif_id IN (${sqlList(feifIds)});`,
  );
  lines.push(
    `DELETE FROM accommodations WHERE tenant_id = '${tenantId}' AND name IN (${sqlList(accNames)});`,
  );
  lines.push(
    `DELETE FROM resources WHERE tenant_id = '${tenantId}' AND name IN (${sqlList(resourceNames)});`,
  );
  lines.push(
    `DELETE FROM memberships WHERE tenant_id = '${tenantId}' ` +
      `AND user_id IN (SELECT id FROM users WHERE email IN (${sqlList(userEmails)}));`,
  );
  // Keep users that may still be referenced elsewhere; only remove orphaned demo emails
  lines.push(
    `DELETE FROM users WHERE email IN (${sqlList(userEmails)}) ` +
      `AND id NOT IN (SELECT user_id FROM memberships) ` +
      `AND id NOT IN (SELECT user_id FROM sessions);`,
  );
}

for (const u of DEMO_USERS) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  lines.push(
    `INSERT OR IGNORE INTO users (id, email, name) VALUES ('${userId}', '${esc(u.email)}', '${esc(u.name)}');`,
  );
  lines.push(
    `INSERT OR IGNORE INTO memberships (id, user_id, tenant_id, role) ` +
      `SELECT '${membershipId}', u.id, '${tenantId}', '${u.role}' FROM users u WHERE u.email = '${esc(u.email)}' ` +
      `AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.tenant_id = '${tenantId}');`,
  );
}

for (const r of DEMO_RESOURCES) {
  lines.push(
    `INSERT INTO resources (id, tenant_id, name, kind) ` +
      `SELECT '${randomUUID()}', '${tenantId}', '${esc(r.name)}', '${r.kind}' ` +
      `WHERE NOT EXISTS (SELECT 1 FROM resources WHERE tenant_id = '${tenantId}' AND name = '${esc(r.name)}');`,
  );
}

for (const a of DEMO_ACCOMMODATIONS) {
  const capacity = a.capacity == null ? "NULL" : String(a.capacity);
  lines.push(
    `INSERT INTO accommodations (id, tenant_id, name, kind, capacity, notes) ` +
      `SELECT '${randomUUID()}', '${tenantId}', '${esc(a.name)}', '${a.kind}', ${capacity}, NULL ` +
      `WHERE NOT EXISTS (SELECT 1 FROM accommodations WHERE tenant_id = '${tenantId}' AND name = '${esc(a.name)}');`,
  );
}

for (const h of DEMO_HORSES) {
  lines.push(
    `INSERT OR IGNORE INTO horses (id, tenant_id, name, feif_id, sex, birth_year, notes) ` +
      `VALUES ('${randomUUID()}', '${tenantId}', '${esc(h.name)}', '${h.feifId}', '${h.sex}', ${h.birthYear}, NULL);`,
  );
}

lines.push("COMMIT;");
runSql(lines.join("\n"));

console.log(`Seed OK — ${DEMO_TENANT.name} (${tenantId})` + (reset ? " (reset)" : ""));
console.log(`  Nutzer (${DEMO_USERS.length}):`);
for (const u of DEMO_USERS) {
  console.log(`    • ${u.name} <${u.email}> [${u.role}]`);
}
console.log(`  Ressourcen (${DEMO_RESOURCES.length}):`);
for (const r of DEMO_RESOURCES) {
  console.log(`    • ${r.name} (${r.kind})`);
}
console.log(`  Unterbringungen (${DEMO_ACCOMMODATIONS.length}):`);
for (const a of DEMO_ACCOMMODATIONS) {
  console.log(`    • ${a.name} (${a.kind})`);
}
console.log(`  Pferde (${DEMO_HORSES.length}):`);
for (const h of DEMO_HORSES) {
  console.log(`    • ${h.name} (${h.feifId})`);
}
