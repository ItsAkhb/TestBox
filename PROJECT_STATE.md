# TestBox — Project State & Release Status (v2.1.0)

## RELEASE STATUS: v2.1.0

**Last updated: 2026-09-05.** v2.0.0 history is in git history
(`git log --follow PROJECT_STATE.md`).

## What ships in v2.1.0 (on top of v2.0.0)

- **Unresolved question state (حل‌نشده):** a first-class per-question state
  (`examData.unresolved`) — the user worked on a question but could not solve
  it and does not want to enter an answer. Marking it clears any
  answer/result; answering normally lifts it. Counted as worked-on
  (`solved` + a dedicated `unresolved` tally) but scored as unanswered —
  never correct/incorrect, never distorts accuracy. Synced through the
  existing `exam_questions.status = "unresolved"` (no separate pipeline).
  Shown in DayDetail/MonthSummary tallies and the results breakdown
  (glyph ◌). No separate page/navigation destination; retake clears it.
- **Tags system (برچسب‌ها)** replacing Marked: full CRUD + per-exam
  assignments via stable `tagIds`, legacy marked questions migrate once
  into a tag (marked data preserved), filter chips, assign modal, fa+en.
  Sync via `tags` table + `exams.tag_ids`, tombstoned deletes.
- **Post-v2.0.0 sync fixes:** cloud pulls no longer re-trigger the sync
  loop; the wholesale cloud-prune cannot wipe cloud rows a fresh device
  hasn't downloaded yet (data-loss guard); uploads are dirty-only
  (subjects/activity/settings/tags); dirty sections are fingerprint-guarded
  against mid-sync edits; `stopwatch_enabled`/`tag_ids` capability-gated.
- **Cross-platform QA fixes:** Modal focus-steal (typing dead in
  create-subject/folder on desktop) and Modal ghost overlay (stuck
  AnimatePresence exit blocked all clicks until reload — exit animations
  removed, unmount is immediate); mobile top bar compacted instead of
  hidden (sync dot, weather, clock visible ≤600px); shared SessionContext
  shows the active exam countdown / practice stopwatch in the TopBar on
  every page; Electron close-to-tray (tray menu Show/Quit, persisted,
  sandboxed send-only IPC); Vite dev server binds 127.0.0.1.
- eslint: `android/app/build` intermediates ignored; v2.1.0 baseline is
  12 errors / 11 warnings, all documented categories.

## Sync coverage (v2.1.0)

| Data | Cloud | Notes |
|---|---|---|
| Folders | `folders` | incl. `subject_id` when the column exists |
| Exams (config/metadata) | `exams` | type/timer/stopwatch/tag_ids capability-gated |
| Per-question answers/results/marks/**unresolved** | `exam_questions` | status carries `unresolved` |
| Subjects | `subjects` | dirty-only upload |
| Daily activity (solved/correct/wrong/unanswered/unresolved/study seconds) | `daily_activity` | per-day merge, dirty day wins |
| Settings (language, weather location) | `user_settings` | dirty-only upload |
| Tags + assignments | `tags` + `exams.tag_ids` | tombstoned deletes |
| Deletes | tombstones in the dirty registry | applied to cloud before upserts |
| Timers (`testbox-timer-*`), theme | local-only by design | wall-clock recomputable / device preference |

**Migration status:** the live schema must contain `subjects`,
`daily_activity`, `user_settings`, `tags` tables and the extra `exams`/
`folders` columns for those types to sync. The app probes capabilities on
load and treats missing pieces as local-only (never destructive). The full
SQL is in `docs/packaging.md` → "Supabase schema migration".

## Build status (v2.1.0, this machine)

| Check | Result |
|---|---|
| `npm run lint` | ✅ baseline only (12 errors / 11 warnings, documented categories) |
| `npm run build` (web) | ✅ 0 errors |
| `npm run build:packaged` | ✅ 0 errors |
| Node gates: unresolved storage+scoring 13/13, activity tallies 9/9, tags 18-20/20 | ✅ |
| Fresh Windows/Android artifacts | built at release time from the same commit — see the v2.1.0 release |

## Known limitations

- Windows exes are not code-signed (SmartScreen may warn).
- Android APK is signed with the self-generated release keystore
  (`android/testbox-release.keystore`, gitignored — keep it for updates).
- Cloud sync of the newer data types activates when the Supabase
  migration is applied (see above); until then they are fully functional
  locally.
- Single-bundle web build (>500 kB advisory).
