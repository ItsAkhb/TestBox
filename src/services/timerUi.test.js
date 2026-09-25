import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadTimerUi() {
  const source = (await readFile(new URL("./timerUi.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const { createContext, runInContext } = await import("node:vm");
  const context = createContext({});
  runInContext(source, context);
  return context;
}

test("topbar timer: hidden on exam page while focus timer is visible", async () => {
  const { shouldShowTopbarSession } = await loadTimerUi();
  const session = { kind: "exam", remainingSeconds: 600 };
  assert.equal(
    shouldShowTopbarSession({ session, onExamPage: true, focusTimerVisible: true }),
    false
  );
});

test("topbar timer: appears when focus timer scrolls out of view", async () => {
  const { shouldShowTopbarSession } = await loadTimerUi();
  const session = { kind: "exam", remainingSeconds: 600 };
  assert.equal(
    shouldShowTopbarSession({ session, onExamPage: true, focusTimerVisible: false }),
    true
  );
});

test("topbar timer: appears when leaving the exam route (same session state)", async () => {
  const { shouldShowTopbarSession } = await loadTimerUi();
  const session = { kind: "exam", remainingSeconds: 600 };
  // Same object — one engine, two representations
  assert.equal(
    shouldShowTopbarSession({ session, onExamPage: false, focusTimerVisible: true }),
    true
  );
  assert.equal(
    shouldShowTopbarSession({ session, onExamPage: false, focusTimerVisible: false }),
    true
  );
});

test("topbar timer: never shown without a session; stopwatch docks like exam timer", async () => {
  const { shouldShowTopbarSession } = await loadTimerUi();
  assert.equal(
    shouldShowTopbarSession({ session: null, onExamPage: false, focusTimerVisible: false }),
    false
  );
  const stopwatch = { kind: "stopwatch", elapsedMs: 1000, running: true, examId: "e1" };
  // Bug 1 regression: practice stopwatch scrolls out → TopBar appears
  assert.equal(
    shouldShowTopbarSession({ session: stopwatch, onExamPage: true, focusTimerVisible: false }),
    true
  );
  // Mutual exclusion: focus visible hides the TopBar copy
  assert.equal(
    shouldShowTopbarSession({ session: stopwatch, onExamPage: true, focusTimerVisible: true }),
    false
  );
  assert.equal(
    shouldShowTopbarSession({ session: stopwatch, onExamPage: false, focusTimerVisible: true }),
    true
  );
});

test("practice stopwatch: TopBar reflects same session state; no second engine", async () => {
  const { shouldShowTopbarSession, focusVisibleFromIntersection } = await loadTimerUi();
  const session = { kind: "stopwatch", elapsedMs: 42000, running: true, examId: "practice-1" };
  const focusTimerVisible = focusVisibleFromIntersection(false);
  assert.equal(
    shouldShowTopbarSession({ session, onExamPage: true, focusTimerVisible }),
    true
  );
  // Same mutual-exclusion invariant as the exam countdown
  assert.equal(focusTimerVisible && shouldShowTopbarSession({
    session, onExamPage: true, focusTimerVisible: true,
  }), false);
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  const useStopwatchCalls = examSource.match(/useStopwatch\s*\(/g) || [];
  assert.equal(useStopwatchCalls.length, 1, "exactly one useStopwatch() in Exam.jsx");
  assert.ok(
    !/useStopwatch\s*\(/.test(await readFile(new URL("../components/layout/TopBar.jsx", import.meta.url), "utf8")),
    "TopBar does not create a stopwatch engine"
  );
});

test("topbar navigation: pill restores exact active exam via examId (never /start)", async () => {
  const topbar = await readFile(new URL("../components/layout/TopBar.jsx", import.meta.url), "utf8");
  assert.ok(topbar.includes("handleSessionClick"), "session pill has a click handler");
  assert.ok(
    /navigate\(\s*`\/exam\/\$\{session\.examId\}`\s*\)/.test(topbar),
    "navigates to /exam/{examId} using session identity"
  );
  assert.ok(
    !/\/exam\/\$\{session\.examId\}\/start/.test(topbar),
    "must not navigate to /start (would create a fresh attempt)"
  );
  assert.ok(topbar.includes("onClick={handleSessionClick}"), "click wired to handler");
  assert.ok(topbar.includes("onKeyDown"), "keyboard activation supported");
  // Session registration always carries examId
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(
    /kind:\s*"exam"[\s\S]{0,80}examId:\s*id/.test(examSource),
    "exam session registers examId"
  );
  assert.ok(
    /kind:\s*"stopwatch"[\s\S]{0,80}examId:\s*id/.test(examSource),
    "stopwatch session registers examId"
  );
});

test("completion cleanup: finish clears TopBar session and persisted timer", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(
    examSource.includes("clearTimerPersisted"),
    "finish path clears persisted countdown"
  );
  // handleFinishExam body must clear session + timer before navigate
  const finishMatch = examSource.match(
    /const handleFinishExam[\s\S]*?navigate\(`\/exam\/\$\{id\}\/results`\);/
  );
  assert.ok(finishMatch, "handleFinishExam found");
  const finishBody = finishMatch[0];
  assert.ok(
    finishBody.includes("updateSession(null)"),
    "finish clears shared session immediately"
  );
  assert.ok(
    finishBody.includes("clearTimerPersisted"),
    "finish clears localStorage timer"
  );
  // Session only registers while in_progress — completed cannot resurrect
  assert.ok(
    examSource.includes("isExamAttemptActive(examData) && timer.remaining > 0"),
    "exam session gated on active attempt (in_progress)"
  );
  assert.ok(
    /else if \(isExamMode\) \{\s*\/\/ completed[\s\S]{0,80}updateSession\(null\)/.test(examSource) ||
      examSource.includes("// completed / not started / expired"),
    "non-in_progress exam clears session"
  );
});

test("practice stopwatch: focus pill is observed for IntersectionObserver docking", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(
    examSource.includes("shouldObserveFocusPill = isActiveExam || stopwatchOn"),
    "observer gate includes practice stopwatch"
  );
  const stopwatchIdx = examSource.indexOf("stopwatch-cluster");
  assert.ok(stopwatchIdx !== -1, "stopwatch cluster rendered");
  const afterCluster = examSource.slice(stopwatchIdx, stopwatchIdx + 400);
  assert.ok(
    afterCluster.includes("attachFocusTimerRef"),
    "stopwatch ExamTimer receives focus ref for observer"
  );
  const timerUi = await readFile(new URL("./timerUi.js", import.meta.url), "utf8");
  assert.ok(
    !/session\.kind === "exam"\s*return[\s\S]{0,40}return false/.test(timerUi),
    "shouldShowTopbarSession no longer special-cases only exam kind"
  );
});

test("focus visibility: only one of focus vs topbar when on exam page", async () => {
  const { shouldShowTopbarSession, focusVisibleFromIntersection } = await loadTimerUi();
  for (const session of [
    { kind: "exam", remainingSeconds: 30 },
    { kind: "stopwatch", elapsedMs: 30000, running: true },
  ]) {
    for (const isIntersecting of [true, false]) {
      const focusTimerVisible = focusVisibleFromIntersection(isIntersecting);
      const showTop = shouldShowTopbarSession({ session, onExamPage: true, focusTimerVisible });
      // Mutual exclusion: never both representations at once
      assert.equal(showTop && focusTimerVisible, false);
      // At least one representation is available
      assert.equal(showTop || focusTimerVisible, true);
    }
  }
});

test("beforeunload: active only for active web exams", async () => {
  const { shouldWarnBeforeUnload } = await loadTimerUi();
  assert.equal(shouldWarnBeforeUnload({ activeExam: true, platformIsWeb: true }), true);
  assert.equal(shouldWarnBeforeUnload({ activeExam: false, platformIsWeb: true }), false);
  assert.equal(shouldWarnBeforeUnload({ activeExam: true, platformIsWeb: false }), false);
  assert.equal(shouldWarnBeforeUnload({ activeExam: false, platformIsWeb: false }), false);
});

test("beforeunload: platform gate excludes Capacitor and Electron", async () => {
  const { isWebUnloadPlatform } = await loadTimerUi();
  assert.equal(isWebUnloadPlatform({}), true);
  assert.equal(isWebUnloadPlatform(undefined), false);
  assert.equal(
    isWebUnloadPlatform({ Capacitor: { isNativePlatform: () => true } }),
    false
  );
  assert.equal(
    isWebUnloadPlatform({ Capacitor: { isNativePlatform: () => false } }),
    true
  );
  assert.equal(isWebUnloadPlatform({ testboxDesktop: {} }), false);
});

test("timer: Exam page owns a single useTimer engine (no second countdown)", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  const calls = examSource.match(/useTimer\s*\(/g) || [];
  assert.equal(calls.length, 1, "exactly one useTimer() in Exam.jsx");
});

test("timer: TopBar session display is display-only (no useTimer/useStopwatch engine)", async () => {
  const topbar = await readFile(new URL("../components/layout/TopBar.jsx", import.meta.url), "utf8");
  assert.ok(topbar.includes("session.remainingSeconds"), "reads session state");
  assert.ok(!/useTimer\s*\(/.test(topbar), "TopBar does not create a timer engine");
  assert.ok(!/useStopwatch\s*\(/.test(topbar), "TopBar does not create a stopwatch engine");
});

test("timer: beforeunload listener is registered only under active exam gate", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(examSource.includes("beforeunload"), "Exam page attaches the guard");
  assert.ok(
    examSource.includes("isActiveExam"),
    "guard is tied to isActiveExam"
  );
  const topLevel = (examSource.match(/beforeunload/g) || []).length;
  assert.ok(topLevel >= 1, "at least one beforeunload reference");
  // No other page should register beforeunload (avoid duplicate listeners)
  const { readdir, readFile: rf } = await import("node:fs/promises");
  const pages = await readdir(new URL("../pages/", import.meta.url));
  for (const file of pages) {
    if (!file.endsWith(".jsx") && !file.endsWith(".js")) continue;
    if (file === "Exam.jsx") continue;
    const src = await rf(new URL(`../pages/${file}`, import.meta.url), "utf8");
    assert.ok(
      !src.includes("beforeunload"),
      `${file} must not add a second beforeunload listener`
    );
  }
});

// =========================================================
// Active normal-exam session lifecycle (examState identity)
// =========================================================

test("lifecycle: isExamAttemptActive / examEntryDestination gate entry routes", async () => {
  const {
    isExamAttemptActive,
    examEntryDestination,
    shouldBypassExamStart,
    canStartNewAttempt,
  } = await loadTimerUi();

  const active = { examState: { status: "in_progress", startedAt: 1 } };
  const completed = { examState: { status: "completed", finishedAt: 2 } };
  const fresh = { examState: null };
  const empty = {};

  assert.equal(isExamAttemptActive(active), true);
  assert.equal(isExamAttemptActive(completed), false);
  assert.equal(isExamAttemptActive(fresh), false);
  assert.equal(isExamAttemptActive(empty), false);
  assert.equal(isExamAttemptActive(null), false);

  assert.equal(examEntryDestination(active), "exam", "active attempt opens Exam, never /start");
  assert.equal(examEntryDestination(completed), "results");
  assert.equal(examEntryDestination(fresh), "start");
  assert.equal(examEntryDestination(empty), "start");

  assert.equal(shouldBypassExamStart(active), true, "ExamStart must bypass active session");
  assert.equal(shouldBypassExamStart(fresh), false);

  assert.equal(canStartNewAttempt(active), false, "cannot begin a second attempt while active");
  assert.equal(canStartNewAttempt(fresh), true);
  assert.equal(canStartNewAttempt(completed), true, "after completion a fresh attempt is allowed");
});

test("lifecycle: ExamStart auto-redirects active attempt (never shows Begin)", async () => {
  const examStart = await readFile(new URL("../pages/ExamStart.jsx", import.meta.url), "utf8");
  assert.ok(
    examStart.includes("shouldBypassExamStart"),
    "ExamStart uses the shared active-session bypass helper"
  );
  assert.ok(
    /shouldBypassExamStart\(examData\)[\s\S]{0,120}Navigate to=\{`\/exam\/\$\{id\}`\} replace/.test(examStart),
    "active attempt → immediate Navigate to /exam/:id (replace), no ExamStart UI"
  );
  assert.ok(
    examStart.includes("canStartNewAttempt"),
    "handleStart guards against overwriting a live session"
  );
  // Persist failure must not navigate (silent saveExamData false was the wipe bug)
  const startMatch = examStart.match(/function handleStart\(\)[\s\S]*?\n {2}\}/);
  assert.ok(startMatch, "handleStart found");
  const startBody = startMatch[0];
  assert.ok(
    startBody.includes("saveExamData") && startBody.includes("if (!saved)"),
    "handleStart checks saveExamData return value"
  );
  assert.ok(
    !/if \(!saved\)[\s\S]{0,80}navigate\(/.test(startBody),
    "failed persist must not navigate into Exam"
  );
});

test("lifecycle: Exam routes via examEntryDestination; finish clears session + timer", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(
    examSource.includes("examEntryDestination"),
    "Exam lifecycle uses shared entry-destination helper"
  );
  assert.ok(
    /examEntryDestination\(examData\)[\s\S]{0,200}dest === "results"/.test(examSource),
    "completed → results redirect preserved"
  );
  assert.ok(
    examSource.includes('dest === "start"'),
    "non-active → start redirect preserved"
  );
  // Active attempt must NOT redirect to start
  assert.ok(
    !/examStatus !== "in_progress"[\s\S]{0,80}\/start/.test(examSource),
    "raw status check replaced by helper (no accidental active→start)"
  );
  assert.ok(
    examSource.includes("isExamAttemptActive(examData)"),
    "session registration uses shared active helper"
  );
  // Finish cleanup
  assert.ok(examSource.includes("clearTimerPersisted"), "finish path clears persisted countdown");
  const finishMatch = examSource.match(
    /const handleFinishExam[\s\S]*?navigate\(`\/exam\/\$\{id\}\/results`\);/
  );
  assert.ok(finishMatch, "handleFinishExam found");
  const finishBody = finishMatch[0];
  assert.ok(finishBody.includes("updateSession(null)"), "finish clears shared session immediately");
  assert.ok(finishBody.includes("clearTimerPersisted"), "finish clears localStorage timer");
  assert.ok(
    finishBody.includes('status: "completed"'),
    "finish marks examState completed"
  );
});

test("lifecycle: leaving Exam never clears examState (only stopwatch session)", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  // Unmount cleanup must only drop stopwatch sessions — exam sessions persist
  const unmountMatch = examSource.match(
    /return \(\) => \{\s*updateSession\(\(current\) =>\s*current && current\.kind === "stopwatch" \? null : current\s*\);\s*\};/
  );
  assert.ok(unmountMatch, "unmount only clears stopwatch sessions");
  // No examState:null wipe outside finish/retake paths
  assert.ok(
    !examSource.includes("examState: null"),
    "Exam.jsx never nulls examState (leave is not completion)"
  );
});

test("lifecycle: resume preserves answers — saveData spreads base examState", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  const saveIdx = examSource.indexOf("function saveData(");
  assert.ok(saveIdx !== -1, "saveData found");
  const body = examSource.slice(saveIdx, saveIdx + 900);
  assert.ok(body.includes("...base"), "saveData merges onto latest data (preserves examState)");
  assert.ok(
    !body.includes("examState:"),
    "saveData does not overwrite examState (managed by start/finish flows)"
  );
});

test("lifecycle: TopBar + folder cards never create a second attempt", async () => {
  const topbar = await readFile(new URL("../components/layout/TopBar.jsx", import.meta.url), "utf8");
  assert.ok(
    /navigate\(\s*`\/exam\/\$\{session\.examId\}`\s*\)/.test(topbar),
    "TopBar navigates to exact active exam via examId"
  );
  assert.ok(
    !/\/exam\/\$\{session\.examId\}\/start/.test(topbar),
    "TopBar never /start"
  );

  const folder = await readFile(new URL("../pages/Folder.jsx", import.meta.url), "utf8");
  assert.ok(
    folder.includes("isExamAttemptActive"),
    "folder cards detect active session via shared helper"
  );
  assert.ok(
    /to=\{`\/exam\/\$\{exam\.id\}`\}/.test(folder),
    "folder exam card links to /exam/:id (not /start)"
  );
  assert.ok(
    !/to=\{`\/exam\/\$\{exam\.id\}\/start`\}/.test(folder),
    "folder card must not link to /start"
  );
});

test("lifecycle: SessionContext hydrates active exam from persisted examState+timer", async () => {
  const sessionSrc = await readFile(new URL("../context/SessionContext.jsx", import.meta.url), "utf8");
  assert.ok(
    sessionSrc.includes("hydrateActiveExamSession"),
    "boot hydrate restores TopBar pill after reload"
  );
  assert.ok(
    sessionSrc.includes("activeExamSessionFromPersisted"),
    "hydrate projects the SAME persisted session (no second engine)"
  );
  assert.ok(
    sessionSrc.includes("isExamAttemptActive"),
    "hydrate only seeds in_progress attempts"
  );
  // Still display-only: Exam owns useTimer
  assert.ok(
    !/useTimer\s*\(/.test(sessionSrc),
    "SessionContext does not create a timer engine"
  );
});

test("lifecycle: practice exam/stopwatch path unchanged (no examState gate on stopwatch)", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  // Practice stopwatch registration still keyed on stopwatchOn, not examState
  assert.ok(
    /stopwatchOn && stopwatch\.elapsedMs > 0/.test(examSource),
    "practice stopwatch session registration unchanged"
  );
  assert.ok(
    examSource.includes("useStopwatch"),
    "practice stopwatch engine still present"
  );
  // finish path only runs for isExamMode
  const finishMatch = examSource.match(/const handleFinishExam[\s\S]{0,120}/);
  assert.ok(finishMatch && finishMatch[0].includes("isExamMode"), "finish gated to exam mode");
});

test("lifecycle: pure helpers remain free of React/DOM (testable)", async () => {
  const timerUi = await readFile(new URL("./timerUi.js", import.meta.url), "utf8");
  assert.ok(!/from ["']react["']/.test(timerUi), "timerUi has no React import");
  assert.ok(timerUi.includes("export function isExamAttemptActive"), "helper exported");
  assert.ok(timerUi.includes("export function examEntryDestination"), "helper exported");
  assert.ok(timerUi.includes("export function activeExamSessionFromPersisted"), "helper exported");
  assert.ok(timerUi.includes("export function canStartNewAttempt"), "helper exported");
});

// =========================================================
// Round-2: real end-to-end entry path (examState survives)
// =========================================================

test("entry: active exam route does not redirect to ExamStart", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  // Lifecycle effect is the only redirect into /start — gated by helper
  assert.ok(
    /examEntryDestination\(examData\)[\s\S]{0,400}dest === "start"/.test(examSource),
    "Exam uses examEntryDestination for /start redirect"
  );
  // Helper maps in_progress → "exam" (stays put)
  const timerUi = await readFile(new URL("./timerUi.js", import.meta.url), "utf8");
  assert.ok(
    /if \(isExamAttemptActive\(examData\)\) return "exam"/.test(timerUi),
    "active attempt destination is exam (never start)"
  );
});

test("entry: Folder card + TopBar target the same resumable exam route", async () => {
  const folder = await readFile(new URL("../pages/Folder.jsx", import.meta.url), "utf8");
  assert.ok(
    /to=\{`\/exam\/\$\{exam\.id\}`\}/.test(folder),
    "Folder card → /exam/:id"
  );
  assert.ok(
    folder.includes("isExamAttemptActive") && folder.includes("activeExamIds"),
    "Folder badge derives from the same persisted active-session helper"
  );

  const topbar = await readFile(new URL("../components/layout/TopBar.jsx", import.meta.url), "utf8");
  assert.ok(
    /navigate\(\s*`\/exam\/\$\{session\.examId\}`\s*\)/.test(topbar),
    "TopBar click → /exam/{session.examId}"
  );
  assert.ok(!/\/start/.test(topbar.match(/handleSessionClick[\s\S]{0,200}/)?.[0] || ""), "TopBar handler never routes through /start");
});

test("entry: ExamStart refuses to initialize a second attempt when in_progress", async () => {
  const examStart = await readFile(new URL("../pages/ExamStart.jsx", import.meta.url), "utf8");
  assert.ok(examStart.includes("canStartNewAttempt"), "guards handleStart");
  assert.ok(examStart.includes("shouldBypassExamStart"), "bypasses when active");
  // handleStart must not create examState when canStartNewAttempt is false
  assert.ok(
    /if \(!canStartNewAttempt\(current\)\)[\s\S]{0,80}navigate\(`\/exam\/\$\{id\}`\)/.test(examStart),
    "active session → navigate to Exam without writing a new examState"
  );
});

test("entry: persisted active state survives reinitialization (normalize keeps examState)", async () => {
  const storage = await readFile(new URL("./storage.js", import.meta.url), "utf8");
  // normalizeExamData must not coerce a live examState object away
  assert.ok(
    /examState:\s*isObject\(data\.examState\) \|\| data\.examState === null/.test(storage),
    "normalizeExamData preserves object examState"
  );
  // getExamData path uses the same key as saveExamData
  assert.ok(storage.includes("getExamDataKey"), "read and write share getExamDataKey");
});

test("entry: cloud push unions dirty examData into syncExam (exam_state lands)", async () => {
  const cloudSync = await readFile(new URL("./cloudSync.js", import.meta.url), "utf8");
  // Root cause: dirty.exams-only push left exam_state un-uploaded, then
  // clearDirty + pull nulled local in_progress.
  assert.ok(
    cloudSync.includes("examIdsToSync"),
    "syncLocalToCloud builds a union of dirty exams + dirty examData ids"
  );
  assert.ok(
    /dirtyState\.examData[\s\S]{0,200}examIdsToSync/.test(cloudSync) ||
      /examIdsToSync[\s\S]{0,200}dirtyState\.examData/.test(cloudSync),
    "dirty examData ids are included in the upload set"
  );
  // Pull must never null a local in_progress when cloud exam_state is absent
  assert.ok(
    /existing\?\.examState\?\.status === "in_progress"/.test(cloudSync),
    "pull preserves local in_progress examState over missing cloud exam_state"
  );
});

test("entry: useTimer persists under testbox-timer-${examId} (not boolean key)", async () => {
  const useTimer = await readFile(new URL("../hooks/useTimer.js", import.meta.url), "utf8");
  assert.ok(
    /timerLiveRef = useRef\(examId \|\| null\)/.test(useTimer),
    "timerLiveRef holds examId string (not !!examId)"
  );
  assert.ok(
    !/timerLiveRef = useRef\(!!examId\)/.test(useTimer),
    "regression: boolean ref wrote testbox-timer-true"
  );
  assert.ok(
    /writePersisted\(timerLiveRef\.current/.test(useTimer),
    "interval/unmount write uses the ref (now the real id)"
  );
});

test("entry: SessionContext re-hydrates after auth settles (storage prefix race)", async () => {
  const sessionSrc = await readFile(new URL("../context/SessionContext.jsx", import.meta.url), "utf8");
  assert.ok(
    sessionSrc.includes("hydrateActiveExamSession"),
    "hydrate helper present"
  );
  assert.ok(
    /authState === "unknown"/.test(sessionSrc),
    "waits for authState to leave unknown before re-hydrate"
  );
  assert.ok(
    /hydratedAuthKey !== authKey/.test(sessionSrc) &&
      /session === null/.test(sessionSrc) &&
      /hydrateActiveExamSession\(\)/.test(sessionSrc),
    "render-time re-hydrate once, only when session is still null (no live-session clobber)"
  );
  assert.ok(
    !/useEffect\(\(\) => \{[\s\S]{0,200}hydrateActiveExamSession/.test(sessionSrc),
    "no setState-in-effect hydrate (react-hooks/set-state-in-effect)"
  );
  assert.ok(
    !/useTimer\s*\(/.test(sessionSrc),
    "still display-only (no second timer engine)"
  );
});

test("entry: completed exam no longer counts as active (no stale badge/session)", async () => {
  const timerUi = await readFile(new URL("./timerUi.js", import.meta.url), "utf8");
  assert.ok(
    /export function isExamAttemptCompleted[\s\S]{0,80}status === "completed"/.test(timerUi),
    "completed detected"
  );
  assert.ok(
    /export function isExamAttemptActive[\s\S]{0,80}status === "in_progress"/.test(timerUi),
    "only in_progress is active"
  );
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");
  assert.ok(
    examSource.includes('status: "completed"'),
    "finish marks completed so subsequent entry goes to results"
  );
});
