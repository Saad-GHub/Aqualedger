"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a stat that may carry a unit ("2,176", "12.3 m", "—"): the number part
 * counts up with the same decimals, the unit stays put, and non-numbers render as-is.
 */
export function StatValue({ value }: { value: string }) {
  const match = /^\s*(-?[\d,]*\.?\d+)(.*)$/.exec(value);
  if (!match) return <>{value}</>;
  const number = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return <>{value}</>;
  const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
  const suffix = match[2];
  return (
    <AnimatedNumber
      value={number}
      format={(n) =>
        `${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
      }
    />
  );
}

/** Counts up from the previous value to `value` with an ease-out curve. */
export function AnimatedNumber({
  value,
  duration = 1100,
  format = (n: number) => Math.round(n).toLocaleString(),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value, duration]);

  return <>{format(shown)}</>;
}
