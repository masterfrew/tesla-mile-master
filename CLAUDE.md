# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KM Track (kmtrack.nl) is a Dutch vehicle mileage tracker with automatic Tesla sync. Users log business vs. personal kilometers for Dutch tax reporting, generate monthly PDF reports, and optionally export to Google Sheets.

## Commands

```bash
npm run dev        # Start dev server on port 8080
npm run build      # Production build to dist/
npm run lint       # ESLint check
npm run preview    # Preview production build
```

There is no test suite. Verification is manual via the running dev server.

**Edge Functions (Deno, requires Supabase CLI):**
```bash
supabase functions deploy <function-name> --project-ref hqpwepmdxzmuevalzkix
supabase functions logs <function-name>
```

## Architecture

### Stack
- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), React Query, React Hook Form + Zod
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions written in Deno)
- **External APIs:** Tesla Fleet API (EU), Nominatim (reverse geocoding), Google Sheets API

### Provider tree (`src/App.tsx`)
`QueryClientProvider` → `AuthProvider` → `TooltipProvider` → `BrowserRouter`

Auth state is globally available via `useAuth()` from `src/contexts/AuthContext.tsx`. It exposes `{ user, session, loading, signOut }`.

### Routes
| Path | Component | Notes |
|---|---|---|
| `/` | `Index` | Redirects to `/auth` or `/trips` |
| `/auth` | `Auth` | Sign up / login |
| `/trips` | `Trips` | Main app — tabbed: list, daily, calendar |
| `/add-vehicle` | `AddVehicle` | Vehicle registration |
| `/tesla/callback` or `/oauth2callback` | `TeslaCallback` | Tesla OAuth2 callback |
| `/admin` | `Admin` | Admin-only dashboard |

### Tesla OAuth2 / PKCE Flow
1. **`tesla-start`** edge function: generates `state` nonce + `code_verifier`, stores both in `oauth_pkce_state` table (15-min TTL), returns authorization URL.
2. User is redirected to Tesla login.
3. **`tesla-auth`** edge function: validates `state` nonce, exchanges `code` for tokens using stored `code_verifier`, writes tokens to `encrypted_tesla_tokens` table.
4. `TeslaCallback` page handles the browser redirect and calls `tesla-auth`.

### Data Sync
- **Manual:** "Sync Tesla" button → calls `tesla-mileage` edge function for the current user.
- **Automated:** `tesla-sync-all` runs on a cron schedule to sync all users. This is the only edge function with `verify_jwt = false` in `supabase/config.toml`.
- Geocoding uses Nominatim (no API key) and is handled in `supabase/functions/_shared/geocoding.ts`.
- Google Sheets sync is handled in `supabase/functions/_shared/sheets.ts` using a service account.

### Database Tables (all RLS-protected)
- **`profiles`** — user account data; created automatically via a DB trigger on `auth.users`
- **`vehicles`** — Tesla vehicles linked to a user
- **`trips`** — individual trip records with start/end odometer, locations (lat/lon + name), timestamps, `purpose`, and `is_manual` flag
- **`mileage_readings`** — legacy daily odometer snapshots (pre-trips schema)
- **`encrypted_tesla_tokens`** — AES-encrypted access/refresh tokens
- **`oauth_pkce_state`** — temporary PKCE state (nonce + code_verifier)
- **`google_sheets_integrations`** — user's spreadsheet mappings
- **`audit_logs`** — admin audit trail

### UI Conventions
- All UI components come from `src/components/ui/` (shadcn/ui). Do not add new third-party component libraries.
- Design tokens (HSL color variables, gradients, shadows) are defined in `src/index.css`. Tailwind classes reference these tokens.
- The `cn()` utility from `src/lib/utils.ts` merges Tailwind classes (`clsx` + `tailwind-merge`).
- The UI is in Dutch. Labels, error messages, and user-facing strings should remain in Dutch.
- Toast notifications use `sonner` (via `<Sonner />` in `App.tsx`), not the Radix toast.

### Path Alias
`@/*` resolves to `src/*` (configured in `tsconfig.json` and `vite.config.ts`).

### Supabase Client
Import from `@/integrations/supabase/client` (singleton). Database types are in `@/integrations/supabase/types.ts` — regenerate with `supabase gen types typescript` when schema changes.

## Environment

`.env` contains public Supabase keys:
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

Edge Functions require these secrets set in the Supabase dashboard (not in `.env`):
- `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`
- `TESLA_FLEET_API_BASE_URL` (EU: `https://fleet-api.prd.eu.vn.cloud.tesla.com`)
- `GOOGLE_SERVICE_ACCOUNT_JSON`

## Deployment

GitHub Actions (`.github/workflows/`) auto-deploys edge functions to Supabase on push to `main` when files under `supabase/functions/` change. Requires `SUPABASE_ACCESS_TOKEN` repository secret.

The frontend is deployed separately (not via this repo's CI).

## Reference Docs

- `TESLA_OAUTH_SETUP.md` — detailed OAuth2 PKCE flow with debugging tips
- `TESLA_REGISTRATION.md` — Tesla account registration steps for EU region
