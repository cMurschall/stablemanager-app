import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  BillFarrierSignupSchema,
  CreateFarrierSignupSchema,
  CreateFarrierVisitSchema,
  UpdateFarrierSignupSchema,
  UpdateFarrierVisitSchema,
} from "@stablemanager/shared";
import type { AppVariables, Env } from "../env";
import { createDb } from "../db/client";
import {
  farrierSignups,
  farrierVisits,
  horses,
  memberships,
  notifications,
  users,
} from "../db/schema";
import { id, nowIso } from "../lib/crypto";
import { routeParam } from "../lib/params";
import { canWriteStaff, isOwnerOnly, requireRoles } from "../lib/rbac";
import { authMiddleware } from "../middleware/auth";

export const farrierRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

farrierRoutes.use("*", authMiddleware);

type Db = ReturnType<typeof createDb>;

async function loadVisitSignups(
  db: Db,
  tenantId: string,
  visitId: string,
  role: string,
  userId: string,
) {
  const conditions = [
    eq(farrierSignups.tenantId, tenantId),
    eq(farrierSignups.visitId, visitId),
  ];
  if (isOwnerOnly(role as "horse_owner")) {
    conditions.push(eq(horses.ownerUserId, userId));
  }

  return db
    .select({
      id: farrierSignups.id,
      tenantId: farrierSignups.tenantId,
      visitId: farrierSignups.visitId,
      horseId: farrierSignups.horseId,
      shoeing: farrierSignups.shoeing,
      shoeingNotes: farrierSignups.shoeingNotes,
      presentation: farrierSignups.presentation,
      presentedAt: farrierSignups.presentedAt,
      presentedBy: farrierSignups.presentedBy,
      billedAt: farrierSignups.billedAt,
      createdBy: farrierSignups.createdBy,
      createdAt: farrierSignups.createdAt,
      horseName: horses.name,
      ownerUserId: horses.ownerUserId,
      ownerName: users.name,
    })
    .from(farrierSignups)
    .innerJoin(horses, eq(farrierSignups.horseId, horses.id))
    .leftJoin(users, eq(horses.ownerUserId, users.id))
    .where(and(...conditions))
    .orderBy(asc(horses.name))
    .all();
}

farrierRoutes.get("/visits", async (c) => {
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");
  const status = c.req.query("status");
  const needsPresentation = c.req.query("needsPresentation") === "1";
  const unbilled = c.req.query("unbilled") === "1";

  const visitConditions = [eq(farrierVisits.tenantId, tenantId)];
  if (status === "open" || status === "closed") {
    visitConditions.push(eq(farrierVisits.status, status));
  }

  const visits = await db
    .select({
      id: farrierVisits.id,
      tenantId: farrierVisits.tenantId,
      startsAt: farrierVisits.startsAt,
      endsAt: farrierVisits.endsAt,
      farrierName: farrierVisits.farrierName,
      notes: farrierVisits.notes,
      status: farrierVisits.status,
      createdBy: farrierVisits.createdBy,
      createdAt: farrierVisits.createdAt,
    })
    .from(farrierVisits)
    .where(and(...visitConditions))
    .orderBy(desc(farrierVisits.startsAt))
    .all();

  const withSignups = await Promise.all(
    visits.map(async (visit) => {
      let signups = await loadVisitSignups(
        db,
        tenantId,
        visit.id,
        role,
        userId,
      );

      if (needsPresentation) {
        signups = signups.filter(
          (s) => s.presentation === "staff" && !s.presentedAt,
        );
      }
      if (unbilled) {
        signups = signups.filter(
          (s) =>
            !s.billedAt &&
            (s.presentedAt || s.presentation === "owner"),
        );
      }

      return { ...visit, signupCount: signups.length, signups };
    }),
  );

  // When filtering by presentation/billing, only return visits that still have matching signups
  const filtered =
    needsPresentation || unbilled
      ? withSignups.filter((v) => v.signups.length > 0)
      : withSignups;

  return c.json({ visits: filtered });
});

