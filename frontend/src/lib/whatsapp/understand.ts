// Turns a farmer's message (English, Roman Urdu or Urdu) into a structured request.
// Claude does this when ANTHROPIC_API_KEY is set; a keyword parser is the free fallback.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { matchDistrict, districtNames, type District } from "@/lib/whatsapp/knowledge";
import { isVocabularyWord } from "@/lib/whatsapp/analyzer";

export type Lang = "en" | "roman" | "ur";
export type SourceType = "Tube well" | "Borehole" | "Hand pump" | "Open well";

export type Understanding = {
  intent: "area_info" | "report_reading" | "help" | "other";
  district: District | null;
  /** Place names as the user wrote them, to look up on the map. */
  places: string[];
  depthM: number | null;
  depthAsSaid: string | null;
  sourceType: SourceType | null;
  lang: Lang;
  engine: "claude" | "rules";
};

const FEET_TO_M = 0.3048;

const ROMAN_WORDS =
  /\b(pani|paani|kitna|kitni|kitne|kya|kia|hai|hain|mera|meri|mere|hamara|hamare|gehra|gehrai|gehraai|ghera|batao|bataen|bataein|zila|shehar|sheher|nalka|boring|kuan|kunwan|par|mein|main|ka|ki|ke|salam|assalam|janab|bhai)\b/i;
const URDU_SCRIPT = /[؀-ۿ]/;

export function detectLang(text: string): Lang {
  if (URDU_SCRIPT.test(text)) return "ur";
  return ROMAN_WORDS.test(text) ? "roman" : "en";
}

const toAsciiDigits = (text: string) =>
  text.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

function parseDepth(text: string): { depthM: number; asSaid: string } | null {
  const clean = toAsciiDigits(text);
  const withUnit = clean.match(
    /(\d+(?:\.\d+)?)\s*(feet|foot|fut|fit|ft|fuut|فٹ|فُٹ|فیٹ|meters?|metres?|mtrs?|m\b|میٹر)/i
  );
  if (withUnit) {
    const value = Number(withUnit[1]);
    const metres = /^(m|met|mtr|میٹر)/i.test(withUnit[2]) && !/^m(?:ain|ein)/i.test(withUnit[2]);
    return { depthM: metres ? value : value * FEET_TO_M, asSaid: `${value} ${metres ? "m" : "ft"}` };
  }
  return null;
}

function parseSource(text: string): SourceType | null {
  const t = text.toLowerCase();
  if (/tube\s*-?\s*well|tubewell|ٹیوب\s*ویل|ٹیوبویل/.test(t)) return "Tube well";
  if (/\bbor(e|ing|ewell|ehole)?\b|بور|بورنگ/.test(t)) return "Borehole";
  if (/hand\s*pump|handpump|nalka|nalkay|نلکا|ہینڈ\s*پمپ/.test(t)) return "Hand pump";
  if (/\bku+n?wa?n\b|\bkuan\b|open\s*well|کنواں|کنویں/.test(t)) return "Open well";
  return null;
}

const GREETING = /^(hi|hello|hey|salam|salaam|assalam|aoa|a\.o\.a|start|menu|help|madad|السلام|سلام|مدد|ہیلو)\b/i;
const QUESTION = /\?|؟|\b(kitna|kitni|kitne|kya|kia|kaisa|kaisi|how|what|which|batao|bataen|bataein|tell|info|status)\b|کتنا|کتنی|کیا|کیسا|بتائیں|بتاؤ/i;
const MINE = /\b(mera|meri|mere|hamara|hamari|hamare|my|our|apna|apni)\b|میرا|میری|میرے|ہمارا|ہماری/i;

// Words that are never part of a place name, so what is left over is the place.
const FILLER = new Set(
  (
    "mein main me men ka ki ke ko se sy par pe pr hai hain he hy tha thi the paani pani pane water groundwater ground " +
    "kitna kitni kitne gehra gehri gehrai gehraai ghera deep depth level how is in at of what whats what's the a an my our " +
    "mera meri mere hamara hamari hamare apna apni tube well wells tubewell tubewells bore boring borehole nalka nalkay hand pump " +
    "kunwan kuan feet foot ft fut fit meter meters metre metres mtr m kaisa kaisi kesa kesi batao bataen bataein bata tell me " +
    "about status area areas ilaqa ilaqay ilaqe zila zilla district city shehar sheher town village gaon gaun kya kia please plz pls " +
    "ji bhai sahab sir salam hi hello check report reading near qareeb aas paas around there here yahan wahan wala wali wale " +
    "thanks thank thankyou shukriya shukria ok okay theek thik acha achha good yes no haan nahi jee " +
    "solar lagana lagwana lagvana lagwani lagani karwana karvana banwana install drill new naya nayi naye nai plan acre acres " +
    "killa killay kille kanal kheti khet fasal farm farming ghar home house peena peene drinking motor submersible chahiye " +
    "chahta chahti chahte hoon hun liye lie wala need want to for " +
    "parega pareg parta parti pare sakta sakti sakte skta " +
    "kar karna karni karne karen karein karo kiya kiye kya karun karoon chahiye chahie ab phir dobara " +
    "ho hoga hogi hoge gaya gayi gaye jayega jayegi jaye jata jati aata aati aaye raha rahi rahe de deta deti diya " +
    "milta milti mile milega kam zyada ziada baad pehle upar oopar neeche niche tum tu kon kaun layak laiq saal mahine " +
    "din waqt kab kaise kese kaisay kyun kyon q bachay bache bachon log logon sab koi kuch bohat bahut bht zara thora " +
    "info information data and aur or bhi abhi kab kahan kaha is us iss uss ye yeh wo woh hum ham hamain mujhe btao bta"
  ).split(" ")
);
const URDU_FILLER = new Set(
  "سولر لگانا لگوانا نیا چاہیے لیے ایکڑ کھیتی کھیت گھر موٹر میں کا کی کے کو سے پر ہے ہیں تھا پانی کتنا کتنی کتنے گہرا گہری گہرائی میرا میری میرے ہمارا ٹیوب ویل بور نلکا فٹ میٹر کیا کیسا کیسی بتائیں بتاؤ علاقہ علاقے ضلع شہر گاؤں اور یا بھی یہ وہ ہم مجھے".split(
    " "
  )
);

