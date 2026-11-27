"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookmarkCheck } from "lucide-react";
import { PageIntro, useAquaRole } from "@/components/aqualedger/app-shell";
import { UniversalAreaDepthForecast } from "@/components/aqualedger/depth-infographics";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  readPublicAreaSourceTrends,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";

export default function ForecastPage() {
  const { isSignedIn, authReady } = useAquaRole();
  const lang = useLanguage();
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
        eyebrow={tr(lang, "Universal Area & Organization Intelligence", "علاقائی اور تنظیمی زیرِ زمین پانی کی ذہانت")}
        title={tr(lang, "Universal Groundwater Depth Forecast", "عالمی زیرِ زمین پانی کی گہرائی کی پیشگوئی")}
        description={tr(
          lang,
          "Area-wide groundwater depth averages, AI trend predictions, and criticality alerts aggregated across all submitted sources for organizations, researchers, and communities.",
          "تمام جمع کرائی گئی رپورٹس کی بنیاد پر علاقائی اوسط گہرائی، AI رجحانات کی پیشگوئی اور خطرے کے الرٹس۔"
        )}
        action={
          <Link
            href={isSignedIn ? "/my-sources" : "/login?role=user"}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <BookmarkCheck size={16} />
            {isSignedIn
              ? tr(lang, "My Personal Sources →", "میرے ذاتی ذرائع ←")
              : tr(lang, "Sign in for Personal Sources", "ذاتی ذرائع کے لیے سائن ان کریں")}
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
