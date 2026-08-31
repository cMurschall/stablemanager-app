# Stablemanager — Stallverwaltung für Islandpferdehöfe

Multi-tenant PWA (Vue 3 + Tailwind) und Cloudflare Worker API (Hono + D1).

## Stack

- **Frontend:** Vue 3, Vite, Pinia, Vue Router, vue-i18n, Tailwind CSS v4, PWA
- **Backend:** Cloudflare Worker, Hono, Drizzle ORM, D1
- **Shared:** Zod schemas (`packages/shared`)

## Setup

```bash
pnpm install
pnpm db:migrate:local
# einmalig: leeres dist für lokalen Worker mit Assets-Binding
mkdir -p apps/web/dist && echo '<!doctype html><title>ok</title>' > apps/web/dist/index.html
pnpm dev
```

- Web: http://localhost:5173 (proxied `/api` → Worker)
- API: http://localhost:8787

### Erster Hof (Dev)

1. Auf der Login-Seite „Demo-Hof anlegen“ oder:

```bash
curl -X POST http://127.0.0.1:8787/api/bootstrap \
  -H 'content-type: application/json' \
  -d '{}'
```

Das erzeugt lokal den Entwicklungs-Hof **Kjoelavik** samt Demo-Mitgliedern. Eigene Werte lassen sich weiterhin im Request Ã¼bergeben.

2. Magic Link mit derselben E-Mail anfordern — in Dev kommt `devLink` in der JSON-Antwort.

## Rollen

| Rolle | Rechte |
|-------|--------|
| `hof_admin` | Stammdaten, Einladungen, alles |
| `staff` | Pferde, Unterbringung, Kalender, Brett, Erinnerungen |
| `horse_owner` | nur eigene Pferde; Kalender/Brett lesen |

## Phase-1 Features

- Pferdeprofile inkl. FEIF-ID
- Unterbringung (Box, Paddockbox, Paddock, Außenweide); aktuelle Herde = Pferde in derselben Unterbringung
- Belegungskalender (Ovalbahn / Halle)
- Schwarzes Brett
- Hufschmied- / Impf-Erinnerungen (Cron + In-App)

## Deploy

```bash
pnpm deploy
```

Secrets: `SESSION_SECRET`, optional `RESEND_API_KEY`.
