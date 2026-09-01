import type {
  AccommodationKind,
  CareEventType,
  HorseSex,
  ResourceKind,
  Role,
  TrainingLogType,
} from "@stablemanager/shared";

export type Horse = {
  id: string;
  tenantId: string;
  name: string;
  feifId: string | null;
  sex: HorseSex | null;
  birthYear: number | null;
  ownerUserIds: string[];
  accommodationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccommodationHistoryEntry = {
  id: string;
  horseId: string;
  accommodationId: string | null;
  accommodationName: string | null;
  accommodationKind: AccommodationKind | null;
  startedAt: string;
  endedAt: string | null;
  changedBy: string | null;
};

export type Accommodation = {
  id: string;
  tenantId: string;
  name: string;
  kind: AccommodationKind;
  capacity: number | null;
  notes: string | null;
  createdAt: string;
};

export type Resource = {
  id: string;
  tenantId: string;
  name: string;
  kind: ResourceKind;
  createdAt: string;
};

export type Booking = {
  id: string;
  tenantId: string;
  resourceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  horseId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  horseName: string | null;
  resourceName: string;
  resourceKind: ResourceKind;
};

export type BulletinPost = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  pinned: boolean;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type CareEvent = {
  id: string;
  tenantId: string;
  horseId: string;
  type: CareEventType;
  dueAt: string;
  doneAt: string | null;
  intervalDays: number | null;
  notes: string | null;
  createdAt: string;
  horseName: string;
};

export type Notification = {
  id: string;
  tenantId: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  careEventId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  maxDailyServiceTasks: number;
  createdAt: string;
};

export type ServiceOrder = {
  id: string;
  tenantId: string;
  horseId: string;
  horseName: string;
  title: string;
  instructions: string;
  startDate: string;
  endDate: string;
  dailyCount: number;
  createdBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  selfDays: string[];
};

export type DailyTask = {
  source: "service" | "farrier";
  id: string;
  serviceOrderId?: string;
  horseId: string;
  horseName: string;
  title: string;
  instructions: string | null;
  occurrence: number;
  completedAt: string | null;
  completedBy: string | null;
  note: string | null;
};

export type Member = {
  userId: string;
  email: string;
  name: string;
  role: Role;
};

export type Invite = {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type FarrierVisitStatus = "open" | "closed";
export type FarrierShoeing = "trim" | "front_shoes" | "all_shoes" | "other";
export type FarrierPresentation = "staff" | "owner";

export type FarrierSignup = {
  id: string;
  tenantId: string;
  visitId: string;
  horseId: string;
  shoeing: FarrierShoeing;
  shoeingNotes: string | null;
  presentation: FarrierPresentation;
  presentedAt: string | null;
  presentedBy: string | null;
  billedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  horseName: string;
  ownerName: string | null;
  visitStartsAt?: string;
  visitFarrierName?: string | null;
  visitStatus?: FarrierVisitStatus;
};

export type FarrierVisit = {
  id: string;
  tenantId: string;
  startsAt: string;
  endsAt: string | null;
  farrierName: string | null;
  notes: string | null;
  status: FarrierVisitStatus;
  createdBy: string | null;
  createdAt: string;
  signupCount?: number;
  signups: FarrierSignup[];
};

export type TrainingLog = {
  id: string;
  tenantId: string;
  horseId: string;
  date: string;
  type: TrainingLogType;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  horseName: string;
  createdByName: string | null;
};
