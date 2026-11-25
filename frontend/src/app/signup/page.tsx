"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/forecast`,
          data: { full_name: name.trim() },
        },
      });
      if (authError) throw authError;
      setOtpSent(true);
      setMessage(
        `An 8-digit OTP code has been sent to ${email.trim()}. Enter it below to verify your email and create your account.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send verification OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      let { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });
      if (verifyError) {
        ({ error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: "signup",
        }));
      }
      if (verifyError) throw verifyError;
      router.push("/my-sources");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid or expired OTP code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="Farmer & Community Registration"
        title="Create account with Email OTP"
        description="Verify your email using an 8-digit OTP code from Supabase, then track your water depth over time."
      />
      <Panel
        title={otpSent ? "Enter your 8-digit OTP" : "Register with Email OTP"}
        description="Community accounts cannot access administrator review tools."
      >
        {otpSent ? (
          <form onSubmit={(event) => void verifyOtp(event)} className="max-w-lg space-y-4">
            {message && (
              <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-800">
                {message}
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              8-digit OTP Code
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="Enter code from email"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base tracking-widest outline-none focus:border-teal-600"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                <MailCheck size={16} />
                {busy ? "Verifying…" : "Verify OTP & Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Change email / Resend
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => void sendOtp(event)} className="max-w-lg space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Your name
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Muhammad Ali"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {busy ? "Sending OTP…" : "Send verification OTP"}
            </button>
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login?role=user" className="font-semibold text-teal-700 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </Panel>
    </>
  );
}