farrierRoutes.get("/visits/:id", async (c) => {
  const visitId = routeParam(c, "id");
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const visit = await db
    .select()
    .from(farrierVisits)
    .where(
      and(eq(farrierVisits.id, visitId), eq(farrierVisits.tenantId, tenantId)),
    )
    .get();

  if (!visit) {
    return c.json({ error: "Termin nicht gefunden" }, 404);
  }

  const signups = await loadVisitSignups(db, tenantId, visitId, role, userId);
  return c.json({ visit: { ...visit, signups } });
});

farrierRoutes.post(
  "/visits",
  requireRoles("hof_admin", "staff"),
  async (c) => {
    const body = CreateFarrierVisitSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json(
        { error: "Ungültige Anfrage", details: body.error.flatten() },
        400,
      );
    }

    const db = createDb(c.env);
    const tenantId = c.get("tenantId");
    const userId = c.get("userId");
    const visitId = id();

    await db.insert(farrierVisits).values({
      id: visitId,
      tenantId,
      startsAt: body.data.startsAt,
      endsAt: body.data.endsAt ?? null,
      farrierName: body.data.farrierName ?? null,
      notes: body.data.notes ?? null,
      status: "open",
      createdBy: userId,
    });

    const owners = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.role, "horse_owner"),
        ),
      )
      .all();

    const dateLabel = new Date(body.data.startsAt).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const title = "Hufschmied-Termin";
    const farrierPart = body.data.farrierName
      ? ` (${body.data.farrierName})`
      : "";
    const notifBody = `${dateLabel}${farrierPart} — Pferde können angemeldet werden.`;

    for (const owner of owners) {
      await db.insert(notifications).values({
        id: id(),
        tenantId,
        userId: owner.userId,
        kind: "farrier_visit",
        title,
        body: notifBody,
      });
    }

    const visit = await db
      .select()
      .from(farrierVisits)
      .where(eq(farrierVisits.id, visitId))
      .get();

    return c.json({ visit: { ...visit, signups: [] } }, 201);
  },
);

farrierRoutes.patch(
  "/visits/:id",
  requireRoles("hof_admin", "staff"),
  async (c) => {
    const visitId = routeParam(c, "id");
    const body = UpdateFarrierVisitSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json(
        { error: "Ungültige Anfrage", details: body.error.flatten() },
        400,
      );
    }

    const db = createDb(c.env);
    const tenantId = c.get("tenantId");

    const existing = await db
      .select()
      .from(farrierVisits)
      .where(
        and(
          eq(farrierVisits.id, visitId),
          eq(farrierVisits.tenantId, tenantId),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Termin nicht gefunden" }, 404);
    }

    await db
      .update(farrierVisits)
      .set({
        startsAt: body.data.startsAt ?? existing.startsAt,
        endsAt:
          body.data.endsAt !== undefined ? body.data.endsAt : existing.endsAt,
        farrierName:
          body.data.farrierName !== undefined
            ? body.data.farrierName
            : existing.farrierName,
        notes:
          body.data.notes !== undefined ? body.data.notes : existing.notes,
        status: body.data.status ?? existing.status,
      })
      .where(eq(farrierVisits.id, visitId));

    const visit = await db
      .select()
      .from(farrierVisits)
      .where(eq(farrierVisits.id, visitId))
      .get();

    const signups = await loadVisitSignups(
      db,
      tenantId,
      visitId,
      c.get("role"),
      c.get("userId"),
    );

    return c.json({ visit: { ...visit, signups } });
  },
);

