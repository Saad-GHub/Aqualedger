"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a stat that may carry a unit ("2,176", "12.3 m", "—"): the number part
 * counts up with the same decimals, the unit stays put, and non-numbers render as-is.
 */
export function StatValue({ value }: { value: string }) {
  // Metres + feet ("8.5 m / 28.0 ft"): metres lead, feet sit smaller beside them so the stat stays on one line.
  // Also matches the Urdu units from translateDepthUnitsUr ("8.5 میٹر / 28.0 فٹ").
  const dual = /^(.+?\s(?:m|میٹر))\s*\/\s*(.+\s(?:ft|فٹ))$/.exec(value);
  if (dual) {
    return (
      <span className="whitespace-nowrap">
        {dual[1]}
        <span className="ml-1.5 text-sm font-semibold tracking-normal text-slate-400 sm:text-base">{dual[2]}</span>
      </span>
    );
  }
  // Do not animate other slash values like "8 / 36" to avoid desync between the two numbers.
  if (value.includes("/")) return <>{value}</>;
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
