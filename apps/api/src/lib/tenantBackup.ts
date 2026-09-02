import { eq, inArray } from "drizzle-orm";
import type { TenantBackupV1 } from "@stablemanager/shared";
import type { Db } from "../db/client";
import {
  accommodations,
  bookingParticipants,
  bookings,
  bulletinPosts,
  careEvents,
  farrierSignups,
  farrierVisits,
  horseAccommodationHistory,
  horseOwners,
  horses,
  invites,
  memberships,
  notifications,
  resources,
  serviceOrderSelfDays,
  serviceOrders,
  serviceTaskCompletions,
  tenants,
  trainingLogs,
  trainingTypes,
  users,
} from "../db/schema";
import { id as newId } from "./crypto";

const CHUNK = 40;

export type BackupSummary = {
  members: number;
  accommodations: number;
  horses: number;
  resources: number;
  bookings: number;
  bulletinPosts: number;
  trainingTypes: number;
  trainingLogs: number;
  careEvents: number;
  notifications: number;
  farrierVisits: number;
  farrierSignups: number;
  serviceOrders: number;
  invites: number;
};

function collectUserIds(...groups: Array<Iterable<string | null | undefined>>) {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      if (value) ids.add(value);
    }
  }
  return [...ids];
}

async function insertChunks<T extends Record<string, unknown>>(
  db: Db,
  table: Parameters<Db["insert"]>[0],
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    if (slice.length) {
      await db.insert(table).values(slice as never);
    }
  }
}

function mapUser(
  map: Map<string, string>,
  backupUserId: string | null | undefined,
): string | null {
  if (!backupUserId) return null;
  return map.get(backupUserId) ?? null;
}

function requireUser(map: Map<string, string>, backupUserId: string): string {
  const live = map.get(backupUserId);
  if (!live) {
    throw new Error(`Unbekannter Benutzer im Backup: ${backupUserId}`);
  }
  return live;
}

