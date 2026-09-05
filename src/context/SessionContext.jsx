import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const SessionContext = createContext(null);

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
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const updateSession = useCallback((next) => {
    setSession((current) =>
      typeof next === "function" ? next(current) : next
    );
  }, []);

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
  const value = useMemo(() => {
    if (!session) return { session: null, updateSession };
    if (session.kind === "exam") {
      const remainingMs = session.endsAt - now;
      if (remainingMs <= 0) return { session: null, updateSession };
      return {
        session: {
          ...session,
          remainingSeconds: Math.ceil(remainingMs / 1000),
        },
        updateSession,
      };
    }
    return { session, updateSession };
  }, [session, now, updateSession]);

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
