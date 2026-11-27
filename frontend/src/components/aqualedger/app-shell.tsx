"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookmarkCheck,
  Database,
  Droplets,
  FileText,
  LayoutDashboard,
  LogIn,
  Map,
  Menu,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
  Waves,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { NotificationBell } from "@/components/aqualedger/notification-bell";
import { ThemeToggle } from "@/components/aqualedger/theme-toggle";
import { LanguageToggle, tr, useLanguage } from "@/components/aqualedger/language-toggle";

const adminNav = [
  { label: "Overview", urLabel: "جائزہ", urShort: "جائزہ", href: "/", icon: LayoutDashboard },
  { label: "Depth Forecast", urLabel: "گہرائی کی پیشگوئی", urShort: "پیشگوئی", href: "/forecast", icon: TrendingUp },
  { label: "Groundwater Map", urLabel: "زمینی پانی کا نقشہ", urShort: "نقشہ", href: "/map", icon: Map },
  { label: "Water Sources", urLabel: "پانی کے ذرائع", urShort: "ذرائع", href: "/sources", icon: Droplets },
  { label: "Monitoring Data", urLabel: "مانیٹرنگ ڈیٹا", urShort: "مانیٹرنگ", href: "/monitoring", icon: Activity },
  { label: "Community Reports", urLabel: "کمیونٹی رپورٹس", urShort: "رپورٹس", href: "/reports", icon: Users },
];

const userNav = [
  { label: "Overview", urLabel: "جائزہ", urShort: "جائزہ", href: "/", icon: LayoutDashboard },
  { label: "My Sources", urLabel: "میرے ذرائع", urShort: "ذرائع", href: "/my-sources", icon: BookmarkCheck },
  { label: "Depth Forecast", urLabel: "گہرائی کی پیشگوئی", urShort: "پیشگوئی", href: "/forecast", icon: TrendingUp },
  { label: "Groundwater Map", urLabel: "زمینی پانی کا نقشہ", urShort: "نقشہ", href: "/map", icon: Map },
  { label: "Water Sources", urLabel: "پانی کے ذرائع", urShort: "ذرائع", href: "/sources", icon: Droplets },
  { label: "Log Reading", urLabel: "ریڈنگ درج کریں", urShort: "ریڈنگ", href: "/reports", icon: FileText },
];

const titles: Record<string, string> = {
  "/": "Groundwater Overview",
  "/my-sources": "My Sources & Personal Forecast",
  "/forecast": "Universal Depth Forecast",
  "/map": "Groundwater Map",
  "/sources": "Water Sources",
  "/monitoring": "Monitoring Data",
  "/quality": "Quality Reports",
  "/reports": "Community Reports",
  "/settings": "Settings",
  "/data-management": "Data Management",
  "/login": "Sign in",
  "/signup": "Create Account",
  "/account": "My Account",
  "/reset-password": "Set or Reset Password",
};

type AquaRole = {
  isAdmin: boolean;
  isSignedIn: boolean;
  emailVerified: boolean;
  currentEmail: string;
  authReady: boolean;
};

const AquaRoleContext = createContext<AquaRole>({
  isAdmin: false,
  isSignedIn: false,
  emailVerified: false,
  currentEmail: "",
  authReady: false,
});

