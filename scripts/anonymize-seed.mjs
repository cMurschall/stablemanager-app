#!/usr/bin/env node
/**
 * Reads seed-horses.sql (full local names) and writes an anonymized copy
 * for remote/staging seeds: "Anna Krummel" → "Anna K.", emails similarly.
 *
 * Usage:
 *   node scripts/anonymize-seed.mjs [input.sql] [output.sql]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(root, process.argv[2] ?? "seed-horses.sql");
const outputPath = resolve(
  root,
  process.argv[3] ?? "apps/api/.wrangler/tmp/seed-horses.remote.sql",
);

function anonymizeDisplayName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last[0]?.toLocaleUpperCase("de-DE") ?? "";
  if (!initial) return name;
  return `${first} ${initial}.`;
}

/** firstname-lastname-extra@seed.local → firstname-l@seed.local */
function anonymizeSeedEmail(email) {
  const match = email.match(/^([a-z0-9]+)(?:-([a-z0-9-]+))?@(seed\.local)$/i);
  if (!match) return email;
  const [, first, rest, domain] = match;
  if (!rest) return email;
  const initial = rest[0].toLowerCase();
  return `${first}-${initial}@${domain}`;
}

function buildMaps(sql) {
  const nameByOriginal = new Map();
  const emailByOriginal = new Map();

  // Pairs like ('email@seed.local', 'Full Name') — multi-line safe
  const pairRe =
    /\(\s*'([^']+@(?:seed\.local|example\.com))'\s*,\s*'([^']+)'\s*\)/g;
  for (const m of sql.matchAll(pairRe)) {
    const email = m[1];
    const name = m[2];
    if (email.endsWith("@seed.local")) {
      const anonEmail = anonymizeSeedEmail(email);
      if (anonEmail !== email) emailByOriginal.set(email, anonEmail);
    }
    const anonName = anonymizeDisplayName(name);
    if (anonName !== name) nameByOriginal.set(name, anonName);
  }

  // Single-line user inserts: ..., 'email', 'Full Name'
  const inlineRe =
    /'([^']+@(?:seed\.local|example\.com))'\s*,\s*'([^']+)'/g;
  for (const m of sql.matchAll(inlineRe)) {
    const email = m[1];
    const name = m[2];
    if (email.endsWith("@seed.local")) {
      const anonEmail = anonymizeSeedEmail(email);
      if (anonEmail !== email) emailByOriginal.set(email, anonEmail);
    }
    const anonName = anonymizeDisplayName(name);
    if (anonName !== name) nameByOriginal.set(name, anonName);
  }

  // Standalone seed.local emails (ownership CTE without adjacent name)
  const emailOnlyRe = /'([^']+@seed\.local)'/g;
  for (const m of sql.matchAll(emailOnlyRe)) {
    const email = m[1];
    const anonEmail = anonymizeSeedEmail(email);
    if (anonEmail !== email) emailByOriginal.set(email, anonEmail);
  }

  // SET name = 'Full Name'
  const setNameRe = /SET name = '([^']+)'/g;
  for (const m of sql.matchAll(setNameRe)) {
    const name = m[1];
    const anonName = anonymizeDisplayName(name);
    if (anonName !== name) nameByOriginal.set(name, anonName);
  }

  return { nameByOriginal, emailByOriginal };
}

function applyMaps(sql, { nameByOriginal, emailByOriginal }) {
  let out = sql;

  // Longer keys first so we don't partially replace
  const emails = [...emailByOriginal.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [from, to] of emails) {
    out = out.split(from).join(to);
  }

  const names = [...nameByOriginal.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [from, to] of names) {
    out = out.split(`'${from}'`).join(`'${to}'`);
  }

  return out;
}

const sql = readFileSync(inputPath, "utf8");
const maps = buildMaps(sql);
const anonymized = applyMaps(sql, maps);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, anonymized, "utf8");

console.log(
  `Anonymized seed: ${maps.nameByOriginal.size} names, ${maps.emailByOriginal.size} emails`,
);
console.log(`Wrote ${outputPath}`);
