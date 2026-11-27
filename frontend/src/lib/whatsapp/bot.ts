// The WhatsApp bot's brain: takes one incoming message, returns the reply message(s).
// Shared by the real webhook and the local test page.
import { depthFt, depthM } from "@/lib/units";
import {
  areaLabel,
  checkPlace,
  communityStatsFor,
  districtAt,
  loadDistricts,
  matchDistrict,
  nearestWell,
  wellsNear,
  wellStatsFor,
  type District,
  type FoundPlace,
} from "@/lib/whatsapp/knowledge";
import {
  buildPlan,
  isAdvisorRequest,
  kindButtons,
  kindName,
  parseAcres,
  parseKind,
  parsePurpose,
  purposeButtons,
  type Purpose,
  type SourceKind as AdvisorKind,
} from "@/lib/whatsapp/advisor";
import { analyze, hasTopic, tokens, type Topic } from "@/lib/whatsapp/analyzer";
import { ANSWERABLE, answerTopic, suggestionButtons } from "@/lib/whatsapp/topics";
import { claudeEnabled, extractPlaces, understand, type Lang, type SourceType, type Understanding } from "@/lib/whatsapp/understand";
import { saveReading, savingEnabled, type SaveResult } from "@/lib/whatsapp/save-reading";
import { transcribeAudio, transcriptionEnabled } from "@/lib/whatsapp/transcribe";

export type BotInput =
  | { kind: "start"; from: string }
  | { kind: "text"; from: string; text: string }
  | { kind: "audio"; from: string; data: ArrayBuffer; mimeType: string }
  | { kind: "location"; from: string; latitude: number; longitude: number }
  | { kind: "unsupported"; from: string };

export type BotContext = {
  /** Where /data/*.json is served from (the site itself). */
  origin: string;
  /** Public site link put in replies. */
  siteUrl: string;
  /** true on the test page unless "really save" is ticked. */
  dryRun: boolean;
  /** Language the client already knows (test page); WhatsApp users are remembered in memory. */
  lang?: Lang;
  /** The website chat (readings are logged on the Log Reading page there). */
  webChat?: boolean;
};

export type ReplyButton = { id: string; title: string };
export type BotReply = { text: string; buttons?: ReplyButton[] };

export type BotResult = {
  replies: BotReply[];
  lang: Lang | null;
  transcript?: string;
  understood?: Omit<Understanding, "district"> & { district: string | null };
  places?: string[];
  topics?: string[];
  save?: SaveResult;
  engines: { understanding: "claude" | "rules"; voice: boolean; saving: boolean };
};

type Pending = { depthM: number; depthAsSaid: string | null; sourceType: SourceType | null; lang: Lang; at: number };
const PENDING_TTL_MS = 30 * 60_000;
// Kept in memory: enough for short two-step chats. A cold start on Vercel forgets them.
const pending = new Map<string, Pending>();
const languages = new Map<string, Lang>();
const heldQuestion = new Map<string, BotInput>();
// A menu topic (quality / trend) waiting for the user to name a place.
const topicWaiting = new Map<string, { topic: Topic; at: number }>();
const TOPIC_WAIT_TTL_MS = 30 * 60_000;
function freshTopicWaiting(from: string) {
  const item = topicWaiting.get(from);
  if (item && Date.now() - item.at < TOPIC_WAIT_TTL_MS) return item.topic;
  topicWaiting.delete(from);
  return null;
}

const MAX_DEPTH_M = 460; // ~1,500 ft; anything deeper is almost certainly a typo

export const LANGUAGE_BUTTONS: ReplyButton[] = [
  { id: "lang:en", title: "English" },
  { id: "lang:roman", title: "Roman Urdu" },
  { id: "lang:ur", title: "اردو" },
];

const t = (lang: Lang, en: string, roman: string, ur: string) => (lang === "ur" ? ur : lang === "roman" ? roman : en);

type Level = "critical" | "moderate" | "normal";
// Same cut-offs as the Overview page (18 m and 10 m).
const levelFor = (metres: number): Level => (metres >= 18 ? "critical" : metres >= 10 ? "moderate" : "normal");

function levelLabel(level: Level, lang: Lang) {
  if (level === "critical") return t(lang, "🔴 Critical", "🔴 Khatarnaak (Critical)", "🔴 تشویشناک");
  if (level === "moderate") return t(lang, "🟠 Moderate", "🟠 Darmiyana (Moderate)", "🟠 درمیانہ");
  return t(lang, "🟢 Normal", "🟢 Theek (Normal)", "🟢 معمول کے مطابق");
}

function tip(level: Level, lang: Lang) {
  if (level === "critical")
    return t(
      lang,
      "Build a rain recharge pit near your bore, run the pump in short spells instead of non-stop, and switch to drip or furrow irrigation.",
      "Bore ke paas baarish ke paani ka recharge pit banayein, motor lagataar na chalayein, aur drip ya kheliyon wali aabpashi apnayein.",
      "بور کے پاس بارش کے پانی کا ریچارج پٹ بنائیں، موٹر مسلسل نہ چلائیں، اور ڈرپ یا کھیلیوں والی آبپاشی اپنائیں۔"
    );
  if (level === "moderate")
    return t(
      lang,
      "Irrigate early morning or evening, fix leaks, and send your reading every 3 months.",
      "Subah ya shaam ko paani dein, leakage theek karein, aur har 3 mahine baad reading bhejein.",
      "صبح یا شام کو پانی دیں، لیکیج ٹھیک کریں، اور ہر 3 ماہ بعد ریڈنگ بھیجیں۔"
    );
  return t(
    lang,
    "Keep the area around the well clean and send a reading every 3 months so changes show up early.",
    "Bore ke ird gird safai rakhein aur har 3 mahine reading bhejein taake tabdeeli jaldi pata chale.",
    "بور کے اردگرد صفائی رکھیں اور ہر 3 ماہ ریڈنگ بھیجیں تاکہ تبدیلی جلد معلوم ہو۔"
  );
}

function greeting(): BotReply {
  return {
    text: "👋 *Welcome! I am Aqua Chatbot.* 💧\n\nPlease select your language.",
    buttons: LANGUAGE_BUTTONS,
  };
}

type MenuId = "area" | "bore" | "impact" | "quality" | "trend" | "pump" | "report" | "save";

function menuButtons(lang: Lang): ReplyButton[] {
  const items: [MenuId, string, string, string][] = [
    ["area", "📍 Water in my area", "📍 Mere ilaqe ka paani", "📍 میرے علاقے کا پانی"],
    ["bore", "🛠️ New bore / tube well", "🛠️ Naya bore / tube well", "🛠️ نیا بور / ٹیوب ویل"],
    ["impact", "⚖️ Re-bore risk", "⚖️ Dobara bore ka khatra", "⚖️ دوبارہ بور کا خطرہ"],
    ["quality", "🧪 Is the water safe?", "🧪 Paani ki quality", "🧪 پانی کا معیار"],
    ["trend", "📉 Future water trend", "📉 Paani ka trend", "📉 پانی کا رجحان"],
    ["pump", "🔧 Motor / pump problem", "🔧 Motor / pump masla", "🔧 موٹر / پمپ مسئلہ"],
    ["report", "📏 Send my reading", "📏 Reading bhejein", "📏 ریڈنگ بھیجیں"],
    ["save", "💧 Save water", "💧 Paani bachayein", "💧 پانی بچائیں"],
  ];
  return items.map(([id, en, roman, ur]) => ({ id: `menu:${id}`, title: t(lang, en, roman, ur) }));
}

