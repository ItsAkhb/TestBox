# Offline-first: persistence, dirty tracking & sync

TestBox is offline-first: every feature works with the network fully down,
and cloud sync is a background best-effort layer on top. Upload-first ordering
guarantees local edits are never overwritten by a download.

## Persistence (localStorage, per-user namespace)

All keys are `testbox-{userId}-<key>`, or `testbox-<key>` when logged out.
Logging in/out switches the namespace, so an anonymous session's data never
mixes with an account's data. Key format is a contract — never change it
without a migration (`getExamDataKey()` in `dataService.js` is the single
source for exam-data keys).

Activity dates are always Gregorian local `YYYY-MM-DD` (never
`toISOString()`, which shifts to UTC). Jalali is presentation-only.

## Dirty tracking (offline queue)

`src/services/storage.js` keeps a persistent registry per user:

```
testbox-{userId}-dirty = {
  folders, exams, subjects, settings: boolean,
  examData: { [examId]: true },
  activity: { [YYYY-MM-DD]: true },
  deletes: [{ type, id, deletedAt, pushedAt? }]   // tombstones (7-day TTL)
}
```

- Every mutation marks its section dirty (written through the same
  `writeJson` path, so it survives restarts — no in-memory-only queue).
- Deletes write tombstones so a deletion can be propagated to the cloud
  even when the cloud row no longer exists locally.
- Cloud→local pulls wrap their writes in `setDirtySuppression(true)` so
  downloaded data never marks anything dirty (no sync loops, no false
  "pending" state).
- `restoreBackup` marks everything dirty so a restored backup fully
  re-uploads.
- Exported through `dataService.js`: `getDirtyState`, `hasPendingLocalChanges`,
  `clearDirtySection`, `setDirtySuppression`.

## Sync order (upload-first)

`src/components/CloudSyncManager.jsx` drives cycles; `cloudSync.js` does the
work. Per cycle:

1. **Tombstones first** — `applyLocalDeletesToCloud` pushes deletions
   (including `exam_questions` rows) before any upsert, so a delete cannot be
   resurrected.
2. **Upload dirty sections** — folders/exams/examData/subjects/activity/
   settings per the dirty flags. Sections with no changes are skipped.
   The legacy wholesale cloud-prune only runs when the dirty registry has no
   tombstones (prevents a fresh device from wiping cloud data).
3. **Clear dirty sections** that uploaded successfully.
4. **Pull** — `syncCloudToLocal` downloads, never overwriting dirty local
   entities.

### Pull semantics (conflict policy)

- Folders/exams: local rows are never dropped; cloud-only rows are added;
  clean rows adopt cloud values.
- Exam data: per-question rows carry a first-class "unresolved" status
  (worked-on, no answer) alongside correct/wrong/unanswered; an exam with
  dirty local data is skipped entirely (kept local,
  uploaded later); otherwise cloud values merge in, restoring
  `answerKey`/`examState` from local when the cloud schema can't carry them.
- Daily activity merges **per day**: cloud-only days are added; a day that is
  locally dirty wins and re-pushes immediately after download
  (last-writer-wins per day, never a wholesale overwrite).
- Settings download only when locally absent **and** clean.
- Subjects: accepted from cloud only when the `subjects` table exists;
  otherwise the local list is untouched.

## Connectivity handling

`AuthContext` computes `isOffline = !navigator.onLine || !supabaseReachable`.
`supabaseReachable` comes from a 6-second-timeout probe of
`/auth/v1/health` **with the apikey header** (the endpoint answers 401
without it — an earlier version of the probe omitted the header and pinned
the app to "offline" on healthy networks; fixed in v2.0.0).

`CloudSyncManager` is connectivity-aware:

- **Offline:** no network calls. A local edit flips the status dot to
  `pending` (offline + unsynced changes); with nothing pending it shows
  `offline`.
- **Online:** upload-first cycle on login, on every local change
  (`testbox-local-change` window events fired by storage writes), and
  immediately on reconnect (flushing what accumulated offline).
- **Failures:** exponential backoff 5 s → 10 s → … → cap 5 min (ref-based,
  reset on success). Statuses: `idle` (logged out) | `syncing` | `synced` |
  `pending` | `offline` | `error`.
- **Retry guard (v2.1.3):** "is there work" is decided by the DURABLE
  dirty registry (`hasPendingLocalChanges()`), never only the ephemeral
  in-memory flag — a failed cycle retries itself without waiting for an
  unrelated event; offline retry chains stay scheduled (capped) so a
  dead gateway (navigator.onLine stuck true) still self-heals.
- **Reconciliation watchdog (v2.1.3):** a central 3-minute tick plus
  visibility/online lifecycle events. Pending durable work runs the
  same cycle as manual sync (single engine). Otherwise a cheap HEAD
  count probe (4 requests) compares cloud vs local and pulls only on
  difference — cross-device convergence needs no manual action.
- **Dev/QA observability:** `window.__testboxSyncDebug()` in DEV builds
  → status, pending types, retry count, offline flag. No secrets.

## Offline auth

`testbox-last-user` persists the identity. Supabase events that fire merely
because the network is down (`TOKEN_REFRESHED` with no session, `SIGNED_OUT`
from a failed refresh) do **not** flip the storage namespace to anonymous —
the cached identity keeps local data visible and editable offline. Only a
real sign-out (user action while online) clears it.

## Schema capability probes

`cloudSync.js` probes the live schema once per page load
(`probeSchemaCapabilities()`) and gates every synced data type on the
result: if a table/column is missing the data still works fully local
and is never damaged by sync. The live schema now contains all migrated
pieces (subjects/daily_activity/user_settings/tags tables, the extra
folders/exams columns, the unresolved status constraint).

## Stopwatch & stats safety

- Practice stopwatch (`useStopwatch` + per-exam `stopwatchEnabled`) measures
  study time additively; paused time is excluded; reset never touches
  history; study seconds ride along in the activity record per exam
  (`studySeconds`).
- Activity recording is dedup-safe: re-answering a question rolls back the
  previous outcome instead of double-counting; exam completion replaces the
  exam's entry with authoritative numbers (idempotent).
- Sync re-uploads a dirty day's whole payload, so partial pushes can't
  double-count — the day's record is the unit of consistency.

## Platform differences

- **Web / Electron / Android** share one code path: localStorage keys,
  dirty tracking and sync are identical. There is no platform-specific
  storage.
- **Android:** hardware back button via `native.js`; WebView cache
  `LOAD_DEFAULT`; no cleartext traffic.
- **Electron:** sandboxed renderer, external links open in the system
  browser; storage is Chromium profile storage inside the app's user-data
  dir.
- Timers (`testbox-timer-*`) and theme are local-only by design: a countdown
  is recomputed from wall-clock and a theme is a device preference.
