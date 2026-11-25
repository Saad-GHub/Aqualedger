"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, UserCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";

type LoginRole = "user" | "admin" | null;
type UserAuthMode = "otp" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<LoginRole>(null);
  const [userAuthMode, setUserAuthMode] = useState<UserAuthMode>("otp");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function handleSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/forecast`,
          data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
        },
      });
      if (otpError) throw otpError;
      setOtpSent(true);
      setInfo(
        `An 8-digit verification code has been sent to ${email.trim()}. Enter it below to verify your email and sign in.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send OTP to this email.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const supabase = getSupabaseBrowserClient();
      let { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });
      if (verifyError) {
        ({ data, error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: "signup",
        }));
      }
      if (verifyError) throw verifyError;

      const userIsAdmin = data.user?.app_metadata?.role === "admin";
      if (userIsAdmin) {
        await supabase.auth.signOut();
        setError("Administrator accounts must sign in using the Administrator option.");
        return;
      }

      setCurrentEmail(data.user?.email ?? email.trim());
      setIsAdmin(false);
      router.push("/my-sources");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid or expired OTP code.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
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
      setError(
        message.toLowerCase().includes("invalid login credentials")
          ? // Accounts made by the earlier email-code flow have no password, so they also land here.
            "Email or password is incorrect. If you created your account with an email code, it has no password yet: use \"Set / reset password\" below to set one."
          : message || "Sign in failed. Check your email and password."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut();
    setCurrentEmail("");
    setIsAdmin(false);
    setOtpSent(false);
    setOtpCode("");
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
          description="Choose whether you are signing in as a Farmer / Community User (with Email OTP verification) or as the single Administrator."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelectedRole("user");
              setError("");
              setInfo("");
              setOtpSent(false);
            }}
            className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-teal-400 hover:bg-teal-50/40"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <UserCheck size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">Farmer / Community User</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Verify your email with an 8-digit OTP to create an account or sign in, log water depth every 3 months, and get AI depth predictions & precautions.
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
              setOtpSent(false);
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
        title={isAdminMode ? "Administrator Sign In" : "User Sign In & Email OTP"}
        description={
          isAdminMode
            ? "Sign in with the single authorized AquaLedger admin credentials."
            : "Verify your email using an 8-digit OTP code from Supabase to create an account or sign in."
        }
        action={
          <button
            type="button"
            onClick={() => {
              setSelectedRole(null);
              setError("");
              setInfo("");
              setOtpSent(false);
              setOtpCode("");
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
          title={userAuthMode === "otp" ? "Email OTP Authentication" : "Password Sign In"}
          description={
            userAuthMode === "otp"
              ? "New and existing users can enter their email to receive an 8-digit OTP code from Supabase."
              : "Sign in with your email and password."
          }
        >
          <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => {
                setUserAuthMode("otp");
                setError("");
                setInfo("");
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                userAuthMode === "otp"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Mail size={14} />
              Email OTP (Recommended)
            </button>
            <button
              type="button"
              onClick={() => {
                setUserAuthMode("password");
                setError("");
                setInfo("");
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                userAuthMode === "password"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound size={14} />
              Password
            </button>
          </div>

          {userAuthMode === "otp" ? (
            !otpSent ? (
              <form onSubmit={(event) => void handleSendOtp(event)} className="max-w-lg space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Full Name <span className="text-xs font-normal text-slate-400">(for new accounts)</span>
                  <input
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="e.g. Muhammad Ali"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Email Address
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
                  <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <button
                  disabled={busy}
                  className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {busy ? "Sending OTP…" : "Send 8-digit OTP"}
                </button>
              </form>
            ) : (
              <form onSubmit={(event) => void handleVerifyOtp(event)} className="max-w-lg space-y-4">
                {info && (
                  <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
                    {info}
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
                  <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    disabled={busy}
                    className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    {busy ? "Verifying…" : "Verify OTP & Sign in"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setError("");
                      setInfo("");
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Change email / Resend
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={(event) => void handlePasswordLogin(event)} className="max-w-lg space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  autoComplete="username"
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
                    Create account with OTP
                  </Link>
                </span>
              </div>
            </form>
          )}
        </Panel>
      )}
    </>
  );
}