/** The options "tab": what would you like to ask? */
function mainMenu(lang: Lang, firstTime = false): BotReply {
  const intro = firstTime
    ? t(lang, "Welcome! I am *Aqua Chatbot*. 💧\n\n", "Welcome! Main *Aqua Chatbot* hoon. 💧\n\n", "خوش آمدید! میں *ایکوا چیٹ بوٹ* ہوں۔ 💧\n\n")
    : "";
  return {
    text:
      intro +
      t(
        lang,
        "*What would you like to ask?*\nPick an option, or just type / send a voice note in your own words.",
        "*Aap kya poochna chahte hain?*\nNeeche se chunein, ya apne alfaaz mein likhein / voice note bhejein.",
        "*آپ کیا پوچھنا چاہتے ہیں؟*\nنیچے سے چنیں، یا اپنے الفاظ میں لکھیں / وائس نوٹ بھیجیں۔"
      ),
    buttons: menuButtons(lang),
  };
}

function helpText(lang: Lang, siteUrl: string, justChosen = false) {
  const intro = justChosen
    ? t(lang, "Great, we'll talk in English. 💧\n\n", "Theek hai, hum Roman Urdu mein baat karenge. 💧\n\n", "ٹھیک ہے، ہم اردو میں بات کریں گے۔ 💧\n\n")
    : "💧 ";
  return intro + t(
    lang,
    `You can type or send a *voice note*:\n\n1️⃣ Ask about any town or district\n   _"How deep is water in Mailsi?"_\n2️⃣ Report your own well\n   _"My tube well is 120 feet in Pattoki"_\n3️⃣ Send your 📍 *location* to hear about water near you\n4️⃣ Planning a new bore or tube well? Type *new bore*\n\nType *language* any time to switch. Full map: ${siteUrl}/map`,
    `Aap likh kar ya *voice note* bhej kar pooch sakte hain:\n\n1️⃣ Kisi bhi shehar ya zile ka poochein\n   _"Mailsi mein paani kitna gehra hai?"_\n2️⃣ Apne bore ki reading bhejein\n   _"Mera tube well Pattoki mein 120 foot par hai"_\n3️⃣ Apni 📍 *location* bhejein, aas paas ka paani jaanein\n4️⃣ Naya bore ya tube well lagwana hai? *naya bore* likhein\n\nZuban badalni ho to *language* likhein. Poora naqsha: ${siteUrl}/map`,
    `آپ لکھ کر یا *وائس نوٹ* بھیج کر پوچھ سکتے ہیں:\n\n1️⃣ کسی بھی شہر یا ضلع کا پوچھیں\n   _"میلسی میں پانی کتنا گہرا ہے؟"_\n2️⃣ اپنے بور کی ریڈنگ بھیجیں\n   _"میرا ٹیوب ویل پتوکی میں 120 فٹ پر ہے"_\n3️⃣ اپنی 📍 *لوکیشن* بھیجیں اور قریب کا پانی جانیں\n4️⃣ نیا بور یا ٹیوب ویل لگوانا ہے؟ *نیا بور* لکھیں\n\nزبان بدلنی ہو تو *language* لکھیں۔ مکمل نقشہ: ${siteUrl}/map`
  );
}

/** Plain-language reasons behind the numbers, drawn only from the data we have. */
function reasons(
  lang: Lang,
  district: District,
  wells: { deepeningPct: number | null; count: number } | null
): string[] {
  const out: string[] = [];
  if (wells && wells.count >= 3 && wells.deepeningPct != null && wells.deepeningPct >= 60) {
    out.push(
      t(
        lang,
        `In ${wells.deepeningPct}% of the monitoring wells the water keeps going down: more water is pumped out by tube wells than rain and canals put back.`,
        `${wells.deepeningPct}% monitoring wells mein paani har saal neeche ja raha hai: tube wells se jitna paani nikalta hai, baarish aur nehar utna wapas nahi bharte.`,
        `${wells.deepeningPct}% مانیٹرنگ کنوؤں میں پانی ہر سال نیچے جا رہا ہے: ٹیوب ویلوں سے جتنا پانی نکلتا ہے، بارش اور نہر اتنا واپس نہیں بھرتے۔`
      )
    );
  }
  const median = district.medianDepthFt;
  if (median != null && median >= 100) {
    out.push(
      t(
        lang,
        "The water table here is naturally deep, which usually comes with low rainfall, few canals or higher, rocky ground.",
        "Yahan paani ki satah qudrati taur par gehri hai; aam taur par is ki wajah kam baarish, nehri paani ki kami ya oonchi/pathreeli zameen hoti hai.",
        "یہاں پانی کی سطح قدرتی طور پر گہری ہے؛ عام طور پر اس کی وجہ کم بارش، نہری پانی کی کمی یا اونچی/پتھریلی زمین ہوتی ہے۔"
      )
    );
  } else if (median != null && median <= 30) {
    out.push(
      t(
        lang,
        "Water is close to the surface: canals and rivers nearby keep recharging it, but very shallow water can bring waterlogging and salt.",
        "Paani zameen ke qareeb hai: nehrein aur dariya ise bharte rehte hain, lekin bohat oopar paani se sem-o-thur (waterlogging) aur namak ka khatra hota hai.",
        "پانی زمین کے قریب ہے: نہریں اور دریا اسے بھرتے رہتے ہیں، لیکن بہت اوپر پانی سے سیم و تھور اور نمک کا خطرہ ہوتا ہے۔"
      )
    );
  }
  if ((district.brackishPct ?? 0) >= 15) {
    out.push(
      t(
        lang,
        `Brackish water in ${district.brackishPct}% of villages comes from salts in the soil and old river deposits; test TDS before drinking or drilling.`,
        `${district.brackishPct}% mouzon mein khara paani zameen ke namak aur purani dariyai mitti ki wajah se hai; peene ya naya bore karwane se pehle TDS test karwayein.`,
        `${district.brackishPct}% موضعوں میں کھارا پانی زمین کے نمک اور پرانی دریائی مٹی کی وجہ سے ہے؛ پینے یا نیا بور کروانے سے پہلے TDS ٹیسٹ کروائیں۔`
      )
    );
  }
  return out;
}

