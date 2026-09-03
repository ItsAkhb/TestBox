import { useEffect, useRef, useState } from "react";

const TIMER_KEY_PREFIX = "testbox-timer-";

function readPersisted(examId) {
  try {
    const raw = localStorage.getItem(TIMER_KEY_PREFIX + examId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersisted(examId, remainingSeconds) {
  try {
    localStorage.setItem(
      TIMER_KEY_PREFIX + examId,
      JSON.stringify({ remainingSeconds, savedAt: Date.now() })
    );
  } catch {
    // storage unavailable — timer still works in-memory
  }
}

function clearPersisted(examId) {
  try {
    localStorage.removeItem(TIMER_KEY_PREFIX + examId);
  } catch {
    // ignore
  }
}

/**
 * Countdown timer backed by localStorage.
 *
 * Persisted record: { remainingSeconds, savedAt } — the remaining count at
 * the moment it was saved. Restore computes remaining - (now - savedAt), so
 * time keeps running while the app is closed or the page is refreshed.
 */
export default function useTimer(examId, initialSeconds, onTimeUp) {
  const [remaining, setRemaining] = useState(() => {
    if (!examId || !initialSeconds) return initialSeconds || 0;

    const saved = readPersisted(examId);
    if (saved && Number.isFinite(saved.remainingSeconds) && saved.savedAt) {
      const elapsedSinceSave = Math.floor((Date.now() - saved.savedAt) / 1000);
      return Math.max(saved.remainingSeconds - elapsedSinceSave, 0);
    }
    return initialSeconds;
  });

  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  const firedRef = useRef(false);
  const timerLiveRef = useRef(!!examId);

  useEffect(() => {
    timerLiveRef.current = !!examId;
  }, [examId]);

  // Countdown interval — runs while remaining > 0
  useEffect(() => {
    if (remaining <= 0 || !timerLiveRef.current) return undefined;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next === 0) {
          clearInterval(interval);
          if (timerLiveRef.current) {
            clearPersisted(timerLiveRef.current);
          }
          if (!firedRef.current) {
            firedRef.current = true;
            setTimeout(() => onTimeUpRef.current?.(), 0);
          }
        } else if (next % 5 === 0 && timerLiveRef.current) {
          // Persist every 5s so a refresh loses at most 5s of wall clock
          writePersisted(timerLiveRef.current, next);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remaining > 0]);

  // Persist on unmount so navigating away keeps the clock correct
  useEffect(() => {
    return () => {
      if (timerLiveRef.current && !firedRef.current) {
        setRemaining((current) => {
          if (current > 0) writePersisted(timerLiveRef.current, current);
          return current;
        });
      }
    };
  }, []);

  // Fire onTimeUp when restored at/below zero (e.g. refresh after expiry).
  // A saved record existing means the clock had been running and ran out.
  useEffect(() => {
    if (remaining > 0 || initialSeconds <= 0 || !timerLiveRef.current) return;
    if (firedRef.current) return;

    const saved = readPersisted(timerLiveRef.current);
    if (!saved) return;

    firedRef.current = true;
    clearPersisted(timerLiveRef.current);
    onTimeUpRef.current?.();
  }, [remaining, initialSeconds]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    minutes,
    seconds,
    remaining,
    formatted,
    isWarning: remaining > 0 && remaining <= 300,
    isCritical: remaining > 0 && remaining <= 60,
    isPulsing: remaining > 0 && remaining <= 30,
    totalSeconds: initialSeconds,
  };
}

export { clearPersisted as clearTimerPersisted };
