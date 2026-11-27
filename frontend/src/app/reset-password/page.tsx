"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MailCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";

type ResetStep = "email" | "otp" | "password";

export default function ResetPasswordPage() {
  const router = useRouter();
  const lang = useLanguage();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    void getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setEmail(data.session.user.email ?? "");
          setStep("password");
        }
      })
      .catch(() => {});
  }, []);

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
        },
      });
      if (otpError) throw otpError;
      setStep("otp");
      setMessage(
        tr(
          lang,
          `An OTP code has been sent to ${trimmedEmail}. Enter it below to verify your email and set a new password.`,
          `${trimmedEmail} پر OTP کوڈ بھیج دیا گیا ہے۔ تصدیق کے لیے نیچے کوڈ درج کریں۔`
        )
      );
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : "";
      if (raw.toLowerCase().includes("signups not allowed")) {
        setError(
          tr(
            lang,
            "No account was found with this email. Please create an account first.",
            "اس ای میل پر کوئی اکاؤنٹ موجود نہیں ہے۔ براہ کرم پہلے نیا اکاؤنٹ بنائیں۔"
          )
        );
      } else {
        setError(raw || tr(lang, "Could not send verification OTP.", "OTP بھیجنے میں ناکامی۔"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const token = otpCode.trim();
    if (!trimmedEmail || !token) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      let { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token,
        type: "email",
      });
      if (verifyError) {
        ({ error: verifyError } = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token,
          type: "recovery",
        }));
      }
      if (verifyError) throw verifyError;
      setOtpCode("");
      setStep("password");
      setMessage(
        tr(
          lang,
          "Email verified! Enter your new password below.",
          "ای میل کی تصدیق ہو گئی! اب نیچے نیا پاس ورڈ درج کریں۔"
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(lang, "Invalid or expired OTP code.", "OTP کوڈ غلط یا زائد المیعاد ہے۔")
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setResending(true);
    setError("");
    setMessage("");
    try {
      const { error: otpError } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
        },
      });
      if (otpError) throw otpError;
      setMessage(
        tr(
          lang,
          `A fresh OTP code has been sent to ${trimmedEmail}.`,
          `${trimmedEmail} پر نیا OTP کوڈ بھیج دیا گیا ہے۔`
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(lang, "Could not resend OTP.", "دوبارہ OTP نہ بھیجا جا سکا۔")
      );
    } finally {
      setResending(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError(tr(lang, "Passwords do not match.", "پاس ورڈ آپس میں نہیں ملتے۔"));
      return;
    }
    setBusy(true);
    try {
      const { data, error: updateError } = await getSupabaseBrowserClient().auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setMessage(
        tr(
          lang,
          "New password saved! You can now sign in anytime with your email and password.",
          "نیا پاس ورڈ محفوظ ہو گیا! اب آپ ای میل اور پاس ورڈ سے سائن ان کر سکتے ہیں۔"
        )
      );
      setPassword("");
      setConfirmPassword("");
      const isAdmin = data.user?.app_metadata?.role === "admin";
      setTimeout(() => {
        router.push(isAdmin ? "/" : "/my-sources");
        router.refresh();
      }, 900);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(lang, "Could not update password.", "پاس ورڈ اپڈیٹ نہ ہو سکا۔")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={tr(lang, "Password Recovery", "پاس ورڈ کی بحالی")}
        title={tr(lang, "Set or reset password", "پاس ورڈ سیٹ یا ری سیٹ کریں")}
        description={tr(
          lang,
          "Verify your email with a one-time OTP code right here (no external links) and set a new password.",
          "یہیں ای میل OTP کوڈ کے ذریعے تصدیق کریں اور نیا پاس ورڈ سیٹ کریں۔"
        )}
      />
      <Panel
        title={
          step === "password"
            ? tr(lang, "Choose a new password", "نیا پاس ورڈ منتخب کریں")
            : step === "otp"
              ? tr(lang, "Enter verification OTP", "تصدیقی OTP درج کریں")
              : tr(lang, "Verify your account email", "اپنے اکاؤنٹ کے ای میل کی تصدیق کریں")
        }
        description={tr(
          lang,
          "This keeps your existing account and all submitted water reports intact.",
          "اس سے آپ کا موجودہ اکاؤنٹ اور تمام رپورٹس محفوظ رہتی ہیں۔"
        )}
      >
        {step === "password" ? (
          <form onSubmit={(event) => void updatePassword(event)} className="max-w-lg space-y-4">
            {message && (
              <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
                {message}
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              {tr(lang, "New password", "نیا پاس ورڈ")}{" "}
              <span className="text-xs font-normal text-slate-400">(minimum 8 characters)</span>
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter new password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {tr(lang, "Confirm new password", "نئے پاس ورڈ کی تصدیق کریں")}
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
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
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              <KeyRound size={16} />
              {busy ? tr(lang, "Saving…", "محفوظ ہو رہا ہے…") : tr(lang, "Save new password", "نیا پاس ورڈ محفوظ کریں")}
            </button>
          </form>
        ) : step === "otp" ? (
          <form onSubmit={(event) => void verifyOtp(event)} className="max-w-lg space-y-4">
            {message && (
              <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
                {message}
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              {tr(lang, "Email OTP Code", "ای میل OTP کوڈ")}
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="Enter code from your email"
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
                {busy ? tr(lang, "Verifying…", "تصدیق ہو رہی ہے…") : tr(lang, "Verify OTP", "OTP کی تصدیق کریں")}
              </button>
              <button
                type="button"
                disabled={resending}
                onClick={() => void resendOtp()}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {resending ? tr(lang, "Resending…", "دوبارہ بھیجا جا رہا ہے…") : tr(lang, "Resend OTP", "دوبارہ OTP بھیجیں")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtpCode("");
                  setError("");
                  setMessage("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {tr(lang, "Change email", "ای میل تبدیل کریں")}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => void sendOtp(event)} className="max-w-lg space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              {tr(lang, "Account email", "اکاؤنٹ کا ای میل")}
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
              {busy ? tr(lang, "Sending OTP…", "OTP بھیجا جا رہا ہے…") : tr(lang, "Send OTP to email", "ای میل پر OTP بھیجیں")}
            </button>
            <p className="text-sm text-slate-500">
              {tr(lang, "Remembered it?", "پاس ورڈ یاد آ گیا؟")}{" "}
              <Link href="/login" className="font-semibold text-teal-700 hover:underline">
                {tr(lang, "Sign in", "سائن ان کریں")}
              </Link>
            </p>
          </form>
        )}
      </Panel>
    </>
  );
}