async function areaReport(district: District, districts: District[], ctx: BotContext, lang: Lang, place?: FoundPlace) {
  const [wells, community, nearby] = await Promise.all([
    wellStatsFor(district, ctx.origin).catch(() => null),
    communityStatsFor(district, districts).catch(() => null),
    place ? wellsNear(place.lat, place.lon, ctx.origin).catch(() => null) : Promise.resolve(null),
  ]);
  const lines: string[] = [];
  if (place && place.name.toLowerCase() !== district.name.toLowerCase()) {
    lines.push(
      t(
        lang,
        `📍 *${place.name}* is in *${areaLabel(district)}* district (${place.lat.toFixed(3)}°N, ${place.lon.toFixed(3)}°E).`,
        `📍 *${place.name}* zila *${areaLabel(district)}* mein hai (${place.lat.toFixed(3)}°N, ${place.lon.toFixed(3)}°E).`,
        `📍 *${place.name}* ضلع *${areaLabel(district)}* میں ہے (${place.lat.toFixed(3)}°N، ${place.lon.toFixed(3)}°E)۔`
      ),
      ""
    );
  }
  lines.push(`💧 *${t(lang, "District", "Zila", "ضلع")} ${areaLabel(district)}*`);

  if (district.medianDepthFt != null) {
    lines.push(
      t(
        lang,
        `📊 *Census 2020* (${district.mouzas.toLocaleString()} villages): water is usually at *${depthFt(district.medianDepthFt)}*` +
          (district.p75DepthFt != null ? `; in 3 of 4 villages within ${depthFt(district.p75DepthFt)}.` : "."),
        `📊 *Census 2020* (${district.mouzas.toLocaleString()} mouze): aam taur par paani *${depthFt(district.medianDepthFt)}* par` +
          (district.p75DepthFt != null ? `; 4 mein se 3 mouzon mein ${depthFt(district.p75DepthFt)} tak.` : "."),
        `📊 *مردم شماری 2020* (${district.mouzas.toLocaleString()} موضع جات): عام طور پر پانی *${depthFt(district.medianDepthFt)}* پر` +
          (district.p75DepthFt != null ? `؛ چار میں سے تین موضعوں میں ${depthFt(district.p75DepthFt)} تک۔` : "۔")
      )
    );
  }
  if (district.brackishPct != null) {
    lines.push(
      t(
        lang,
        `🧂 Brackish (salty) groundwater in ${district.brackishPct}% of villages.`,
        `🧂 Khara paani: ${district.brackishPct}% mouzon mein.`,
        `🧂 کھارا پانی: ${district.brackishPct}% موضعوں میں۔`
      )
    );
  }
  if (wells && wells.count > 0) {
    const cm = wells.medianTrendM != null ? Math.abs(wells.medianTrendM * 100).toFixed(1) : null;
    const falling = wells.medianTrendM != null && wells.medianTrendM > 0;
    lines.push(
      t(
        lang,
        `📉 *Monitoring wells* (records up to ${wells.lastYear}): ${wells.count} wells` +
          (wells.deepeningPct != null ? `, water dropped in ${wells.deepeningPct}%` : "") +
          (cm ? `; typical change ${cm} cm/year ${falling ? "deeper" : "shallower"}.` : "."),
        `📉 *Monitoring wells* (${wells.lastYear} tak ka record): ${wells.count} wells` +
          (wells.deepeningPct != null ? `, ${wells.deepeningPct}% mein paani neeche gaya` : "") +
          (cm ? `; aam taur par ${cm} cm saalana ${falling ? "neeche" : "upar"}.` : "."),
        `📉 *مانیٹرنگ کنویں* (${wells.lastYear} تک کا ریکارڈ): ${wells.count} کنویں` +
          (wells.deepeningPct != null ? `، ${wells.deepeningPct}% میں پانی نیچے گیا` : "") +
          (cm ? `؛ عام طور پر ${cm} سینٹی میٹر سالانہ ${falling ? "نیچے" : "اوپر"}۔` : "۔")
      )
    );
  }
  if (place && nearby && nearby.count > 0 && nearby.medianLastDepthM != null) {
    lines.push(
      t(
        lang,
        `📌 *Around ${place.name}* (${nearby.radiusKm} km): ${nearby.count} wells, water at about *${depthM(nearby.medianLastDepthM)}* (latest ${nearby.lastYear})` +
          (nearby.deepeningPct != null ? `, falling in ${nearby.deepeningPct}%.` : "."),
        `📌 *${place.name} ke aas paas* (${nearby.radiusKm} km): ${nearby.count} wells, paani taqreeban *${depthM(nearby.medianLastDepthM)}* par (aakhri ${nearby.lastYear})` +
          (nearby.deepeningPct != null ? `, ${nearby.deepeningPct}% mein neeche ja raha hai.` : "."),
        `📌 *${place.name} کے آس پاس* (${nearby.radiusKm} کلومیٹر): ${nearby.count} کنویں، پانی تقریباً *${depthM(nearby.medianLastDepthM)}* پر (آخری ${nearby.lastYear})` +
          (nearby.deepeningPct != null ? `، ${nearby.deepeningPct}% میں نیچے جا رہا ہے۔` : "۔")
      )
    );
  }
  if (community && community.reports > 0) {
    lines.push(
      t(
        lang,
        `👥 *Community readings*: ${community.reports}` +
          (community.averageDepthM != null ? `, average *${depthM(community.averageDepthM)}*` : "") +
          ".",
        `👥 *Logon ki readings*: ${community.reports}` +
          (community.averageDepthM != null ? `, ausat *${depthM(community.averageDepthM)}*` : "") +
          ".",
        `👥 *لوگوں کی ریڈنگز*: ${community.reports}` +
          (community.averageDepthM != null ? `، اوسط *${depthM(community.averageDepthM)}*` : "") +
          "۔"
      )
    );
  }

  // Status from the most local evidence: wells around the town, then the census, then community readings.
  const basisM =
    (nearby && nearby.count >= 3 ? nearby.medianLastDepthM : null) ??
    (district.medianDepthFt != null ? district.medianDepthFt * 0.3048 : null) ??
    community?.averageDepthM ??
    null;
  if (basisM != null) {
    const level = levelFor(basisM);
    lines.push("", `${t(lang, "Status", "Halat", "صورتحال")}: ${levelLabel(level, lang)}`);
  }
  const why = reasons(lang, district, nearby && nearby.count >= 3 ? nearby : wells);
  if (why.length) {
    lines.push("", `🔎 *${t(lang, "Why", "Wajah", "وجہ")}:*`, ...why.map((reason) => `• ${reason}`));
  }
  if (basisM != null) lines.push("", `✅ *${t(lang, "Advice", "Mashwara", "مشورہ")}:* ${tip(levelFor(basisM), lang)}`);
  lines.push("", `🗺️ ${ctx.siteUrl}/map`);
  return lines.join("\n");
}

type Resolved = { district: District; place?: FoundPlace };
type Resolution = { found: Resolved[]; abroad: FoundPlace[]; missing: string[] };

/**
 * Every place is first looked up on the map and checked to be inside Pakistan,
 * then mapped to its census district. The alias list is only a fallback.
 */
async function resolvePlaces(u: Understanding, text: string, districts: District[]): Promise<Resolution> {
  const found: Resolved[] = [];
  const abroad: FoundPlace[] = [];
  const missing: string[] = [];
  for (const query of u.places) {
    const check = await checkPlace(query, districts);
    if (check.status === "pakistan" && check.district) {
      found.push({ district: check.district, place: check.place });
    } else if (check.status === "abroad") {
      abroad.push(check.place);
    } else {
      // Map search found nothing (or is offline): fall back to the known town list.
      const known = matchDistrict(query, districts);
      if (known) found.push({ district: known });
      else missing.push(query);
    }
  }
  if (!found.length && !abroad.length && u.district) found.push({ district: u.district });
  if (!found.length && !abroad.length && !u.places.length) {
    const known = matchDistrict(text, districts);
    if (known) found.push({ district: known });
  }
  // One answer per district, most specific place first.
  const byDistrict = new Map<string, Resolved>();
  for (const item of found.sort((a, b) => (b.place?.rank ?? 0) - (a.place?.rank ?? 0))) {
    if (!byDistrict.has(item.district.name)) byDistrict.set(item.district.name, item);
  }
  return { found: [...byDistrict.values()].slice(0, 2), abroad, missing };
}

function notInPakistan(lang: Lang, places: FoundPlace[]) {
  const list = places.map((p) => `${p.name}${p.country ? ` (${p.country})` : ""}`).join(", ");
  return t(
    lang,
    `🌍 ${list} is not in Pakistan. AquaLedger only has groundwater data for Pakistan; please send a Pakistani town or district.`,
    `🌍 ${list} Pakistan mein nahi hai. AquaLedger ke paas sirf Pakistan ka zameeni paani ka data hai; koi Pakistani shehar ya zila bhejein.`,
    `🌍 ${list} پاکستان میں نہیں ہے۔ ایکوا لیجر کے پاس صرف پاکستان کا ڈیٹا ہے؛ کوئی پاکستانی شہر یا ضلع بھیجیں۔`
  );
}