export function useAquaRole() {
  return useContext(AquaRoleContext);
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, authReady } = useAquaRole();
  const lang = useLanguage();
  if (!authReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        {tr(lang, "Checking workspace access…", "ورک اسپیس رسائی چیک ہو رہی ہے…")}
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <ShieldCheck size={24} />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">
          {tr(lang, "Admin workspace", "ایڈمن ورک اسپیس")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {tr(
            lang,
            "This page contains private report and monitoring tools. Sign in with the AquaLedger admin account to continue.",
            "اس صفحے پر نجی رپورٹس اور مانیٹرنگ ٹولز موجود ہیں۔ جاری رکھنے کے لیے AquaLedger ایڈمن اکاؤنٹ سے سائن ان کریں۔"
          )}
        </p>
        <Link
          href="/login?role=admin"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <ShieldCheck size={16} />
          {tr(lang, "Admin sign in", "ایڈمن سائن ان")}
        </Link>
        <p className="mt-3">
          <Link href="/" className="text-sm font-medium text-teal-700 hover:underline">
            {tr(lang, "Back to public overview", "عوامی جائزے پر واپس جائیں")}
          </Link>
        </p>
      </section>
    );
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lang = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<AquaRole>({
    isAdmin: false,
    isSignedIn: false,
    emailVerified: false,
    currentEmail: "",
    authReady: false,
  });

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    const initAuth = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (active) {
          setRole({
            isAdmin: data.user?.app_metadata?.role === "admin",
            isSignedIn: Boolean(data.user),
            emailVerified: Boolean(data.user?.email_confirmed_at),
            currentEmail: data.user?.email ?? "",
            authReady: true,
          });
        }
        const authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
          if (active) {
            setRole({
              isAdmin: session?.user?.app_metadata?.role === "admin",
              isSignedIn: Boolean(session?.user),
              emailVerified: Boolean(session?.user?.email_confirmed_at),
              currentEmail: session?.user?.email ?? "",
              authReady: true,
            });
          }
        });
        subscription = authSubscription.data.subscription;
      } catch {
        if (active) {
          setRole({
            isAdmin: false,
            isSignedIn: false,
            emailVerified: false,
            currentEmail: "",
            authReady: true,
          });
        }
      }
    };
    void initAuth();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  // The header turns into a slightly denser glass once the page scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const nav = role.isAdmin ? adminNav : userNav;
  const PageIcon =
    [...adminNav, ...userNav].find((item) => item.href === pathname)?.icon ??
    (pathname === "/settings"
      ? Settings
      : pathname === "/data-management"
        ? Database
        : pathname === "/account"
          ? User
          : Waves);
  const navLinkClass = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      active
        ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
        : "text-slate-300 hover:bg-white/5 hover:text-white"
    }`;

  const sidebar = (
    <>
      <Link href="/" onClick={() => setMenuOpen(false)} className="mb-9 flex items-center gap-2.5 px-1">
        <img
          src="/aqualedger-logo.jpg"
          alt="AquaLedger logo"
          className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-[0_6px_20px_-6px_rgb(45_212_191/0.7)]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-white">AquaLedger</p>
          <p className="truncate text-[9.5px] font-medium uppercase leading-tight tracking-[0.04em] text-teal-200/75">
            Groundwater Intelligence
          </p>
        </div>
      </Link>

      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">
        {role.isAdmin
          ? tr(lang, "Admin workspace", "ایڈمن ورک اسپیس")
          : tr(lang, "Farmer & Community", "کسان اور کمیونٹی")}
      </p>

      <nav className="space-y-1" aria-label="Main navigation">
        {nav.map(({ label, urLabel, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={navLinkClass(active)}
            >
              {active && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-teal-300" />}
              <Icon size={18} className={active ? "text-teal-300" : "text-slate-400 group-hover:text-slate-200"} />
              {lang === "ur" ? urLabel : label}
            </Link>
          );
        })}
      </nav>

      {role.isAdmin ? (
        <div className="mt-8">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">
            {tr(lang, "System", "سسٹم")}
          </p>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={navLinkClass(pathname === "/settings")}
          >
            <Settings size={18} className={pathname === "/settings" ? "text-teal-300" : "text-slate-400"} />
            {tr(lang, "Settings", "سیٹنگز")}
          </Link>
          <Link
            href="/data-management"
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === "/data-management" ? "page" : undefined}
            className={navLinkClass(pathname === "/data-management")}
          >
            <Database size={18} className={pathname === "/data-management" ? "text-teal-300" : "text-slate-400"} />
            {tr(lang, "Data management", "ڈیٹا مینجمنٹ")}
          </Link>
        </div>
      ) : (
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-300/15 text-teal-200">
            <TrendingUp size={18} />
          </div>
          <p className="text-sm font-semibold text-white">
            {tr(lang, "Track your well depth", "اپنے کنویں کی گہرائی ٹریک کریں")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {tr(
              lang,
              "Log readings every 3 months to get AI depth predictions, area averages, and water precautions.",
              "ہر 3 ماہ بعد ریڈنگ درج کریں اور AI پیشگوئی، علاقائی اوسط اور حفاظتی مشورے حاصل کریں۔"
            )}
          </p>
          <Link
            href="/reports?new=1"
            onClick={() => setMenuOpen(false)}
            className="mt-4 flex items-center justify-center rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-teal-200"
          >
            {tr(lang, "Submit reading", "ریڈنگ جمع کروائیں")}
          </Link>
        </div>
      )}

      {role.isAdmin && (
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white">
          <div className="mb-3 flex items-center gap-2 text-teal-300">
            <ShieldCheck size={18} />
            <span className="text-xs font-semibold">AquaLedger AI</span>
          </div>
          <p className="text-sm font-semibold">{tr(lang, "Groundwater insights", "زیرِ زمین پانی کے حقائق")}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {tr(lang, "Turn monitoring data into actionable intelligence.", "مانیٹرنگ ڈیٹا کو قابلِ عمل بصیرت میں بدلیں۔")}
          </p>
        </div>
      )}
    </>
  );

  const accountLabel = role.isAdmin
    ? tr(lang, "Admin", "ایڈمن")
    : role.currentEmail
      ? role.currentEmail.split("@")[0]
      : tr(lang, "Account", "اکاؤنٹ");

  const urTitles: Record<string, string> = {
    "/": "زمینی پانی کا جائزہ",
    "/my-sources": "میرے ذرائع",
    "/forecast": "گہرائی کی پیشگوئی",
    "/map": "زمینی پانی کا نقشہ",
    "/sources": "پانی کے ذرائع",
    "/monitoring": "مانیٹرنگ ڈیٹا",
    "/quality": "معیار کی رپورٹس",
    "/reports": "کمیونٹی رپورٹس",
    "/settings": "سیٹنگز",
    "/data-management": "ڈیٹا مینجمنٹ",
    "/login": "سائن ان",
    "/signup": "اکاؤنٹ بنائیں",
    "/account": "میرا اکاؤنٹ",
    "/reset-password": "پاس ورڈ تبدیل کریں",
  };
  const mobileEnTitles: Record<string, string> = {
    "/": "Overview",
    "/my-sources": "My Sources",
    "/forecast": "Forecast",
    "/map": "Map",
    "/sources": "Sources",
    "/monitoring": "Monitoring",
    "/quality": "Quality",
    "/reports": "Log Reading",
    "/settings": "Settings",
    "/data-management": "Data Audit",
    "/account": "Account",
  };
  const pageTitle =
    pathname === "/reports" && !role.isAdmin
      ? tr(lang, "Log Reading", "ریڈنگ درج کریں")
      : (lang === "ur" ? urTitles[pathname] : undefined) ?? titles[pathname] ?? "AquaLedger";
  const mobilePageTitle =
    lang === "ur"
      ? pageTitle
      : (pathname === "/reports" && !role.isAdmin ? "Log Reading" : mobileEnTitles[pathname] ?? pageTitle);

  return (
    <AquaRoleContext.Provider value={role}>
      <div className="aqua-backdrop min-h-dvh text-slate-900 lg:flex">
        <div aria-hidden="true" className="aqua-orbs">
          <span />
          <span />
          <span />
        </div>
        <aside className="aqua-sidebar z-30 hidden w-64 shrink-0 flex-col px-4 py-6 lg:fixed lg:inset-y-0 lg:flex">
          {sidebar}
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            />
            <aside className="aqua-sidebar relative flex h-full w-[min(18rem,85vw)] flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
              {sidebar}
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="absolute right-4 top-4 rounded-lg p-2 text-slate-300 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </aside>
          </div>
        )}

        <div className="relative z-10 min-w-0 flex-1 lg:ml-[17.5rem]">
          {/* Solid-backed sticky header so scrolled cards never bleed above or behind it. */}
          <header className="aqua-header sticky top-0 z-30 bg-[#e8f3f6] px-2.5 pb-1.5 pt-[max(0.25rem,env(safe-area-inset-top))] dark:bg-black sm:px-4 lg:px-6 lg:pt-2.5">
           <div
            data-scrolled={scrolled || undefined}
            className="aqua-header-bar glass-strong flex h-14 items-center justify-between gap-2 rounded-[22px] bg-white pl-2 pr-2 shadow-sm dark:bg-[#0b1016] sm:h-16 sm:gap-3 sm:pl-3 sm:pr-3"
           >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                href="/"
                aria-label="AquaLedger home"
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-teal-400 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgb(14_165_233/0.8),inset_0_1px_0_rgb(255_255_255/0.35)] sm:flex sm:h-11 sm:w-11"
              >
                <PageIcon size={20} strokeWidth={2.2} />
              </Link>
              <div className="min-w-0 leading-tight">
                <p className="hidden truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:block sm:text-[11px]">
                  AquaLedger ·{" "}
                  {role.isAdmin
                    ? tr(lang, "Admin workspace", "ایڈمن ورک اسپیس")
                    : tr(lang, "Farmer & Community", "کسان اور کمیونٹی")}
                </p>
                <h2 className="truncate text-[15px] font-bold text-slate-900 sm:hidden">{mobilePageTitle}</h2>
                <h2 className="hidden truncate text-lg font-bold text-slate-900 sm:block">{pageTitle}</h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
              <LanguageToggle />
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <div className="sm:hidden">
                <ThemeToggle compact />
              </div>

              {role.isAdmin && <NotificationBell />}

              {role.isSignedIn ? (
                <Link
                  href="/account"
                  aria-label={role.isAdmin ? "Admin account" : "My account"}
                  title={role.currentEmail || "My account"}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-xs font-semibold shadow-sm transition sm:px-3.5 ${
                    role.isAdmin
                      ? "bg-slate-900 text-white hover:bg-slate-700"
                      : "border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
                  }`}
                >
                  {role.isAdmin ? <ShieldCheck size={16} className="text-teal-300" /> : <User size={16} />}
                  <span className="hidden max-w-[120px] truncate sm:inline">{accountLabel}</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  aria-label="Sign in"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-900 px-3 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgb(11_31_58/0.7)] transition hover:bg-slate-700 sm:px-4"
                >
                  <LogIn size={16} />
                  <span className="hidden sm:inline">{tr(lang, "Sign in", "سائن ان")}</span>
                </Link>
              )}
            </div>
           </div>
          </header>

          <main key={pathname} className="aqua-stagger mx-auto w-full max-w-[1400px] space-y-5 px-3.5 pt-4 pb-32 sm:space-y-6 sm:p-6 sm:pb-32 md:p-8 md:pb-32 lg:pb-8">
            {children}
            <footer className="flex items-center justify-center gap-2 pb-2 pt-4 text-xs text-slate-400">
              <img src="/aqualedger-logo.jpg" alt="" className="h-4 w-4 rounded bg-white object-contain p-0.5" />
              AquaLedger
            </footer>
          </main>
        </div>

        {/* Mobile tab bar (iOS style): the four main pages plus "More" for the full menu. */}
        <nav
          aria-label="Quick navigation"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 pt-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] lg:hidden"
        >
          <div className="glass-strong mx-auto flex w-full max-w-lg items-stretch justify-between gap-0.5 rounded-[26px] p-1 sm:gap-1 sm:p-1.5">
            {nav.slice(0, 4).map(({ label, urShort, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-2 text-[clamp(9.5px,2.6vw,11.5px)] font-semibold leading-tight transition duration-200 sm:px-2 ${
                    active ? "bg-teal-500 text-white shadow-[0_8px_18px_-8px_rgb(20_184_166/0.9)]" : "text-slate-500"
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                  <span className="w-full truncate text-center text-[10px] sm:text-[11px]">
                    {lang === "ur"
                      ? urShort
                      : label
                          .replace("Groundwater ", "")
                          .replace("Depth Forecast", "Forecast")
                          .replace("Water Sources", "Sources")}
                  </span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-2 text-[clamp(9.5px,2.6vw,11.5px)] font-semibold leading-tight text-slate-500 sm:px-2"
            >
              <Menu size={18} className="shrink-0" />
              <span>{tr(lang, "More", "مزید")}</span>
            </button>
          </div>
        </nav>
      </div>
    </AquaRoleContext.Provider>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 pt-1 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-[28px] text-slate-900 sm:text-4xl">{title}</h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-3xl p-5 sm:p-6 ${className}`}>
      <div className="mb-5">
        <h3 className="text-[17px] font-bold text-slate-900">{title}</h3>
        {description && <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}
