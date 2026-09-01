import { and, eq, inArray, sql } from "drizzle-orm";
import { horseOwners, memberships } from "../db/schema";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/** SQL predicate for queries that already include the horses table. */
export function horseOwnerAccess(horseId: unknown, tenantId: string, userId: string) {
  return sql`exists (select 1 from ${horseOwners} where ${horseOwners.horseId} = ${horseId} and ${horseOwners.tenantId} = ${tenantId} and ${horseOwners.userId} = ${userId})`;
}

export async function isHorseOwner(
  db: Db,
  tenantId: string,
  horseId: string,
  userId: string,
): Promise<boolean> {
  return Boolean(
    await db
      .select({ horseId: horseOwners.horseId })
      .from(horseOwners)
      .where(
        and(
          eq(horseOwners.tenantId, tenantId),
          eq(horseOwners.horseId, horseId),
          eq(horseOwners.userId, userId),
        ),
      )
      .get(),
  );
}

export async function horseOwnerIds(
  db: Db,
  tenantId: string,
  horseIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!horseIds.length) return result;
  const rows = await db
    .select({ horseId: horseOwners.horseId, userId: horseOwners.userId })
    .from(horseOwners)
    .where(and(eq(horseOwners.tenantId, tenantId), inArray(horseOwners.horseId, horseIds)))
    .all();
  for (const row of rows) {
    result.set(row.horseId, [...(result.get(row.horseId) ?? []), row.userId]);
  }
  return result;
}

export async function ownersAreTenantMembers(
  db: Db,
  tenantId: string,
  ownerUserIds: string[],
): Promise<boolean> {
  if (!ownerUserIds.length) return true;
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), inArray(memberships.userId, ownerUserIds)))
    .all();
  return members.length === ownerUserIds.length;
}