function notFound(lang: Lang, names: string[]) {
  const list = names.join(", ");
  return t(
    lang,
    `🔍 I could not find "${list}" on the map of Pakistan. Please check the spelling, add the district name (e.g. "Mailsi, Vehari"), or send your 📍 location.`,
    `🔍 "${list}" Pakistan ke naqshe par nahi mila. Spelling check karein, saath zile ka naam likhein (maslan "Mailsi, Vehari"), ya apni 📍 location bhejein.`,
    `🔍 "${list}" پاکستان کے نقشے پر نہیں ملا۔ ہجے چیک کریں، ساتھ ضلع کا نام لکھیں (مثلاً "میلسی، وہاڑی")، یا اپنی 📍 لوکیشن بھیجیں۔`
  );
}

async function recordReading(
  from: string,
  reading: Pending,
  target: Resolved,
  districts: District[],
  ctx: BotContext,
  location?: { latitude: number; longitude: number }
): Promise<{ text: string; save: SaveResult }> {
  const lang = reading.lang;
  const district = target.district;
  const area = areaLabel(district);
  const save = await saveReading(
    { phone: from, areaName: area, depthM: reading.depthM, sourceType: reading.sourceType, latitude: location?.latitude, longitude: location?.longitude },
    { dryRun: ctx.dryRun }
  );
  const sourceEn = reading.sourceType ?? "Tube well";
  const sourceNames: Record<SourceType, [string, string]> = {
    "Tube well": ["Tube well", "ٹیوب ویل"],
    Borehole: ["Bore", "بور"],
    "Hand pump": ["Nalka (hand pump)", "نلکا"],
    "Open well": ["Kunwan", "کنواں"],
  };
  const source = t(lang, sourceEn, sourceNames[sourceEn][0], sourceNames[sourceEn][1]);
  const where = target.place && target.place.name.toLowerCase() !== district.name.toLowerCase() ? `${target.place.name}, ${area}` : area;
  if (save.status === "rejected") {
    return {
      save,
      text: t(
        lang,
        `⚠️ ${depthM(reading.depthM)} looks unusual for ${area}, so it was not saved. Please check the number and whether it is feet or metres, then send it again.`,
        `⚠️ ${area} ke liye ${depthM(reading.depthM)} ajeeb lag raha hai, is liye save nahi kiya. Number aur foot/meter dobara check karke bhejein.`,
        `⚠️ ${area} کے لیے ${depthM(reading.depthM)} غیر معمولی لگ رہا ہے، اس لیے محفوظ نہیں کیا۔ نمبر اور فٹ/میٹر دوبارہ چیک کر کے بھیجیں۔`
      ),
    };
  }
  const community = await communityStatsFor(district, districts).catch(() => null);
  const lines = [
    t(lang, "✅ *Reading received*", "✅ *Reading mil gayi*", "✅ *ریڈنگ موصول ہو گئی*"),
    `${t(lang, "Source", "Zariya", "ذریعہ")}: ${source} · ${where}`,
    `${t(lang, "Depth", "Gehraai", "گہرائی")}: *${depthM(reading.depthM)}*`,
  ];
  if (community?.averageDepthM != null) {
    const diff = reading.depthM - community.averageDepthM;
    lines.push(
      Math.abs(diff) < 1
        ? t(lang, `About the same as the district average (${depthM(community.averageDepthM)}).`, `Zile ki ausat (${depthM(community.averageDepthM)}) ke qareeb hai.`, `ضلع کی اوسط (${depthM(community.averageDepthM)}) کے قریب ہے۔`)
        : t(
            lang,
            `${depthM(Math.abs(diff))} ${diff > 0 ? "deeper" : "shallower"} than the district average (${depthM(community.averageDepthM)}).`,
            `Zile ki ausat (${depthM(community.averageDepthM)}) se ${depthM(Math.abs(diff))} ${diff > 0 ? "zyada gehra" : "kam gehra"}.`,
            `ضلع کی اوسط (${depthM(community.averageDepthM)}) سے ${depthM(Math.abs(diff))} ${diff > 0 ? "زیادہ گہرا" : "کم گہرا"}۔`
          )
    );
  }
  const level = levelFor(reading.depthM);
  lines.push(`${t(lang, "Status", "Halat", "صورتحال")}: ${levelLabel(level, lang)}`, `✅ ${tip(level, lang)}`, "");
  if (save.status === "saved") {
    lines.push(
      t(
        lang,
        "Saved to AquaLedger for review. Send a new reading in 3 months to see your trend.",
        "AquaLedger mein review ke liye save ho gayi. 3 mahine baad nayi reading bhejein taake trend nazar aaye.",
        "ایکوا لیجر میں جائزے کے لیے محفوظ ہو گئی۔ 3 ماہ بعد نئی ریڈنگ بھیجیں تاکہ رجحان نظر آئے۔"
      )
    );
  } else if (save.status === "test" && ctx.webChat) {
    lines.push(
      t(
        lang,
        `📝 To save it to your record, use *Log Reading*: ${ctx.siteUrl}/reports`,
        `📝 Apne record mein save karne ke liye *Log Reading* page use karein: ${ctx.siteUrl}/reports`,
        `📝 اپنے ریکارڈ میں محفوظ کرنے کے لیے *ریڈنگ درج کریں* صفحہ استعمال کریں: ${ctx.siteUrl}/reports`
      )
    );
  } else if (save.status === "test") {
    lines.push(t(lang, "🧪 Test mode: not saved.", "🧪 Test mode: save nahi hui.", "🧪 ٹیسٹ موڈ: محفوظ نہیں ہوئی۔"));
  } else {
    lines.push(
      t(
        lang,
        `Saving from WhatsApp is not switched on yet. You can add it at ${ctx.siteUrl}`,
        `WhatsApp se save karna abhi band hai. Website par darj karein: ${ctx.siteUrl}`,
        `واٹس ایپ سے محفوظ کرنا ابھی بند ہے۔ ویب سائٹ پر درج کریں: ${ctx.siteUrl}`
      )
    );
  }
  return { text: lines.join("\n"), save };
}

function askForArea(lang: Lang, depthText: string) {
  return t(
    lang,
    `👍 Got it: ${depthText}. Which town or district is this well in? Type the name or send your 📍 location.`,
    `👍 Samajh gaya: ${depthText}. Yeh bore kis shehar ya zile mein hai? Naam likhein ya apni 📍 location bhejein.`,
    `👍 سمجھ گیا: ${depthText}۔ یہ بور کس شہر یا ضلع میں ہے؟ نام لکھیں یا اپنی 📍 لوکیشن بھیجیں۔`
  );
}

function freshPending(from: string) {
  const item = pending.get(from);
  if (item && Date.now() - item.at < PENDING_TTL_MS) return item;
  pending.delete(from);
  return null;
}

/** "lang:en" from a button, or the user typing the language name. */
function languageChoice(text: string): Lang | null {
  const v = text.trim().toLowerCase();
  if (v === "lang:en" || v === "english" || v === "eng" || v === "en") return "en";
  if (v === "lang:roman" || v === "roman urdu" || v === "roman" || v === "roman-urdu") return "roman";
  if (v === "lang:ur" || v === "urdu" || v === "اردو" || v === "ur") return "ur";
  return null;
}

const LANGUAGE_SWITCH = /^(language|languages|zuban|zaban|lang|زبان|change language)$/i;

// ---------- New water source advisor (multi-step) ----------