export async function exportTenantBackup(
  db: Db,
  tenantId: string,
): Promise<TenantBackupV1> {
  const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).get();
  if (!tenant) {
    throw new Error("Hof nicht gefunden");
  }

  const memberRows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, tenantId))
    .all();

  const accommodationRows = await db
    .select()
    .from(accommodations)
    .where(eq(accommodations.tenantId, tenantId))
    .all();
  const horseRows = await db.select().from(horses).where(eq(horses.tenantId, tenantId)).all();
  const horseOwnerRows = await db
    .select()
    .from(horseOwners)
    .where(eq(horseOwners.tenantId, tenantId))
    .all();
  const historyRows = await db
    .select()
    .from(horseAccommodationHistory)
    .where(eq(horseAccommodationHistory.tenantId, tenantId))
    .all();
  const resourceRows = await db
    .select()
    .from(resources)
    .where(eq(resources.tenantId, tenantId))
    .all();
  const bookingRows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.tenantId, tenantId))
    .all();
  const bookingIds = bookingRows.map((row) => row.id);
  const participantRows = bookingIds.length
    ? await db
        .select()
        .from(bookingParticipants)
        .where(inArray(bookingParticipants.bookingId, bookingIds))
        .all()
    : [];
  const bulletinRows = await db
    .select()
    .from(bulletinPosts)
    .where(eq(bulletinPosts.tenantId, tenantId))
    .all();
  const trainingTypeRows = await db
    .select()
    .from(trainingTypes)
    .where(eq(trainingTypes.tenantId, tenantId))
    .all();
  const trainingLogRows = await db
    .select()
    .from(trainingLogs)
    .where(eq(trainingLogs.tenantId, tenantId))
    .all();
  const careRows = await db
    .select()
    .from(careEvents)
    .where(eq(careEvents.tenantId, tenantId))
    .all();
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.tenantId, tenantId))
    .all();
  const visitRows = await db
    .select()
    .from(farrierVisits)
    .where(eq(farrierVisits.tenantId, tenantId))
    .all();
  const signupRows = await db
    .select()
    .from(farrierSignups)
    .where(eq(farrierSignups.tenantId, tenantId))
    .all();
  const orderRows = await db
    .select()
    .from(serviceOrders)
    .where(eq(serviceOrders.tenantId, tenantId))
    .all();
  const orderIds = orderRows.map((row) => row.id);
  const selfDayRows = orderIds.length
    ? await db
        .select()
        .from(serviceOrderSelfDays)
        .where(inArray(serviceOrderSelfDays.serviceOrderId, orderIds))
        .all()
    : [];
  const completionRows = orderIds.length
    ? await db
        .select()
        .from(serviceTaskCompletions)
        .where(inArray(serviceTaskCompletions.serviceOrderId, orderIds))
        .all()
    : [];
  const inviteRows = await db.select().from(invites).where(eq(invites.tenantId, tenantId)).all();

  const referencedUserIds = collectUserIds(
    memberRows.map((m) => m.userId),
    horseRows.map((h) => h.ownerUserId),
    horseOwnerRows.map((h) => h.userId),
    historyRows.map((h) => h.changedBy),
    bookingRows.map((b) => b.createdBy),
    participantRows.map((p) => p.userId),
    bulletinRows.map((p) => p.createdBy),
    trainingLogRows.map((t) => t.createdBy),
    notificationRows.map((n) => n.userId),
    visitRows.map((v) => v.createdBy),
    signupRows.map((s) => s.createdBy),
    signupRows.map((s) => s.presentedBy),
    orderRows.map((o) => o.createdBy),
    completionRows.map((c) => c.completedBy),
    inviteRows.map((i) => i.invitedBy),
  );

  const userRows = referencedUserIds.length
    ? await db.select().from(users).where(inArray(users.id, referencedUserIds)).all()
    : [];

  return {
    version: 1,
    format: "stablemanager-backup-v1",
    exportedAt: new Date().toISOString(),
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      maxDailyServiceTasks: tenant.maxDailyServiceTasks,
    },
    users: userRows.map((u) => ({
      id: u.id,
      email: u.email.toLowerCase(),
      name: u.name,
    })),
    members: memberRows.map((m) => ({
      userId: m.userId,
      email: m.email.toLowerCase(),
      name: m.name,
      role: m.role,
    })),
    accommodations: accommodationRows,
    horses: horseRows,
    horseOwners: horseOwnerRows,
    horseAccommodationHistory: historyRows,
    resources: resourceRows,
    bookings: bookingRows,
    bookingParticipants: participantRows,
    bulletinPosts: bulletinRows,
    trainingTypes: trainingTypeRows,
    trainingLogs: trainingLogRows,
    careEvents: careRows,
    notifications: notificationRows,
    farrierVisits: visitRows,
    farrierSignups: signupRows,
    serviceOrders: orderRows,
    serviceOrderSelfDays: selfDayRows,
    serviceTaskCompletions: completionRows,
    invites: inviteRows,
  };
}

async function clearTenantData(db: Db, tenantId: string) {
  const bookingIds = (
    await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.tenantId, tenantId)).all()
  ).map((row) => row.id);
  if (bookingIds.length) {
    await db.delete(bookingParticipants).where(inArray(bookingParticipants.bookingId, bookingIds));
  }

  const orderIds = (
    await db
      .select({ id: serviceOrders.id })
      .from(serviceOrders)
      .where(eq(serviceOrders.tenantId, tenantId))
      .all()
  ).map((row) => row.id);
  if (orderIds.length) {
    await db
      .delete(serviceTaskCompletions)
      .where(inArray(serviceTaskCompletions.serviceOrderId, orderIds));
    await db
      .delete(serviceOrderSelfDays)
      .where(inArray(serviceOrderSelfDays.serviceOrderId, orderIds));
  }

  await db.delete(notifications).where(eq(notifications.tenantId, tenantId));
  await db.delete(careEvents).where(eq(careEvents.tenantId, tenantId));
  await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
  await db.delete(farrierSignups).where(eq(farrierSignups.tenantId, tenantId));
  await db.delete(farrierVisits).where(eq(farrierVisits.tenantId, tenantId));
  await db.delete(trainingLogs).where(eq(trainingLogs.tenantId, tenantId));
  await db.delete(trainingTypes).where(eq(trainingTypes.tenantId, tenantId));
  await db.delete(bookings).where(eq(bookings.tenantId, tenantId));
  await db.delete(resources).where(eq(resources.tenantId, tenantId));
  await db.delete(bulletinPosts).where(eq(bulletinPosts.tenantId, tenantId));
  await db.delete(horseOwners).where(eq(horseOwners.tenantId, tenantId));
  await db
    .delete(horseAccommodationHistory)
    .where(eq(horseAccommodationHistory.tenantId, tenantId));
  await db.delete(horses).where(eq(horses.tenantId, tenantId));
  await db.delete(accommodations).where(eq(accommodations.tenantId, tenantId));
  await db.delete(invites).where(eq(invites.tenantId, tenantId));
  await db.delete(memberships).where(eq(memberships.tenantId, tenantId));
}