farrierRoutes.post("/visits/:id/signups", async (c) => {
  const visitId = routeParam(c, "id");
  const body = CreateFarrierSignupSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json(
      { error: "Ungültige Anfrage", details: body.error.flatten() },
      400,
    );
  }

  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const visit = await db
    .select()
    .from(farrierVisits)
    .where(
      and(eq(farrierVisits.id, visitId), eq(farrierVisits.tenantId, tenantId)),
    )
    .get();

  if (!visit) {
    return c.json({ error: "Termin nicht gefunden" }, 404);
  }
  if (visit.status !== "open") {
    return c.json({ error: "Anmeldung geschlossen" }, 400);
  }

  const horse = await db
    .select()
    .from(horses)
    .where(
      and(eq(horses.id, body.data.horseId), eq(horses.tenantId, tenantId)),
    )
    .get();

  if (!horse) {
    return c.json({ error: "Pferd nicht gefunden" }, 404);
  }

  if (isOwnerOnly(role) && horse.ownerUserId !== userId) {
    return c.json({ error: "Keine Berechtigung für dieses Pferd" }, 403);
  }

  const duplicate = await db
    .select({ id: farrierSignups.id })
    .from(farrierSignups)
    .where(
      and(
        eq(farrierSignups.visitId, visitId),
        eq(farrierSignups.horseId, body.data.horseId),
      ),
    )
    .get();

  if (duplicate) {
    return c.json({ error: "Pferd ist bereits angemeldet" }, 409);
  }

  const signupId = id();
  await db.insert(farrierSignups).values({
    id: signupId,
    tenantId,
    visitId,
    horseId: body.data.horseId,
    shoeing: body.data.shoeing,
    shoeingNotes: body.data.shoeingNotes ?? null,
    presentation: body.data.presentation,
    createdBy: userId,
  });

  const signup = (
    await loadVisitSignups(db, tenantId, visitId, role, userId)
  ).find((s) => s.id === signupId);

  return c.json({ signup }, 201);
});

farrierRoutes.patch("/signups/:id", async (c) => {
  const signupId = routeParam(c, "id");
  const body = UpdateFarrierSignupSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json(
      { error: "Ungültige Anfrage", details: body.error.flatten() },
      400,
    );
  }

  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");

  const row = await db
    .select({
      signup: farrierSignups,
      ownerUserId: horses.ownerUserId,
    })
    .from(farrierSignups)
    .innerJoin(horses, eq(farrierSignups.horseId, horses.id))
    .where(
      and(
        eq(farrierSignups.id, signupId),
        eq(farrierSignups.tenantId, tenantId),
      ),
    )
    .get();

  if (!row) {
    return c.json({ error: "Anmeldung nicht gefunden" }, 404);
  }

  if (isOwnerOnly(role)) {
    if (row.ownerUserId !== userId) {
      return c.json({ error: "Keine Berechtigung" }, 403);
    }
    if (row.signup.presentedAt) {
      return c.json(
        { error: "Anmeldung kann nach dem Vorstellen nicht mehr geändert werden" },
        400,
      );
    }
  }

  await db
    .update(farrierSignups)
    .set({
      shoeing: body.data.shoeing ?? row.signup.shoeing,
      shoeingNotes:
        body.data.shoeingNotes !== undefined
          ? body.data.shoeingNotes
          : row.signup.shoeingNotes,
      presentation: body.data.presentation ?? row.signup.presentation,
    })
    .where(eq(farrierSignups.id, signupId));

  const signup = (
    await loadVisitSignups(
      db,
      tenantId,
      row.signup.visitId,
      role,
      userId,
    )
  ).find((s) => s.id === signupId);

  return c.json({ signup });
});

