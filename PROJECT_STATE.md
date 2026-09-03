# TestBox — Project State & Release Status (v2.0.0)

## RELEASE STATUS: v2.0.0 — build & QA complete, ready to publish

**Last updated: 2026-09-04.** This file was rewritten for the v2 production
release; the historical redesign-era notes it replaced are in git history
(`git log --follow PROJECT_STATE.md`).

## What shipped in v2.0.0

- Complete visual redesign (Lucide icons, Framer Motion, warm token system,
  FA/EN × light/dark × responsive) — earlier phases, see git history.
- Practice session stopwatch (`useStopwatch`, per-exam toggle, study-time in
  day reports and monthly totals).
- Offline-first sync engine: persistent dirty registry, tombstone deletes,
  upload-first cycles, per-day activity merge, connectivity-aware
  orchestrator with exponential backoff, offline auth guard.
- Windows packaging (Electron 44 + electron-builder) and Android packaging
  (Capacitor 7), one codebase — see `docs/packaging.md`.
- Offline behavior and sync semantics documented in `docs/offline.md`.
- Mobile nav: Subjects added (6 items), verified balanced at 320/375 px.

## Build status (verified 2026-09-04, this machine)

| Check | Result |
|---|---|
| `npm run lint` | ✅ 20 problems — documented baseline only (5 react-refresh context-hook exports, 4 set-state-in-effect refresh patterns, 9 exhaustive-deps warnings, 1 unused markedCount, 1 benign memo dep) |
| `npm run build` (web, base `/TestBox/`) | ✅ 0 errors (761 KB JS / 219 KB gzip) |
| `npm run build:packaged` (base `./`) | ✅ 0 errors, relative paths verified |
| `npm run dist:win` | ✅ `release/TestBox-Setup-2.0.0.exe` + `release/TestBox-Portable-2.0.0.exe` (124 MB each, NSIS x64 + portable) |
| Packaged app smoke test | ✅ `win-unpacked/TestBox.exe` launches, window renders |
| `cd android && ./gradlew assembleRelease` | ✅ `android/app/build/outputs/apk/release/app-release.apk` — release-signed with generated keystore (gitignored) |
| Cloud sync round-trip | ✅ Verified against live Supabase: signup → local edits → offline edits → reconnect → upload → cloud rows present → dirty registry cleared |

## Exact artifact paths (what the GitHub release attaches)

- `release/TestBox-Setup-2.0.0.exe` — Windows installer
- `release/TestBox-Portable-2.0.0.exe` — Windows portable
- `android/app/build/outputs/apk/release/app-release.apk` — Android APK

## Bugs found & fixed during this release pass

1. **Offline health probe 401 (release-blocking).** The offline-auth probe in
   `AuthContext.jsx` fetched `/auth/v1/health` without the Supabase `apikey`
   header; the endpoint answers 401, so the app was pinned to "offline" on
   healthy networks. Fixed by sending `supabase.auth.headers` (which carries
   the key). Verified: sync dot now reaches `synced` and completes cycles.
2. **Offline status stuck on "offline" instead of "pending".**
   `syncLocalChanges`' offline branch set the pending flag but never updated
   the status, so local edits made offline kept the dot on "offline". Fixed:
   the branch now sets `pending` when unsynced changes exist.
3. **electron-builder EPERM on rename** (3 consecutive failures):
   extract→rename of `win-unpacked.tmp` deterministically fails when
   Defender/Search holds handles on fresh files. Fixed via
   `electronDist: "node_modules/electron/dist"` in `electron-builder.json5`
   (skips the extract+rename entirely; output identical).
4. **eslint coverage of build output** — `android/.../assets/public` (synced
   minified bundles) and missing Node globals in `vite.config.js` produced
   200+ false lint errors. Fixed in `eslint.config.js` (globalIgnores +
   node globals).
5. **`local.properties` sdk.dir escaping** — single-backslash Windows paths
   break Java-properties escaping ("filename syntax is incorrect" from
   SdkLocator). Use forward slashes.

## Environment (this machine, all user-scope, no admin)

- Node 24.20 / npm 11.19 / git 2.55
- JDK 21.0.12.1 (Temurin zip) → `%LOCALAPPDATA%/Java/jdk-21.0.12.1+1`
  (Capacitor 7 requires Java 21 for the Android build; JDK 17 also present
  but insufficient)
- Android SDK → `%LOCALAPPDATA%/Android/Sdk` (cmdline-tools latest,
  platform-tools, platforms;android-35/36 via variables, build-tools;36.0.0)
