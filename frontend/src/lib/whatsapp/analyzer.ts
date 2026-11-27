// Rule-based message analyzer: reads the words of any message (English, Roman Urdu,
// Urdu), tolerates spelling mistakes, and scores which topics the user is asking about.
// It lets the bot answer free-form questions instead of going silent.

export type Topic =
  | "greeting"
  | "thanks"
  | "bye"
  | "identity"
  | "smalltalk"
  | "quality"
  | "health"
  | "trend"
  | "depth"
  | "install"
  | "report"
  | "pump_trouble"
  | "conservation"
  | "irrigation"
  | "solar"
  | "cost"
  | "government"
  | "rain"
  | "impact"
  | "about_app";

// Words and phrases per topic. Roman Urdu spellings vary a lot; repeated letters are
// collapsed before matching ("paani" = "pani", "khaara" = "khara") and small typos are forgiven.
const TOPIC_WORDS: Record<Topic, string[]> = {
  greeting: ["hi", "hello", "hey", "salam", "salaam", "assalam", "assalamualaikum", "aoa", "adaab", "السلام", "سلام", "ہیلو", "good morning"],
  thanks: ["thanks", "thank", "thankyou", "shukriya", "shukria", "meharbani", "jazakallah", "شکریہ", "مہربانی", "جزاک"],
  bye: ["bye", "goodbye", "allah hafiz", "khuda hafiz", "phir milenge", "اللہ حافظ", "خدا حافظ"],
  identity: ["kaun ho", "kon ho", "who are you", "tum kya ho", "aap kaun", "apna naam", "your name", "bot ho", "insaan ho", "کون ہو", "آپ کون"],
  smalltalk: ["kaise ho", "kese ho", "kaisay ho", "how are you", "kya haal", "kia haal", "theek ho", "کیسے ہو", "کیا حال"],
  quality: [
    "khara", "kharra", "meetha", "mitha", "namkeen", "namak", "salty", "brackish", "sweet water", "quality", "safe", "saaf", "saf",
    "ganda", "gandla", "peene", "pine", "drink", "drinking", "tds", "arsenic", "sankhiya", "fluoride", "bacteria", "germs",
    "filter", "boil", "ubal", "ubalna", "test", "lab", "keetanu", "کھارا", "میٹھا", "نمکین", "صاف", "گندا", "پینے", "آرسینک", "فلٹر", "ٹیسٹ",
  ],
  health: ["bimar", "bemar", "bimari", "pait", "pet dard", "dast", "diarrhea", "cholera", "typhoid", "hepatitis", "yarqan", "sick", "doctor", "بیمار", "بیماری", "پیٹ", "دست"],
  trend: [
    "trend", "future", "aage", "agle", "aanay wale", "anay wale", "ayenda", "forecast", "prediction", "predict", "girna", "gir raha",
    "gir rahi", "neeche ja", "kam ho raha", "khatam", "khatm", "decline", "falling", "drop", "sookh", "sukh", "sukha", "sookha", "dry",
    "10 saal", "saal baad", "years", "آگے", "مستقبل", "گر رہا", "ختم", "سوکھ", "خشک", "پیشگوئی",
  ],
  depth: ["gehra", "gehrai", "ghera", "gahra", "deep", "depth", "level", "satah", "satha", "water table", "kitne foot", "kitne feet", "گہرا", "گہرائی", "سطح"],
  install: [
    "lagana", "lagwana", "lagvana", "lagwani", "karwana", "install", "drill", "boring karwani", "naya bore", "new bore", "naya tube well",
    "bore plan", "لگانا", "لگوانا", "نیا بور",
  ],
  report: ["reading", "report", "submit", "darj", "record", "meri reading", "naap", "naapa", "measure", "ریڈنگ", "رپورٹ", "درج", "ناپ"],
  pump_trouble: [
    "motor", "pump", "hawa", "air", "paani nahi aa", "pani nahi aa", "pani kam", "kam pani", "pani band", "nahi kheench", "kheenchti",
    "kheench", "khrab", "kharab", "kharaab", "chal nahi", "band ho", "voltage", "bijli", "ret", "sand", "mitti aa", "foot valve",
    "valve", "leak", "jam", "fail", "kaam nahi", "موٹر", "پمپ", "ہوا", "خراب", "پانی نہیں", "پانی کم", "ریت", "بجلی",
  ],
  conservation: [
    "bachana", "bachaen", "bachayen", "bachat", "save water", "saving", "recharge", "recharge pit", "soakage", "zaya", "waste",
    "conserve", "conservation", "rainwater", "harvesting", "barish ka pani jama", "بچانا", "بچت", "ری چارج", "ضائع",
  ],
  irrigation: [
    "fasal", "fasl", "crop", "crops", "kheti", "khet", "irrigation", "aabpashi", "abpashi", "chawal", "dhaan", "dhan", "rice", "gandum",
    "wheat", "kapas", "cotton", "ganna", "sugarcane", "makki", "maize", "sabzi", "vegetables", "drip", "sprinkler", "laser", "فصل",
    "کھیت", "آبپاشی", "چاول", "دھان", "گندم", "کپاس", "گنا", "مکئی", "سبزی",
  ],
  solar: ["solar", "panel", "panels", "plate", "plates", "inverter", "dhoop", "سولر", "پینل", "انورٹر"],
  cost: ["cost", "price", "kharcha", "kharch", "qeemat", "keemat", "rate", "paisa", "paise", "rupees", "rupay", "budget", "sasta", "mehenga", "کتنے پیسے", "خرچہ", "قیمت", "روپے"],
  government: ["government", "hukumat", "sarkar", "sarkari", "subsidy", "scheme", "loan", "qarz", "complaint", "shikayat", "wasa", "irrigation department", "حکومت", "سرکاری", "سبسڈی", "سکیم", "شکایت"],
  rain: ["barish", "baarish", "barsat", "rain", "monsoon", "sailab", "flood", "baadal", "بارش", "برسات", "مون سون", "سیلاب"],
  impact: [
    "dobara bore", "dobara boring", "re bore", "rebore", "redrill", "bore fail", "bore sookh", "bore sukh", "bore khatam",
    "kitna pani nikalta", "kitna paani nikalta", "kitna pani nikalega", "pani nikalta", "nikalta hai", "withdrawal", "withdraw",
    "extraction", "nikasi", "asar", "impact", "nuqsan", "nuksan", "depletion", "دوبارہ بور", "کتنا پانی نکلتا", "اثر", "نقصان",
  ],
  about_app: ["aqualedger", "aqua ledger", "website", "app", "account", "login", "sign up", "signup", "password", "ویب سائٹ", "اکاؤنٹ"],
};

