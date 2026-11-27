// "Naya bore / tube well" advisor: a rough drilling and pump estimate for a spot,
// from nearby monitoring wells, the census and the website's Supabase forecast.
// These are rule-of-thumb numbers for planning, not an engineering design.
import { depthM } from "@/lib/units";
import {
  areaLabel,
  communityForecastFor,
  communityStatsFor,
  wellsNear,
  wellStatsFor,
  type District,
} from "@/lib/whatsapp/knowledge";
import type { Lang } from "@/lib/whatsapp/understand";

export type SourceKind = "hand_pump" | "home_bore" | "tube_well" | "solar_tube_well";
export type Purpose = "home" | "farm" | "both";

const t = (lang: Lang, en: string, roman: string, ur: string) => (lang === "ur" ? ur : lang === "roman" ? roman : en);
const FT = 3.28084;
const ft = (m: number) => Math.round((m * FT) / 10) * 10; // drilling depths are quoted to the nearest 10 ft
const depthPlan = (m: number) => `${ft(m)} ft · ${Math.round(m)} m`;

// ---------- Understanding the request ----------

const INSTALL =
  /\b(lagana|lagwana|lagvana|lagwani|lagani|karwana|karvana|banwana|install|installing|drill|drilling|new bore|naya bore|naya tube ?well|naye bore|nai bore|bore plan|tube ?well plan)\b|لگانا|لگوانا|لگوانی|کروانا|نیا بور|نیا ٹیوب ویل/i;
const SOURCE_WORD = /tube ?well|bore|boring|nalka|hand ?pump|solar|motor|pump|ٹیوب|بور|نلکا|سولر|پمپ|موٹر/i;
// "I want / need / chahiye" only counts with a whole water source, not a motor or pump that is broken.
const WANT = /\b(chahiye|chahie|chahta|chahti|chahte|want|need|planning|plan to|looking for)\b|چاہیے/i;
const WHOLE_SOURCE = /tube ?well|\bbore\b|boring|nalka|hand ?pump|solar|ٹیوب|بور|نلکا|سولر/i;
const TROUBLE = /kharab|khrab|kharaab|nahi aa|kam de|band ho|fail|hawa|خراب|نہیں آ/i;

/** "Mujhe Mailsi mein solar tube well lagwana hai" / "I want a home bore" → true. */
export function isAdvisorRequest(text: string) {
  if (/^(naya bore|new bore|bore plan|advisor|نیا بور)$/i.test(text.trim())) return true;
  if (TROUBLE.test(text)) return false;
  return (INSTALL.test(text) && SOURCE_WORD.test(text)) || (WANT.test(text) && WHOLE_SOURCE.test(text));
}

export function parseKind(text: string): SourceKind | null {
  const v = text.toLowerCase();
  if (v === "kind:hand_pump" || /hand ?pump|nalka|نلکا|ہینڈ پمپ/.test(v)) return "hand_pump";
  if (v === "kind:solar_tube_well" || /solar|سولر/.test(v)) return "solar_tube_well";
  if (v === "kind:tube_well" || /tube ?well|ٹیوب ?ویل/.test(v)) return "tube_well";
  if (v === "kind:home_bore" || /\b(bore|boring|submersible|motor)\b|بور|موٹر/.test(v)) return "home_bore";
  return null;
}

export function parsePurpose(text: string): Purpose | null {
  const v = text.toLowerCase();
  if (v === "purpose:both" || /\b(both|dono|donon)\b|دونوں/.test(v)) return "both";
  if (v === "purpose:farm" || /\b(kheti|khet|fasal|farm|farming|irrigation|zameen|acre|acres|killa|kille)\b|کھیت|کھیتی|فصل|ایکڑ/.test(v)) return "farm";
  if (v === "purpose:home" || /\b(ghar|gher|home|house|peena|peene|drinking|domestic)\b|گھر|پینے|پینا/.test(v)) return "home";
  return null;
}

