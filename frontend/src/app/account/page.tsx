"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import {
  getSupabaseBrowserClient,
  readMyCommunityWaterReports,
  type CommunityWaterReport,
} from "@/lib/community-water-reports";
import { formatDepthMetersAndFeet } from "@/lib/depth-analytics";
import { buildReportCodes } from "@/lib/report-display-codes";
import { depthM } from "@/lib/units";

export default function AccountPage() {
  const router = useRouter();
  const { isAdmin, isSignedIn, currentEmail, emailVerified, authReady } = useAquaRole();
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (authReady && isSignedIn) {
      void readMyCommunityWaterReports()
        .then(setReports)
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Could not load your reports.")
        );
    }
  }, [authReady, isSignedIn]);

  async function signOut() {
    setBusy(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function resendVerification() {
    if (!currentEmail) return;
    setResending(true);
    setInfo("");
    setError("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: currentEmail,
        options: { emailRedirectTo: `${window.location.origin}/account` },
      });
      if (resendError) throw resendError;
      setInfo(`Verification email sent to ${currentEmail}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification email.");
    } finally {
      setResending(false);
    }
  }

  const codes = buildReportCodes(reports);

  if (!authReady) {
    return (
      <Panel title="My account">
        <p className="text-sm text-slate-500">Checking sign-in…</p>
      </Panel>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <PageIntro
          title="My account"
          description="Sign in or create an account to keep your water reports together."
        />
        <Panel title="Your AquaLedger account">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageIntro
        title="My account"
        description="Your submissions and tracked sources are saved under this account."
        action={
          <button
            disabled={busy}
            onClick={() => void signOut()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        }
      />

      <Panel
        title={isAdmin ? "Administrator account" : "Community account"}
        description="Report records are associated with this signed-in identity."
      >
        <p className="text-sm font-semibold text-slate-800">{currentEmail}</p>
        <p className="mt-1 text-xs text-slate-500">
          Email status: {emailVerified ? "Verified" : "Not verified"}
          {isAdmin ? " · Administrator role" : " · Community member"}
        </p>
        {!emailVerified && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <p>Verify your email before submitting water reports.</p>
            <button
              type="button"
              disabled={resending}
              onClick={() => void resendVerification()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-50 disabled:opacity-60"
            >
              <MailCheck size={14} />
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          </div>
        )}
        {info && (
          <p role="status" className="mt-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
            {info}
          </p>
        )}
      </Panel>

      <Panel
        title="My water reports"
        description="Only reports saved by this account are listed here."
      >
        {error ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </p>
        ) : reports.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-3">Report</th>
                  <th className="pb-3">Area</th>
                  <th className="pb-3">Source</th>
                  <th className="pb-3">Depth</th>
                  <th className="pb-3">Test date</th>
                  <th className="pb-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-slate-50">
                    <td className="py-3 font-semibold text-teal-700">
                      {codes.get(report.id) ?? report.id.slice(0, 8)}
                    </td>
                    <td className="py-3">{report.areaName || report.address}</td>
                    <td className="py-3">
                      {report.sourceCode ? `${report.sourceCode} · ` : ""}
                      {report.sourceLabel || report.sourceType || "Water source"}
                    </td>
<<<<<<< HEAD
                    <td className="py-3">{report.depth ? formatDepthMetersAndFeet(report.depth) : "—"}</td>
=======
                    <td className="py-3">{report.depth ? `${depthM(Number(report.depth))}` : "—"}</td>
>>>>>>> d8cec3d8088b9c2170ba8e470193557574d3d166
                    <td className="py-3">{report.sampleDate || "—"}</td>
                    <td className="py-3">{report.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
            No reports saved under this account yet.{" "}
            <Link href="/reports" className="font-semibold text-teal-700 hover:underline">
              Submit your first report
            </Link>
            .
          </div>
        )}
      </Panel>
    </>
  );
}
