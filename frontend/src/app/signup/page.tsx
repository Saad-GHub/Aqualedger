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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function registerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const trimmedEmail = email.trim();
      const { data, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/my-sources`,
          data: { full_name: name.trim() },
        },
      });
      if (authError) throw authError;

      // Supabase returns an empty identities list when the email is already registered.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError(
          "An account with this email already exists. Please sign in with your email and password, or use Set / reset password if needed."
        );
        return;
      }

      if (data.session) {
        router.push("/my-sources");
        router.refresh();
        return;
      }

      setOtpSent(true);
      setMessage(
        `A verification OTP code has been sent to ${trimmedEmail}. Enter it below to verify your email and finish creating your account.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create account or send verification OTP.");
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
      const trimmedEmail = email.trim();
      const token = otpCode.trim();
      let { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token,
        type: "signup",
      });
      if (verifyError) {
        ({ error: verifyError } = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token,
          type: "email",
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

  async function resendOtp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setResending(true);
    setError("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: { emailRedirectTo: `${window.location.origin}/my-sources` },
      });
      if (resendError) throw resendError;
      setMessage(`A fresh verification OTP has been sent to ${trimmedEmail}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification OTP.");
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="Farmer & Community Registration"
        title="Create your account"
        description="Set your email and password, then verify your email once with an OTP. Future sign-ins only need your email and password."
      />
      <Panel
        title={otpSent ? "Verify your email with OTP" : "Register with Email, Password & OTP"}
        description="Email OTP is required only once when creating a new account. Community accounts cannot access administrator review tools."
      >
        {otpSent ? (
          <form onSubmit={(event) => void verifyOtp(event)} className="max-w-lg space-y-4">
            {message && (
              <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-800">
                {message}
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Verification OTP Code
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
                disabled={resending}
                onClick={() => void resendOtp()}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {resending ? "Resending…" : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setError("");
                  setMessage("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Change email
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Already confirmed via link in your email?{" "}
              <Link href="/login?role=user" className="font-semibold text-teal-700 hover:underline">
                Sign in with your password
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={(event) => void registerAccount(event)} className="max-w-lg space-y-4">
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
            <label className="block text-sm font-medium text-slate-700">
              Password <span className="text-xs font-normal text-slate-400">(minimum 8 characters)</span>
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a confidential password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
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
              {busy ? "Creating account…" : "Create account & send OTP"}
            </button>
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login?role=user" className="font-semibold text-teal-700 hover:underline">
                Sign in with email & password
              </Link>
            </p>
          </form>
        )}
      </Panel>
    </>
  );
}