async function resolveUsers(
  db: Db,
  backup: TenantBackupV1,
  actorUserId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const byEmail = new Map<string, { id: string; email: string; name: string }>();

  for (const user of backup.users) {
    byEmail.set(user.email.toLowerCase(), user);
  }
  for (const member of backup.members) {
    if (!byEmail.has(member.email.toLowerCase())) {
      byEmail.set(member.email.toLowerCase(), {
        id: member.userId,
        email: member.email.toLowerCase(),
        name: member.name,
      });
    }
  }

  for (const backupUser of byEmail.values()) {
    const email = backupUser.email.toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      map.set(backupUser.id, existing.id);
      if (existing.name !== backupUser.name) {
        await db.update(users).set({ name: backupUser.name }).where(eq(users.id, existing.id));
      }
    } else {
      const liveId = newId();
      await db.insert(users).values({
        id: liveId,
        email,
        name: backupUser.name,
      });
      map.set(backupUser.id, liveId);
    }
  }

  // Ensure actor is mapped (may already be via email)
  if (![...map.values()].includes(actorUserId)) {
    const actor = await db.select().from(users).where(eq(users.id, actorUserId)).get();
    if (actor) {
      const backupMatch = backup.users.find((u) => u.email.toLowerCase() === actor.email.toLowerCase());
      if (backupMatch) map.set(backupMatch.id, actorUserId);
    }
  }

  return map;
}

