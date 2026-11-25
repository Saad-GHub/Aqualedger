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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data, error: authError } = await getSupabaseBrowserClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/account`,
        },
      });
      if (authError) throw authError;
      if (data.session) {
        router.push("/account");
        router.refresh();
        return;
      }
      setCreated(true);
      setMessage(
        `Verification link sent to ${email.trim()}. Open your inbox and confirm your email once, then sign in with your email and password.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  async function resendEmail() {
    if (!email.trim()) return;
    setResending(true);
    setError("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/account` },
      });
      if (resendError) throw resendError;
      setMessage(`Verification email resent to ${email.trim()}. Please check your inbox and spam folder.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification email.");
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="Community registration"
        title="Create a community account"
        description="Verify your email once, then use this account for all your water reports."
      />
      <Panel
        title={created ? "Verify your email" : "Community signup"}
        description="Community accounts are for submitting and tracking reports. Administrator access is separate."
      >
        {created ? (
          <div className="max-w-lg space-y-4">
            <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-800">
              {message}
            </p>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login?role=user"
                className="inline-flex rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Continue to sign in
              </Link>
              <button
                type="button"
                disabled={resending}
                onClick={() => void resendEmail()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <MailCheck size={16} />
                {resending ? "Sending…" : "Resend email"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Your name
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
              <span className="mt-1 block text-xs text-slate-500">Use at least 8 characters.</span>
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
              {busy ? "Creating account…" : "Create account"}
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