type AdvisorTarget = { district: District; placeName: string; lat: number | null; lon: number | null };
type AdvisorState = {
  kind: AdvisorKind | null;
  purpose: Purpose | null;
  acres: number | null;
  askedAcres: boolean;
  target: AdvisorTarget | null;
  awaiting: "kind" | "purpose" | "acres" | "place";
  at: number;
  /** Earlier steps, newest last, so "Back" can undo an answer. */
  history: AdvisorSnapshot[];
};
type AdvisorSnapshot = Omit<AdvisorState, "at" | "history">;
const advisors = new Map<string, AdvisorState>();
// The last finished plan, so "Back" after the estimate can reopen it to change an answer.
const finishedPlans = new Map<string, AdvisorState>();
const BACK = /^(nav:back|back|go back|previous|wapas|wapis|peeche|pichay|pichhe|undo|پیچھے|واپس)$/i;

const snapshot = (s: AdvisorState): AdvisorSnapshot => ({
  kind: s.kind,
  purpose: s.purpose,
  acres: s.acres,
  askedAcres: s.askedAcres,
  target: s.target,
  awaiting: s.awaiting,
});

/** Undo the last answer: go back to the step that was being asked, with that answer cleared. */
function stepBack(state: AdvisorState): boolean {
  const previous = state.history.pop();
  if (!previous) return false;
  Object.assign(state, previous);
  if (previous.awaiting === "kind") state.kind = null;
  if (previous.awaiting === "purpose") state.purpose = null;
  if (previous.awaiting === "acres") {
    state.acres = null;
    state.askedAcres = false;
  }
  if (previous.awaiting === "place") state.target = null;
  return true;
}

function navButtons(lang: Lang, withMenu = false): ReplyButton[] {
  const back = { id: "nav:back", title: t(lang, "⬅️ Back", "⬅️ Wapas", "↩️ واپس") };
  return withMenu ? [back, { id: "menu:main", title: t(lang, "🏠 Main menu", "🏠 Main menu", "🏠 مین مینو") }] : [back];
}
const ADVISOR_TTL_MS = 30 * 60_000;
const CANCEL = /^(cancel|stop|band|khatam|exit|menu|chhoro|chhodo|rehne do|رک|بند|ختم)$/i;

function freshAdvisor(from: string) {
  const state = advisors.get(from);
  if (state && Date.now() - state.at < ADVISOR_TTL_MS) return state;
  advisors.delete(from);
  return null;
}

/** Asks for the next missing detail, or builds the estimate once everything is known. */
async function advanceAdvisor(from: string, state: AdvisorState, lang: Lang, ctx: BotContext, districts: District[]): Promise<BotReply[]> {
  state.at = Date.now();
  if (state.kind === "hand_pump" || state.kind === "home_bore") state.purpose ??= "home";
  if (!state.kind) {
    state.awaiting = "kind";
    advisors.set(from, state);
    return [
      {
        text: t(
          lang,
          "🛠️ Let's plan your new water source. Which one do you want to install?",
          "🛠️ Aaiye aap ke naye paani ke zariye ka andaza lagayein. Aap kya lagwana chahte hain?",
          "🛠️ آئیے آپ کے نئے پانی کے ذریعے کا اندازہ لگائیں۔ آپ کیا لگوانا چاہتے ہیں؟"
        ),
        buttons: [...kindButtons(lang), ...navButtons(lang)],
      },
    ];
  }
  if (!state.purpose) {
    state.awaiting = "purpose";
    advisors.set(from, state);
    return [
      {
        text: t(lang, `What will the ${kindName(state.kind, lang)} be used for?`, `${kindName(state.kind, lang)} kis kaam ke liye chahiye?`, `${kindName(state.kind, lang)} کس کام کے لیے چاہیے؟`),
        buttons: [...purposeButtons(lang), ...navButtons(lang)],
      },
    ];
  }
  const farm = state.purpose !== "home" && (state.kind === "tube_well" || state.kind === "solar_tube_well");
  if (farm && state.acres == null && !state.askedAcres) {
    state.awaiting = "acres";
    advisors.set(from, state);
    return [
      {
        text: t(
          lang,
          "How many acres do you want to water? Send a number (e.g. \"10 acre\"), or \"don't know\".",
          "Kitne acre zameen ko paani dena hai? Number bhejein (maslan \"10 acre\"), ya \"pata nahi\" likhein.",
          "کتنے ایکڑ زمین کو پانی دینا ہے؟ نمبر بھیجیں (مثلاً \"10 ایکڑ\")، یا \"پتا نہیں\" لکھیں۔"
        ),
        buttons: [{ id: "acres:unknown", title: t(lang, "Don't know", "Pata nahi", "پتا نہیں") }, ...navButtons(lang)],
      },
    ];
  }
  if (!state.target) {
    state.awaiting = "place";
    advisors.set(from, state);
    return [
      {
        text: t(
          lang,
          "📍 Where will it be installed? Share the *location* of the spot (best), or type the village / town name.",
          "📍 Yeh kahan lagega? Us jagah ki *location* share karein (sab se behtar), ya gaon / shehar ka naam likhein.",
          "📍 یہ کہاں لگے گا؟ اس جگہ کی *لوکیشن* شیئر کریں (سب سے بہتر)، یا گاؤں / شہر کا نام لکھیں۔"
        ),
        buttons: navButtons(lang),
      },
    ];
  }
  advisors.delete(from);
  // Remember the finished plan so "Back" can reopen its last step to change the place.
  finishedPlans.set(from, { ...state, history: [...state.history] });
  const plan = await buildPlan(
    {
      kind: state.kind,
      purpose: state.purpose,
      acres: state.acres,
      district: state.target.district,
      districts,
      placeName: state.target.placeName,
      lat: state.target.lat,
      lon: state.target.lon,
      origin: ctx.origin,
    },
    lang
  );
  return [
    { text: plan },
    {
      text: t(lang, "Want to change an answer? Tap *Back*.", "Koi jawab badalna hai? *Wapas* dabayein.", "کوئی جواب بدلنا ہے؟ *واپس* دبائیں۔"),
      buttons: navButtons(lang, true),
    },
  ];
}

/** Reads whatever the user said into the advisor state (type, use, acres, place). */
async function fillAdvisor(state: AdvisorState, text: string, lang: Lang, districts: District[]): Promise<string | null> {
  // A tapped button ("kind:tube_well") is never a place; "naya bore" alone does not say which kind.
  const isButton = /^(kind|purpose|lang|acres|nav|menu):/.test(text.trim());
  if (text === "acres:unknown" && state.awaiting === "acres") state.askedAcres = true;
  const specific = text.replace(/naya bore|new bore|nayi bore|نیا بور|bore plan/gi, " ");
  state.kind ??= parseKind(specific);
  state.purpose ??= parsePurpose(text);
  if (state.acres == null) {
    const acres = parseAcres(text, state.awaiting !== "acres");
    if (acres != null) state.acres = acres;
    else if (state.awaiting === "acres") state.askedAcres = true; // "pata nahi": fall back to 5 acres
  }
  if (!isButton && !state.target && (state.awaiting === "place" || extractPlaces(text).length)) {
    const u = await understand(text, districts, lang);
    if (u.places.length || u.district) {
      const found = await resolvePlaces(u, text, districts);
      const first = found.found[0];
      if (first) {
        state.target = {
          district: first.district,
          placeName: first.place?.name ?? first.district.name,
          lat: first.place?.lat ?? null,
          lon: first.place?.lon ?? null,
        };
      } else if (state.awaiting === "place") {
        if (found.abroad.length) return notInPakistan(lang, found.abroad);
        if (found.missing.length) return notFound(lang, found.missing);
      }
    }
  }
  return null;
}