/** Pulls likely place names out of a message ("Bahawalpur, Mailsi" → ["Bahawalpur", "Mailsi"]). */
export function extractPlaces(text: string): string[] {
  const clean = toAsciiDigits(text).replace(/\d+(\.\d+)?/g, " ");
  const segments = clean.split(/[,،؛;\n]|\s(?:and|aur|or|اور)\s/i);
  const out: string[] = [];
  for (const segment of segments) {
    const words = segment
      .replace(/[?؟!.:"'()]/g, " ")
      .split(/\s+/)
      // Topic words ("motor", "khara", even misspelt) are never part of a place name.
      .filter((w) => w && !FILLER.has(w.toLowerCase()) && !URDU_FILLER.has(w) && !isVocabularyWord(w));
    const name = words.join(" ").trim();
    if (name.replace(/[^\p{L}]/gu, "").length >= 3) out.push(name);
  }
  return [...new Set(out)].slice(0, 3);
}

export function understandWithRules(text: string, districts: District[]): Understanding {
  const lang = detectLang(text);
  const depth = parseDepth(text);
  const district = matchDistrict(text, districts);
  const sourceType = parseSource(text);
  let intent: Understanding["intent"] = "other";
  if (depth && (MINE.test(text) || !QUESTION.test(text))) intent = "report_reading";
  else if (district || extractPlaces(text).length) intent = "area_info";
  else if (GREETING.test(text.trim()) || text.trim().length <= 2) intent = "help";
  return {
    intent,
    district,
    places: extractPlaces(text),
    depthM: depth?.depthM ?? null,
    depthAsSaid: depth?.asSaid ?? null,
    sourceType,
    lang,
    engine: "rules",
  };
}

const Extraction = z.object({
  intent: z
    .enum(["area_info", "report_reading", "help", "other"])
    .describe("area_info: asks about water in a place. report_reading: tells the depth of their own well/bore. help: greeting or asks what the bot does."),
  district: z.string().nullable().describe("Exact district name from the list, or null"),
  places: z
    .array(z.string())
    .describe("Every town, village, city or area name in the message, spelled in English letters as best you can (e.g. \"Mailsi\", \"Chak 45 GB\"). Empty if none."),
  depth_value: z.number().nullable().describe("Depth number the user gave for their own source, or null"),
  depth_unit: z.enum(["ft", "m"]).nullable().describe("Unit of depth_value; farmers in Pakistan usually mean feet"),
  source_type: z.enum(["Tube well", "Borehole", "Hand pump", "Open well"]).nullable(),
  language: z.enum(["en", "roman", "ur"]).describe("en: English, roman: Urdu/Punjabi in Latin letters, ur: Urdu script"),
});

let client: Anthropic | null = null;

export function claudeEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function understandWithClaude(text: string, districts: District[]): Promise<Understanding | null> {
  client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const system = [
    "You read short WhatsApp messages from Pakistani farmers to AquaLedger, a groundwater depth service.",
    "Messages may be English, Roman Urdu, Urdu script or Punjabi, often from a voice note transcript with spelling mistakes.",
    "Extract what the user wants. Map any town, tehsil or city to the census district that contains it, using exactly one name from this list:",
    districtNames(districts),
    "If no place is mentioned, district is null. Do not guess a place.",
  ].join("\n");
  const response = await client.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 2048,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(Extraction) },
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  const out = response.parsed_output;
  const district =
    (out.district && (districts.find((d) => d.name.toLowerCase() === out.district!.toLowerCase()) ?? matchDistrict(out.district, districts))) ||
    null;
  const depthM =
    out.depth_value != null && out.depth_value > 0
      ? out.depth_unit === "m"
        ? out.depth_value
        : out.depth_value * FEET_TO_M
      : null;
  return {
    intent: out.intent,
    district,
    places: out.places.map((p) => p.trim()).filter(Boolean).slice(0, 3),
    depthM,
    depthAsSaid: out.depth_value != null ? `${out.depth_value} ${out.depth_unit ?? "ft"}` : null,
    sourceType: out.source_type,
    lang: URDU_SCRIPT.test(text) ? "ur" : out.language,
    engine: "claude",
  };
}

export async function understand(text: string, districts: District[], preferredLang?: Lang): Promise<Understanding> {
  const result = await understandAny(text, districts);
  return preferredLang ? { ...result, lang: preferredLang } : result;
}

async function understandAny(text: string, districts: District[]): Promise<Understanding> {
  const rules = understandWithRules(text, districts);
  if (!claudeEnabled()) return rules;
  try {
    const ai = await understandWithClaude(text, districts);
    if (!ai) return rules;
    // Keep anything the keyword parser found that Claude left out.
    return {
      ...ai,
      district: ai.district ?? rules.district,
      places: ai.places.length ? ai.places : rules.places,
      depthM: ai.depthM ?? rules.depthM,
      depthAsSaid: ai.depthAsSaid ?? rules.depthAsSaid,
      sourceType: ai.sourceType ?? rules.sourceType,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.warn(`[whatsapp] Claude API ${error.status}:`, error.message);
    else console.warn("[whatsapp] Claude unavailable, using keyword parser:", error);
    return rules;
  }
}