/** "10 acre", "5 killay", "40 kanal" → acres. */
export function parseAcres(text: string, requireUnit = false): number | null {
  const m = text
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .match(/(\d+(?:\.\d+)?)\s*(acres?|ekar|aikar|killa|killay|kille|kanal|ایکڑ|کلے|کنال)?/i);
  if (!m || (requireUnit && !m[2])) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 2000) return null;
  return /kanal|کنال/i.test(m[2] ?? "") ? value / 8 : value;
}

export function kindButtons(lang: Lang) {
  return [
    { id: "kind:hand_pump", title: t(lang, "Hand pump", "Nalka", "نلکا") },
    { id: "kind:home_bore", title: t(lang, "Home bore", "Ghar ka bore", "گھر کا بور") },
    { id: "kind:tube_well", title: t(lang, "Tube well", "Tube well", "ٹیوب ویل") },
    { id: "kind:solar_tube_well", title: t(lang, "Solar tube well", "Solar tube well", "سولر ٹیوب ویل") },
  ];
}

export function purposeButtons(lang: Lang) {
  return [
    { id: "purpose:home", title: t(lang, "Home / drinking", "Ghar / peena", "گھر / پینا") },
    { id: "purpose:farm", title: t(lang, "Farming", "Kheti", "کھیتی") },
    { id: "purpose:both", title: t(lang, "Both", "Dono", "دونوں") },
  ];
}

const KIND_NAME: Record<SourceKind, [string, string, string]> = {
  hand_pump: ["hand pump", "nalka", "نلکا"],
  home_bore: ["home bore", "ghar ka bore", "گھر کا بور"],
  tube_well: ["tube well", "tube well", "ٹیوب ویل"],
  solar_tube_well: ["solar tube well", "solar tube well", "سولر ٹیوب ویل"],
};
export const kindName = (kind: SourceKind, lang: Lang) => t(lang, ...KIND_NAME[kind]);

// ---------- Withdrawal and depletion ("what happens without recharge") ----------
//
// Average yearly withdrawal per source, from field data:
//  * farm tube wells: diesel/electric farms pump ~1,300 mm of water a year over their land,
//    solar farms ~1,600 mm (Lower Indus Basin study, 30 matched farm pairs, 2025);
//  * a household bore ~1.5 m³ a day, a hand pump ~0.5 m³ a day.
// About a quarter of irrigation water seeps back. The pumping is spread over the well's
// radius of influence (~750 m in Indus alluvium) with specific yield ~0.12: rule-of-thumb values.
const SPECIFIC_YIELD = 0.12;
const INFLUENCE_RADIUS_M = 750;
const RETURN_FLOW = 0.25;
const ACRE_M2 = 4047;

export type DepletionInput = {
  kind: SourceKind;
  purpose: Purpose;
  acres: number;
  nowM: number;
  regionalRateM: number; // measured trend of the area (all pumps together), m/year
  pumpSetM: number;
  boreM: number;
  drawdownM: number;
};