- gh CLI 2.100.0 → `%LOCALAPPDATA%/Programs/gh/bin/gh.exe`
- Note: `dl.google.com/android/repository/*` 404s from this network; Google's
  edge mirror `redirector.gvt1.com/edgedl/android/...` works and was used for
  the cmdline-tools download. sdkmanager itself worked (different endpoint).

## Supabase schema status (unchanged, optional migration)

Live schema has `folders`, `exams`, `exam_questions` only. `subjects`,
`daily_activity`, `user_settings` tables and extra columns are absent — sync
is capability-gated per `probeSchemaCapabilities()`, so those types are
local-only (fully functional) until the migration runs:

```sql
alter table folders add column subject_id text;
alter table exams add column type text default 'practice';
alter table exams add column timer_duration int;
alter table exams add column answer_key jsonb;
alter table exams add column exam_state jsonb;
create table subjects (id bigint primary key, user_id uuid not null, name text not null, color text, updated_at timestamptz default now());
create table daily_activity (user_id uuid not null, date date not null, payload jsonb not null, updated_at timestamptz default now(), primary key (user_id, date));
create table user_settings (user_id uuid primary key, settings jsonb not null, updated_at timestamptz default now());
```

## QA log (2026-09-04, browser via dev server + packaged exe)

| Check | Result |
|---|---|
| Subject create (modal, color picker) → dirty flag `subjects:true` | ✅ |
| Folder create with subject assignment → `foldersDirty`, `subjectId` linked | ✅ |
| Exam create: practice + stopwatch ON + 10 questions → persisted, dirty | ✅ |
| Exam start → examState `in_progress`, workspace renders | ✅ |
| Stopwatch: start (runs), pause (frozen — verified two 2 s samples equal), reset | ✅ |
| Practice answers: Q1 opt2, Q2 opt1 → activity `solved=2`, dedup keys written | ✅ |
| Q3 answered then marked correct → `solved=3, correct=1`, `results['3']='correct'`, outcome rollback | ✅ |
| Result buttons correctly disabled until an answer is chosen (by design) | ✅ |
| Offline (`navigator.onLine=false`): dot `offline`; edit → `pending`; dirty registry accumulates | ✅ |
| Reconnect: upload cycle → `synced`, dirty registry fully cleared | ✅ |
| Cloud verification (as-authenticated RLS query): uploaded folder present in `folders` | ✅ |
| Capability probes: 400/404 for missing schema, gracefully gated, no app errors | ✅ |
| Anonymous vs. per-user namespace separation (no data mixing on login) | ✅ |
| Mobile 320×640: 6 nav items × 53 px balanced, no horizontal scroll, RTL | ✅ |
| Mobile 375×812 (mobile preset): renders, nav intact | ✅ |
| Desktop 1200×800: sidebar 256 px, layout intact | ✅ |
| Dark mode + light mode toggles (data-theme flips, warm near-black verified) | ✅ |
| RTL (fa) + LTR (en) with correct headings (Calendar/تقویم) and Jalali↔Gregorian | ✅ |
| Packaged Windows app launches and renders | ✅ |

Not re-run in this pass (verified in the earlier functional gate, unchanged
code paths): timer countdown persistence, auto-finish on expiry, answer-key
grid editing, backup/restore round-trip, weather search. The 19/19 scoring
and 14/14 date node gates from the earlier phase still stand.

## Known limitations

- Windows exes are not code-signed with a trusted certificate (SmartScreen
  may warn); Android APK is signed with a self-generated release keystore —
  keep the keystore/password for all future updates.
- Cloud sync of subjects/activity/settings waits on the optional Supabase
  migration (above); folders/exams sync today.
- Single-bundle web build (>500 kB advisory); no code-splitting yet.
- Search in Answer-key "Set All to 1" is fixed to option 1 (pre-existing).
- Backup/restore JSON does not include per-day activity records
  (pre-existing).

## Release checklist

- [x] Lint / web build / packaged build / APK build all green
- [x] Docs: `docs/packaging.md`, `docs/offline.md`, this file
- [x] `.gitignore` covers `release/`, `android/.gradle/`,
      `android/app/build/`, `android/local.properties`, keystores,
      `*.jks`, `keystore.properties`, `testbox.rar`
- [x] `.env.local` untracked; no secrets in tracked diff
- [x] Commits pushed to `origin main`
- [x] Tag `v2.0.0` + GitHub release with real artifacts only
