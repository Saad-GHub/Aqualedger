"use client";

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
  translateAreaUr,
  translateConditionUr,
  translateDepthUnitsUr,
  translateSourceTypeUr,
  translateStatusUr,
} from "@/lib/urdu-translations";
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
      <Panel title={tr(lang, "My Sources & Personal Forecast", "میرے ذرائع اور ذاتی پیشگوئی")}>
        <p className="text-sm text-slate-500">{tr(lang, "Loading your personal water records…", "آپ کے ذاتی پانی کے ریکارڈ لوڈ ہو رہے ہیں…")}</p>
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
        <Panel
          title={tr(lang, "Sign in to access your personal water data", "اپنے ذاتی پانی کے ڈیٹا تک رسائی کے لیے سائن ان کریں")}
          description={tr(lang, "Each user sees only their own submitted sources and readings here.", "ہر صارف یہاں صرف اپنے جمع کردہ ذرائع اور ریڈنگز دیکھ سکتا ہے۔")}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login?role=user"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <UserCheck size={16} />
              {tr(lang, "Sign in", "سائن ان کریں")}
            </Link>
            <Link
              href="/my-sources?demo=1"
              className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100"
            >
              {tr(lang, "Continue as Demo Farmer →", "ڈیمو کسان کے طور پر جاری رکھیں ←")}
            </Link>
            <Link
              href="/signup"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tr(lang, "Create account", "اکاؤنٹ بنائیں")}
            </Link>
            <Link
              href="/forecast"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tr(lang, "View Universal Area Forecast", "عالمی علاقائی پیشگوئی دیکھیں")}
            </Link>
          </div>
        </Panel>
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
          {tr(lang, "Your email is not verified yet.", "آپ کا ای میل ابھی تصدیق شدہ نہیں ہے۔")}{" "}
          <Link href="/account" className="font-semibold underline">
            {tr(lang, "Verify in My Account", "میرے اکاؤنٹ میں تصدیق کریں")}
          </Link>{" "}
          {tr(lang, "before logging new readings.", "نئی ریڈنگز درج کرنے سے پہلے۔")}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Personal Source Cards */}
      <Panel
        title={tr(lang, `Your Tracked Sources (${mySourceSummaries.length})`, `آپ کے ٹریک شدہ ذرائع (${mySourceSummaries.length})`)}
        description={tr(lang, "Overview of every water source and location you have recorded, with its current condition and 6-month AI outlook.", "آپ کے درج کردہ ہر پانی کے ذریعے اور مقام کا جائزہ، موجودہ صورتحال اور 6 ماہ کی AI پیشگوئی۔")}
      >
        {mySourceSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Droplets size={28} className="mx-auto text-teal-600" />
            <p className="mt-3 font-semibold text-slate-800">
              {tr(lang, "You haven't logged any water sources yet", "آپ نے ابھی تک کوئی پانی کا ذریعہ درج نہیں کیا")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {tr(lang, "Add your first tube well, borehole, or hand pump reading to start tracking its depth every 3 months.", "ہر 3 ماہ بعد گہرائی ٹریک کرنے کے لیے اپنا پہلا ٹیوب ویل، بورویل یا ہینڈ پمپ درج کریں۔")}
            </p>
            <Link
              href="/reports"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus size={16} />
              {tr(lang, "Add Your First Source", "اپنا پہلا ذریعہ شامل کریں")}
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
                          {source.code} · {translateSourceTypeUr(lang, source.sourceType)}
                        </span>
                        <h4 className="mt-0.5 text-base font-bold text-slate-900">
                          {translateSourceTypeUr(lang, source.label)}
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
                        {translateConditionUr(lang, source.condition.conditionLabel)}
                      </span>
                    </div>

                    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <span>{translateAreaUr(lang, source.address)}</span>
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="text-slate-400">{tr(lang, "Latest Depth", "حالیہ گہرائی")}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-900">
                          {source.currentDepth !== null ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(source.currentDepth)) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">{tr(lang, "6-Mo AI Forecast", "6 ماہ کی AI پیشگوئی")}</p>
                        <p className="mt-0.5 text-sm font-bold text-blue-700">
                          {source.projection
                            ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(source.projection.projectedDepth))
                            : tr(lang, "Need 2+ mo", "2+ ماہ درکار")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                      {source.reports.length} {source.reports.length === 1 ? tr(lang, "reading", "ریڈنگ") : tr(lang, "readings", "ریڈنگز")} · {tr(lang, "Last:", "آخری:")}{" "}
                      {source.latest.sampleDate || "—"}
                    </span>
                    <Link
                      href="/reports"
                      className="font-semibold text-teal-700 hover:underline"
                    >
                      + {tr(lang, "Log reading", "ریڈنگ درج کریں")}
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
          title={tr(lang, "My Reading History", "میری ریڈنگز کی تاریخ")}
          description={tr(lang, "Complete chronological log of all water depth and quality entries submitted from your account.", "آپ کے اکاؤنٹ سے جمع کرائی گئی تمام گہرائی اور معیار کی ریڈنگز کا مکمل ریکارڈ۔")}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-3 font-medium">{tr(lang, "Report", "رپورٹ")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Source", "ذریعہ")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Area / Location", "علاقہ / مقام")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Depth", "گہرائی")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Sample Date", "تاریخ")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Screening", "جانچ")}</th>
                  <th className="pb-3 font-medium">{tr(lang, "Review", "جائزہ")}</th>
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
                        {translateSourceTypeUr(lang, report.sourceLabel || report.sourceType || "Water source")}
                      </td>
                      <td className="py-3.5 text-slate-500">
                        {translateAreaUr(lang, report.areaName || report.address)}
                      </td>
                      <td className="py-3.5 font-semibold text-slate-800">
                        {report.depth ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(report.depth)) : "—"}
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
                          {translateConditionUr(lang, risk)}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs capitalize text-slate-500">
                        {translateStatusUr(lang, report.status)}
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
