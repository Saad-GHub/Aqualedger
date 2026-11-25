"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, Bell, Database, FileText, LayoutDashboard, Map, Menu, Settings, ShieldCheck, Waves, X, Droplets, Users } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/community-water-reports";

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
const titles: Record<string, string> = { "/": "Groundwater Overview", "/map": "Groundwater Map", "/sources": "Water Sources", "/monitoring": "Monitoring Data", "/quality": "Quality Reports", "/reports": "Community Reports", "/settings": "Settings", "/login": "Admin access" };
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
    <div className="mb-9 flex items-center gap-3 px-2"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white"><Waves size={25} /></div><div><p className="text-xl font-bold tracking-tight">AquaLedger</p><p className="text-xs text-slate-500">Groundwater Intelligence</p></div></div>
    <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{role.isAdmin ? "Admin workspace" : "Community"}</p>
    <nav className="space-y-1" aria-label="Main navigation">{nav.map(({ label, href, icon: Icon }) => { const active = pathname === href; return <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={19} />{label}</Link>; })}</nav>
    {role.isAdmin ? <div className="mt-8"><p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">System</p><Link href="/settings" onClick={() => setMenuOpen(false)} aria-current={pathname === "/settings" ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${pathname === "/settings" ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}><Settings size={19} />Settings</Link><Link href="/reports" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Database size={19} />Data management</Link></div> : <div className="mt-8 rounded-2xl border border-teal-100 bg-teal-50/60 p-4"><p className="text-sm font-semibold text-teal-900">Your report matters</p><p className="mt-1 text-xs leading-5 text-slate-600">Share a water source concern or lab result with the community review team.</p><Link href="/reports" className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:underline">Submit a water report →</Link></div>}
    {role.isAdmin && <div className="mt-auto rounded-2xl bg-slate-900 p-4 text-white"><div className="mb-3 flex items-center gap-2 text-teal-300"><ShieldCheck size={18} /><span className="text-xs font-semibold">AquaLedger AI</span></div><p className="text-sm font-semibold">Groundwater insights</p><p className="mt-1 text-xs leading-5 text-slate-400">Turn monitoring data into actionable intelligence.</p></div>}
  </>;
  return <AquaRoleContext.Provider value={role}><div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:fixed lg:inset-y-0 lg:flex">{sidebar}</aside>
    {menuOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-900/40"/><aside className="relative flex h-full w-72 flex-col border-r border-slate-200 bg-white px-5 py-6">{sidebar}<button onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="absolute right-4 top-4 rounded-lg p-2 text-slate-500"><X size={18}/></button></aside></div>}
    <div className="min-w-0 flex-1 lg:ml-64"><header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 md:px-8"><div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden"><Menu size={19}/></button><div><p className="text-xs font-medium text-slate-400">Pakistan / AquaLedger</p><h1 className="text-lg font-bold text-slate-800 md:text-xl">{pathname === "/reports" && !role.isAdmin ? "Submit a Water Report" : titles[pathname] ?? "AquaLedger"}</h1></div></div><div className="flex items-center gap-3">{role.isAdmin && <button aria-label="Notifications" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><Bell size={19}/></button>}<Link href={role.isSignedIn ? "/account" : "/login"} aria-label={role.isAdmin ? "Admin account" : role.isSignedIn ? "My account" : "Sign in"} title={role.currentEmail || (role.isSignedIn ? "My account" : "Sign in") } className="flex h-10 min-w-10 items-center justify-center rounded-full bg-teal-100 px-2 text-xs font-bold text-teal-800">{role.isAdmin ? "AD" : role.isSignedIn ? role.currentEmail.slice(0, 2).toUpperCase() : "Sign in"}</Link></div></header><main className="space-y-6 p-4 sm:p-5 md:p-8">{children}<footer className="pb-2 pt-3 text-center text-xs text-slate-400">AquaLedger · Pakistan Underground Water Intelligence System · Community-reported data</footer></main></div>
  </div></AquaRoleContext.Provider>;
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-700">{eyebrow}</p>}<h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>; }
export function Panel({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string }) { return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}><div className="mb-5"><h3 className="font-bold">{title}</h3>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>{children}</section>; }