const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");
const URDU = /[؀-ۿ]/;

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedTypos = (word: string) => (word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0);

type Entry = { topic: Topic; raw: string; norm: string; phrase: boolean };
const ENTRIES: Entry[] = Object.entries(TOPIC_WORDS).flatMap(([topic, words]) =>
  words.map((raw) => ({ topic: topic as Topic, raw, norm: collapse(raw.toLowerCase()), phrase: raw.includes(" ") || URDU.test(raw) }))
);
const SINGLE_WORDS = ENTRIES.filter((e) => !e.phrase);

export type Analysis = {
  /** Topics ranked by how strongly the message points at them. */
  topics: { topic: Topic; score: number; words: string[] }[];
  /** Words of the message that matched the vocabulary (for "I noticed: …"). */
  noticed: string[];
};

export function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True when a word is (or is a near-misspelling of) a topic word, so it is not a place name. */
export function isVocabularyWord(word: string) {
  const w = collapse(word.toLowerCase());
  if (w.length < 2) return false;
  const typos = allowedTypos(w);
  return SINGLE_WORDS.some((e) => e.norm === w || (typos > 0 && e.norm[0] === w[0] && editDistance(w, e.norm, typos) <= typos));
}

export function analyze(text: string): Analysis {
  const lower = text.toLowerCase();
  const normText = ` ${collapse(tokens(text).join(" "))} `;
  const words = tokens(text);
  const scores = new Map<Topic, { score: number; words: Set<string> }>();
  const noticed = new Set<string>();
  const add = (topic: Topic, score: number, word: string) => {
    const entry = scores.get(topic) ?? { score: 0, words: new Set<string>() };
    entry.score += score;
    entry.words.add(word);
    scores.set(topic, entry);
    noticed.add(word);
  };

  // Phrases and Urdu words: substring match.
  for (const e of ENTRIES) {
    if (!e.phrase) continue;
    if (URDU.test(e.raw) ? lower.includes(e.raw) : normText.includes(` ${e.norm} `)) add(e.topic, 2, e.raw);
  }
  // Single words: exact first, then a near match for typos.
  for (const word of words) {
    const w = collapse(word);
    if (w.length < 2 || URDU.test(w)) continue;
    let matched = false;
    for (const e of SINGLE_WORDS) {
      if (e.norm === w) {
        add(e.topic, 1.5, word);
        matched = true;
      }
    }
    if (matched) continue;
    const typos = allowedTypos(w);
    if (!typos) continue;
    for (const e of SINGLE_WORDS) {
      // Typos keep the first letter ("tubwel" ~ "tubewell"), which avoids "kaise" ~ "paise".
      if (e.norm.length >= 4 && e.norm[0] === w[0] && editDistance(w, e.norm, typos) <= typos) add(e.topic, 1, word);
    }
  }

  const topics = [...scores.entries()]
    .map(([topic, v]) => ({ topic, score: v.score, words: [...v.words] }))
    .sort((a, b) => b.score - a.score);
  return { topics, noticed: [...noticed] };
}

export const hasTopic = (a: Analysis, topic: Topic, minScore = 1) => a.topics.some((t) => t.topic === topic && t.score >= minScore);
