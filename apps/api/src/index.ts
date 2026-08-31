import { Hono } from "hono";
import type { AppVariables, Env } from "./env";
import { authRoutes } from "./routes/auth";
import { bootstrapRoutes } from "./routes/bootstrap";
import { horseRoutes } from "./routes/horses";
import { housingRoutes } from "./routes/housing";
import { bookingRoutes } from "./routes/bookings";
import { boardRoutes } from "./routes/board";
import { careRoutes } from "./routes/care";
import { farrierRoutes } from "./routes/farrier";
import { notificationRoutes } from "./routes/notifications";
import { tenantRoutes } from "./routes/tenants";
import { serviceOrderRoutes } from "./routes/serviceOrders";
import { runCareReminders } from "./jobs/careReminders";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/api/health", (c) =>
  c.json({ ok: true, name: c.env.APP_NAME, env: c.env.ENVIRONMENT }),
);

app.route("/api/auth", authRoutes);
app.route("/api/bootstrap", bootstrapRoutes);
app.route("/api/tenants", tenantRoutes);
app.route("/api/horses", horseRoutes);
app.route("/api/housing", housingRoutes);
app.route("/api/bookings", bookingRoutes);
app.route("/api/board", boardRoutes);
app.route("/api/care-events", careRoutes);
app.route("/api/farrier", farrierRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/service-orders", serviceOrderRoutes);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Nicht gefunden" }, 404);
  }
  // Let Static Assets / SPA handle non-API routes when bound
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not found", 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const result = await runCareReminders(env);
    console.log(`care reminders created: ${result.created}`);
  },
};
