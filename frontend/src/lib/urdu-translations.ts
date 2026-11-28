import type { AquaLang } from "@/components/aqualedger/language-toggle";

const PLACE_UR: Record<string, string> = {
  // Provinces & regions
  punjab: "پنجاب",
  sindh: "سندھ",
  kp: "خیبر پختونخوا",
  kpk: "خیبر پختونخوا",
  "khyber pakhtunkhwa": "خیبر پختونخوا",
  balochistan: "بلوچستان",
  ict: "اسلام آباد",
  "islamabad capital territory": "اسلام آباد",
  kashmir: "آزاد کشمیر",
  ajk: "آزاد کشمیر",
  "azad jammu and kashmir": "آزاد کشمیر",
  "gilgit-baltistan": "گلگت بلتستان",
  "gilgit baltistan": "گلگت بلتستان",
  gb: "گلگت بلتستان",
  pakistan: "پاکستان",

  // Cities & districts
  bahawalpur: "بہاولپور",
  "rahim yar khan": "رحیم یار خان",
  lahore: "لاہور",
  faisalabad: "فیصل آباد",
  multan: "ملتان",
  rawalpindi: "راولپنڈی",
  islamabad: "اسلام آباد",
  sargodha: "سرگودھا",
  gujranwala: "گوجرانوالہ",
  sialkot: "سیالکوٹ",
  chakwal: "چکوال",
  okara: "اوکاڑہ",
  gujrat: "گجرات",
  jhang: "جھنگ",
  "dera ghazi khan": "ڈیرہ غازی خان",
  sahiwal: "ساہیوال",
  vehari: "وہاڑی",
  pakpattan: "پاکپتن",
  khanewal: "خانیوال",
  lodhran: "لودھراں",
  chiniot: "چنیوٹ",
  "toba tek singh": "ٹوبہ ٹیک سنگھ",
  hafizabad: "حافظ آباد",
  khushab: "خوشاب",
  mianwali: "میانوالی",
  bhakkar: "بھکر",
  leiah: "لیہ",
  layyah: "لیہ",
  muzaffargarh: "مظفرگڑھ",
  rajanpur: "راجن پور",
  bahawalnagar: "بہاولنگر",
  "mandi bahauddin": "منڈی بہاؤالدین",
  narowal: "نارووال",
  kasur: "قصور",
  sheikhupura: "شیخوپورہ",
  "nankana sahib": "ننکانہ صاحب",
  jhelum: "جہلم",
  ghotki: "گھوٹکی",
  karachi: "کراچی",
  hyderabad: "حیدرآباد",
  sukkur: "سکھر",
  peshawar: "پشاور",
  quetta: "کوئٹہ",
  abbottabad: "ایبٹ آباد",
  mirpur: "میرپور",
  attock: "اٹک",
  mardan: "مردان",
  swat: "سوات",
  bannu: "بنوں",
  kohat: "کوہاٹ",
  "dera ismail khan": "ڈیرہ اسماعیل خان",
  larkana: "لاڑکانہ",
  nawabshah: "نوابشاہ",
  "mirpur khas": "میرپور خاص",
  jacobabad: "جیکب آباد",
  khuzdar: "خضدار",
  turbat: "تربت",
  gwadar: "گوادر",
  "area not provided": "علاقہ درج نہیں",
};

const SOURCE_TYPE_UR: Record<string, string> = {
  "all sources": "تمام ذرائع",
  "tube well": "ٹیوب ویل",
  "tubewell": "ٹیوب ویل",
  borehole: "بورویل",
  "community well": "کمیونٹی کنواں",
  "hand pump": "ہینڈ پمپ",
  spring: "چشمہ",
  "open well": "کھلا کنواں",
  "motor pump": "موٹر پمپ",
  other: "دیگر",
  "water source": "پانی کا ذریعہ",
  "type not provided": "قسم درج نہیں",
};

const CONDITION_UR: Record<string, string> = {
  normal: "معمول کے مطابق",
  moderate: "درمیانہ",
  critical: "تشویشناک",
  "high concern": "شدید تشویشناک",
  "moderate concern": "درمیانی تشویش",
  incomplete: "نامکمل",
};

const CONFIDENCE_UR: Record<string, string> = {
  high: "زیادہ",
  medium: "درمیانہ",
  low: "کم",
};

const CONCERN_UR: Record<string, string> = {
  "seasonal checking": "موسمی جانچ",
  "seasonal 3-month check": "سہ ماہی موسمی جانچ",
  "low water level": "پانی کی کم سطح",
  "dry well": "خشک کنواں",
  "supply interruption": "فراہمی میں تعطل",
  "depth reading": "گہرائی کی ریڈنگ",
};

const STATUS_UR: Record<string, string> = {
  verified: "تصدیق شدہ",
  under_review: "زیرِ جائزہ",
  "under review": "زیرِ جائزہ",
  rejected: "مسترد",
  aggregated: "مجموعی",
  demo: "ڈیمو",
};

/** Translates "City, Province" or standalone city/province names into Urdu when lang === "ur". */
export function translateAreaUr(lang: AquaLang, area: string): string {
  if (lang !== "ur" || !area) return area;
  const parts = area.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return area;
  return parts
    .map((part) => PLACE_UR[part.toLowerCase()] ?? part)
    .join("، ");
}

export function translateSourceTypeUr(lang: AquaLang, sourceType: string): string {
  if (lang !== "ur" || !sourceType) return sourceType;
  return SOURCE_TYPE_UR[sourceType.trim().toLowerCase()] ?? sourceType;
}

export function translateConditionUr(lang: AquaLang, label: string): string {
  if (lang !== "ur" || !label) return label;
  return CONDITION_UR[label.trim().toLowerCase()] ?? label;
}

export function translateConfidenceUr(lang: AquaLang, label: string): string {
  if (lang !== "ur" || !label) return label;
  return CONFIDENCE_UR[label.trim().toLowerCase()] ?? label;
}

export function translateConcernUr(lang: AquaLang, concern: string): string {
  if (lang !== "ur" || !concern) return concern;
  return CONCERN_UR[concern.trim().toLowerCase()] ?? concern;
}

export function translateStatusUr(lang: AquaLang, status: string): string {
  if (lang !== "ur" || !status) return status;
  return STATUS_UR[status.trim().toLowerCase()] ?? status.replaceAll("_", " ");
}

/** Converts "18.5 m / 60.7 ft" -> "18.5 میٹر / 60.7 فٹ" in Urdu while keeping digits intact. */
export function translateDepthUnitsUr(lang: AquaLang, formatted: string): string {
  if (lang !== "ur" || !formatted) return formatted;
  return formatted
    .replace(/\bm\b/g, "میٹر")
    .replace(/\bft\b/g, "فٹ");
}
