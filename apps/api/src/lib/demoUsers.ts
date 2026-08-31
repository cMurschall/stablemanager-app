import type { Role } from "@stablemanager/shared";

export type DemoUser = {
  name: string;
  email: string;
  role: Role;
};

/** All yard accounts mirrored from local demo DB (Login as / memberships). */
export const DEMO_USERS: DemoUser[] = [
  { name: "Hof Admin", email: "admin@example.com", role: "hof_admin" },
  { name: "Meeri", email: "meeri@example.com", role: "staff" },
  { name: "Fraya", email: "fraya@example.com", role: "staff" },
  { name: "Julie", email: "julie@example.com", role: "staff" },
  { name: "Sammy", email: "sammy@example.com", role: "staff" },
  { name: "Daniela Schulz", email: "daniela@example.com", role: "horse_owner" },
  { name: "Anna Krummel", email: "anna@example.com", role: "horse_owner" },
];

export const DEMO_ADMIN = DEMO_USERS.find(
  (user) => user.role === "hof_admin",
)!;

