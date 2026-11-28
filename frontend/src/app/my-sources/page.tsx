"use client";

import { SignedOutCard } from "@/components/aqualedger/signed-out-card";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  MapPin,
  Plus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { FarmerDepthWorkspace } from "@/components/aqualedger/depth-infographics";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  readMyCommunityWaterReports,
  readPublicAreaSourceTrends,
  type CommunityWaterReport,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import {
  aggregateSourceMonthlyDepths,
  formatDepthMetersAndFeet,
  normalizeAreaName,
  computeAreaDepthBenchmark,
  evaluateSourceCondition,
  forecastDepthForHorizon,
} from "@/lib/depth-analytics";
import { buildReportCodes } from "@/lib/report-display-codes";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { depthM } from "@/lib/units";

export default function MySourcesPage() {
  const { isSignedIn, currentEmail, emailVerified, authReady } = useAquaRole();
  const lang = useLanguage();
  const [myReports, setMyReports] = useState<CommunityWaterReport[]>([]);
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const isDemo = !isSignedIn && new URLSearchParams(window.location.search).get("demo") === "1";
    if (!isSignedIn && !isDemo) {
      queueMicrotask(() => {
        setMyReports([]);
        setDemoMode(false);
        setLoading(false);
      });
      return;
    }
    if (isDemo) {
      let active = true;
      const demoReports: CommunityWaterReport[] = [
        { id: "demo-1", sourceId: "demo-src-1", sourceCode: "SRC-DEMO1", sourceLabel: "Model Town Tube Well", areaName: "Bahawalpur, Punjab", areaKey: "Bahawalpur, Punjab", address: "Model Town B, Bahawalpur, Punjab", sourceType: "Tube well", depth: "7.8", sampleDate: "2026-09-15", concern: "Seasonal checking", status: "demo", measurements: {}, createdBy: "demo-farmer" },
        { id: "demo-2", sourceId: "demo-src-1", sourceCode: "SRC-DEMO1", sourceLabel: "Model Town Tube Well", areaName: "Bahawalpur, Punjab", areaKey: "Bahawalpur, Punjab", address: "Model Town B, Bahawalpur, Punjab", sourceType: "Tube well", depth: "7.1", sampleDate: "2026-06-15", concern: "Low water level", status: "demo", measurements: {}, createdBy: "demo-farmer" },
        { id: "demo-3", sourceId: "demo-src-1", sourceCode: "SRC-DEMO1", sourceLabel: "Model Town Tube Well", areaName: "Bahawalpur, Punjab", areaKey: "Bahawalpur, Punjab", address: "Model Town B, Bahawalpur, Punjab", sourceType: "Tube well", depth: "6.4", sampleDate: "2026-03-15", concern: "Seasonal checking", status: "demo", measurements: {}, createdBy: "demo-farmer" },
      ];
      void readPublicAreaSourceTrends()
        .then((trends) => {
          if (active) setPublicTrends(trends);
        })
        .catch(() => {})
        .finally(() => {
          if (active) {
            setDemoMode(true);
            setMyReports(demoReports);
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }

    let active = true;
    void Promise.allSettled([
      readMyCommunityWaterReports(),
      readPublicAreaSourceTrends(),
    ]).then(([mineResult, trendsResult]) => {
      if (!active) return;
      if (mineResult.status === "fulfilled") {
        setMyReports(mineResult.value);
        setError("");
      } else {
        setError(
          mineResult.reason instanceof Error
            ? mineResult.reason.message
            : "Could not load your personal water reports."
        );
      }
      if (trendsResult.status === "fulfilled") {
        setPublicTrends(trendsResult.value);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [authReady, isSignedIn]);

  const reportCodes = useMemo(() => buildReportCodes(myReports), [myReports]);

  const mySourceSummaries = useMemo(() => {
    const groups = new Map<string, CommunityWaterReport[]>();
    for (const report of myReports) {
      const key = report.sourceId ?? `legacy:${report.sourceType ?? "source"}:${report.address}`;
      groups.set(key, [...(groups.get(key) ?? []), report]);
    }

    return [...groups.entries()].map(([key, reports]) => {
      const latest = reports[0];
      const screening = screenWaterReport(latest);
      const areaKey = normalizeAreaName(latest.areaKey || latest.areaName, latest.address);
      const monthly =
        latest.sourceId && latest.createdBy
          ? aggregateSourceMonthlyDepths(myReports, latest.sourceId, latest.createdBy)
          : [];
      const projection = forecastDepthForHorizon(monthly, 6);
      const benchmark = computeAreaDepthBenchmark(publicTrends, areaKey, latest.sourceType);
      const currentDepth =
        monthly.at(-1)?.depth ??
        (latest.depth ? Number.parseFloat(latest.depth) : null);
      const condition = evaluateSourceCondition({
        currentDepthM: Number.isFinite(currentDepth) ? currentDepth : null,
        projectedDepthM: projection?.projectedDepth ?? null,
        projectedChangeM: projection?.projectedChange ?? null,
        slopePerMonth: projection?.slopePerMonth ?? null,
        areaBenchmark: benchmark,
        riskLevel: latest.riskLevel ?? screening.riskLevel,
        flags: screening.flags,
      });

      return {
        key,
        code: latest.sourceCode ?? (latest.sourceId ? `SRC-${latest.sourceId.slice(0, 8).toUpperCase()}` : "Source"),
        label: latest.sourceLabel || latest.sourceType || "Water source",
        sourceType: latest.sourceType || "Unspecified",
        areaKey,
        address: latest.address,
        reports,
        latest,
        currentDepth: Number.isFinite(currentDepth) ? currentDepth : null,
        projection,
        condition,
      };
    });
  }, [myReports, publicTrends]);

  if (!authReady || loading) {
    return (
      <Panel title="My Sources & Personal Forecast">
        <p className="text-sm text-slate-500">Loading your personal water records…</p>
      </Panel>
    );
  }

  if (!isSignedIn && !demoMode) {
    return (
      <>
        <PageIntro
          eyebrow={tr(lang, "Personal Workspace", "ذاتی ورک اسپیس")}
          title={tr(lang, "My Water Sources & Personal Forecast", "میرے پانی کے ذرائع اور ذاتی پیشگوئی")}
          description={tr(
            lang,
            "Sign in with your email and password to view only your own water sources, depth history, AI predictions, and tailored precautions.",
            "اپنے ذاتی پانی کے ذرائع، گہرائی کی تاریخ، AI پیشگوئی اور حفاظتی تدابیر دیکھنے کے لیے سائن ان کریں۔"
          )}
        />
        <SignedOutCard
          icon={UserCheck}
          preview="sources"
          previewLabel={tr(lang, "Preview", "جھلک")}
          lockLabel={tr(lang, "Sign in to see your own wells", "اپنے کنویں دیکھنے کے لیے سائن ان کریں")}
          title={tr(lang, "Your wells, your forecast", "آپ کے کنویں، آپ کی پیشگوئی")}
          body={tr(lang, "Sign in to see only the sources you have logged, their depth history and an AI forecast for each one. Each user sees only their own readings.", "سائن ان کر کے صرف اپنے درج کردہ ذرائع، ان کی گہرائی کی تاریخ اور ہر ایک کی AI پیشگوئی دیکھیں۔ ہر صارف صرف اپنی ریڈنگز دیکھتا ہے۔")}
          primary={{ href: "/login?role=user", label: tr(lang, "Sign in", "سائن ان کریں") }}
          secondary={{ href: "/my-sources?demo=1", label: tr(lang, "Try the demo farmer", "ڈیمو کسان آزمائیں") }}
          links={[
            { href: "/signup", label: tr(lang, "Create an account", "اکاؤنٹ بنائیں") },
            { href: "/forecast", label: tr(lang, "See area forecasts", "علاقائی پیشگوئی دیکھیں") },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <PageIntro
        eyebrow={tr(lang, "Personal Water Intelligence", "ذاتی آبی ذہانت")}
        title={tr(lang, "My Sources & Depth Predictions", "میرے ذرائع اور گہرائی کی پیشگوئی")}
        description={
          demoMode
            ? tr(lang, "Interactive Demo Farmer workspace (Bahawalpur, Punjab sample readings). Sign in with your email and password to track your own wells.", "انٹرایکٹو ڈیمو کسان ورک اسپیس (بہاولپور کے نمونہ ریکارڈ)۔ اپنے کنوؤں کو ٹریک کرنے کے لیے ای میل اور پاس ورڈ سے سائن ان کریں۔")
            : tr(lang, `Private workspace for ${currentEmail}. Only your own tracked sources, readings, and predictions are shown here.`, `${currentEmail} کے لیے ذاتی ورک اسپیس۔ یہاں صرف آپ کے ذرائع اور پیشگوئیاں دکھائی جا رہی ہیں۔`)
        }
        action={
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <Plus size={16} />
            {tr(lang, "Log New Reading", "نئی ریڈنگ درج کریں")}
          </Link>
        }
      />

      {!emailVerified && !demoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your email is not verified yet.{" "}
          <Link href="/account" className="font-semibold underline">
            Verify in My Account
          </Link>{" "}
          before logging new readings.
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Personal Source Cards */}
      <Panel
        title={`Your Tracked Sources (${mySourceSummaries.length})`}
        description="Overview of every water source and location you have recorded, with its current condition and 6-month AI outlook."
      >
        {mySourceSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Droplets size={28} className="mx-auto text-teal-600" />
            <p className="mt-3 font-semibold text-slate-800">
              You haven&apos;t logged any water sources yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add your first tube well, borehole, or hand pump reading to start tracking its depth every 3 months.
            </p>
            <Link
              href="/reports"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus size={16} />
              Add Your First Source
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mySourceSummaries.map((source) => {
              const badgeClass =
                source.condition.conditionTone === "red"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : source.condition.conditionTone === "amber"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-teal-50 text-teal-800 border-teal-200";
              return (
                <div
                  key={source.key}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                          {source.code} · {source.sourceType}
                        </span>
                        <h4 className="mt-0.5 text-base font-bold text-slate-900">
                          {source.label}
                        </h4>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                      >
                        {source.condition.conditionTone === "red" ? (
                          <TrendingDown size={13} />
                        ) : source.condition.conditionTone === "amber" ? (
                          <ShieldAlert size={13} />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        {source.condition.conditionLabel}
                      </span>
                    </div>

                    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <span>{source.address}</span>
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="text-slate-400">Latest Depth</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-900">
                          {source.currentDepth !== null ? formatDepthMetersAndFeet(source.currentDepth) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">6-Mo AI Forecast</p>
                        <p className="mt-0.5 text-sm font-bold text-blue-700">
                          {source.projection
                            ? formatDepthMetersAndFeet(source.projection.projectedDepth)
                            : "Need 2+ mo"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                      {source.reports.length} reading{source.reports.length === 1 ? "" : "s"} · Last:{" "}
                      {source.latest.sampleDate || "—"}
                    </span>
                    <Link
                      href="/reports"
                      className="font-semibold text-teal-700 hover:underline"
                    >
                      + Log reading
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Personal AI Prediction, Well Infographic & Precautions */}
      {myReports.length > 0 && (
        <FarmerDepthWorkspace
          myReports={myReports}
          publicTrends={publicTrends}
          isSignedIn={isSignedIn}
        />
      )}

      {/* Personal Readings History Table */}
      {myReports.length > 0 && (
        <Panel
          title="My Reading History"
          description="Complete chronological log of all water depth and quality entries submitted from your account."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-3 font-medium">Report</th>
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 font-medium">Area / Location</th>
                  <th className="pb-3 font-medium">Depth</th>
                  <th className="pb-3 font-medium">Sample Date</th>
                  <th className="pb-3 font-medium">Screening</th>
                  <th className="pb-3 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {myReports.map((report) => {
                  const screening = screenWaterReport(report);
                  const risk = report.riskLevel ?? screening.riskLevel;
                  return (
                    <tr key={report.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3.5 font-semibold text-teal-700">
                        {reportCodes.get(report.id) ?? report.id.slice(0, 8)}
                      </td>
                      <td className="py-3.5 text-slate-700">
                        {report.sourceCode ? `${report.sourceCode} · ` : ""}
                        {report.sourceLabel || report.sourceType || "Water source"}
                      </td>
                      <td className="py-3.5 text-slate-500">
                        {report.areaName || report.address}
                      </td>
                      <td className="py-3.5 font-semibold text-slate-800">
                        {report.depth ? formatDepthMetersAndFeet(report.depth) : "—"}
                      </td>
                      <td className="py-3.5 text-slate-500">{report.sampleDate || "—"}</td>
                      <td className="py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            risk === "High concern"
                              ? "bg-red-50 text-red-700"
                              : risk === "Moderate concern"
                                ? "bg-amber-50 text-amber-800"
                                : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          {risk === "High concern" ? (
                            <AlertTriangle size={12} />
                          ) : (
                            <TrendingUp size={12} />
                          )}
                          {risk}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs capitalize text-slate-500">
                        {report.status.replaceAll("_", " ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
