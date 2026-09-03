import { useCallback, useEffect, useRef, useState } from "react";

const STOPWATCH_KEY_PREFIX = "testbox-stopwatch-";

// How often (ms) a running stopwatch rebases its persisted baseline.
// Bounds refresh-loss and midnight misattribution to this window.
export const STOPWATCH_FLUSH_INTERVAL_MS = 5000;

function recordKey(examId) {
  return `${STOPWATCH_KEY_PREFIX}${examId}`;
}

function readRecord(examId) {
  try {
    const raw = localStorage.getItem(recordKey(examId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRecord(examId, record) {
  try {
    localStorage.setItem(recordKey(examId), JSON.stringify(record));
  } catch {
    // storage unavailable — stopwatch still works in-memory
  }
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return { accumulatedMs: 0, runningSince: null, savedAt: Date.now() };
  }
  return {
    accumulatedMs:
      Number.isFinite(Number(raw.accumulatedMs)) && Number(raw.accumulatedMs) > 0
        ? Number(raw.accumulatedMs)
        : 0,
    runningSince:
      Number.isFinite(Number(raw.runningSince)) && Number(raw.runningSince) > 0
        ? Number(raw.runningSince)
        : null,
    savedAt: Date.now(),
  };
}

/**
 * Pure: elapsed ms described by a record at `nowMs`.
 * Display-only — never mutates anything.
 */
export function elapsedMs(record, nowMs = Date.now()) {
  const rec = sanitizeRecord(record);
  if (rec.runningSince == null) return rec.accumulatedMs;
  return rec.accumulatedMs + Math.max(0, nowMs - rec.runningSince);
}

/**
 * Pure: ms → "HH:MM:SS" (hours grow unbounded: 25:04:09).
 */
export function formatHMS(totalMs) {
  const totalSeconds = Math.max(0, Math.floor((Number(totalMs) || 0) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Session stopwatch backed by localStorage.
 *
 * The record is the ref-held source of truth ({ accumulatedMs,
 * runningSince, savedAt }); renders are driven by a 1s clock, so
 * re-renders can never reset or duplicate the session, and no setState
 * updater ever performs side effects (StrictMode-safe).
 *
 * - start(): begins/resumes counting from now (no-op if already running).
 * - pause(): folds elapsed time into accumulatedMs and stops. Returns the
 *   ms elapsed since the last baseline — the caller flushes that delta to
 *   statistics exactly once.
 * - reset(): zeroes the engine and stops. Never touches statistics.
 * - Opening the exam never auto-starts: a fresh record has runningSince null.
 * - Refresh/leave/return: a record with runningSince resumes via wall clock.
 * - onTick(deltaMs) fires every STOPWATCH_FLUSH_INTERVAL_MS while running
 *   plus once with the remainder on unmount, so the caller flushes running
 *   time incrementally (duplicate-proof, midnight-safe).
 */
export default function useStopwatch(examId, { onTick } = {}) {
  // Record is state (render-safe); recordRef is a write-only mirror for
  // the unmount effect. Every mutation goes through persist(), which
  // updates both — handlers read the ref (always fresh), render reads
  // the state. No setState updater ever performs side effects.
  const [record, setRecord] = useState(() =>
    examId ? sanitizeRecord(readRecord(examId)) : sanitizeRecord(null)
  );
  const recordRef = useRef(record);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Mirrors whether the record is running. Set only from user-action
  // handlers, alongside persist().
  const [running, setRunning] = useState(() => record.runningSince != null);

  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const liveRef = useRef(!!examId);
  useEffect(() => {
    liveRef.current = !!examId;
  }, [examId]);

  const persist = useCallback((next) => {
    const stamped = { ...next, savedAt: Date.now() };
    recordRef.current = stamped;
    setRecord(stamped);
    if (liveRef.current) writeRecord(examId, stamped);
    setNowMs(Date.now());
  }, [examId]);

  // 1s display ticker + periodic flush callback while running.
  useEffect(() => {
    if (!running || !liveRef.current) return undefined;

    let lastFlush = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now - lastFlush >= STOPWATCH_FLUSH_INTERVAL_MS) {
        const delta = now - lastFlush;
        lastFlush = now;
        try {
          onTickRef.current?.(delta);
        } catch {
          // statistics flushing must never break the clock
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  // Flush the in-flight remainder when leaving the page/unmounting.
  // Reads the ref only — no setState, StrictMode-safe.
  useEffect(() => {
    return () => {
      if (!liveRef.current) return;
      const current = recordRef.current;
      if (current && current.runningSince != null) {
        const remainder = Math.max(0, Date.now() - current.runningSince);
        const stopped = {
          accumulatedMs: current.accumulatedMs + remainder,
          runningSince: null,
          savedAt: Date.now(),
        };
        recordRef.current = stopped;
        writeRecord(liveRef.current, stopped);
        try {
          onTickRef.current?.(remainder);
        } catch {
          // ignore — stats flushing must never break unmount
        }
      }
    };
  }, []);

  const start = useCallback(() => {
    const current = recordRef.current;
    if (current.runningSince != null) return;
    persist({ ...current, runningSince: Date.now() });
    setRunning(true);
  }, [persist]);

  const pause = useCallback(() => {
    const current = recordRef.current;
    if (current.runningSince == null) return 0;
    const now = Date.now();
    const flushed = Math.max(0, now - current.runningSince);
    persist({
      accumulatedMs: current.accumulatedMs + flushed,
      runningSince: null,
    });
    setRunning(false);
    return flushed;
  }, [persist]);

  const reset = useCallback(() => {
    persist({ accumulatedMs: 0, runningSince: null });
    setRunning(false);
  }, [persist]);

  const elapsed = elapsedMs(record, nowMs);

  return {
    elapsedMs: elapsed,
    formatted: formatHMS(elapsed),
    running,
    start,
    pause,
    reset,
  };
}

export { readRecord as readStopwatchRecord };
