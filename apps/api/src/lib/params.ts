import type { Context } from "hono";

/** Hono loses param typing when middleware is chained; assert presence. */
export function routeParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) {
    throw new Error(`Missing route param: ${name}`);
  }
  return value;
}
