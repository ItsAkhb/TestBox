import { useEffect, useMemo, useRef, useState } from "react";

// Animated number: eases from 0 to `value` on mount/value change.
// Honors prefers-reduced-motion by rendering the value directly.
export default function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
}) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);

  const prefersReduced = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    if (prefersReduced) return undefined;

    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(target * eased);
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, prefersReduced]);

  const shown = prefersReduced ? target : display;
  const text =
    decimals > 0
      ? String(parseFloat(shown.toFixed(decimals)))
      : String(Math.round(shown));

  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
