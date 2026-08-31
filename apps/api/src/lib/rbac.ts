import type { Context } from "hono";
import type { AppVariables, Env } from "../env";
import type { Role } from "@stablemanager/shared";

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export function requireRoles(...roles: Role[]) {
  return async (c: AppContext, next: () => Promise<void>) => {
    const role = c.get("role");
    if (!roles.includes(role)) {
      return c.json({ error: "Keine Berechtigung" }, 403);
    }
    await next();
  };
}

export function canWriteStaff(role: Role): boolean {
  return role === "hof_admin" || role === "staff";
}

export function isOwnerOnly(role: Role): boolean {
  return role === "horse_owner";
}
