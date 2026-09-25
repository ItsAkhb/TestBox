// Pure helpers for the exam timer → TopBar docking behavior and the
// web-only beforeunload guard. Kept free of React so tests can cover
// the visibility/policy rules without a DOM.

/**
 * Should the TopBar show the session pill?
 *
 * - No session → never.
 * - Outside the exam route → always (leaving the exam keeps the countdown).
 * - On the exam route → only while the in-page focus pill is NOT visible
 *   (scrolled out of the viewport). Same rule for the exam countdown and
 *   the practice stopwatch so both dock into the TopBar identically.
 *
 * Never both: focus visible + on exam page hides the TopBar copy.
 */
export function shouldShowTopbarSession({ session, onExamPage, focusTimerVisible }) {
  if (!session) return false;
  if (!onExamPage) return true;
  return focusTimerVisible === false;
}

/**
 * Native beforeunload only while an active web exam is mounted.
 * Native (Capacitor) and Electron are excluded — web browsers only.
 */
export function shouldWarnBeforeUnload({ activeExam, platformIsWeb }) {
  return Boolean(activeExam && platformIsWeb);
}

/** True on plain web (not Capacitor native, not the Electron shell). */
export function isWebUnloadPlatform(win) {
  const w = win !== undefined ? win : typeof window !== "undefined" ? window : undefined;
  if (!w) return false;
  if (w.Capacitor?.isNativePlatform?.()) return false;
  if (w.testboxDesktop) return false;
  return true;
}

/**
 * IntersectionObserver callback → focus-timer visibility flag.
 * `isIntersecting` is already boolean; coerce for safety.
 */
export function focusVisibleFromIntersection(isIntersecting) {
  return Boolean(isIntersecting);
}

// =========================================================
// Active normal-exam session identity (examState + timer)
// =========================================================
// Exam definition ≠ active attempt. The active attempt identity is
// examData.examState.status === "in_progress" (persisted via saveExamData)
// plus the single testbox-timer-${id} wall-clock record. These helpers
// are pure so routing/entry rules can be unit-tested without a DOM.

/**
 * True when the normal exam attempt is still active (unfinished).
 * Practice exams never use examState — they are never "active" here.
 */
export function isExamAttemptActive(examData) {
  return examData?.examState?.status === "in_progress";
}

/** True when the attempt finished (results page owns this state). */
export function isExamAttemptCompleted(examData) {
  return examData?.examState?.status === "completed";
}

/**
 * Entry destination for /exam/:id given current examState:
 * - "exam"    → open the live attempt (never ExamStart)
 * - "results" → completed
 * - "start"   → no active attempt (fresh begin is allowed)
 */
export function examEntryDestination(examData) {
  if (isExamAttemptCompleted(examData)) return "results";
  if (isExamAttemptActive(examData)) return "exam";
  return "start";
}

/**
 * ExamStart must never render when an active attempt exists —
 * bounce straight into the Exam view (replace) so no second attempt
 * can be created from the start screen.
 */
export function shouldBypassExamStart(examData) {
  return isExamAttemptActive(examData);
}

/**
 * Build the display-only TopBar session object for an active exam
 * from persisted examState + the single timer record's remaining.
 * Returns null when the attempt is not active or remaining has hit 0.
 * This is a projection of the SAME session — not a second engine.
 */
export function activeExamSessionFromPersisted({
  examId,
  label,
  examData,
  remainingSeconds,
  now = Date.now(),
}) {
  if (!examId || !isExamAttemptActive(examData)) return null;
  const remaining = Number(remainingSeconds);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return {
    kind: "exam",
    examId,
    label: label || "",
    endsAt: now + remaining * 1000,
  };
}

/**
 * Can a NEW attempt be started? Only when no active attempt exists.
 * Guards handleStart against overwriting a live session.
 */
export function canStartNewAttempt(examData) {
  return !isExamAttemptActive(examData);
}