export async function restoreTenantBackup(
  db: Db,
  tenantId: string,
  actorUserId: string,
  backup: TenantBackupV1,
): Promise<BackupSummary> {
  const userMap = await resolveUsers(db, backup, actorUserId);

  await clearTenantData(db, tenantId);

  // Memberships from backup + force actor as hof_admin
  const membershipInserts: Array<{
    id: string;
    userId: string;
    tenantId: string;
    role: "hof_admin" | "staff" | "boarder";
  }> = [];
  const seenUsers = new Set<string>();

  for (const member of backup.members) {
    const liveUserId = requireUser(userMap, member.userId);
    if (seenUsers.has(liveUserId)) continue;
    seenUsers.add(liveUserId);
    membershipInserts.push({
      id: newId(),
      userId: liveUserId,
      tenantId,
      role: liveUserId === actorUserId ? "hof_admin" : member.role,
    });
  }

  if (!seenUsers.has(actorUserId)) {
    membershipInserts.push({
      id: newId(),
      userId: actorUserId,
      tenantId,
      role: "hof_admin",
    });
  } else {
    const actorMembership = membershipInserts.find((m) => m.userId === actorUserId);
    if (actorMembership) actorMembership.role = "hof_admin";
  }

  await insertChunks(db, memberships, membershipInserts);

  await insertChunks(
    db,
    accommodations,
    backup.accommodations.map((row) => ({
      ...row,
      tenantId,
      active: Boolean(row.active ?? true),
    })),
  );

  await insertChunks(
    db,
    horses,
    backup.horses.map((row) => ({
      ...row,
      tenantId,
      ownerUserId: mapUser(userMap, row.ownerUserId as string | null),
      active: Boolean(row.active ?? true),
    })),
  );

  await insertChunks(
    db,
    horseOwners,
    backup.horseOwners
      .map((row) => {
        const liveUserId = mapUser(userMap, row.userId as string);
        if (!liveUserId) return null;
        return {
          horseId: String(row.horseId),
          tenantId,
          userId: liveUserId,
          createdAt: (row.createdAt as string) ?? new Date().toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  );

  await insertChunks(
    db,
    horseAccommodationHistory,
    backup.horseAccommodationHistory.map((row) => ({
      ...row,
      tenantId,
      changedBy: mapUser(userMap, row.changedBy as string | null),
    })),
  );

  await insertChunks(
    db,
    resources,
    backup.resources.map((row) => ({ ...row, tenantId })),
  );

  await insertChunks(
    db,
    bookings,
    backup.bookings.map((row) => ({
      ...row,
      tenantId,
      createdBy: mapUser(userMap, row.createdBy as string | null),
    })),
  );

  await insertChunks(
    db,
    bookingParticipants,
    backup.bookingParticipants
      .map((row) => {
        const liveUserId = mapUser(userMap, row.userId as string);
        if (!liveUserId) return null;
        return {
          bookingId: String(row.bookingId),
          userId: liveUserId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  );

  await insertChunks(
    db,
    bulletinPosts,
    backup.bulletinPosts.map((row) => ({
      ...row,
      tenantId,
      pinned: Boolean(row.pinned ?? false),
      createdBy: mapUser(userMap, row.createdBy as string | null),
    })),
  );

  await insertChunks(
    db,
    trainingTypes,
    backup.trainingTypes.map((row) => ({ ...row, tenantId })),
  );

  await insertChunks(
    db,
    trainingLogs,
    backup.trainingLogs.map((row) => ({
      ...row,
      tenantId,
      createdBy: mapUser(userMap, row.createdBy as string | null),
    })),
  );

  await insertChunks(
    db,
    careEvents,
    backup.careEvents.map((row) => ({ ...row, tenantId })),
  );

  await insertChunks(
    db,
    notifications,
    backup.notifications
      .map((row) => {
        const liveUserId = mapUser(userMap, row.userId as string);
        if (!liveUserId) return null;
        return {
          ...row,
          tenantId,
          userId: liveUserId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  );

  await insertChunks(
    db,
    farrierVisits,
    backup.farrierVisits.map((row) => ({
      ...row,
      tenantId,
      createdBy: mapUser(userMap, row.createdBy as string | null),
    })),
  );

  await insertChunks(
    db,
    farrierSignups,
    backup.farrierSignups.map((row) => ({
      ...row,
      tenantId,
      createdBy: mapUser(userMap, row.createdBy as string | null),
      presentedBy: mapUser(userMap, row.presentedBy as string | null),
    })),
  );

  await insertChunks(
    db,
    serviceOrders,
    backup.serviceOrders.map((row) => ({
      ...row,
      tenantId,
      createdBy: mapUser(userMap, row.createdBy as string | null),
    })),
  );

  await insertChunks(db, serviceOrderSelfDays, backup.serviceOrderSelfDays);
  await insertChunks(
    db,
    serviceTaskCompletions,
    backup.serviceTaskCompletions.map((row) => ({
      ...row,
      completedBy: mapUser(userMap, row.completedBy as string | null),
    })),
  );

  await insertChunks(
    db,
    invites,
    backup.invites.map((row) => ({
      ...row,
      tenantId,
      invitedBy: mapUser(userMap, row.invitedBy as string | null),
    })),
  );

  await db
    .update(tenants)
    .set({
      name: backup.tenant.name,
      timezone: backup.tenant.timezone,
      maxDailyServiceTasks: backup.tenant.maxDailyServiceTasks,
    })
    .where(eq(tenants.id, tenantId));

  return {
    members: membershipInserts.length,
    accommodations: backup.accommodations.length,
    horses: backup.horses.length,
    resources: backup.resources.length,
    bookings: backup.bookings.length,
    bulletinPosts: backup.bulletinPosts.length,
    trainingTypes: backup.trainingTypes.length,
    trainingLogs: backup.trainingLogs.length,
    careEvents: backup.careEvents.length,
    notifications: backup.notifications.length,
    farrierVisits: backup.farrierVisits.length,
    farrierSignups: backup.farrierSignups.length,
    serviceOrders: backup.serviceOrders.length,
    invites: backup.invites.length,
  };
}
