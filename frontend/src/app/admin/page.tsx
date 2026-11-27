"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAquaRole } from "@/components/aqualedger/app-shell";

export default function AdminRedirectPage() {
  const router = useRouter();
  const { isAdmin, authReady } = useAquaRole();

  useEffect(() => {
    if (!authReady) return;
    router.replace(isAdmin ? "/" : "/login?role=admin");
  }, [authReady, isAdmin, router]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      Redirecting to AquaLedger Admin…
    </div>
  );
}
