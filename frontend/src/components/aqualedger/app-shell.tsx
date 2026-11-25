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

const adminNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Depth Forecast", href: "/forecast", icon: TrendingUp },
  { label: "Groundwater Map", href: "/map", icon: Map },
  { label: "Water Sources", href: "/sources", icon: Droplets },
  { label: "Monitoring Data", href: "/monitoring", icon: Activity },
  { label: "Community Reports", href: "/reports", icon: Users },
];

const userNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "My Sources", href: "/my-sources", icon: BookmarkCheck },
  { label: "Depth Forecast", href: "/forecast", icon: TrendingUp },
  { label: "Groundwater Map", href: "/map", icon: Map },
  { label: "Water Sources", href: "/sources", icon: Droplets },
  { label: "Log Reading", href: "/reports", icon: FileText },
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
  if (!authReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Checking workspace access…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <ShieldCheck size={24} />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Admin workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This page contains private report and monitoring tools. Sign in with the AquaLedger admin account to continue.
        </p>
        <Link
          href="/login?role=admin"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <ShieldCheck size={16} />
          Admin sign in
        </Link>
        <p className="mt-3">
          <Link href="/" className="text-sm font-medium text-teal-700 hover:underline">
            Back to public overview
          </Link>
        </p>
      </section>
    );
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
      <Link href="/" onClick={() => setMenuOpen(false)} className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-cyan-500 text-slate-900 shadow-[0_6px_20px_-6px_rgb(45_212_191/0.7)]">
          <Waves size={24} strokeWidth={2.4} />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight text-white">AquaLedger</p>
          <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.08em] text-teal-200/70">
            Groundwater Intelligence
          </p>
        </div>
      </Link>

      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">
        {role.isAdmin ? "Admin workspace" : "Farmer & Community"}
      </p>

      <nav className="space-y-1" aria-label="Main navigation">
        {nav.map(({ label, href, icon: Icon }) => {
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
              {label}
            </Link>
          );
        })}
      </nav>

      {role.isAdmin ? (
        <div className="mt-8">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">
            System
          </p>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={navLinkClass(pathname === "/settings")}
          >
            <Settings size={18} className={pathname === "/settings" ? "text-teal-300" : "text-slate-400"} />
            Settings
          </Link>
          <Link
            href="/data-management"
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === "/data-management" ? "page" : undefined}
            className={navLinkClass(pathname === "/data-management")}
          >
            <Database size={18} className={pathname === "/data-management" ? "text-teal-300" : "text-slate-400"} />
            Data management
          </Link>
        </div>
      ) : (
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-300/15 text-teal-200">
            <TrendingUp size={18} />
          </div>
          <p className="text-sm font-semibold text-white">Track your well depth</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Log readings every 3 months to get AI depth predictions, area averages, and water precautions.
          </p>
          <Link
            href="/forecast"
            onClick={() => setMenuOpen(false)}
            className="mt-4 flex items-center justify-center rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-teal-200"
          >
            Open depth forecast
          </Link>
        </div>
      )}

      {role.isAdmin && (
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white">
          <div className="mb-3 flex items-center gap-2 text-teal-300">
            <ShieldCheck size={18} />
            <span className="text-xs font-semibold">AquaLedger AI</span>
          </div>
          <p className="text-sm font-semibold">Groundwater insights</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Turn monitoring data into actionable intelligence.
          </p>
        </div>
      )}
    </>
  );

  const accountLabel = role.isAdmin
    ? "Admin"
    : role.currentEmail
      ? role.currentEmail.split("@")[0]
      : "Account";

  const pageTitle =
    pathname === "/reports" && !role.isAdmin ? "Log Water Reading" : titles[pathname] ?? "AquaLedger";

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
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            />
            <aside className="aqua-sidebar relative flex h-full w-[min(18rem,85vw)] flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
              {sidebar}
              <button
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
          {/* Floating glass header; on iPhones it clears the notch / Dynamic Island. */}
          <header className="aqua-header sticky top-0 z-20 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 lg:px-6 lg:pt-3">
           <div
            data-scrolled={scrolled || undefined}
            className="aqua-header-bar glass-strong flex h-14 items-center justify-between gap-3 rounded-[22px] pl-2 pr-2 sm:h-16 sm:pl-3 sm:pr-3"
           >
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Link
                href="/"
                aria-label="AquaLedger home"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-teal-400 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgb(14_165_233/0.8),inset_0_1px_0_rgb(255_255_255/0.35)] sm:h-11 sm:w-11"
              >
                <PageIcon size={20} strokeWidth={2.2} />
              </Link>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
                  AquaLedger<span className="hidden sm:inline"> · {role.isAdmin ? "Admin workspace" : "Farmer & Community"}</span>
                </p>
                <h2 className="truncate text-[16px] font-bold text-slate-900 sm:text-lg">{pageTitle}</h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              <span className="hidden items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-700 md:inline-flex">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live data
              </span>

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
                  <span className="hidden sm:inline">Sign in</span>
                </Link>
              )}
            </div>
           </div>
          </header>

          <main key={pathname} className="aqua-stagger mx-auto w-full max-w-[1400px] space-y-5 px-3.5 pt-4 pb-32 sm:space-y-6 sm:p-6 sm:pb-32 md:p-8 lg:pb-8">
            {children}
            <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 pb-2 pt-6 text-xs text-slate-400 sm:flex-row">
              <span className="flex items-center gap-2">
                <Waves size={14} className="text-teal-600" />
                AquaLedger · Pakistan Underground Water Intelligence System
              </span>
              <span>Community-reported data · screening only</span>
            </footer>
          </main>
        </div>

        {/* Mobile tab bar (iOS style): the four main pages plus "More" for the full menu. */}
        <nav
          aria-label="Quick navigation"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 pt-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:hidden"
        >
          <div className="glass-strong mx-auto flex max-w-md items-stretch justify-between rounded-[26px] p-1.5">
            {nav.slice(0, 4).map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[20px] px-1 py-2 text-[10.5px] font-semibold transition duration-300 ${
                    active ? "bg-teal-500 text-white shadow-[0_8px_18px_-8px_rgb(20_184_166/0.9)]" : "text-slate-500"
                  }`}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                  <span className="w-full truncate text-center">{label.replace("Groundwater ", "")}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[20px] px-1 py-2 text-[10.5px] font-semibold text-slate-500"
            >
              <Menu size={19} />
              <span>More</span>
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
