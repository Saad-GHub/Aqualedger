"use client";

import { useEffect, useSyncExternalStore } from "react";

export type AquaLang = "en" | "ur";

const STORAGE_KEY = "aqua-lang";
const EVENT_NAME = "aqua-lang-changed";

function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): AquaLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

function getServerSnapshot(): AquaLang {
  return "en";
}

export function useLanguage(): AquaLang {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);
  return lang;
}

export function tr(lang: AquaLang, en: string, ur: string): string {
  return lang === "ur" ? ur : en;
}

const PRECAUTION_UR_MAP: Record<string, { title: string; detail: string }> = {
  "Install rainwater recharge / soakage pit": {
    title: "بارش کے پانی کا ریچارج / سوکج پٹ بنائیں",
    detail:
      "چھت اور مون سون کا پانی فلٹر شدہ ریچارج پٹ کے ذریعے بورویل کے قریب زمین میں اتاریں تاکہ پانی کی سطح مزید گرنے سے رکے۔",
  },
  "Reduce peak-hour pumping & check pump intake": {
    title: "پیک آورز میں پمپنگ کم کریں اور پمپ کی گہرائی چیک کریں",
    detail:
      "مسلسل پمپنگ کے بجائے وقفے وقفے سے پمپ چلائیں اور پمپ انٹیک کی پوزیشن چیک کریں تاکہ موٹر خشک چلنے سے بچے۔",
  },
  "Switch to drip or scheduled irrigation": {
    title: "ڈرپ یا شیڈول آبپاشی اپنائیں",
    detail:
      "فلڈ ایریگیشن سے گریز کریں؛ صبح سویرے یا شام کو ڈرپ/اسپرنکلر سے پانی دے کر 30–50% زیرِ زمین پانی بچائیں۔",
  },
  "Maintain safe wellhead protection & drainage": {
    title: "کنویں کے منہ کی حفاظت اور نکاسیِ آب بہتر رکھیں",
    detail:
      "بورویل یا کنویں کے اردگرد پکا فرش رکھیں اور گندے پانی کی نالیوں کو کم از کم 15 میٹر دور رکھیں۔",
  },
  "Keep logging every 3 months": {
    title: "ہر 3 ماہ بعد ریڈنگ درج کرتے رہیں",
    detail:
      "موسمی تبدیلی (مون سون بمقابلہ خشک موسم) کو ٹریک کرنے کے لیے ہر سہ ماہی میں پانی کی گہرائی لازمی ریکارڈ کریں۔",
  },
  "Boil or filter drinking water": {
    title: "پینے کا پانی ابال کر یا فلٹر کر کے استعمال کریں",
    detail:
      "پینے اور کھانا پکانے کے لیے پانی کو کم از کم 1 منٹ ابالیں یا مستند فلٹر استعمال کریں۔",
  },
};

export function translatePrecaution(
  lang: AquaLang,
  title: string,
  detail: string
): { title: string; detail: string } {
  if (lang !== "ur") return { title, detail };
  const exact = PRECAUTION_UR_MAP[title];
  if (exact) return exact;
  if (title.toLowerCase().includes("recharge")) return PRECAUTION_UR_MAP["Install rainwater recharge / soakage pit"];
  if (title.toLowerCase().includes("pumping")) return PRECAUTION_UR_MAP["Reduce peak-hour pumping & check pump intake"];
  if (title.toLowerCase().includes("drip") || title.toLowerCase().includes("irrigation"))
    return PRECAUTION_UR_MAP["Switch to drip or scheduled irrigation"];
  if (title.toLowerCase().includes("wellhead") || title.toLowerCase().includes("drainage"))
    return PRECAUTION_UR_MAP["Maintain safe wellhead protection & drainage"];
  if (title.toLowerCase().includes("3 months") || title.toLowerCase().includes("logging"))
    return PRECAUTION_UR_MAP["Keep logging every 3 months"];
  return { title, detail };
}

/** Compact EN / اردو glass pill switch. */
export function LanguageToggle() {
  const lang = useLanguage();

  const choose = (next: AquaLang) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="glass relative inline-flex items-center rounded-full p-1 text-[11px] font-bold"
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 bottom-1 w-9 rounded-full bg-teal-500 shadow-[0_4px_14px_-4px_rgb(20_184_166/0.8)] transition-transform duration-200 ${
          lang === "ur" ? "translate-x-9" : "translate-x-0"
        }`}
      />
      {(
        [
          ["en", "EN"],
          ["ur", "اردو"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={lang === value}
          onClick={() => choose(value)}
          className={`relative z-10 flex h-7 w-9 items-center justify-center rounded-full transition ${
            lang === value ? "text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
