"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookmarkCheck } from "lucide-react";
import { PageIntro, useAquaRole } from "@/components/aqualedger/app-shell";
import { UniversalAreaDepthForecast } from "@/components/aqualedger/depth-infographics";
import {
  readPublicAreaSourceTrends,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";

export default function ForecastPage() {
  const { isSignedIn, authReady } = useAquaRole();
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authReady) return;
    void readPublicAreaSourceTrends()
      .then((trends) => {
        setPublicTrends(trends);
        setError("");
      })
      .catch(() =>
        setError(
          "Public area depth summaries are not connected yet. Run supabase/reset-and-renew-schema.sql in Supabase."
        )
      )
      .finally(() => setLoading(false));
  }, [authReady]);

  return (
    <>
      <PageIntro
        eyebrow="Universal Area & Organization Intelligence"
        title="Universal Groundwater Depth Forecast"
        description="Area-wide groundwater depth averages, AI trend predictions, and criticality alerts aggregated across all submitted sources for organizations, researchers, and communities."
        action={
          <Link
            href={isSignedIn ? "/my-sources" : "/login?role=user"}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <BookmarkCheck size={16} />
            {isSignedIn ? "My Personal Sources →" : "Sign in for Personal Sources"}
          </Link>
        }
      />
      {error && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
      )}
      <UniversalAreaDepthForecast
        publicTrends={publicTrends}
        isSignedIn={isSignedIn}
        loading={loading}
      />
    </>
  );
}