export function depletion(input: DepletionInput) {
  const farm = input.purpose !== "home" && (input.kind === "tube_well" || input.kind === "solar_tube_well");
  const yearlyM3 = farm
    ? input.acres * ACRE_M2 * (input.kind === "solar_tube_well" ? 1.6 : 1.3) + (input.purpose === "both" ? 550 : 0)
    : input.kind === "hand_pump"
      ? 0.5 * 365
      : 1.5 * 365;
  const netM3 = yearlyM3 * (farm ? 1 - RETURN_FLOW : 0.9);
  const area = Math.max(Math.PI * INFLUENCE_RADIUS_M ** 2, input.acres * ACRE_M2);
  const ownRateM = netM3 / (SPECIFIC_YIELD * area);
  // With measures: drip / laser levelling / AWD cut pumping ~30 %, and each recharge pit puts back
  // ~1,000 m³ of rain a year (1 acre of catchment, ~400 mm rain, 60 % captured).
  const pits = farm ? Math.max(1, Math.round(input.acres / 5)) : 1;
  const savedNetM3 = Math.max(0, (farm ? yearlyM3 * 0.7 : yearlyM3 * 0.8) * (farm ? 1 - RETURN_FLOW : 0.9) - pits * 1000);
  const ownRateWithM = savedNetM3 / (SPECIFIC_YIELD * area);
  const regional = Math.max(0, input.regionalRateM);
  const withoutRate = regional + ownRateM;
  const withRate = regional + ownRateWithM;
  const seasonalDipM = 1.5; // summer pumping season pulls the level down further
  const yearsUntil = (limitM: number, rate: number) => {
    const room = limitM - (input.nowM + input.drawdownM + seasonalDipM);
    if (room <= 0) return 0;
    if (rate <= 0.005) return Infinity;
    return room / rate;
  };
  return {
    farm,
    yearlyM3,
    pits,
    ownRateM,
    withoutRate,
    withRate,
    pumpYearsWithout: yearsUntil(input.pumpSetM - 1, withoutRate),
    reboreYearsWithout: yearsUntil(input.boreM - 10, withoutRate),
    pumpYearsWith: yearsUntil(input.pumpSetM - 1, withRate),
    reboreYearsWith: yearsUntil(input.boreM - 10, withRate),
  };
}

function litresText(m3: number, lang: Lang) {
  const litres = m3 * 1000;
  if (lang === "en") return litres >= 1e6 ? `${(litres / 1e6).toFixed(1)} million litres` : `${Math.round(litres).toLocaleString()} litres`;
  // Lakh / crore read naturally in Urdu.
  const unit = litres >= 1e7 ? [litres / 1e7, lang === "ur" ? "کروڑ لیٹر" : "crore liter"] : [litres / 1e5, lang === "ur" ? "لاکھ لیٹر" : "lakh liter"];
  return `${(unit[0] as number).toFixed(1)} ${unit[1]}`;
}

function yearsText(years: number, lang: Lang, thisYear: number) {
  if (!Number.isFinite(years) || years > 40) return t(lang, "not within 40 years", "40 saal tak nahi", "40 سال تک نہیں");
  if (years < 1) return t(lang, "already at risk", "abhi se khatra", "ابھی سے خطرہ");
  const y = Math.round(years);
  return t(lang, `in about ${y} years (~${thisYear + y})`, `taqreeban ${y} saal mein (~${thisYear + y})`, `تقریباً ${y} سال میں (~${thisYear + y})`);
}

