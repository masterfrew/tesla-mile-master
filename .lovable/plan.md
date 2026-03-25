
## Plan: Fix Build Errors + Comprehensive Trip UI Upgrade

### Part 1: Fix Build Errors (3 files)

**`supabase/functions/_shared/sheets.ts`**
- Replace `assert { type: "json" }` with `with { type: "json" }` (import attributes syntax)
- Add a fallback: if the JSON file doesn't exist, read credentials from an env variable `GOOGLE_SERVICE_ACCOUNT_JSON` instead — this avoids the "cannot find module" error at build time
- Fix `alg` type: cast the header as `{ alg: Algorithm, typ: string }` using the djwt `Algorithm` type

**`supabase/functions/backfill-sheets/index.ts`** (line 79)
- Type the `error` catch variable: `catch (error: unknown)` and use `(error as Error).message`

**`supabase/functions/tesla-sync-all/index.ts`** (line 649)
- Change `null` to `undefined` in the `logAuditEvent` call

---

### Part 2: New Feature — Daily Trip Overview + Calendar View

**New page: `/trips` (rewrite `src/pages/Trips.tsx`)**
- Add a `Tabs` component with three views:
  1. **Kalender** — monthly calendar grid, click a day → shows all trips for that day in a slide-out panel
  2. **Per dag** — grouped list: each day is a collapsible section showing all trips with exact start/end times
  3. **Alle ritten** — flat list (existing `NewTripsList`)

**New component: `src/components/DailyTripsView.tsx`**
- Groups trips by date
- Each date row shows: total km for that day, trip count, expand/collapse
- Inside each day: trip cards with exact departure time → arrival time, start location → end location, distance, purpose badge

**New component: `src/components/TripsCalendar.tsx`**
- Monthly calendar grid using the existing `Calendar` (react-day-picker) component
- Days with trips show a colored dot + total km
- Clicking a day opens a panel/sheet showing that day's trips in detail

---

### Part 3: Location Tracking Improvements

**`src/components/ManualTripForm.tsx`** — already has location fields, no changes needed

**`src/components/EditTripDialog.tsx`** — ensure start_location and end_location fields are present with editable inputs (add them if missing)

---

### Part 4: Enhanced CSV Export

**`src/components/NewTripsList.tsx`** — update `exportToCSV()`:
- Columns: Datum, Vertrektijd, Aankomsttijd, Duur (min), Startlocatie, Eindlocatie, Afstand (km), Start km-stand, Eind km-stand, Type rit, Voertuig, Beschrijving
- Adds a totals row at the bottom
- File name: `ritregistratie-YYYY-MM-DD.csv` with BOM for Excel compatibility

---

### Part 5: Dashboard Recent Trips Widget

**`src/pages/Dashboard.tsx`** — add a "Recente ritten" card below the stats:
- Shows last 5 trips from the `trips` table
- Each row: date, start → end location, distance, purpose badge
- Link to `/trips` for full overview

---

### Files to change

```text
supabase/functions/_shared/sheets.ts           ← fix 3 build errors
supabase/functions/backfill-sheets/index.ts    ← fix error typing
supabase/functions/tesla-sync-all/index.ts     ← fix null → undefined
src/components/NewTripsList.tsx                ← enhanced CSV export
src/components/EditTripDialog.tsx              ← ensure location fields
src/components/DailyTripsView.tsx              ← new: grouped by day
src/components/TripsCalendar.tsx               ← new: calendar view
src/pages/Trips.tsx                            ← rewrite with tabs
src/pages/Dashboard.tsx                        ← add recent trips widget
src/App.tsx                                    ← no changes needed
```
