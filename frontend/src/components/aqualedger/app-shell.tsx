"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, Database, FileText, LayoutDashboard, LogIn, Map, Menu, Settings, ShieldCheck, Waves, X, Droplets, Users } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";
import { NotificationBell } from "@/components/aqualedger/notification-bell";

const adminNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Groundwater Map", href: "/map", icon: Map },
  { label: "Water Sources", href: "/sources", icon: Droplets },
  { label: "Monitoring Data", href: "/monitoring", icon: Activity },
  { label: "Quality Reports", href: "/quality", icon: FileText },
  { label: "Community Reports", href: "/reports", icon: Users },
];
const userNav = [
  { label: "Public Overview", href: "/", icon: LayoutDashboard },
  { label: "Groundwater Map", href: "/map", icon: Map },
  { label: "Water Sources", href: "/sources", icon: Droplets },
];
const titles: Record<string, string> = { "/": "Groundwater Overview", "/map": "Groundwater Map", "/sources": "Water Sources", "/monitoring": "Monitoring Data", "/quality": "Quality Reports", "/reports": "Community Reports", "/settings": "Settings", "/login": "Sign in" };
type AquaRole = { isAdmin: boolean; isSignedIn: boolean; emailVerified: boolean; currentEmail: string; authReady: boolean };
const AquaRoleContext = createContext<AquaRole>({ isAdmin: false, isSignedIn: false, emailVerified: false, currentEmail: "", authReady: false });
export function useAquaRole() { return useContext(AquaRoleContext); }

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, authReady } = useAquaRole();
  if (!authReady) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Checking workspace access…</div>;
  if (!isAdmin) return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><ShieldCheck size={24}/></div><h2 className="mt-4 text-xl font-bold text-slate-900">Admin workspace</h2><p className="mt-2 text-sm leading-6 text-slate-500">This page contains private report and monitoring tools. Sign in with the AquaLedger admin account to continue.</p><Link href="/login?role=admin" className="mt-5 inline-flex rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Admin sign in</Link><p className="mt-3"><Link href="/" className="text-sm font-medium text-teal-700 hover:underline">Back to public overview</Link></p></section>;
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<AquaRole>({ isAdmin: false, isSignedIn: false, emailVerified: false, currentEmail: "", authReady: false });
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    const initAuth = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (active) setRole({ isAdmin: data.user?.app_metadata?.role === "admin", isSignedIn: Boolean(data.user), emailVerified: Boolean(data.user?.email_confirmed_at), currentEmail: data.user?.email ?? "", authReady: true });
        const authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
          if (active) setRole({ isAdmin: session?.user?.app_metadata?.role === "admin", isSignedIn: Boolean(session?.user), emailVerified: Boolean(session?.user?.email_confirmed_at), currentEmail: session?.user?.email ?? "", authReady: true });
        });
        subscription = authSubscription.data.subscription;
      } catch {
        if (active) setRole({ isAdmin: false, isSignedIn: false, emailVerified: false, currentEmail: "", authReady: true });
      }
    };
    void initAuth();
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  const nav = role.isAdmin ? adminNav : userNav;
  const sidebar = <>
    <Link href="/" onClick={() => setMenuOpen(false)} className="mb-10 flex items-center gap-3 px-2"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-cyan-500 text-slate-900 shadow-[0_6px_20px_-6px_rgb(45_212_191/0.7)]"><Waves size={24} strokeWidth={2.4}/></div><div><p className="text-lg font-semibold tracking-tight text-white">AquaLedger</p><p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.08em] text-teal-200/70">Groundwater Intelligence</p></div></Link>
    <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">{role.isAdmin ? "Admin workspace" : "Community"}</p>
    <nav className="space-y-1" aria-label="Main navigation">{nav.map(({ label, href, icon: Icon }) => { const active = pathname === href; return <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{active && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-teal-300"/>}<Icon size={18} className={active ? "text-teal-300" : "text-slate-400 group-hover:text-slate-200"}/>{label}</Link>; })}</nav>
    {role.isAdmin ? <div className="mt-8"><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">System</p><Link href="/settings" onClick={() => setMenuOpen(false)} aria-current={pathname === "/settings" ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${pathname === "/settings" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><Settings size={18} className={pathname === "/settings" ? "text-teal-300" : "text-slate-400"}/>Settings</Link><Link href="/reports" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"><Database size={18} className="text-slate-400"/>Data management</Link></div> : <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-300/15 text-teal-200"><Droplets size={18}/></div><p className="text-sm font-semibold text-white">Your report matters</p><p className="mt-1 text-xs leading-5 text-slate-300">Share a water source concern or lab result with the community review team.</p><Link href="/reports" onClick={() => setMenuOpen(false)} className="mt-4 flex items-center justify-center rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-teal-200">Submit a water report</Link></div>}
    {role.isAdmin && <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white"><div className="mb-3 flex items-center gap-2 text-teal-300"><ShieldCheck size={18} /><span className="text-xs font-semibold">AquaLedger AI</span></div><p className="text-sm font-semibold">Groundwater insights</p><p className="mt-1 text-xs leading-5 text-slate-300">Turn monitoring data into actionable intelligence.</p></div>}
  </>;
  const pageTitle = pathname === "/reports" && !role.isAdmin ? "Submit a Water Report" : titles[pathname] ?? "AquaLedger";
  return <AquaRoleContext.Provider value={role}><div className="aqua-backdrop min-h-screen text-slate-900 lg:flex">
    <aside className="aqua-sidebar hidden w-64 shrink-0 flex-col px-4 py-6 lg:fixed lg:inset-y-0 lg:flex">{sidebar}</aside>
    {menuOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"/><aside className="aqua-sidebar relative flex h-full w-72 flex-col px-4 py-6">{sidebar}<button onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="absolute right-4 top-4 rounded-lg p-2 text-slate-300 hover:bg-white/10"><X size={18}/></button></aside></div>}
    <div className="min-w-0 flex-1 lg:ml-64"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/70 px-4 backdrop-blur-xl sm:px-6 md:px-8"><div className="flex min-w-0 items-center gap-3"><button onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 lg:hidden"><Menu size={19}/></button><p className="truncate text-sm text-slate-500"><span className="hidden sm:inline">AquaLedger <span className="mx-1.5 text-slate-300">/</span></span><span className="font-semibold text-slate-800">{pageTitle}</span></p></div><div className="flex items-center gap-2.5"><span className="hidden items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-700 md:inline-flex"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none"/><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"/></span>Live data</span>{role.isAdmin && <NotificationBell/>}{role.isSignedIn ? <Link href="/account" aria-label={role.isAdmin ? "Admin account" : "My account"} title={role.currentEmail || "My account"} className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-xs font-bold text-white ring-2 ring-white shadow-sm">{role.isAdmin ? "AD" : role.currentEmail.slice(0, 2).toUpperCase()}</Link> : <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"><LogIn size={16}/>Sign in</Link>}</div></header><main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 md:p-8">{children}<footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 pb-2 pt-6 text-xs text-slate-400 sm:flex-row"><span className="flex items-center gap-2"><Waves size={14} className="text-teal-600"/>AquaLedger · Pakistan Underground Water Intelligence System</span><span>Community-reported data · screening only</span></footer></main></div>
  </div></AquaRoleContext.Provider>;
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-col justify-between gap-4 pt-1 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700"><span className="h-1.5 w-1.5 rounded-full bg-teal-500"/>{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action}</div>; }
export function Panel({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string }) { return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}><div className="mb-5"><h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>{description && <p className="mt-1 text-[13px] leading-5 text-slate-500">{description}</p>}</div>{children}</section>; }