farrierRoutes.post(
  "/signups/:id/present",
  requireRoles("hof_admin", "staff"),
  async (c) => {
    const signupId = routeParam(c, "id");
    const db = createDb(c.env);
    const tenantId = c.get("tenantId");
    const userId = c.get("userId");

    const existing = await db
      .select()
      .from(farrierSignups)
      .where(
        and(
          eq(farrierSignups.id, signupId),
          eq(farrierSignups.tenantId, tenantId),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Anmeldung nicht gefunden" }, 404);
    }

    if (existing.presentation !== "staff") {
      return c.json(
        { error: "Dieses Pferd wird nicht vom Mitarbeiter vorgestellt" },
        400,
      );
    }

    const presentedAt = existing.presentedAt ?? nowIso();
    await db
      .update(farrierSignups)
      .set({
        presentedAt,
        presentedBy: existing.presentedBy ?? userId,
      })
      .where(eq(farrierSignups.id, signupId));

    const signup = (
      await loadVisitSignups(
        db,
        tenantId,
        existing.visitId,
        c.get("role"),
        userId,
      )
    ).find((s) => s.id === signupId);

    return c.json({ signup });
  },
);

farrierRoutes.post(
  "/signups/:id/billed",
  requireRoles("hof_admin"),
  async (c) => {
    const signupId = routeParam(c, "id");
    const body = BillFarrierSignupSchema.safeParse(
      (await c.req.json().catch(() => ({}))) ?? {},
    );
    if (!body.success) {
      return c.json(
        { error: "Ungültige Anfrage", details: body.error.flatten() },
        400,
      );
    }

    const db = createDb(c.env);
    const tenantId = c.get("tenantId");
    const userId = c.get("userId");

    const existing = await db
      .select()
      .from(farrierSignups)
      .where(
        and(
          eq(farrierSignups.id, signupId),
          eq(farrierSignups.tenantId, tenantId),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ error: "Anmeldung nicht gefunden" }, 404);
    }

    // Owner-presented horses count as done when signed up; staff ones need present
    const done =
      existing.presentedAt ||
      existing.presentation === "owner";
    if (body.data.billed && !done) {
      return c.json(
        { error: "Pferd muss zuerst vorgestellt bzw. erledigt sein" },
        400,
      );
    }

    await db
      .update(farrierSignups)
      .set({
        billedAt: body.data.billed ? (existing.billedAt ?? nowIso()) : null,
        // If owner presented, mark presented when billing so billing list is consistent
        presentedAt:
          body.data.billed && !existing.presentedAt && existing.presentation === "owner"
            ? nowIso()
            : existing.presentedAt,
      })
      .where(eq(farrierSignups.id, signupId));

    const signup = (
      await loadVisitSignups(
        db,
        tenantId,
        existing.visitId,
        c.get("role"),
        userId,
      )
    ).find((s) => s.id === signupId);

    return c.json({ signup });
  },
);

// Convenience list for staff checklist / admin billing without nesting in visits
farrierRoutes.get("/signups", async (c) => {
  const db = createDb(c.env);
  const tenantId = c.get("tenantId");
  const role = c.get("role");
  const userId = c.get("userId");
  const needsPresentation = c.req.query("needsPresentation") === "1";
  const unbilled = c.req.query("unbilled") === "1";
  const billed = c.req.query("billed") === "1";

  if (needsPresentation && !canWriteStaff(role)) {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }
  if ((unbilled || billed) && role !== "hof_admin") {
    return c.json({ error: "Keine Berechtigung" }, 403);
  }

  const conditions = [eq(farrierSignups.tenantId, tenantId)];

  if (needsPresentation) {
    conditions.push(eq(farrierSignups.presentation, "staff"));
    conditions.push(isNull(farrierSignups.presentedAt));
  }
  if (unbilled) {
    // Ready for billing: presented OR owner-presentation
    conditions.push(isNull(farrierSignups.billedAt));
    conditions.push(
      sql`(${farrierSignups.presentedAt} IS NOT NULL OR ${farrierSignups.presentation} = 'owner')`,
    );
  }
  if (billed) {
    conditions.push(isNotNull(farrierSignups.billedAt));
  }
  if (isOwnerOnly(role)) {
    conditions.push(eq(horses.ownerUserId, userId));
  }

  const rows = await db
    .select({
      id: farrierSignups.id,
      tenantId: farrierSignups.tenantId,
      visitId: farrierSignups.visitId,
      horseId: farrierSignups.horseId,
      shoeing: farrierSignups.shoeing,
      shoeingNotes: farrierSignups.shoeingNotes,
      presentation: farrierSignups.presentation,
      presentedAt: farrierSignups.presentedAt,
      presentedBy: farrierSignups.presentedBy,
      billedAt: farrierSignups.billedAt,
      createdBy: farrierSignups.createdBy,
      createdAt: farrierSignups.createdAt,
      horseName: horses.name,
      ownerUserId: horses.ownerUserId,
      ownerName: users.name,
      visitStartsAt: farrierVisits.startsAt,
      visitFarrierName: farrierVisits.farrierName,
      visitStatus: farrierVisits.status,
    })
    .from(farrierSignups)
    .innerJoin(horses, eq(farrierSignups.horseId, horses.id))
    .innerJoin(farrierVisits, eq(farrierSignups.visitId, farrierVisits.id))
    .leftJoin(users, eq(horses.ownerUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(farrierVisits.startsAt), asc(horses.name))
    .all();

  return c.json({ signups: rows });
});
