# AGENTS.md — Stablemanager

Stallverwaltung für Islandpferdehöfe. Multi-tenant PWA + Cloudflare Worker API.

## Stack

| Layer | Tech |
|-------|------|
| Web | Vue 3, Vite, Pinia, Vue Router, vue-i18n, Tailwind v4, PWA |
| API | Cloudflare Workers, Hono, Drizzle ORM, D1 (SQLite) |
| Shared | Zod in `packages/shared` |
| Auth | Session-Cookie `sm_session`; Magic Link (+ Dev-Login) |

Monorepo (pnpm): `apps/web`, `apps/api`, `packages/shared`.

## Lokale Entwicklung

```bash
pnpm install
pnpm db:migrate:local
# einmalig: apps/web/dist für ASSETS-Binding anlegen
pnpm dev
```

- Web: http://localhost:5173 (`/api` → Worker :8787)
- API: http://localhost:8787 (`wrangler dev --port 8787`)

Demo-Hof: Login „Demo-Hof anlegen“ oder `POST /api/bootstrap`. Dev-Logins: `admin@example.com`, `staff@example.com`, `daniela@example.com` (Dropdown „Login as“).

## Rollen (eine Membership pro User × Tenant)

| Rolle | Bedeutung |
|-------|-----------|
| `hof_admin` | Hof-Admin: Einstellungen, Einladungen, alles |
| `staff` | Mitarbeiter: schreiben an Pferden, Housing, Kalender, Brett, Care, Hufschmied, Training |
| `boarder` | Einsteller: nur eigene Pferde sehen; lesen Kalender/Brett/Training; Hufschmied anmelden |

Frontend: `auth.isAdmin`, `auth.canWrite` (= admin \|\| staff) in `apps/web/src/stores/auth.ts`.  
Backend: `requireRoles`, `canWriteStaff`, `isBoarderOnly` in `apps/api/src/lib/rbac.ts`.

**Pferdebesitz ≠ Rolle:** Jedes Mitglied (auch Admin/Staff) kann als `horses.ownerUserId` gesetzt werden. Die Rolle bleibt Admin/Staff; die eingeschränkte Einsteller-Sicht gilt nur bei Membership `boarder`.

## Features (Stand)

### Pferde (`/horses`, `/horses/:id`)
- Profil: Name, FEIF-ID, Geschlecht, Geburtsjahr, Besitzer, Unterbringung, Notizen
- FEIF-ID kann Geburtsjahr/Geschlecht vorbelegen
- Unterbringungshistorie (`horse_accommodation_history`)
- Einsteller sehen nur eigene Pferde; Staff/Admin alle; Schreiben nur Staff/Admin

### Unterbringung (`/housing`)
- Arten: `box`, `paddock_box`, `paddock`, `pasture`
- Kapazität, Notizen, aktuelle Herde (Pferde in derselben Unterbringung)
- Anlegen/Löschen/Bearbeiten (Name, Kapazität, Notizen): Staff/Admin
- Lesen: alle Rollen

### Kalender (`/calendar`)
- Ressourcen-Buchungen (Ovalbahn / Halle), Wochenansicht
- Schreiben: Staff/Admin; Lesen: alle

### Schwarzes Brett (`/board`)
- Beiträge, Anpinnen, optional Ablauf
- Schreiben: Staff/Admin; Lesen: alle

### Hufschmied-Termine (`/farrier`) — getrennt von Care-Erinnerungen
- Staff/Admin legen `farrier_visits` an (offen/geschlossen); Notification `farrier_visit` an alle `boarder`
- Anmeldung (`farrier_signups`): Beschlag `trim` \| `front_shoes` \| `all_shoes` \| `other`; Vorstellung `staff` \| `owner`
- Staff-Checkliste: Signups mit `presentation=staff` als vorgestellt markieren
- Hof-Admin: Abrechnungsliste (`billedAt`) — keine PDF/Preise/Zahlungen
- API: `/api/farrier` (`visits`, `signups`, `present`, `billed`)

### Erinnerungen (`/reminders`)
- Care-Events: `farrier` \| `vaccination` (Fälligkeit, Intervall, Erledigt → nächstes Event)
- Cron `0 6 * * *` → In-App-Notifications `care_due`
- Unabhängig von Hufschmied-Besuchsterminen

### Training (`/training`) — Tagesprotokoll
- Einträge (`training_logs`): `longe` \| `ridden` \| `trail` \| `rental` (Longiert, Beritt, Ausritt, Leihpferd)
- Mehrere Einträge pro Pferd und Tag erlaubt; optionale Notiz
- Schreiben: Staff/Admin für **alle** Hofpferde (hofeigene, Mitarbeiter-, Kundenpferde)
- Lesen: Staff/Admin alle; `boarder` nur Pferde mit `ownerUserId === user`
- Ansichten: Tag (gruppiert nach Pferd) und Monat (optional Pferdefilter); Ausschnitt am Pferde-Detail
- API: `/api/training-logs` (`date` oder `from`+`to` max. 31 Tage, optional `horseId`)

### Einstellungen (`/settings`, nur `hof_admin`)
- Hofname, Zeitzone, Mitglieder, Einladungen, buchbare Ressourcen

### Auth / Tenancy
- Multi-Tenant über `memberships`; Tenant-Wechsel möglich
- Invites mit vorgegebener Rolle

## Wichtige Pfade

```
apps/api/src/db/schema.ts          # Drizzle-Schema
apps/api/migrations/               # D1-Migrationen (0000–0005)
apps/api/src/routes/*.ts           # Hono-Routen
apps/api/src/index.ts              # Mount + Cron
packages/shared/src/schemas.ts     # Zod + shared Types
apps/web/src/views/*.vue
apps/web/src/types/api.ts
apps/web/src/i18n.ts               # nur Locale de
apps/web/src/router/index.ts
apps/web/src/layouts/AppLayout.vue # Nav
```

## Feature-Pattern

1. Zod in `packages/shared` → `pnpm --filter @stablemanager/shared build`
2. Tabelle in `schema.ts` + Migration unter `apps/api/migrations/`
3. Route-Modul + Mount in `index.ts`; immer `tenantId` filtern
4. Types in `apps/web/src/types/api.ts`
5. View + Router + Nav + i18n (`de`)

## Bewusste Lücken

- Keine Rechnungs-PDFs, Preise, Zahlungen (nur `billedAt`-Markierung beim Hufschmied)
- Kein Englisch in der UI
- Care-Events und Hufschmied-Visits sind nicht verknüpft
- Keine E-Mail bei Hufschmied-Terminen (nur In-App)

## Konventionen für Agents

- **Keine Dev-Server ohne Erlaubnis:** `pnpm dev`, `wrangler dev`, Vite oder andere lokalen Instanzen **nicht** starten, neu starten oder Ports freikämpfen, außer der User fordert es ausdrücklich. Mehrere/hängende Instanzen verwirren die lokale Umgebung.
- Bestehende UI-Muster folgen (Listen, Modals wie `BoardView` / `RemindersView` / `FarrierView`)
- Keine generischen Purple/Dashboard-Layouts; bestehendes Brand/Tailwind nutzen
- Keine Secrets committen (`.dev.vars`, Session-Secrets)
- Commits nur auf ausdrückliche Anfrage
- i18n-Strings in `apps/web/src/i18n.ts` (deutsch)
- API-Fehlermeldungen derzeit hardcoded deutsch
