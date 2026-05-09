## Plan: Losse ritten met start/eind-locatie — auto-detectie + handmatige invoer

### Doel

Per dag elke afzonderlijke rit zien (tijd, van → naar, km), in plaats van alleen het dag-totaal. Gecombineerde aanpak: automatische detectie voor nieuwe ritten + makkelijke handmatige invoer voor historie en correcties.

---

### Deel 1 — Automatische rit-detectie (nieuwe ritten)

**Hoe het werkt:**
Tesla geeft via `vehicle_data` een `drive_state` met o.a. `shift_state` (`P`/`R`/`N`/`D`), `latitude`, `longitude`, `odometer`. Door dit elke ~5 min te pollen kunnen we transities detecteren:
- `P` → `D`/`R` = **rit gestart** (sla startlocatie + km-stand op)
- `D`/`R` → `P` (en blijft P) = **rit beëindigd** (sla eindlocatie + km-stand op, maak trip-record)

**Database wijzigingen:**
Nieuwe tabel `vehicle_drive_state` voor per-voertuig laatste status:
- `vehicle_id` (PK), `last_shift_state`, `last_odometer_km`, `last_lat`, `last_lon`, `trip_started_at`, `trip_start_odometer_km`, `trip_start_lat`, `trip_start_lon`, `trip_start_location`, `last_polled_at`

Dit voorkomt dat we elke poll alle historie opnieuw lezen.

**Nieuwe edge function `tesla-trip-detector`:**
1. Voor elk actief voertuig: probeer wakker te maken (skip als slaapt > 15 min en geen bekende trip in progress).
2. Haal huidige `vehicle_data` op (met `location_data=true`).
3. Vergelijk met vorige `shift_state`:
   - **Trip start**: zet `trip_started_at`, `trip_start_*` velden.
   - **Trip end**: reverse-geocode start + eind via Nominatim, INSERT in `trips` met `is_manual=false`, purpose default `business`.
4. Werk altijd `last_*` velden bij.

**Cron:**
Aparte cron-job elke 5 minuten voor `tesla-trip-detector` (de bestaande 4-uurs `tesla-sync-all` voor totaal-km blijft). Skip-logica om Tesla niet wakker te houden als auto al lang slaapt.

---

### Deel 2 — Handmatige invoer per dag (UI)

**`DailyTripsView`:**
- Knop **"+ Rit toevoegen"** bovenin elke dag-kaart. Opent `ManualTripForm` met die datum voorgeselecteerd.
- Onder een dag die alleen een synthetische totaalrit heeft: helder bannertje "Tesla detecteerde {X} km — splits op in losse ritten" met dezelfde knop.
- De synthetische rit verdwijnt automatisch zodra er ≥1 echte trip op die dag staat (huidige logica blijft).

**`ManualTripForm`:**
- Accepteer optionele `defaultDate` prop zodat de datum is voorgevuld vanuit dag-kaart.

---

### Deel 3 — Schema & secrets

**Migratie:**
- `CREATE TABLE public.vehicle_drive_state` met RLS (eigenaar = `vehicles.user_id`).
- Geen wijzigingen aan `trips` tabel nodig (heeft al `start_location`, `end_location`, `start_odometer_km`, `end_odometer_km`).

**Secrets:** `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `CRON_SECRET` zijn al aanwezig — geen nieuwe nodig.

---

### Bestanden

```
supabase/migrations/<timestamp>_vehicle_drive_state.sql      ← nieuw
supabase/functions/tesla-trip-detector/index.ts              ← nieuw
src/components/DailyTripsView.tsx                            ← + "Rit toevoegen" knop per dag
src/components/ManualTripForm.tsx                            ← + defaultDate prop
```

Plus een kleine SQL via insert-tool om de 5-min cron te registreren (bevat anon key en URL, daarom geen migratie).

---

### Belangrijke kanttekeningen

- **Geen historie**: auto-detectie werkt alleen vóór ritten ná activatie. Voor oude dagen blijft handmatige invoer nodig.
- **Slapende auto**: als de Tesla > 15 min slaapt en er was geen trip in progress, slaan we de poll over. Dit voorkomt extra accuverbruik.
- **Reverse-geocoding**: hergebruikt bestaande `_shared/geocoding.ts` (Nominatim).
- **API-volume**: ~288 calls/dag/voertuig (5-min poll) — ruim binnen Tesla Fleet API limiet.