export function depletionSection(input: DepletionInput, lang: Lang, thisYear: number): string[] {
  const d = depletion(input);
  const cm = (m: number) => Math.round(m * 100);
  const risk =
    d.reboreYearsWithout < 10 || d.pumpYearsWithout < 4
      ? t(lang, "🔴 High", "🔴 Zyada", "🔴 زیادہ")
      : d.reboreYearsWithout < 20 || d.pumpYearsWithout < 10
        ? t(lang, "🟠 Medium", "🟠 Darmiyana", "🟠 درمیانہ")
        : t(lang, "🟢 Low", "🟢 Kam", "🟢 کم");
  const lines = [
    "",
    `⚖️ *${t(lang, "Water you will take out", "Aap kitna paani nikalein ge", "آپ کتنا پانی نکالیں گے")}*`,
    `• ${t(lang, "About", "Taqreeban", "تقریباً")} *${litresText(d.yearlyM3, lang)}* ${t(lang, "a year", "saalana", "سالانہ")} (${Math.round(d.yearlyM3).toLocaleString()} m³)` +
      (d.farm
        ? t(
            lang,
            ` — a typical ${input.kind === "solar_tube_well" ? "solar" : "diesel/electric"} farm pumps ~${input.kind === "solar_tube_well" ? "1.6" : "1.3"} m of water a year over its land.`,
            ` — aam ${input.kind === "solar_tube_well" ? "solar" : "diesel/bijli"} farm apni zameen par saal mein ~${input.kind === "solar_tube_well" ? "1.6" : "1.3"} m paani nikalta hai.`,
            ` — عام ${input.kind === "solar_tube_well" ? "سولر" : "ڈیزل/بجلی"} فارم اپنی زمین پر سال میں ~${input.kind === "solar_tube_well" ? "1.6" : "1.3"} میٹر پانی نکالتا ہے۔`
          )
        : ""),
    "",
    `🚫 *${t(lang, "Without recharge or saving measures", "Agar recharge aur bachat ka intezam NA kiya", "اگر ریچارج اور بچت کا انتظام نہ کیا")}*`,
    `• ${t(lang, "Water level near your bore falls", "Aap ke bore ke paas paani girega", "آپ کے بور کے پاس پانی گرے گا")} ~*${cm(d.withoutRate)} cm/${t(lang, "year", "saal", "سال")}* (${t(lang, "area trend", "ilaqe ka trend", "علاقے کا رجحان")} ${cm(Math.max(0, input.regionalRateM))} + ${t(lang, "your own pumping", "aap ki apni pumping", "آپ کی اپنی پمپنگ")} ${cm(d.ownRateM)})`,
    `• ${t(lang, "Pump will need lowering", "Pump neeche karna parega", "پمپ نیچے کرنا پڑے گا")}: ${yearsText(d.pumpYearsWithout, lang, thisYear)}`,
    `• ${t(lang, "Bore may need re-drilling deeper", "Dobara gehra bore karwana par sakta hai", "دوبارہ گہرا بور کروانا پڑ سکتا ہے")}: ${yearsText(d.reboreYearsWithout, lang, thisYear)}`,
    `• ${t(lang, "Re-bore risk", "Dobara bore ka khatra", "دوبارہ بور کا خطرہ")}: ${risk}`,
    "",
    `✅ *${t(lang, "With measures", "Intezam ke saath", "انتظام کے ساتھ")}* (${
      d.farm
        ? t(lang, `drip / laser levelling + ${d.pits} recharge pit${d.pits > 1 ? "s" : ""}`, `drip / laser hamwari + ${d.pits} recharge pit`, `ڈرپ / لیزر ہمواری + ${d.pits} ریچارج پٹ`)
        : t(lang, "no waste + 1 recharge pit", "paani zaya na karein + 1 recharge pit", "پانی ضائع نہ کریں + 1 ریچارج پٹ")
    })`,
    `• ${t(lang, "Fall slows to", "Girawat kam ho kar", "گراوٹ کم ہو کر")} ~*${cm(d.withRate)} cm/${t(lang, "year", "saal", "سال")}*`,
    `• ${t(lang, "Pump lowering", "Pump neeche karna", "پمپ نیچے کرنا")}: ${yearsText(d.pumpYearsWith, lang, thisYear)}`,
    `• ${t(lang, "Re-drilling", "Dobara boring", "دوبارہ بورنگ")}: ${yearsText(d.reboreYearsWith, lang, thisYear)}`,
  ];
  if (input.regionalRateM > 0.1) {
    lines.push(
      `_${t(
        lang,
        "Part of the fall comes from every pump in the area, so it continues even if you save water; your measures still buy years.",
        "Girawat ka kuch hissa ilaqe ke tamam pumps ki wajah se hai, jo aap ke bachane par bhi jaari rahega; phir bhi aap ka intezam kai saal bachata hai.",
        "گراوٹ کا کچھ حصہ علاقے کے تمام پمپوں کی وجہ سے ہے، جو آپ کے بچانے پر بھی جاری رہے گا؛ پھر بھی آپ کا انتظام کئی سال بچاتا ہے۔"
      )}_`
    );
  }
  return lines;
}

// ---------- The estimate ----------

