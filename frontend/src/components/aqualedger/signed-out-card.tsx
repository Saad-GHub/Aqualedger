import Link from "next/link";
import { Lock, type LucideIcon } from "lucide-react";
import { DepthGauge } from "@/components/aqualedger/depth-gauge";

type CardLink = { href: string; label: string };

/**
 * Signed-out state for personal pages (My Sources, Log Reading, Account).
 * One clear primary action, one secondary, quiet text links, and a blurred
 * preview of what the signed-in screen looks like so the page is never a dead end.
 */
export function SignedOutCard({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  links = [],
  preview,
  previewLabel = "Preview",
  lockLabel = "Sign in to see your own data",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  primary: CardLink;
  secondary?: CardLink;
  links?: CardLink[];
  preview?: "sources" | "reading";
  previewLabel?: string;
  lockLabel?: string;
}) {
  return (
    <section className={`glass grid overflow-hidden rounded-3xl ${preview ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-2xl"}`}>
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          <Link href={primary.href} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500">
            {primary.label}
          </Link>
          {secondary && (
            // A plain link (full page load) so pages that read their URL once on load, like the demo
            // farmer on /my-sources?demo=1, pick up the new query even when it is the same route.
            <a href={secondary.href} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-teal-600 hover:text-teal-700">
              {secondary.label}
            </a>
          )}
        </div>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-9 items-center text-sm font-semibold text-teal-700 hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {preview && (
        <div className="relative hidden min-h-64 border-t border-slate-200 bg-slate-50 p-6 sm:block lg:border-l lg:border-t-0" aria-hidden="true">
          <span className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm dark:bg-[#0c1b1f]/90">{previewLabel}</span>
          <div className="pointer-events-none select-none blur-[3px] saturate-75">
            {preview === "sources" ? <SourcesPreview /> : <ReadingPreview />}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-md dark:bg-[#0c1b1f]">
              <Lock size={15} className="text-teal-700" />
              {lockLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/* Illustrative skeleton of the signed-in screens. Values are shapes, not data: it is blurred and hidden from assistive tech. */
function SourcesPreview() {
  const rows = [8, 19, 33];
  return (
    <div className="space-y-3 pt-6">
      {rows.map((depth, i) => (
        <div key={depth} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:bg-[#0c1b1f]">
          <DepthGauge depthM={depth} />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-28 rounded bg-slate-300" />
            <div className="h-2 w-20 rounded bg-slate-200" />
          </div>
          <div className={`h-5 w-16 rounded-full ${i === 2 ? "bg-red-100" : i === 1 ? "bg-amber-100" : "bg-teal-100"}`} />
        </div>
      ))}
      <div className="h-24 rounded-2xl border border-slate-200 bg-white dark:bg-[#0c1b1f]">
        <svg viewBox="0 0 300 90" className="h-full w-full" preserveAspectRatio="none">
          <path d="M0 30 C 50 34 80 40 120 46 S 200 58 240 60 S 280 66 300 70" fill="none" stroke="#0a7d74" strokeWidth="2.5" />
        </svg>
      </div>
    </div>
  );
}

function ReadingPreview() {
  return (
    <div className="space-y-4 pt-6">
      {["1", "2", "3"].map((step) => (
        <div key={step} className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800">{step}</span>
          <div className="h-10 flex-1 rounded-xl border border-slate-200 bg-white dark:bg-[#0c1b1f]" />
        </div>
      ))}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:bg-[#0c1b1f]">
        <DepthGauge depthM={14} size="md" />
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-300" />
          <div className="h-2 w-16 rounded bg-slate-200" />
        </div>
      </div>
      <div className="h-11 w-40 rounded-xl bg-teal-600/80" />
    </div>
  );
}
