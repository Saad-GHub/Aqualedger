"use client";
import { useAquaRole, AdminOnly } from "@/components/aqualedger/app-shell";
import { StarterPage } from "@/components/aqualedger/starter-page";
import { PublicWaterSources } from "@/components/aqualedger/public-water-sources";
export default function SourcesPage() {
  const { isAdmin, authReady } = useAquaRole();
  if (!authReady) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading water sources…</div>;
  return isAdmin ? <AdminOnly><StarterPage page="sources" /></AdminOnly> : <PublicWaterSources />;
}
