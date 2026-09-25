import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getExams, getExamData } from "../services/dataService";
import { useAuth } from "./AuthContext";
import {
  activeExamSessionFromPersisted,
  isExamAttemptActive,
} from "../services/timerUi";

const SessionContext = createContext(null);

// Read the single persisted timer record for an exam (same key useTimer
// owns). Pure projection — no second timer engine.
function readRemainingSeconds(examId) {
  try {
    const raw = localStorage.getItem(`testbox-timer-${examId}`);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Number.isFinite(saved?.remainingSeconds) || !saved?.savedAt) return null;
    const elapsed = Math.floor((Date.now() - saved.savedAt) / 1000);
    return Math.max(saved.remainingSeconds - elapsed, 0);
  } catch {
    return null;
  }
}

// Boot-time hydrate: restore the TopBar pill from persisted examState +
// timer so a reload (SessionContext starts null) still shows the active
// normal-exam session. Display only — Exam owns the real useTimer engine.
function hydrateActiveExamSession() {
  try {
    const exams = getExams();
    if (!Array.isArray(exams)) return null;
    for (const exam of exams) {
      if (exam?.type !== "exam") continue;
      const examData = getExamData(exam.id);
      if (!isExamAttemptActive(examData)) continue;
      const remainingSeconds = readRemainingSeconds(exam.id);
      const session = activeExamSessionFromPersisted({
        examId: exam.id,
        label: exam.name || "",
        examData,
        remainingSeconds: remainingSeconds ?? 0,
      });
      if (session) return session;
    }
  } catch {
    // unreadable storage — Exam page will re-register on next mount
  }
  return null;
}

/**
 * Shared "active study session" state so the TopBar can show the exam
 * countdown or practice stopwatch while the exam page is not mounted —
 * without a second timer engine. The Exam page owns the real
 * useTimer/useStopwatch engines and registers the session here.
 *
 * Exam sessions are wall-clock based ({endsAt}) so the countdown keeps
 * ticking correctly in the TopBar even after leaving the page (the
 * underlying persisted timer record behaves the same way). Practice
 * stopwatches pause on unmount (existing engine behavior), so they are
 * cleared when the exam page unmounts.
 */
export function SessionProvider({ children }) {
  const { authState, user } = useAuth();
  // Hydrate once from persisted examState + timer (reload resilience).
  const [session, setSession] = useState(() => hydrateActiveExamSession());
  // Auth identity the boot hydrate ran under (null until auth settles).
  const [hydratedAuthKey, setHydratedAuthKey] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // Focus-timer dock state: true while the in-page exam timer is visible.
  // The Exam page drives this via IntersectionObserver; the TopBar uses it
  // to decide when its (display-only) pill should appear. Display only —
  // never a second timer engine.
  const [focusTimerVisible, setFocusTimerVisible] = useState(true);

  const updateSession = useCallback((next) => {
    setSession((current) =>
      typeof next === "function" ? next(current) : next
    );
  }, []);

  // Boot hydrate can race setStorageUser(user.id): first pass may read
  // the anonymous prefix and miss a user-namespaced active attempt.
  // Once auth settles, re-read once if we still have no session.
  // Adjust during render (React's alternative to setState-in-effect) —
  // never overwrites a live Exam-registered session.
  const authKey = authState === "unknown" ? null : (user?.id ?? "anonymous");
  if (authKey !== null && hydratedAuthKey !== authKey) {
    if (session === null) {
      const rehydrated = hydrateActiveExamSession();
      if (rehydrated) setSession(rehydrated);
    }
    setHydratedAuthKey(authKey);
  }

  // 1s ticker only while an exam countdown is displayed.
  const examRunning = session?.kind === "exam";
  useEffect(() => {
    if (!examRunning) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [examRunning]);

  // Countdown display derives from the wall clock each render; an
  // expired session simply renders as null (real finish flow stays
  // owned by the Exam page's own timer engine).
  const sessionValue = useMemo(() => {
    if (!session) return null;
    if (session.kind === "exam") {
      const remainingMs = session.endsAt - now;
      if (remainingMs <= 0) return null;
      return {
        ...session,
        remainingSeconds: Math.ceil(remainingMs / 1000),
      };
    }
    return session;
  }, [session, now]);

  const value = useMemo(
    () => ({
      session: sessionValue,
      updateSession,
      focusTimerVisible,
      setFocusTimerVisible,
    }),
    [sessionValue, updateSession, focusTimerVisible]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
