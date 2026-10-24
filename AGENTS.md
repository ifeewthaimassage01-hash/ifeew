# AGENTS.md

## Project

- React 18 + Vite 5 PWA POS for I'FEEW Thai Massage. UI text is Thai. HashRouter, `base: './'`.
- Two roles via sessionStorage: `owner` (12 h TTL) and `staff` (no expiry). Role gate is client-side PIN only (see security note in `src/lib/auth.js`).
- No test suite and no lint/format config. `npm run build` is the main verification.

## Commands

- Dev server: `npm run dev` (port 3000; dev mode also serves manifest + SW).
- Production build: `npm run build` → `dist/`. Bumps nothing by itself.
- Preview build: `npm run preview`.
- Supabase CLI is linked to project ref `zpxkhimaatxfhzzgmopw`:
  - Deploy function: `npx supabase functions deploy <name>`
  - Set secret: `npx supabase secrets set KEY=value`
- Migrations are run manually in the Supabase SQL Editor (no migration runner). See `supabase/*.sql`.

## Releasing

- Bump `version` in `package.json` for every release. It is injected as `__APP_VERSION__` and emitted as `version.json` at build time; the app polls it every 5 min and auto-reloads (when no modal is open).
- Build output is `dist/` (gitignored). `dev-dist/` is a generated dev SW snapshot and is tracked — do not hand-edit.

## Environment

- Copy `.env.example` → `.env`, then restart the dev server (Vite env). `.env` is gitignored.
- Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The app is cloud-only: missing/invalid Supabase shows an error screen with no local fallback.
- Optional: `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_BRANCH_ID` (default `main`), `VITE_VAPID_PUBLIC_KEY`.
- Supabase project is shared with the sibling repo `../ifeew-booking` (same project ref).

## Architecture essentials

- `src/App.jsx` holds one `data` object and passes it + `saveData` to pages. `saveData` schedules a debounced (800 ms) sync to Supabase.
- Supabase is the single source of truth; `localStorage` is only an outbox for unsynced bills (`ifeew_pos_outbox_v1`).
- Realtime (`src/lib/realtime.js`) reloads data ~1 s after DB changes, but skips while our own sync is pending/recent.
- All dates/times must go through `src/utils/bkk.js` (`bkkToday`, `bizToday`, `bkkNow`, `fmtBkk`). Business day cutoff is 03:00 (bills 00:00–02:59 count as the previous day). Do not use native `Date` for Thai business dates.
- Roles/pages are defined in `NAV_ITEMS` (`src/components/Sidebar.jsx`): owner = dashboard, pos, bills, expenses, commission, bookings, manage; staff = pos, bills, expenses, commission.

## Supabase / database

- Initial schema: `supabase/schema.sql`. Changes: `supabase/migration_*.sql` (run in SQL Editor).
- `cloudSync.js` tolerates not-yet-migrated columns (drops them and flags a migration warning banner) — run the relevant migration to enable new fields.
- Guarantee (attendance) expenses dedup via `notes` key `guarantee:{therapistId}:{date}` plus partial unique index `ux_expenses_guarantee_key` (`migration_guarantee.sql`).
- `bill_items` are replaced per bill via RPC `sync_bill_items` when available, otherwise delete + insert.
- RLS is currently permissive for anon; the auth/RLS migration is prepared but **not enabled** — do not run PART B of `migration_auth_rls.sql` before client login exists (see `AUTH_RLS_SETUP.md`).
- `booking-admin` Edge Function is deployed from the sibling `../ifeew-booking` repo (same project); the copy under this repo's `supabase/functions/booking-admin` is stale. It accepts either `BOOKING_ADMIN_KEY` or `app_settings.owner_pass`.

## Gotchas

- Cloudinary unsigned uploads: always set a unique `public_id` (`newUploadPublicId` in `src/lib/images.js`) and never send an `overwrite` param (Cloudinary rejects it).
- Owner pass is read from `app_settings.owner_pass`; falls back to `123123` only when cloud is empty/unset. Login failure if cloud cannot be read — no silent fallback.
- Service worker is `injectManifest` (`src/sw.js`). `devOptions.enabled` is on so the manifest works in dev.
- No automated tests; verify SQL/RPC changes manually against Supabase.

## Key files

- `src/App.jsx` — routing, data load, sync, realtime, update flow.
- `src/data/cloudSync.js` — Supabase data layer, outbox, sync mutex.
- `src/lib/billing.js` — billing/guarantee logic.
- `src/utils/bkk.js` — Thai time helpers.
- `src/lib/images.js` — Cloudinary upload.
- `src/lib/bookingAdminApi.js` — booking-admin client.
- `vite.config.js` — PWA manifest, version file, chunks.

## Conventions

- Conventional commits with scope, e.g. `feat(bills): …`, `fix(pos): …` (Thai descriptions are common).
- No Tailwind; plain CSS (`src/index.css`, `src/booking.css`). Fonts: Kanit/Sarabun via Google Fonts.<|end|><|start|><|start|>assistant<|channel|>final<|message|>Created `AGENTS.md` at the repo root with compact, verified, repo-specific guidance. Key content covered: commands (dev/build/preview, Supabase CLI), release/version flow, env requirements, cloud-only architecture, Thai time/business-day rules, DB migration and RLS gotchas, Cloudinary upload quirk, booking-admin ownership in sibling repo, and conventions. No tests/lint exist, so build is the verification step.<|end|><|start|>tool_calls_section_begin|><|end|>assistant to=shell<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="command">
cd "C:\Users\CAT\Documents\ifeew-1"; Get-Content AGENTS.md | Measure-Object -Line