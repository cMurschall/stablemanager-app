import { z } from "zod";

/** Runtime IDs are UUIDs; the local fixture also contains legacy 32-digit hex IDs. */
export const EntityIdSchema = z.string().trim().refine(
  (value) => z.string().uuid().safeParse(value).success || /^[a-f\d]{32}$/i.test(value),
  "Ungültige ID",
);

export const RoleSchema = z.enum(["hof_admin", "staff", "boarder"]);
export type Role = z.infer<typeof RoleSchema>;

export const HorseSexSchema = z.enum(["mare", "stallion", "gelding"]);
export type HorseSex = z.infer<typeof HorseSexSchema>;

export const CareEventTypeSchema = z.enum(["farrier", "vaccination"]);
export type CareEventType = z.infer<typeof CareEventTypeSchema>;

export const ResourceKindSchema = z.enum([
  "oval_track",
  "indoor_arena",
  "other",
]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

/** Where a horse lives on the yard */
export const AccommodationKindSchema = z.enum([
  "box",
  "paddock_box",
  "paddock",
  "pasture",
]);
export type AccommodationKind = z.infer<typeof AccommodationKindSchema>;

/** FEIF / WorldFengur-style ID: country code + digits (e.g. DE2023101234) */
export const FeifIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}\d{8,12}$/, "Ungültige FEIF-ID (z. B. DE2023101234)");

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MagicLinkRequestSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const PasswordSchema = z
  .string()
  .min(8, "Mindestens 8 Zeichen")
  .max(200);

export const PasswordLoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
});

export const PasswordTokenPurposeSchema = z.enum(["welcome", "reset"]);
export type PasswordTokenPurpose = z.infer<typeof PasswordTokenPurposeSchema>;

export const SetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});

export const CreatePasswordLinkSchema = z.object({
  purpose: PasswordTokenPurposeSchema,
});

export const SwitchTenantSchema = z.object({
  tenantId: EntityIdSchema,
});

export const CreateInviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: RoleSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  password: PasswordSchema,
});

export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  maxDailyServiceTasks: z.number().int().min(1).max(12).optional(),
});

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "UngÃ¼ltiges Datum");

export const CreateServiceOrderSchema = z
  .object({
    horseId: EntityIdSchema,
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().min(1).max(4000),
    startDate: LocalDateSchema,
    endDate: LocalDateSchema.optional(),
    durationDays: z.number().int().min(1).max(365).optional(),
    dailyCount: z.number().int().min(1).max(12),
  })
  .refine((data) => Boolean(data.endDate) !== Boolean(data.durationDays), {
    message: "Enddatum oder Dauer angeben",
  });

export const UpdateServiceOrderSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().min(1).max(4000).optional(),
  endDate: LocalDateSchema.optional(),
  dailyCount: z.number().int().min(1).max(12).optional(),
});

export const SetServiceSelfDaySchema = z.object({ date: LocalDateSchema });
export const CompleteServiceTaskSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

export const CreateHorseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  feifId: FeifIdSchema.optional().nullable(),
  sex: HorseSexSchema.optional().nullable(),
  birthYear: z.number().int().min(1980).max(2100).optional().nullable(),
  ownerUserIds: z.array(EntityIdSchema).max(50).optional().default([]),
  accommodationId: EntityIdSchema.optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const UpdateHorseSchema = CreateHorseSchema.partial().extend({
  active: z.boolean().optional(),
});

export const CreateAccommodationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: AccommodationKindSchema,
    /** Places: Box default 1; Paddockbox typically >1 */
    capacity: z.number().int().min(1).max(200).optional().nullable(),
    active: z.boolean().optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "paddock_box" && (data.capacity == null || data.capacity < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Paddockbox braucht Kapazität (≥ 2 Plätze)",
        path: ["capacity"],
      });
    }
    if (data.kind === "box" && data.capacity != null && data.capacity !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Eine Box hat genau 1 Platz",
        path: ["capacity"],
      });
    }
  });

export const UpdateAccommodationSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: AccommodationKindSchema.optional(),
  capacity: z.number().int().min(1).max(200).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** @deprecated use CreateAccommodationSchema */
export const CreateStallSchema = CreateAccommodationSchema;
/** @deprecated use UpdateAccommodationSchema */
export const UpdateStallSchema = UpdateAccommodationSchema;

export const CreateResourceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: ResourceKindSchema.default("other"),
});

export const UpdateResourceSchema = CreateResourceSchema.partial();

export const CreateBookingSchema = z.object({
  resourceId: EntityIdSchema,
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().max(2000).optional().nullable(),
  participantUserIds: z.array(EntityIdSchema).max(50).optional().default([]),
});

export const UpdateBookingSchema = CreateBookingSchema.partial();

