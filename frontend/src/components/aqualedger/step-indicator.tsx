import { Check } from "lucide-react";

/** Numbered progress for short multi-step flows (sign up, password reset). */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-teal-600 text-white" : active ? "bg-teal-50 text-teal-800 ring-2 ring-teal-600" : "bg-slate-100 text-slate-500"
              }`}
            >
              {done ? <Check size={14} aria-hidden="true" /> : index + 1}
            </span>
            <span className={`truncate text-xs font-semibold sm:text-sm ${active ? "text-slate-900" : "text-slate-500"}`}>{label}</span>
            {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-slate-200 sm:block" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