export async function handleMessage(input: BotInput, ctx: BotContext): Promise<BotResult> {
  const engines = { understanding: claudeEnabled() ? ("claude" as const) : ("rules" as const), voice: transcriptionEnabled(), saving: savingEnabled() };
  if (ctx.lang && !languages.has(input.from)) languages.set(input.from, ctx.lang);
  let lang = languages.get(input.from) ?? null;
  const reply = (replies: BotReply[], extra: Partial<BotResult> = {}): BotResult => ({ engines, lang, replies, ...extra });

  // 1. First contact: greet and ask for a language. When the website is already in a
  //    language (e.g. Urdu), start straight in it; the user can still switch with "Language".
  if (input.kind === "start") {
    if (ctx.lang) {
      languages.set(input.from, ctx.lang);
      lang = ctx.lang;
      return reply([mainMenu(ctx.lang, true)]);
    }
    return reply([greeting()]);
  }

  if (input.kind === "text") {
    const chosen = languageChoice(input.text);
    if (chosen) {
      languages.set(input.from, chosen);
      lang = chosen;
      const held = heldQuestion.get(input.from);
      heldQuestion.delete(input.from);
      if (held) {
        // They asked something before choosing: answer it straight away in the chosen language.
        const answer = await handleMessage(held, { ...ctx, lang: chosen });
        return reply(answer.replies, { transcript: answer.transcript, understood: answer.understood, places: answer.places, save: answer.save });
      }
      return reply([mainMenu(chosen, true)]);
    }
    if (lang && /^(menu|main menu|options|option|start|home|مینو)$/i.test(input.text.trim())) {
      advisors.delete(input.from);
      topicWaiting.delete(input.from);
      return reply([mainMenu(lang)]);
    }
    if (LANGUAGE_SWITCH.test(input.text.trim())) {
      return reply([{ text: "Zuban chunein / Choose a language / زبان منتخب کریں", buttons: LANGUAGE_BUTTONS }]);
    }
  }

  // No language yet: auto-detect from the message (or default to English) and answer right away.
  if (!lang) {
    if (input.kind === "text") {
      const txt = input.text.trim();
      if (/[\u0600-\u06FF]/.test(txt)) {
        lang = "ur";
      } else if (/\b(paani|pani|kitna|gehra|kaise|kahan|mera|meri|mere|chahiye|lagwana|mein|hain|hai|hoon|kya|kitni|zameen|maslan|batao|bataein|shukriya|madad)\b/i.test(txt)) {
        lang = "roman";
      } else {
        lang = ctx.lang ?? "en";
      }
      languages.set(input.from, lang);
    } else {
      if (input.kind !== "unsupported") heldQuestion.set(input.from, input);
      return reply([greeting()]);
    }
  }

  const districts = await loadDistricts(ctx.origin);
  const waiting = freshPending(input.from);

  if (input.kind === "unsupported") {
    return reply([
      {
        text: t(
          lang,
          "Sorry, I can read text, voice notes and locations only.",
          "Maazrat, main sirf text, voice note aur location samajh sakta hoon.",
          "معذرت، میں صرف ٹیکسٹ، وائس نوٹ اور لوکیشن سمجھ سکتا ہوں۔"
        ),
      },
    ]);
  }

  if (input.kind === "location") {
    const district = districtAt(input.latitude, input.longitude, districts);
    if (!district) {
      return reply([
        {
          text: t(
            lang,
            "🌍 This location is outside Pakistan, and AquaLedger only covers Pakistan.",
            "🌍 Yeh location Pakistan se bahar hai, AquaLedger sirf Pakistan ka data rakhta hai.",
            "🌍 یہ لوکیشن پاکستان سے باہر ہے، ایکوا لیجر صرف پاکستان کا ڈیٹا رکھتا ہے۔"
          ),
        },
      ]);
    }
    const advisor = freshAdvisor(input.from);
    if (advisor) {
      advisor.target = { district, placeName: district.name, lat: input.latitude, lon: input.longitude };
      return reply(await advanceAdvisor(input.from, advisor, lang, ctx, districts));
    }
    const menuTopicHere = freshTopicWaiting(input.from);
    if (menuTopicHere) {
      topicWaiting.delete(input.from);
      return reply([{ text: await answerTopic(menuTopicHere, { lang, siteUrl: ctx.siteUrl, origin: ctx.origin, district, districts }) }]);
    }
    const replies: BotReply[] = [];
    let save: SaveResult | undefined;
    if (waiting) {
      pending.delete(input.from);
      const recorded = await recordReading(input.from, waiting, { district }, districts, ctx, input);
      replies.push({ text: recorded.text });
      save = recorded.save;
    }
    const here: FoundPlace = {
      query: "location",
      name: t(lang, "your location", "aap ki location", "آپ کی لوکیشن"),
      lat: input.latitude,
      lon: input.longitude,
      countryCode: "pk",
      country: "Pakistan",
      rank: 30,
    };
    const [report, well] = await Promise.all([
      areaReport(district, districts, ctx, lang, here),
      nearestWell(input.latitude, input.longitude, ctx.origin).catch(() => null),
    ]);
    let text = report;
    if (well && well.km <= 25) {
      text += `\n\n${t(
        lang,
        `📍 Nearest monitoring well: ${well.km.toFixed(1)} km away, water at ${depthM(well.lastDepthM)} in ${well.lastYear}.`,
        `📍 Qareeb tareen monitoring well: ${well.km.toFixed(1)} km door, ${well.lastYear} mein paani ${depthM(well.lastDepthM)} par.`,
        `📍 قریب ترین مانیٹرنگ کنواں: ${well.km.toFixed(1)} کلومیٹر دور، ${well.lastYear} میں پانی ${depthM(well.lastDepthM)} پر۔`
      )}`;
    }
    replies.push({ text });
    return reply(replies, { save });
  }

  // Text or voice
  let text: string;
  let transcript: string | undefined;
  if (input.kind === "audio") {
    if (!transcriptionEnabled()) {
      return reply([
        {
          text: t(
            lang,
            "🎙️ Voice notes are not switched on yet. Please type your message.",
            "🎙️ Voice note abhi band hai, meherbani karke likh kar bhejein.",
            "🎙️ وائس نوٹ ابھی بند ہے، براہ کرم لکھ کر بھیجیں۔"
          ),
        },
      ]);
    }
    transcript = await transcribeAudio(input.data, input.mimeType);
    text = transcript;
    if (!text) {
      return reply([{ text: t(lang, "🎙️ I could not hear that, please try again.", "🎙️ Awaaz samajh nahi aayi, dobara saaf bol kar bhejein.", "🎙️ آواز سمجھ نہیں آئی، دوبارہ صاف بول کر بھیجیں۔") }], { transcript });
    }
  } else {
    text = input.text.trim();
  }

  // Starting something else ends the "Back into the last plan" option.
  if (text.startsWith("menu:")) finishedPlans.delete(input.from);

  // Options menu taps.
  if (text === "menu:main") {
    advisors.delete(input.from);
    topicWaiting.delete(input.from);
    return reply([mainMenu(lang)]);
  }
  const askPlaceFor = (en: string, roman: string, ur: string) =>
    reply([{ text: t(lang!, `${en}\n📍 Type the town / district name, or share your location.`, `${roman}\n📍 Shehar / zile ka naam likhein, ya apni location bhejein.`, `${ur}\n📍 شہر / ضلع کا نام لکھیں، یا اپنی لوکیشن بھیجیں۔`) }]);
  if (text === "menu:area") {
    advisors.delete(input.from);
    topicWaiting.delete(input.from);
    return askPlaceFor("Sure, which area?", "Zaroor, kaun sa ilaqa?", "ضرور، کون سا علاقہ؟");
  }
  if (text === "menu:quality" || text === "menu:trend") {
    advisors.delete(input.from);
    topicWaiting.set(input.from, { topic: text === "menu:quality" ? "quality" : "trend", at: Date.now() });
    return text === "menu:quality"
      ? askPlaceFor("🧪 Let's check the water quality. Which area?", "🧪 Paani ki quality dekhte hain. Kaun sa ilaqa?", "🧪 پانی کا معیار دیکھتے ہیں۔ کون سا علاقہ؟")
      : askPlaceFor("📉 Let's look at where the water is heading. Which area?", "📉 Dekhte hain paani kidhar ja raha hai. Kaun sa ilaqa?", "📉 دیکھتے ہیں پانی کدھر جا رہا ہے۔ کون سا علاقہ؟");
  }
  if (text === "menu:pump" || text === "menu:save" || text === "menu:impact") {
    advisors.delete(input.from);
    const topic = text === "menu:pump" ? "pump_trouble" : text === "menu:save" ? "conservation" : "impact";
    return reply([{ text: await answerTopic(topic, { lang, siteUrl: ctx.siteUrl, origin: ctx.origin, district: null, districts }) }]);
  }
  if (text === "menu:report") {
    advisors.delete(input.from);
    return reply([{ text: t(lang, "📏 Write the depth of water in your bore and the town, e.g. \"my tube well is 120 feet in Pattoki\".", "📏 Bore mein paani ki gehraai aur shehar likhein, maslan \"mera tube well Pattoki mein 120 foot par hai\".", "📏 بور میں پانی کی گہرائی اور شہر لکھیں، مثلاً \"میرا ٹیوب ویل پتوکی میں 120 فٹ پر ہے\"۔") }]);
  }
  if (text === "menu:bore") {
    advisors.delete(input.from);
    text = "naya bore";
  }

  // New water source advisor: continue an open one, or start when the user asks to install something.
  const heardPrefix = transcript ? `🎙️ _"${transcript}"_\n\n` : "";
  const advisor = freshAdvisor(input.from);
  if (advisor && CANCEL.test(text.trim())) {
    advisors.delete(input.from);
    return reply([{ text: t(lang, "OK, stopped. Ask me anything else.", "Theek hai, band kar diya. Kuch aur poochein.", "ٹھیک ہے، بند کر دیا۔ کچھ اور پوچھیں۔") }], { transcript });
  }
  // Misspelt requests count too ("lagwaana", "instal"), but only when a water source is named.
  const wantsInstall = isAdvisorRequest(text) || (hasTopic(analyze(text), "install") && /tube ?well|bore|boring|nalka|hand ?pump|solar|ٹیوب|بور|نلکا|سولر/i.test(text));
  // "Back": undo the last answer of an open (or just finished) plan; otherwise go to the menu.
  if (BACK.test(text.trim())) {
    const finished = finishedPlans.get(input.from);
    const open = advisor ?? (finished ? { ...finished, at: Date.now(), history: [...finished.history] } : null);
    if (open && stepBack(open)) {
      finishedPlans.delete(input.from);
      advisors.set(input.from, open);
      return reply(await advanceAdvisor(input.from, open, lang, ctx, districts), { transcript });
    }
    advisors.delete(input.from);
    topicWaiting.delete(input.from);
    return reply([mainMenu(lang)], { transcript });
  }

  // An open plan should not swallow a different question: if the user ignores the step we
  // asked about and writes something longer, leave the plan and answer the new message.
  let advisorActive = advisor != null || wantsInstall;
  if (advisor && !wantsInstall && !/^(kind|purpose|lang|menu|nav|acres):/.test(text) && tokens(text).length >= 3) {
    const awaitedAnswered =
      (advisor.awaiting === "kind" && parseKind(text) != null) ||
      (advisor.awaiting === "purpose" && parsePurpose(text) != null) ||
      (advisor.awaiting === "acres" && parseAcres(text) != null);
    const otherQuestion = analyze(text).topics.some((x) => ANSWERABLE.includes(x.topic)) || /\?|؟|kitna|kya|kaisa|how|what/i.test(text);
    if (!awaitedAnswered && (advisor.awaiting !== "place" || otherQuestion)) {
      advisors.delete(input.from);
      advisorActive = false;
    }
  }
  if (advisorActive) {
    const state: AdvisorState = advisor ?? { kind: null, purpose: null, acres: null, askedAcres: false, target: null, awaiting: "kind", at: Date.now(), history: [] };
    finishedPlans.delete(input.from);
    const before = JSON.stringify([state.kind, state.purpose, state.acres, state.askedAcres, state.target?.district.name]);
    if (advisor) state.history.push(snapshot(state)); // remember the step being answered, for "Back"
    const problem = await fillAdvisor(state, text, lang, districts);
    const progressed = before !== JSON.stringify([state.kind, state.purpose, state.acres, state.askedAcres, state.target?.district.name]);
    if (advisor && !progressed) state.history.pop();
    const replies = await advanceAdvisor(input.from, state, lang, ctx, districts);
    if (problem) replies.unshift({ text: problem });
    else if (advisor && !progressed) {
      replies[0] = {
        ...replies[0],
        text: `${t(lang, "Sorry, I did not get that.", "Maazrat, samajh nahi aaya.", "معذرت، سمجھ نہیں آیا۔")} ${replies[0].text}\n\n_${t(lang, "Type *cancel* to stop.", "Band karne ke liye *cancel* likhein.", "بند کرنے کے لیے *cancel* لکھیں۔")}_`,
      };
    }
    // "Solar lagwane ka kharcha?": say how cost works, then carry on with the sizing questions.
    if (!advisor && hasTopic(analyze(text), "cost", 1.5)) {
      replies.unshift({ text: await answerTopic("cost", { lang, siteUrl: ctx.siteUrl, origin: ctx.origin, district: null, districts }) });
    }
    replies[0] = { ...replies[0], text: heardPrefix + replies[0].text };
    return reply(replies, { transcript });
  }

  finishedPlans.delete(input.from);
  const u = await understand(text, districts, lang);
  const understood = { ...u, district: u.district ? areaLabel(u.district) : null };
  const heard = transcript ? `🎙️ _"${transcript}"_\n\n` : "";
  const base = { transcript, understood };

  // Read the words of the message: which topics is it about?
  const analysis = analyze(text);
  const wordCount = tokens(text).length;
  // The strongest topic, plus a second one only when it was an exact (not misspelt) match.
  const answerable = analysis.topics
    .filter((x) => ANSWERABLE.includes(x.topic) && x.score >= 1)
    .filter((x, i, list) => i === 0 || (x.score >= 1.5 && x.score >= list[0].score / 2))
    .slice(0, 2);
  const onlyGreeting = analysis.topics.length > 0 && analysis.topics.every((x) => x.topic === "greeting") && wordCount <= 4;

  if ((u.intent === "help" && !u.places.length && !answerable.length) || onlyGreeting) {
    const menu = mainMenu(lang);
    // "hi" gets the options; "help" also gets examples of what to type.
    return reply([{ ...menu, text: heard + (onlyGreeting ? menu.text : `${helpText(lang, ctx.siteUrl)}\n\n${menu.text}`) }], base);
  }

  const needsPlace = u.places.length > 0 || u.district != null || (waiting != null && u.depthM == null);
  const resolution = needsPlace ? await resolvePlaces(u, text, districts) : { found: [], abroad: [], missing: [] };
  const places = [
    ...resolution.found.map((r) => (r.place ? `${r.place.name} → ${areaLabel(r.district)}` : areaLabel(r.district))),
    ...resolution.abroad.map((p) => `${p.name} (${p.country})`),
    ...resolution.missing.map((m) => `${m} (not found)`),
  ];
  const withPlaces = { ...base, places, topics: analysis.topics.map((x) => `${x.topic}:${x.score}`) };

  // The user picked "quality" or "trend" from the menu and now names the place.
  const menuTopic = freshTopicWaiting(input.from);
  if (menuTopic && resolution.found.length && u.depthM == null) {
    topicWaiting.delete(input.from);
    const first = resolution.found[0];
    const answer = await answerTopic(menuTopic, { lang, siteUrl: ctx.siteUrl, origin: ctx.origin, district: first.district, districts });
    const where = first.place && first.place.name.toLowerCase() !== first.district.name.toLowerCase()
      ? t(lang, `📍 ${first.place.name} is in ${areaLabel(first.district)} district.\n\n`, `📍 ${first.place.name} zila ${areaLabel(first.district)} mein hai.\n\n`, `📍 ${first.place.name} ضلع ${areaLabel(first.district)} میں ہے۔\n\n`)
      : "";
    return reply([{ text: heard + where + answer }], withPlaces);
  }

  // A depth reading about the user's own source.
  if (u.intent === "report_reading" && u.depthM != null && !answerable.some((x) => x.topic === "trend" || x.topic === "pump_trouble")) {
    if (u.depthM <= 0 || u.depthM > MAX_DEPTH_M) {
      return reply(
        [
          {
            text:
              heard +
              t(
                lang,
                `${u.depthAsSaid} does not look like a well depth. Please send it again, e.g. "120 feet".`,
                `${u.depthAsSaid} bore ki gehraai nahi lagti. Dobara bhejein, maslan "120 foot".`,
                `${u.depthAsSaid} بور کی گہرائی نہیں لگتی۔ دوبارہ بھیجیں، مثلاً "120 فٹ"۔`
              ),
          },
        ],
        withPlaces
      );
    }
    const reading: Pending = { depthM: u.depthM, depthAsSaid: u.depthAsSaid, sourceType: u.sourceType, lang, at: Date.now() };
    if (resolution.abroad.length && !resolution.found.length) return reply([{ text: heard + notInPakistan(lang, resolution.abroad) }], withPlaces);
    const target = resolution.found[0];
    if (!target) {
      pending.set(input.from, reading);
      const prefix = resolution.missing.length ? `${notFound(lang, resolution.missing)}\n\n` : "";
      return reply([{ text: heard + prefix + askForArea(lang, depthM(u.depthM)) }], withPlaces);
    }
    pending.delete(input.from);
    const recorded = await recordReading(input.from, reading, target, districts, ctx);
    return reply([{ text: heard + recorded.text }], { ...withPlaces, save: recorded.save });
  }

  // A place sent right after a reading completes that reading.
  if (waiting && u.depthM == null && resolution.found.length && !answerable.length) {
    pending.delete(input.from);
    const recorded = await recordReading(input.from, { ...waiting, lang }, resolution.found[0], districts, ctx);
    return reply([{ text: heard + recorded.text }], { ...withPlaces, save: recorded.save });
  }

  // Free-form questions: quality, trend, pump trouble, saving water, crops, cost, schemes…
  if (answerable.length) {
    const first = resolution.found[0];
    const topicCtx = { lang, siteUrl: ctx.siteUrl, origin: ctx.origin, district: first?.district ?? null, districts };
    const answers = (await Promise.all(answerable.map((x) => answerTopic(x.topic, topicCtx)))).filter(Boolean);
    const replies: BotReply[] = answers.map((text, i) => ({ text: (i === 0 ? heard : "") + text }));
    const placeAware = answerable.some((x) => x.topic === "quality" || x.topic === "health" || x.topic === "trend" || x.topic === "irrigation");
    // A named place with a non-place topic (e.g. pump trouble in Kasur): add that area's water level too.
    if (first && !placeAware) replies.push({ text: await areaReport(first.district, districts, ctx, lang, first.place) });
    // Leftover words that matched a foreign place are ignored here: the question was about a topic.
    if (replies.length) return reply(replies, withPlaces);
  }

  if (resolution.found.length) {
    const reports = await Promise.all(resolution.found.map((r) => areaReport(r.district, districts, ctx, lang!, r.place)));
    const notes = [
      resolution.abroad.length ? notInPakistan(lang, resolution.abroad) : "",
      resolution.missing.length ? notFound(lang, resolution.missing) : "",
    ].filter(Boolean);
    return reply(
      reports.map((text, i) => ({ text: (i === 0 ? heard : "") + text })).concat(notes.map((text) => ({ text }))),
      withPlaces
    );
  }
  // Only a real town or city abroad gets "not in Pakistan"; random words that hit a tiny foreign hamlet do not.
  const abroadCities = resolution.abroad.filter((p) => p.rank <= 16);
  if (abroadCities.length) return reply([{ text: heard + notInPakistan(lang, abroadCities) }], withPlaces);

  // Asked about depth or water level but no place: ask for one.
  if (hasTopic(analysis, "depth") || hasTopic(analysis, "report")) {
    const msg = hasTopic(analysis, "report")
      ? t(
          lang,
          "📏 To send a reading, write the depth of water in your bore and the town, e.g. \"my tube well is 120 feet in Pattoki\".",
          "📏 Reading bhejne ke liye bore mein paani ki gehraai aur shehar likhein, maslan \"mera tube well Pattoki mein 120 foot par hai\".",
          "📏 ریڈنگ بھیجنے کے لیے بور میں پانی کی گہرائی اور شہر لکھیں، مثلاً \"میرا ٹیوب ویل پتوکی میں 120 فٹ پر ہے\"۔"
        )
      : t(
          lang,
          "📍 Which area? Type the town or district, or share your location, and I'll tell you how deep the water is.",
          "📍 Kis ilaqe ka? Shehar ya zile ka naam likhein, ya location bhejein, main paani ki gehraai bata doon ga.",
          "📍 کس علاقے کا؟ شہر یا ضلع کا نام لکھیں، یا لوکیشن بھیجیں، میں پانی کی گہرائی بتا دوں گا۔"
        );
    return reply([{ text: heard + (resolution.missing.length ? `${notFound(lang, resolution.missing)}\n\n` : "") + msg }], withPlaces);
  }

  // Nothing clear: say which words were noticed, then offer the main options. Never stay silent.
  const noticed = [...new Set([...analysis.noticed, ...resolution.missing])].slice(0, 5);
  const intro = noticed.length
    ? t(
        lang,
        `I noted these words in your message: *${noticed.join(", ")}*, but I'm not sure what you need.`,
        `Aap ke message mein main ne yeh alfaaz note kiye: *${noticed.join(", ")}*, lekin poori baat samajh nahi aayi.`,
        `آپ کے پیغام میں میں نے یہ الفاظ نوٹ کیے: *${noticed.join("، ")}*، لیکن پوری بات سمجھ نہیں آئی۔`
      )
    : t(lang, "I didn't quite get that.", "Maazrat, yeh baat poori tarah samajh nahi aayi.", "معذرت، یہ بات پوری طرح سمجھ نہیں آئی۔");
  return reply(
    [
      {
        text:
          heard +
          intro +
          "\n\n" +
          t(
            lang,
            "You can ask things like: \"how deep is water in Okara\", \"is the water safe in Kasur\", \"motor is giving less water\", or \"I want a solar tube well\". Or pick one:",
            "Aap aise pooch sakte hain: \"Okara mein paani kitna gehra hai\", \"Kasur ka paani peene layak hai?\", \"motor paani kam de rahi hai\", ya \"solar tube well lagwana hai\". Ya neeche se chunein:",
            "آپ ایسے پوچھ سکتے ہیں: \"اوکاڑہ میں پانی کتنا گہرا ہے\"، \"قصور کا پانی پینے لائق ہے؟\"، \"موٹر پانی کم دے رہی ہے\"، یا \"سولر ٹیوب ویل لگوانا ہے\"۔ یا نیچے سے چنیں:"
          ),
        buttons: suggestionButtons(lang),
      },
    ],
    withPlaces
  );
}