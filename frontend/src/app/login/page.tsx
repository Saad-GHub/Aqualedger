"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, UserCheck } from "lucide-react";
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
  const [emailNeedsConfirmation, setEmailNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
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

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    setEmailNeedsConfirmation(false);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;

      const userIsAdmin = data.user?.app_metadata?.role === "admin";
      if (selectedRole === "admin" && !userIsAdmin) {
        await supabase.auth.signOut();
        setError(
          "This account does not have administrator access. Please sign in as a Farmer / Community User."
        );
        return;
      }
      if (selectedRole === "user" && userIsAdmin) {
        await supabase.auth.signOut();
        setError(
          "This is the Administrator account. Please switch role and sign in under Administrator."
        );
        return;
      }

      setCurrentEmail(data.user.email ?? email.trim());
      setIsAdmin(userIsAdmin);
      router.push(userIsAdmin ? "/" : "/my-sources");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      const lower = message.toLowerCase();
      if (lower.includes("email not confirmed")) {
        setEmailNeedsConfirmation(true);
        setError(
          "Your email is not verified yet. Please verify your email using the sign-up OTP or link sent to your inbox."
        );
      } else if (lower.includes("invalid login credentials")) {
        // Accounts made by the earlier email-code flow have no password, so they also land here.
        setError(
          "Email or password is incorrect. If you created your account earlier with an email code, use \"Set / reset password\" below to set a password."
        );
      } else {
        setError(message || "Sign in failed. Check your email and password.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setResending(true);
    setError("");
    setInfo("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: { emailRedirectTo: `${window.location.origin}/my-sources` },
      });
      if (resendError) throw resendError;
      setInfo(`Verification email resent to ${trimmedEmail}. Complete verification, then sign in here.`);
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
          title="Active Session"
          description="Only one account (either Farmer/User or Administrator) can be signed in at a time."
        />
        <Panel
          title={isAdmin ? "Administrator signed in" : "Farmer / Community account signed in"}
          description="Your session is active in this browser."
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{currentEmail}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isAdmin
                  ? "Single Administrator role · Full review & monitoring access"
                  : "Verified Community / Farmer account · Depth forecast & reporting access"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={isAdmin ? "/" : "/forecast"}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                {isAdmin ? "Go to Admin Dashboard" : "Open Depth Forecast"}
              </Link>
              <Link
                href="/account"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                My Account
              </Link>
              <button
                onClick={() => void handleSignOut()}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Sign out / Switch account
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
          title="Select your account type"
          description="Choose whether you are signing in as a Farmer / Community User or as the single Administrator."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelectedRole("user");
              setError("");
              setInfo("");
              setEmailNeedsConfirmation(false);
            }}
            className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/40"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <UserCheck size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Farmer / Community User</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in directly with your email and password to log water depth every 3 months and get AI depth predictions &amp; precautions. New accounts verify once via OTP on sign-up.
            </p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">
              Continue as Farmer / User →
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole("admin");
              setError("");
              setInfo("");
              setEmailNeedsConfirmation(false);
            }}
            className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-teal-300">
              <ShieldCheck size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Administrator</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Restricted to the single authorized AquaLedger administrator account for reviewing reports, verifying lab data, and monitoring all areas.
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
        eyebrow={isAdminMode ? "Administrator access" : "Farmer & Community access"}
        title={isAdminMode ? "Administrator Sign In" : "User Sign In"}
        description={
          isAdminMode
            ? "Sign in with the single authorized AquaLedger admin credentials."
            : "Sign in with your email and password. Email OTP verification is only required once when creating a new account."
        }
        action={
          <button
            type="button"
            onClick={() => {
              setSelectedRole(null);
              setError("");
              setInfo("");
              setEmailNeedsConfirmation(false);
            }}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Switch role
          </button>
        }
      />

      {isAdminMode ? (
        <Panel
          title="Admin credentials"
          description="Only the designated admin account can access this workspace."
        >
          <form onSubmit={(event) => void handlePasswordLogin(event)} className="max-w-lg space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Admin Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
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
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in as Admin"}
            </button>
          </form>
        </Panel>
      ) : (
        <Panel
          title="Password Sign In"
          description="Sign in with your registered email and password."
        >
          <form onSubmit={(event) => void handlePasswordLogin(event)} className="max-w-lg space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
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
            {info && (
              <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
                {info}
              </p>
            )}
            {error && (
              <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p>{error}</p>
                {emailNeedsConfirmation && email.trim() && (
                  <button
                    type="button"
                    disabled={resending}
                    onClick={() => void handleResendConfirmation()}
                    className="mt-2 inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-50 disabled:opacity-60"
                  >
                    {resending ? "Resending…" : "Resend verification email"}
                  </button>
                )}
              </div>
            )}
            <button
              disabled={busy}
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="flex flex-wrap justify-between gap-3 pt-1 text-sm">
              <Link href="/reset-password" className="font-semibold text-teal-700 hover:underline">
                Set / reset password
              </Link>
              <span className="text-slate-500">
                New here?{" "}
                <Link href="/signup" className="font-semibold text-teal-700 hover:underline">
                  Create account (OTP verified)
                </Link>
              </span>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