export const CreateBulletinPostSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
  pinned: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const UpdateBulletinPostSchema = CreateBulletinPostSchema.partial();

export const CreateCareEventSchema = z.object({
  horseId: EntityIdSchema,
  type: CareEventTypeSchema,
  dueAt: z.string().datetime(),
  intervalDays: z.number().int().min(1).max(730).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateCareEventSchema = z.object({
  dueAt: z.string().datetime().optional(),
  doneAt: z.string().datetime().optional().nullable(),
  intervalDays: z.number().int().min(1).max(730).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const CompleteCareEventSchema = z.object({
  doneAt: z.string().datetime().optional(),
  createNext: z.boolean().optional().default(true),
});

export const BootstrapSchema = z.object({
  tenantName: z.string().trim().min(1).max(120).optional(),
  adminEmail: z.string().email().toLowerCase().trim().optional(),
  adminName: z.string().trim().min(1).max(120).optional(),
});

export const FarrierVisitStatusSchema = z.enum(["open", "closed"]);
export type FarrierVisitStatus = z.infer<typeof FarrierVisitStatusSchema>;

export const FarrierShoeingSchema = z.enum([
  "trim",
  "front_shoes",
  "all_shoes",
  "other",
]);
export type FarrierShoeing = z.infer<typeof FarrierShoeingSchema>;

export const FarrierPresentationSchema = z.enum(["staff", "owner"]);
export type FarrierPresentation = z.infer<typeof FarrierPresentationSchema>;

export const CreateFarrierVisitSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  farrierName: z.string().trim().min(1).max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateFarrierVisitSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  farrierName: z.string().trim().min(1).max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: FarrierVisitStatusSchema.optional(),
});

export const CreateFarrierSignupSchema = z.object({
  horseId: EntityIdSchema,
  shoeing: FarrierShoeingSchema,
  shoeingNotes: z.string().max(2000).optional().nullable(),
  presentation: FarrierPresentationSchema,
});

export const UpdateFarrierSignupSchema = z.object({
  shoeing: FarrierShoeingSchema.optional(),
  shoeingNotes: z.string().max(2000).optional().nullable(),
  presentation: FarrierPresentationSchema.optional(),
});

export const BillFarrierSignupSchema = z.object({
  billed: z.boolean().optional().default(true),
});

export const TrainingLogTypeSchema = z.string().trim().min(1).max(80);
export type TrainingLogType = z.infer<typeof TrainingLogTypeSchema>;

export const CreateTrainingTypeSchema = z.object({
  name: TrainingLogTypeSchema,
});

export const CreateTrainingLogSchema = z.object({
  horseId: EntityIdSchema,
  date: LocalDateSchema,
  type: TrainingLogTypeSchema,
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateTrainingLogSchema = z.object({
  date: LocalDateSchema.optional(),
  type: TrainingLogTypeSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Serializable backup of one tenant (v1). Entity rows keep original IDs. */
const BackupScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const BackupRowSchema = z.record(BackupScalarSchema);

export const TenantBackupV1Schema = z.object({
  version: z.literal(1),
  format: z.literal("stablemanager-backup-v1"),
  exportedAt: z.string().min(1),
  tenant: z.object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().optional(),
    timezone: z.string().min(1),
    maxDailyServiceTasks: z.number().int().min(1).max(12),
  }),
  users: z.array(
    z.object({
      id: EntityIdSchema,
      email: z.string().email().toLowerCase(),
      name: z.string().min(1),
    }),
  ),
  members: z.array(
    z.object({
      userId: EntityIdSchema,
      email: z.string().email().toLowerCase(),
      name: z.string().min(1),
      role: RoleSchema,
    }),
  ),
  accommodations: z.array(BackupRowSchema),
  horses: z.array(BackupRowSchema),
  horseOwners: z.array(BackupRowSchema),
  horseAccommodationHistory: z.array(BackupRowSchema),
  resources: z.array(BackupRowSchema),
  bookings: z.array(BackupRowSchema),
  bookingParticipants: z.array(BackupRowSchema),
  bulletinPosts: z.array(BackupRowSchema),
  trainingTypes: z.array(BackupRowSchema),
  trainingLogs: z.array(BackupRowSchema),
  careEvents: z.array(BackupRowSchema),
  notifications: z.array(BackupRowSchema),
  farrierVisits: z.array(BackupRowSchema),
  farrierSignups: z.array(BackupRowSchema),
  serviceOrders: z.array(BackupRowSchema),
  serviceOrderSelfDays: z.array(BackupRowSchema),
  serviceTaskCompletions: z.array(BackupRowSchema),
  invites: z.array(BackupRowSchema),
});

export type TenantBackupV1 = z.infer<typeof TenantBackupV1Schema>;
