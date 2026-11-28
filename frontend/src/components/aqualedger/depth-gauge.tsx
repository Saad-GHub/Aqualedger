/**
 * Borewell gauge: a tiny cross-section of a well. Soil strata sit above the water
 * table and water fills below it, so a deeper water table shows as less water.
 * Used wherever one depth needs to be read at a glance (stat tiles, area lists).
 */
export function DepthGauge({
  depthM,
  maxM = 60,
  size = "sm",
  className = "",
  label,
}: {
  depthM: number | null | undefined;
  /** Depth that maps to the bottom of the gauge. */
  maxM?: number;
  size?: "sm" | "md";
  className?: string;
  /** Accessible description; defaults to "Water table about N m below ground". */
  label?: string;
}) {
  const hasDepth = typeof depthM === "number" && Number.isFinite(depthM);
  const ratio = hasDepth ? Math.min(1, Math.max(0, depthM / maxM)) : 0;
  // Keep a sliver of water visible even for very deep tables so the gauge never looks empty.
  const waterPct = hasDepth ? Math.max(6, (1 - ratio) * 100) : 0;
  const dims = size === "md" ? "h-16 w-5" : "h-11 w-3.5";

  return (
    <span
      role="img"
      aria-label={label ?? (hasDepth ? `Water table about ${depthM.toFixed(1)} m below ground` : "No depth reading")}
      className={`aqua-gauge relative inline-block shrink-0 overflow-hidden rounded-[5px] ${dims} ${className}`}
    >
      {hasDepth && (
        <>
          <span className="aqua-gauge-fill absolute inset-x-0 bottom-0" style={{ height: `${waterPct}%` }} />
          <span className="absolute inset-x-[-1px] h-[2px] bg-[var(--ink)]" style={{ bottom: `calc(${waterPct}% - 1px)` }} />
        </>
      )}
    </span>
  );
}