const PUMP_SIZES_HP = [0.5, 1, 1.5, 2, 3, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75];
const nextPumpSize = (hp: number) => PUMP_SIZES_HP.find((size) => size >= hp) ?? Math.ceil(hp / 5) * 5;

export type PlanInput = {
  kind: SourceKind;
  purpose: Purpose;
  acres: number | null;
  district: District;
  districts: District[];
  placeName: string;
  lat: number | null;
  lon: number | null;
  origin: string;
};

export async function buildPlan(input: PlanInput, lang: Lang): Promise<string> {
  const { district, districts, kind, purpose } = input;
  const thisYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Karachi" }).format(new Date()));
  const [nearby, districtWells, community, forecast] = await Promise.all([
    input.lat != null && input.lon != null ? wellsNear(input.lat, input.lon, input.origin).catch(() => null) : Promise.resolve(null),
    wellStatsFor(district, input.origin).catch(() => null),
    communityStatsFor(district, districts).catch(() => null),
    communityForecastFor(district, districts).catch(() => null),
  ]);

  // 1. Today's water level: the most local measured level, carried forward with its own trend.
  let baseM: number | null = null;
  let baseYear = thisYear;
  let rate: number | null = null;
  let basis = "";
  if (nearby && nearby.count >= 3 && nearby.medianLastDepthM != null) {
    baseM = nearby.medianLastDepthM;
    baseYear = nearby.lastYear ?? thisYear;
    rate = nearby.medianTrendM;
    basis = t(lang, `${nearby.count} monitoring wells within ${nearby.radiusKm} km`, `${nearby.radiusKm} km ke andar ${nearby.count} monitoring wells`, `${nearby.radiusKm} کلومیٹر کے اندر ${nearby.count} مانیٹرنگ کنویں`);
  } else if (districtWells && districtWells.count >= 3 && districtWells.medianLastDepthM != null) {
    baseM = districtWells.medianLastDepthM;
    baseYear = districtWells.lastYear ?? thisYear;
    rate = districtWells.medianTrendM;
    basis = t(lang, `${districtWells.count} monitoring wells in the district`, `zile ke ${districtWells.count} monitoring wells`, `ضلع کے ${districtWells.count} مانیٹرنگ کنویں`);
  } else if (district.medianDepthFt != null) {
    baseM = district.medianDepthFt / FT;
    baseYear = 2020;
    basis = t(lang, "Census 2020 village survey", "Census 2020 ka mouza survey", "مردم شماری 2020 کا موضع سروے");
  } else if (community?.averageDepthM != null) {
    baseM = community.averageDepthM;
    basis = t(lang, "community readings", "logon ki readings", "لوگوں کی ریڈنگز");
  }
  if (baseM == null) {
    return t(
      lang,
      "Sorry, there is not enough groundwater data for this spot yet to estimate a bore.",
      "Maazrat, is jagah ke liye abhi bore ka andaza lagane jitna data nahi hai.",
      "معذرت، اس جگہ کے لیے ابھی بور کا اندازہ لگانے جتنا ڈیٹا نہیں ہے۔"
    );
  }
  // Recent Supabase readings fill in the trend when the wells have none.
  if (rate == null && forecast && forecast.confidence !== "Low") rate = forecast.slopePerYearM;
  const yearlyM = Math.max(-0.5, Math.min(1.5, rate ?? 0.15));
  const gapYears = Math.max(0, thisYear - baseYear);
  const nowM = Math.max(1, baseM + Math.max(-15, Math.min(15, yearlyM * gapYears)));
  const at = (years: number) => Math.max(0.5, nowM + yearlyM * years);
  const declineDesignM = Math.max(0, yearlyM) * 15; // plan for 15 years of falling water

  const lines: string[] = [];
  const where = input.placeName && input.placeName.toLowerCase() !== district.name.toLowerCase() ? `${input.placeName}, ${areaLabel(district)}` : areaLabel(district);
  lines.push(
    `🛠️ *${t(lang, `${kindName(kind, lang)} estimate`, `${kindName(kind, lang)} ka andaza`, `${kindName(kind, lang)} کا اندازہ`)}* · ${where}`
  );
  if (input.lat != null && input.lon != null) lines.push(`📍 ${input.lat.toFixed(4)}°N, ${input.lon.toFixed(4)}°E`);

  // Water level now and later
  lines.push(
    "",
    `💧 *${t(lang, "Groundwater here", "Yahan zameeni paani", "یہاں زیرِ زمین پانی")}*`,
    `• ${t(lang, "Now (estimate)", "Abhi (andaza)", "ابھی (اندازہ)")}: *${depthM(nowM)}*`,
    `  _${t(lang, "from", "maakhaz", "ماخذ")}: ${basis}${gapYears > 0 ? t(lang, `, carried forward from ${baseYear}`, `, ${baseYear} se aage hisaab`, `، ${baseYear} سے آگے حساب`) : ""}_`,
    `• ${t(lang, "Change", "Tabdeeli", "تبدیلی")}: ${
      yearlyM >= 0
        ? t(lang, `about ${Math.round(yearlyM * 100)} cm deeper every year`, `har saal taqreeban ${Math.round(yearlyM * 100)} cm neeche`, `ہر سال تقریباً ${Math.round(yearlyM * 100)} سینٹی میٹر نیچے`)
        : t(lang, `about ${Math.round(-yearlyM * 100)} cm shallower every year`, `har saal taqreeban ${Math.round(-yearlyM * 100)} cm upar`, `ہر سال تقریباً ${Math.round(-yearlyM * 100)} سینٹی میٹر اوپر`)
    }${rate == null ? t(lang, " (no measured trend here; a typical Punjab rate is assumed)", " (yahan ka naapa hua trend nahi; Punjab ka aam rate maana gaya)", " (یہاں کا ناپا ہوا رجحان نہیں؛ پنجاب کا عام ریٹ مانا گیا)") : ""}`,
    "",
    `📉 *${t(lang, "Forecast", "Aage ka andaza", "آگے کا اندازہ")}*`,
    ...[5, 10, 15].map((years) => `• ${thisYear + years}: ${depthM(at(years))}`)
  );

  if (forecast && forecast.confidence !== "Low") {
    const cm = Math.round(Math.abs(forecast.slopePerYearM) * 100);
    lines.push(
      "",
      `👥 *${t(lang, "AquaLedger readings (Supabase)", "AquaLedger readings (Supabase)", "ایکوا لیجر ریڈنگز (Supabase)")}*`,
      t(
        lang,
        `${forecast.readings} readings in this district; latest average ${depthM(forecast.latestDepthM)}. Trend: ${cm} cm/year ${forecast.slopePerYearM >= 0 ? "deeper" : "shallower"}, about ${depthM(forecast.depthInSixMonthsM)} in 6 months (confidence: ${forecast.confidence}).`,
        `Is zile ki ${forecast.readings} readings; aakhri ausat ${depthM(forecast.latestDepthM)}. Trend: har saal ${cm} cm ${forecast.slopePerYearM >= 0 ? "neeche" : "upar"}, 6 mahine mein taqreeban ${depthM(forecast.depthInSixMonthsM)} (bharosa: ${forecast.confidence}).`,
        `اس ضلع کی ${forecast.readings} ریڈنگز؛ آخری اوسط ${depthM(forecast.latestDepthM)}۔ رجحان: ہر سال ${cm} سینٹی میٹر ${forecast.slopePerYearM >= 0 ? "نیچے" : "اوپر"}، 6 ماہ میں تقریباً ${depthM(forecast.depthInSixMonthsM)} (اعتماد: ${forecast.confidence})۔`
      )
    );
  } else if (community?.averageDepthM != null) {
    lines.push("", `👥 ${t(lang, "Community readings: district average", "Logon ki readings: zile ki ausat", "لوگوں کی ریڈنگز: ضلع کی اوسط")} ${depthM(community.averageDepthM)}.`);
  }

  // Sizing
  lines.push("", `🧰 *${t(lang, "What you will need", "Aap ki zaroorat", "آپ کی ضرورت")}*`);
  const acres = input.acres ?? (purpose === "home" ? 0 : 5);
  if (kind === "hand_pump") {
    const suctionLimit = 7; // a suction hand pump cannot lift water from deeper than ~7 m
    const depth = nowM + declineDesignM + 6;
    lines.push(`• ${t(lang, "Bore depth", "Bore ki gehraai", "بور کی گہرائی")}: *~${depthPlan(depth)}*`, `• ${t(lang, "Pipe", "Pipe", "پائپ")}: 1.5–2 inch`);
    if (at(10) > suctionLimit) {
      lines.push(
        `⚠️ ${t(
          lang,
          `Water is (or soon will be) deeper than ${suctionLimit} m, where an ordinary hand pump stops pulling water. A small submersible or deep-well hand pump is the safer choice.`,
          `Paani ${suctionLimit} m se neeche hai ya jald ho jayega; is se neeche aam nalka paani nahi kheench sakta. Chhota submersible ya deep-well nalka behtar rahega.`,
          `پانی ${suctionLimit} میٹر سے نیچے ہے یا جلد ہو جائے گا؛ اس سے نیچے عام نلکا پانی نہیں کھینچ سکتا۔ چھوٹا سب مرسیبل یا ڈیپ ویل نلکا بہتر رہے گا۔`
        )}`
      );
    } else {
      lines.push(`• ${t(lang, "Water", "Paani", "پانی")}: ~600–800 ${t(lang, "litres per hour by hand", "liter ghanta haath se", "لیٹر فی گھنٹہ ہاتھ سے")}`);
    }
    // A suction pump stops at ~7 m, so that is its "pump depth".
    lines.push(
      ...depletionSection(
        { kind, purpose, acres: 0, nowM, regionalRateM: yearlyM, pumpSetM: Math.min(suctionLimit + 1, depth), boreM: depth, drawdownM: 0.5 },
        lang,
        thisYear
      )
    );
  } else {
    const farm = purpose !== "home" && kind !== "home_bore";
    const sunHours = kind === "solar_tube_well" ? 6 : 8;
    // ~24 m³ of water per acre per day in peak season, pumped in `sunHours` hours.
    const flowLs = farm ? Math.max(7, (acres * 24_000) / (sunHours * 3600)) + (purpose === "both" ? 0.4 : 0) : 0.5;
    const drawdownM = farm ? 6 : 3;
    const pumpSetM = nowM + declineDesignM + drawdownM + 3;
    const boreM = pumpSetM + (farm ? 20 : 9);
    const headM = pumpSetM + (farm ? 5 : 12); // home water is lifted to a roof tank
    const pumpKw = (9.81 * (flowLs / 1000) * headM) / 0.5; // ~50 % wire-to-water efficiency
    const pumpHp = nextPumpSize(pumpKw / 0.746);
    const dailyL = flowLs * 3600 * (farm ? sunHours : 2);
    lines.push(
      `• ${t(lang, "Drill to", "Bore ki gehraai", "بور کی گہرائی")}: *~${depthPlan(boreM)}*`,
      `• ${t(lang, "Set the pump at", "Pump ki gehraai", "پمپ کی گہرائی")}: ~${depthPlan(pumpSetM)}`,
      `• ${t(lang, "Pump", "Pump", "پمپ")}: ~${pumpHp} HP (${(pumpHp * 0.746).toFixed(1)} kW) submersible`,
      `• ${t(lang, "Bore / pipe size", "Bore / pipe", "بور / پائپ")}: ${farm ? (flowLs > 15 ? "8–10 inch" : "6 inch") : "4 inch"}`
    );
    if (kind === "solar_tube_well") {
      const kwp = (pumpHp * 0.746) * 1.4;
      const plates = Math.ceil((kwp * 1000) / 550);
      lines.push(`• ${t(lang, "Solar", "Solar", "سولر")}: ~${kwp.toFixed(1)} kW (${plates} × 550 W ${t(lang, "panels", "plates", "پلیٹیں")}) + ${t(lang, "pump inverter", "pump inverter", "پمپ انورٹر")}`);
    }
    lines.push(
      `• ${t(lang, "Water", "Paani", "پانی")}: ~${flowLs.toFixed(1)} ${t(lang, "litres/second", "liter fi second", "لیٹر فی سیکنڈ")} → ~${(Math.round(dailyL / 1000) * 1000).toLocaleString()} ${t(lang, "litres a day", "liter rozana", "لیٹر روزانہ")} (${farm ? sunHours : 2} ${t(lang, "hours", "ghante", "گھنٹے")})`
    );
    if (farm) {
      const covers = (flowLs * sunHours * 3600) / 24_000;
      lines.push(`• ${t(lang, "Enough for about", "Itna paani taqreeban", "اتنا پانی تقریباً")} ${Math.max(1, Math.round(covers))} ${t(lang, "acres in peak season", "acre ke liye (garmi mein)", "ایکڑ کے لیے (گرمی میں)")}${input.acres == null ? t(lang, " (assumed 5 acres; tell me your acres for a better size)", " (5 acre maan kar; apne acre batayein to behtar andaza)", " (5 ایکڑ مان کر؛ اپنے ایکڑ بتائیں تو بہتر اندازہ)") : ""}`);
    }
    lines.push(...depletionSection({ kind, purpose, acres, nowM, regionalRateM: yearlyM, pumpSetM, boreM, drawdownM }, lang, thisYear));
  }

  if ((district.brackishPct ?? 0) >= 10) {
    lines.push(
      "",
      `⚠️ ${t(
        lang,
        `Brackish water is found in ${district.brackishPct}% of villages here. Test TDS while drilling: if the water turns salty deeper down, stop at the sweet layer instead of going deeper.`,
        `Yahan ${district.brackishPct}% mouzon mein khara paani hai. Boring ke dauran TDS test karwate rahein: agar neeche paani khara ho jaye to meethi teh par hi ruk jayein.`,
        `یہاں ${district.brackishPct}% موضعوں میں کھارا پانی ہے۔ بورنگ کے دوران TDS ٹیسٹ کرواتے رہیں: اگر نیچے پانی کھارا ہو جائے تو میٹھی تہہ پر ہی رک جائیں۔`
      )}`
    );
  }
  if (yearlyM > 0.3) {
    lines.push(
      `📉 ${t(
        lang,
        "Water here is falling fast, so the depths above already allow for 15 years of decline. A recharge pit next to the bore helps it last longer.",
        "Yahan paani tezi se gir raha hai, is liye upar ki gehraai mein 15 saal ki girawat shamil hai. Bore ke saath recharge pit banayein taake zyada der chale.",
        "یہاں پانی تیزی سے گر رہا ہے، اس لیے اوپر کی گہرائی میں 15 سال کی گراوٹ شامل ہے۔ بور کے ساتھ ریچارج پٹ بنائیں تاکہ زیادہ دیر چلے۔"
      )}`
    );
  }
  lines.push(
    "",
    `ℹ️ _${t(
      lang,
      "This is a rough estimate from the data. Confirm with a local driller and a water test before you spend money.",
      "Yeh data se nikla mota andaza hai. Paisa lagane se pehle maqami driller aur paani ke test se tasdeeq karein.",
      "یہ ڈیٹا سے نکلا موٹا اندازہ ہے۔ پیسہ لگانے سے پہلے مقامی ڈرلر اور پانی کے ٹیسٹ سے تصدیق کریں۔"
    )}_`
  );
  return lines.join("\n");
}
