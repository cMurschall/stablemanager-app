import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  maxDailyServiceTasks: integer("max_daily_service_tasks")
    .notNull()
    .default(3),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["hof_admin", "staff", "boarder"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("memberships_user_tenant_uidx").on(t.userId, t.tenantId),
    index("memberships_tenant_idx").on(t.tenantId),
  ],
);

export const loginTokens = sqliteTable(
  "login_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("login_tokens_email_idx").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["hof_admin", "staff", "boarder"] }).notNull(),
    name: text("name"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    invitedBy: text("invited_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("invites_tenant_idx").on(t.tenantId),
    uniqueIndex("invites_token_hash_uidx").on(t.tokenHash),
  ],
);

export const accommodations = sqliteTable(
  "accommodations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["box", "paddock_box", "paddock", "pasture"],
    }).notNull(),
    capacity: integer("capacity"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("accommodations_tenant_idx").on(t.tenantId)],
);

/** @deprecated alias — use accommodations */
export const stalls = accommodations;

export const horses = sqliteTable(
  "horses",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    feifId: text("feif_id"),
    sex: text("sex", { enum: ["mare", "stallion", "gelding"] }),
    birthYear: integer("birth_year"),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    accommodationId: text("accommodation_id").references(
      () => accommodations.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("horses_tenant_idx").on(t.tenantId),
    uniqueIndex("horses_tenant_feif_uidx").on(t.tenantId, t.feifId),
    index("horses_owner_idx").on(t.tenantId, t.ownerUserId),
  ],
);

/** Equal co-owners of a horse. tenantId keeps ownership checks tenant-scoped. */
export const horseOwners = sqliteTable(
  "horse_owners",
  {
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("horse_owners_horse_user_uidx").on(t.horseId, t.userId),
    index("horse_owners_tenant_user_idx").on(t.tenantId, t.userId),
  ],
);

/** Periods a horse spent in an accommodation (ended_at null = current) */
export const horseAccommodationHistory = sqliteTable(
  "horse_accommodation_history",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    accommodationId: text("accommodation_id").references(
      () => accommodations.id,
      { onDelete: "set null" },
    ),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    changedBy: text("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("horse_acc_hist_horse_idx").on(t.horseId, t.startedAt),
    index("horse_acc_hist_tenant_idx").on(t.tenantId),
    index("horse_acc_hist_open_idx").on(t.horseId, t.endedAt),
  ],
);

export const resources = sqliteTable(
  "resources",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["oval_track", "indoor_arena", "other"],
    }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("resources_tenant_idx").on(t.tenantId)],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    horseId: text("horse_id").references(() => horses.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("bookings_tenant_time_idx").on(t.tenantId, t.startsAt, t.endsAt),
    index("bookings_resource_idx").on(t.resourceId, t.startsAt),
  ],
);

export const bulletinPosts = sqliteTable(
  "bulletin_posts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    expiresAt: text("expires_at"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("bulletin_posts_tenant_idx").on(t.tenantId)],
);

export const serviceOrders = sqliteTable(
  "service_orders",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    dailyCount: integer("daily_count").notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: text("cancelled_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("service_orders_tenant_dates_idx").on(t.tenantId, t.startDate, t.endDate),
    index("service_orders_horse_idx").on(t.horseId),
  ],
);

export const serviceOrderSelfDays = sqliteTable(
  "service_order_self_days",
  {
    id: text("id").primaryKey(),
    serviceOrderId: text("service_order_id")
      .notNull()
      .references(() => serviceOrders.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("service_order_self_days_order_date_uidx").on(t.serviceOrderId, t.date),
    index("service_order_self_days_date_idx").on(t.date),
  ],
);

export const serviceTaskCompletions = sqliteTable(
  "service_task_completions",
  {
    id: text("id").primaryKey(),
    serviceOrderId: text("service_order_id")
      .notNull()
      .references(() => serviceOrders.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    occurrence: integer("occurrence").notNull(),
    note: text("note"),
    completedBy: text("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: text("completed_at").notNull(),
  },
  (t) => [
    uniqueIndex("service_task_completions_task_uidx").on(
      t.serviceOrderId,
      t.date,
      t.occurrence,
    ),
    index("service_task_completions_date_idx").on(t.date),
  ],
);

export const careEvents = sqliteTable(
  "care_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["farrier", "vaccination"] }).notNull(),
    dueAt: text("due_at").notNull(),
    doneAt: text("done_at"),
    intervalDays: integer("interval_days"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("care_events_tenant_due_idx").on(t.tenantId, t.dueAt),
    index("care_events_horse_idx").on(t.horseId),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    careEventId: text("care_event_id").references(() => careEvents.id, {
      onDelete: "cascade",
    }),
    readAt: text("read_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt),
    index("notifications_tenant_idx").on(t.tenantId),
  ],
);

export const farrierVisits = sqliteTable(
  "farrier_visits",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    farrierName: text("farrier_name"),
    notes: text("notes"),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("farrier_visits_tenant_idx").on(t.tenantId, t.startsAt),
    index("farrier_visits_status_idx").on(t.tenantId, t.status),
  ],
);

export const farrierSignups = sqliteTable(
  "farrier_signups",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    visitId: text("visit_id")
      .notNull()
      .references(() => farrierVisits.id, { onDelete: "cascade" }),
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    shoeing: text("shoeing", {
      enum: ["trim", "front_shoes", "all_shoes", "other"],
    }).notNull(),
    shoeingNotes: text("shoeing_notes"),
    presentation: text("presentation", {
      enum: ["staff", "owner"],
    }).notNull(),
    presentedAt: text("presented_at"),
    presentedBy: text("presented_by").references(() => users.id, {
      onDelete: "set null",
    }),
    billedAt: text("billed_at"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("farrier_signups_visit_horse_uidx").on(t.visitId, t.horseId),
    index("farrier_signups_tenant_idx").on(t.tenantId),
    index("farrier_signups_visit_idx").on(t.visitId),
    index("farrier_signups_present_idx").on(t.tenantId, t.presentedAt),
  ],
);

export const trainingLogs = sqliteTable(
  "training_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    horseId: text("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    type: text("type", {
      enum: ["longe", "ridden", "trail", "rental"],
    }).notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("training_logs_tenant_date_idx").on(t.tenantId, t.date),
    index("training_logs_horse_date_idx").on(t.horseId, t.date),
  ],
);
