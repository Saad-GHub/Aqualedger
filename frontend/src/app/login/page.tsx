"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MailCheck, ShieldCheck, UserCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";

type LoginRole = "user" | "admin" | null;

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<LoginRole>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("role");
    queueMicrotask(() => {
      if (param === "admin" || param === "user") setSelectedRole(param);
    });
    void getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        setCurrentEmail(data.user?.email ?? "");
        setIsAdmin(data.user?.app_metadata?.role === "admin");
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    setNeedsVerification(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;

      const userIsAdmin = data.user?.app_metadata?.role === "admin";
      if (selectedRole === "admin" && !userIsAdmin) {
        await supabase.auth.signOut();
        setError("This account does not have administrator access. Please sign in as a Community User.");
        return;
      }

      setCurrentEmail(data.user.email ?? email.trim());
      setIsAdmin(userIsAdmin);
      router.push(userIsAdmin ? "/" : "/account");
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Sign in failed. Check your email and password.";
      if (message.toLowerCase().includes("email not confirmed")) {
        setNeedsVerification(true);
        setError("Your email is not verified yet. Check your inbox or resend the verification email below.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) return;
    setResending(true);
    setError("");
    setInfo("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/account` },
      });
      if (resendError) throw resendError;
      setInfo(`Verification email sent to ${email.trim()}. Confirm it in your inbox, then sign in.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification email.");
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut();
    setCurrentEmail("");
    setIsAdmin(false);
  }

  if (currentEmail) {
    return (
      <>
        <PageIntro
          title="Signed in"
          description="You are currently signed in to AquaLedger."
        />
        <Panel
          title={isAdmin ? "Administrator signed in" : "Community account signed in"}
          description="Your session is active in this browser."
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{currentEmail}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isAdmin ? "Administrator role · Full review & monitoring access" : "Community member · Submit & track your water reports"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={isAdmin ? "/" : "/account"}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                {isAdmin ? "Go to dashboard" : "My account & reports"}
              </Link>
              <button
                onClick={() => void handleSignOut()}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  if (!selectedRole) {
    return (
      <>
        <PageIntro
          eyebrow="AquaLedger Access"
          title="Choose how you want to sign in"
          description="Select Community User for submitting water reports with email verification, or Administrator for the single review workspace."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelectedRole("user");
              setError("");
              setInfo("");
            }}
            className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <UserCheck size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Community User</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in with your verified email or create a new community account to submit water quality reports and track your sources.
            </p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">
              Continue as Community User →
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole("admin");
              setError("");
              setInfo("");
            }}
            className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-teal-300">
              <ShieldCheck size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Administrator</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in with the single authorized AquaLedger administrator account to review submissions, verify reports, and view full analytics.
            </p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-800">
              Continue as Administrator →
            </span>
          </button>
        </div>
      </>
    );
  }

  const isAdminMode = selectedRole === "admin";

  return (
    <>
      <PageIntro
        eyebrow={isAdminMode ? "Administrator access" : "Community account"}
        title={isAdminMode ? "Administrator Sign In" : "Community User Sign In"}
        description={
          isAdminMode
            ? "Use the single authorized AquaLedger admin credentials."
            : "Sign in with your email-verified community account, or create one."
        }
        action={
          <button
            type="button"
            onClick={() => {
              setSelectedRole(null);
              setError("");
              setInfo("");
              setNeedsVerification(false);
            }}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Switch role
          </button>
        }
      />

      <Panel
        title={isAdminMode ? "Admin credentials" : "Community credentials"}
        description={
          isAdminMode
            ? "Only the designated admin account can access this workspace."
            : "Email verification is required once when you register."
        }
      >
        <form onSubmit={(event) => void handleSubmit(event)} className="max-w-lg space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={isAdminMode ? "admin@example.com" : "you@example.com"}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
            />
          </label>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              {needsVerification && !isAdminMode && (
                <button
                  type="button"
                  disabled={resending}
                  onClick={() => void handleResendVerification()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-50 disabled:opacity-60"
                >
                  <MailCheck size={14} />
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          {info && (
            <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
              {info}
            </p>
          )}

          <button
            disabled={busy}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {busy ? "Signing in…" : isAdminMode ? "Sign in as Admin" : "Sign in"}
          </button>

          {!isAdminMode && (
            <div className="flex flex-wrap justify-between gap-3 pt-1 text-sm">
              <Link href="/reset-password" className="font-semibold text-teal-700 hover:underline">
                Forgot / reset password
              </Link>
              <span className="text-slate-500">
                New user?{" "}
                <Link href="/signup" className="font-semibold text-teal-700 hover:underline">
                  Create account (Email verification)
                </Link>
              </span>
            </div>
          )}
        </form>
      </Panel>
    </>
  );
}
