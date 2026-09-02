/** Frontend origin for copyable links (Vite proxy in dev, same origin in production). */
export function webOrigin(c: { req: { header: (name: string) => string | undefined; url: string } }): string {
  const origin = c.req.header("origin");
  if (origin) return origin.replace(/\/$/, "");
  const referer = c.req.header("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return new URL(c.req.url).origin;
}
