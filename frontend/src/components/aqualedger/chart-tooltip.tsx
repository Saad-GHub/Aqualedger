"use client";

// Glass hover cards for Recharts, styled like the rest of AquaLedger (both themes).
// Recharts injects `active`, `payload` and `label` into the element passed as `content`.

type TooltipEntry = { dataKey?: string | number; value?: unknown; color?: string; fill?: string; payload?: Record<string, unknown> };
type InjectedProps = { active?: boolean; payload?: TooltipEntry[]; label?: unknown };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2008-07" → "Jul 2008"; anything else is returned unchanged. */
export function formatMonth(value: unknown) {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})/.exec(text);
  if (!match) return text;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

const metres = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} m` : "—";
};

function Card({ title, badge, children }: { title: string; badge?: { text: string; tone: "teal" | "blue" }; children: React.ReactNode }) {
  return (
    <div className="aqua-tooltip min-w-[13rem] max-w-[17rem] rounded-2xl px-3.5 py-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-display text-[13px] font-bold text-slate-900">{title}</p>
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              badge.tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-blue-50 text-blue-700"
            }`}
          >
            {badge.text}
          </span>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ color, label, value, dashed = false }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-slate-600">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={dashed ? { border: `2px dashed ${color}` } : { background: color, boxShadow: `0 0 0 3px ${color}26` }}
        />
        {label}
      </span>
      <span className="tabular font-semibold text-slate-900">{value}</span>
    </div>
  );
}

/**
 * Depth trend + AI forecast hover card. Shows the recorded/average depth, the AI
 * projection and the likely range (lower … lower + band) instead of raw band values.
 */
export function DepthTrendTooltip({
  active,
  payload,
  label,
  actualLabel = "Recorded",
  lastMonth,
}: InjectedProps & { actualLabel?: string; lastMonth?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const actual = row.actual as number | null | undefined;
  const projected = row.projected as number | null | undefined;
  const lower = row.lower as number | null | undefined;
  const band = row.band as number | null | undefined;
  const isForecast = actual == null && projected != null && (!lastMonth || String(label) > lastMonth);
  return (
    <Card
      title={formatMonth(label)}
      badge={isForecast ? { text: "AI forecast", tone: "blue" } : { text: "Recorded", tone: "teal" }}
    >
      {actual != null && <Row color="#14b8a6" label={actualLabel} value={metres(actual)} />}
      {projected != null && <Row color="#3b82f6" label="AI projected" value={metres(projected)} dashed />}
      {lower != null && band != null && Number(band) > 0 && (
        <p className="mt-1 rounded-lg bg-sky-50 px-2 py-1 text-[11px] text-sky-800">
          Likely range {Number(lower).toFixed(1)} – {(Number(lower) + Number(band)).toFixed(1)} m
        </p>
      )}
    </Card>
  );
}

/** Bar hover card: title from the bar's category, average depth and report count. */
export function DepthBarTooltip({
  active,
  payload,
  label,
  titleKey,
  countKey,
  valueLabel = "Average depth",
  color = "#14b8a6",
}: InjectedProps & { titleKey?: string; countKey?: string; valueLabel?: string; color?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const title = String((titleKey && row[titleKey]) || label || "");
  const count = countKey ? Number(row[countKey]) : NaN;
  return (
    <Card title={title}>
      <Row
        color={(row.fill as string) || (payload[0]?.fill?.startsWith("#") ? payload[0].fill : undefined) || color}
        label={valueLabel}
        value={metres(payload[0]?.value)}
      />
      {Number.isFinite(count) && (
        <Row color="#94a3b8" label="Reports" value={count.toLocaleString()} />
      )}
    </Card>
  );
}
