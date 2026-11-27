// Groundwater facts the WhatsApp bot answers from: census districts, observation
// wells and the community readings in Supabase.
import {
  readCommunityWaterAreaRisks,
  readPublicAreaSourceTrends,
} from "@/lib/community-water-reports";
import { forecastDepth } from "@/lib/depth-analytics";

type Ring = [number, number][];
type CensusFeature = {
  properties: {
    name: string;
    province: string;
    censusDistricts: string;
    mouzas: number;
    medianDepthFt: number | null;
    p75DepthFt: number | null;
    brackishPct: number | null;
  };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
};
type WellSite = {
  id: string;
  lon: number;
  lat: number;
  trend: number | null;
  n: number;
  firstYear: number;
  lastYear: number;
  firstDepth: number;
  lastDepth: number;
};

export type District = {
  name: string;
  province: string;
  provinceShort: string;
  mouzas: number;
  medianDepthFt: number | null;
  p75DepthFt: number | null;
  brackishPct: number | null;
  polygons: Ring[][];
};

export type WellStats = {
  count: number;
  withTrend: number;
  deepeningPct: number | null;
  medianTrendM: number | null;
  medianLastDepthM: number | null;
  firstYear: number | null;
  lastYear: number | null;
};

export type NearestWell = { id: string; km: number; lastDepthM: number; lastYear: number; trendM: number | null };

export type CommunityStats = {
  areaKey: string;
  reports: number;
  averageDepthM: number | null;
  riskLevel: string | null;
  latestMonth: string | null;
};

const PROVINCE_SHORT: Record<string, string> = {
  Punjab: "Punjab",
  Sindh: "Sindh",
  Balochistan: "Balochistan",
  "Khyber Pakhtunkhwa": "KP",
  "Islamabad Capital Territory": "ICT",
  "Gilgit Baltistan": "GB",
  "Azad Jammu And Kashmir": "AJK",
};

// Towns, new districts and other spellings → the census district that covers them.
const EXTRA_ALIASES: Record<string, string[]> = {
  Sheikhpura: ["sheikhupura", "shekhupura", "muridke", "ferozewala", "nankana", "nankana sahib", "sharakpur", "sangla hill"],
  Vihari: ["vehari", "burewala", "mailsi"],
  Layyah: ["leiah", "karor lal esan", "chaubara"],
  Jhang: ["chiniot", "shorkot", "athara hazari", "lalian", "bhawana"],
  Nawabshah: ["shaheed benazirabad", "benazirabad", "sakrand"],
  "Islamabad Capital Territory": ["islamabad"],
  "Dera Ghazi Khan": ["dg khan", "d g khan", "d.g khan", "d.g. khan", "taunsa"],
  "Dera Ismail Khan": ["di khan", "d i khan", "d.i khan", "d.i. khan"],
  "Rahim Yar Khan": ["rahimyar khan", "rahim yar", "sadiqabad", "khanpur", "liaqatpur"],
  "Toba Tek Singh": ["toba", "gojra", "kamalia", "pir mahal"],
  Kasur: ["pattoki", "chunian", "kot radha kishan", "kot radha kishen"],
  Okara: ["depalpur", "dipalpur", "renala khurd", "renala", "haveli lakha"],
  Sahiwal: ["chichawatni"],
  Pakpattan: ["arifwala", "arif wala"],
  Khanewal: ["mian channu", "kabirwala", "jahanian"],
  Bahawalpur: ["ahmadpur east", "ahmedpur east", "hasilpur", "yazman", "khairpur tamewali"],
  Bahawalnagar: ["chishtian", "haroonabad", "fort abbas", "minchinabad"],
  Muzaffargarh: ["kot addu", "alipur", "jatoi"],
  Gujranwala: ["kamoke", "wazirabad", "nowshera virkan"],
  Sialkot: ["daska", "pasrur", "sambrial"],
  Gujrat: ["kharian", "lalamusa", "lala musa"],
  Rawalpindi: ["pindi", "taxila", "murree", "gujar khan", "kahuta"],
  Chakwal: ["talagang", "tala gang"],
  Sargodha: ["bhalwal", "shahpur", "sillanwali", "kot momin", "bhera"],
  Faisalabad: ["jaranwala", "samundri", "summundri", "chak jhumra", "tandlianwala", "lyallpur"],
  Multan: ["shujabad", "jalalpur pirwala"],
  Lodhran: ["dunyapur", "kahror pacca"],
  "Mandi Bahauddin": ["mandi bahauddin", "mandi bahaudin", "phalia", "malakwal"],
  Narowal: ["shakargarh", "zafarwal"],
  Hafizabad: ["pindi bhattian"],
  Mianwali: ["isa khel", "piplan"],
  Attock: ["fateh jang", "hasan abdal", "pindi gheb"],
  Karachi: ["malir", "korangi"],
  Hyderabad: ["latifabad", "qasimabad"],
  Mirpurkhas: ["mirpur khas"],
  Sukkur: ["rohri"],
  Swat: ["mingora"],
  Mardan: ["takht bhai"],
  Abbottabad: ["havelian"],
  "Qambar Shahdadkot": ["larkana", "qambar", "shahdadkot"],
  Kech: ["turbat"],
  Kachhi: ["bolan"],
  Jafarabad: ["dera allah yar"],
  "Azad Kashmir": ["ajk", "muzaffarabad", "azad jammu"],
  Skardu: ["baltistan"],
  Rajanpur: ["jampur", "rojhan"],
  Bhakkar: ["kalur kot", "darya khan"],
  Khushab: ["quaidabad", "jauharabad"],
};

// Urdu-script names, for voice notes that Whisper writes in Urdu.
const URDU_NAMES: Record<string, string[]> = {
  Lahore: ["لاہور"],
  Faisalabad: ["فیصل آباد", "فیصلآباد", "لائلپور"],
  Multan: ["ملتان"],
  Rawalpindi: ["راولپنڈی", "پنڈی"],
  "Islamabad Capital Territory": ["اسلام آباد"],
  Gujranwala: ["گوجرانوالہ", "گوجرانوالا"],
  Sialkot: ["سیالکوٹ"],
  Sargodha: ["سرگودھا"],
  Bahawalpur: ["بہاولپور"],
  Bahawalnagar: ["بہاولنگر"],
  "Rahim Yar Khan": ["رحیم یار خان"],
  Okara: ["اوکاڑہ", "اوکاڑا", "دیپالپور"],
  Kasur: ["قصور", "پتوکی", "چونیاں"],
  Sheikhpura: ["شیخوپورہ", "مریدکے", "ننکانہ"],
  Sahiwal: ["ساہیوال", "چیچہ وطنی"],
  Pakpattan: ["پاکپتن", "عارف والا"],
  Vihari: ["وہاڑی", "بورے والا", "بوریوالا"],
  Khanewal: ["خانیوال", "میاں چنوں"],
  Lodhran: ["لودھراں"],
  Muzaffargarh: ["مظفرگڑھ", "مظفر گڑھ"],
  "Dera Ghazi Khan": ["ڈیرہ غازی خان"],
  Rajanpur: ["راجن پور"],
  Layyah: ["لیہ"],
  Bhakkar: ["بھکر"],
  Mianwali: ["میانوالی"],
  Khushab: ["خوشاب"],
  Jhang: ["جھنگ", "چنیوٹ"],
  "Toba Tek Singh": ["ٹوبہ ٹیک سنگھ", "گوجرہ"],
  Hafizabad: ["حافظ آباد"],
  "Mandi Bahauddin": ["منڈی بہاؤالدین", "منڈی بہاوالدین"],
  Gujrat: ["گجرات"],
  Jhelum: ["جہلم"],
  Chakwal: ["چکوال"],
  Attock: ["اٹک"],
  Narowal: ["نارووال"],
  Karachi: ["کراچی"],
  Hyderabad: ["حیدرآباد", "حیدر آباد"],
  Sukkur: ["سکھر"],
  "Qambar Shahdadkot": ["لاڑکانہ", "قمبر"],
  Nawabshah: ["نوابشاہ", "نواب شاہ"],
  Mirpurkhas: ["میرپورخاص", "میرپور خاص"],
  Tharparkar: ["تھرپارکر", "تھر"],
  Dadu: ["دادو"],
  Badin: ["بدین"],
  Thatta: ["ٹھٹھہ"],
  Sanghar: ["سانگھڑ"],
  Ghotki: ["گھوٹکی"],
  Khairpur: ["خیرپور"],
  Jacobabad: ["جیکب آباد"],
  Shikarpur: ["شکارپور"],
  Peshawar: ["پشاور"],
  Mardan: ["مردان"],
  Swat: ["سوات"],
  Abbottabad: ["ایبٹ آباد"],
  Kohat: ["کوہاٹ"],
  Bannu: ["بنوں"],
  "Dera Ismail Khan": ["ڈیرہ اسماعیل خان"],
  Nowshera: ["نوشہرہ"],
  Charsadda: ["چارسدہ"],
  Swabi: ["صوابی"],
  Quetta: ["کوئٹہ"],
  Gwadar: ["گوادر"],
  Khuzdar: ["خضدار"],
  Gilgit: ["گلگت"],
  Skardu: ["سکردو"],
  "Azad Kashmir": ["مظفرآباد", "آزاد کشمیر"],
};

// Census names that are also everyday words ("tank", "nagar") are only matched in Urdu or via Claude.
const AMBIGUOUS = new Set(["tank", "nagar", "khyber", "kurram"]);

const CENSUS_PATH = "/data/pakistan-groundwater-census-2020.geojson";
const WELLS_PATH = "/data/pakistan-observation-wells.json";

let districtsPromise: Promise<District[]> | null = null;
let wellsPromise: Promise<WellSite[]> | null = null;
const wellStatsCache = new Map<string, WellStats>();

async function fetchJson<T>(origin: string, path: string): Promise<T> {
  const res = await fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  return (await res.json()) as T;
}

export function loadDistricts(origin: string): Promise<District[]> {
  districtsPromise ??= fetchJson<{ features: CensusFeature[] }>(origin, CENSUS_PATH)
    .then((json) =>
      json.features.map((f) => ({
        name: f.properties.name,
        province: f.properties.province,
        provinceShort: PROVINCE_SHORT[f.properties.province] ?? f.properties.province,
        mouzas: f.properties.mouzas,
        medianDepthFt: f.properties.medianDepthFt,
        p75DepthFt: f.properties.p75DepthFt,
        brackishPct: f.properties.brackishPct,
        polygons: f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
      }))
    )
    .catch((error) => {
      districtsPromise = null;
      throw error;
    });
  return districtsPromise;
}

function loadWells(origin: string): Promise<WellSite[]> {
  wellsPromise ??= fetchJson<{ sites: WellSite[] }>(origin, WELLS_PATH)
    .then((json) => json.sites)
    .catch((error) => {
      wellsPromise = null;
      throw error;
    });
  return wellsPromise;
}

const normalizeLatin = (text: string) =>
  ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const normalizeUrdu = (text: string) => text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ہ");

/** Finds the census district named in free text (English, Roman Urdu or Urdu script). */
export function matchDistrict(text: string, districts: District[]): District | null {
  if (!text.trim()) return null;
  const latin = normalizeLatin(text);
  const urdu = normalizeUrdu(text);
  let best: { district: District; length: number } | null = null;
  const consider = (district: District | undefined, alias: string, found: boolean) => {
    if (district && found && (!best || alias.length > best.length)) best = { district, length: alias.length };
  };
  const byName = new Map(districts.map((d) => [d.name, d]));
  for (const district of districts) {
    const names = [district.name, ...district.name.split(/\s*,\s*/)];
    for (const name of names) {
      const alias = name.toLowerCase();
      if (AMBIGUOUS.has(alias)) continue;
      consider(district, alias, latin.includes(` ${normalizeLatin(alias).trim()} `));
    }
  }
  for (const [name, aliases] of Object.entries(EXTRA_ALIASES)) {
    for (const alias of aliases) consider(byName.get(name), alias, latin.includes(` ${normalizeLatin(alias).trim()} `));
  }
  for (const [name, aliases] of Object.entries(URDU_NAMES)) {
    for (const alias of aliases) consider(byName.get(name), alias, urdu.includes(normalizeUrdu(alias)));
  }
  return (best as { district: District } | null)?.district ?? null;
}

function pointInRing([x, y]: [number, number], ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inDistrict(point: [number, number], district: District) {
  return district.polygons.some(
    (polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole))
  );
}

export function districtAt(lat: number, lon: number, districts: District[]): District | null {
  return districts.find((d) => inDistrict([lon, lat], d)) ?? null;
}

/** District for a map point; points on a border gap snap to the nearest district within ~15 km. */
function districtContaining(place: { lat: number; lon: number }, districts: District[]): District | null {
  const inside = districtAt(place.lat, place.lon, districts);
  if (inside) return inside;
  let best: { district: District; km: number } | null = null;
  for (const district of districts) {
    for (const polygon of district.polygons) {
      for (const [lon, lat] of polygon[0]) {
        const km = distanceKm(place.lat, place.lon, lat, lon);
        if (!best || km < best.km) best = { district, km };
      }
    }
  }
  return best && best.km <= 15 ? best.district : null;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export async function wellStatsFor(district: District, origin: string): Promise<WellStats> {
  const cached = wellStatsCache.get(district.name);
  if (cached) return cached;
  const wells = (await loadWells(origin)).filter((w) => inDistrict([w.lon, w.lat], district));
  const trends = wells.map((w) => w.trend).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  const stats: WellStats = {
    count: wells.length,
    withTrend: trends.length,
    deepeningPct: trends.length ? Math.round((trends.filter((t) => t > 0).length / trends.length) * 100) : null,
    medianTrendM: median(trends),
    medianLastDepthM: median(wells.map((w) => w.lastDepth).filter(Number.isFinite)),
    firstYear: wells.length ? Math.min(...wells.map((w) => w.firstYear)) : null,
    lastYear: wells.length ? Math.max(...wells.map((w) => w.lastYear)) : null,
  };
  wellStatsCache.set(district.name, stats);
  return stats;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export async function nearestWell(lat: number, lon: number, origin: string): Promise<NearestWell | null> {
  let best: NearestWell | null = null;
  for (const w of await loadWells(origin)) {
    const km = distanceKm(lat, lon, w.lat, w.lon);
    if (!best || km < best.km) best = { id: w.id, km, lastDepthM: w.lastDepth, lastYear: w.lastYear, trendM: w.trend };
  }
  return best;
}

export type NearbyWells = {
  radiusKm: number;
  count: number;
  medianLastDepthM: number | null;
  deepeningPct: number | null;
  medianTrendM: number | null;
  lastYear: number | null;
};

/** Monitoring wells around a point: the "surroundings" of a town, not the whole district. */
export async function wellsNear(lat: number, lon: number, origin: string, radiusKm = 20): Promise<NearbyWells> {
  const wells = (await loadWells(origin)).filter((w) => distanceKm(lat, lon, w.lat, w.lon) <= radiusKm);
  const trends = wells.map((w) => w.trend).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  return {
    radiusKm,
    count: wells.length,
    medianLastDepthM: median(wells.map((w) => w.lastDepth).filter(Number.isFinite)),
    deepeningPct: trends.length ? Math.round((trends.filter((t) => t > 0).length / trends.length) * 100) : null,
    medianTrendM: median(trends),
    lastYear: wells.length ? Math.max(...wells.map((w) => w.lastYear)) : null,
  };
}

// ---------- Place search (OpenStreetMap Nominatim) ----------
// Only the place name the user typed is sent, never their phone number or GPS position.

export type FoundPlace = {
  query: string;
  name: string;
  lat: number;
  lon: number;
  countryCode: string;
  country: string;
  /** Higher = more specific (village > town > city > district). */
  rank: number;
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const placeCache = new Map<string, FoundPlace | null>();
let lastNominatimCall = 0;

async function nominatim(query: string, pakistanOnly: boolean, settlementOnly = false): Promise<FoundPlace | null> {
  const key = `${pakistanOnly ? "pk" : "all"}|${settlementOnly ? "s" : ""}|${query.toLowerCase()}`;
  if (placeCache.has(key)) return placeCache.get(key)!;
  // Nominatim's usage policy allows about one request per second.
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimCall = Date.now();
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  if (pakistanOnly) url.searchParams.set("countrycodes", "pk");
  // Prefer the town itself over a tehsil or district boundary with the same name.
  if (settlementOnly) url.searchParams.set("featureType", "settlement");
  const res = await fetch(url, {
    headers: { "User-Agent": "AquaLedger-groundwater-bot/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
  const [hit] = (await res.json()) as {
    lat: string;
    lon: string;
    name?: string;
    display_name?: string;
    place_rank?: number;
    address?: { country?: string; country_code?: string };
  }[];
  const place: FoundPlace | null = hit
    ? {
        query,
        // Show the name the way the user wrote it when the map's name just adds "City Tehsil" etc.
        name: displayName(query, hit.name || hit.display_name?.split(",")[0] || query),
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        countryCode: (hit.address?.country_code ?? "").toLowerCase(),
        country: hit.address?.country ?? "",
        rank: hit.place_rank ?? 0,
      }
    : null;
  placeCache.set(key, place);
  return place;
}

function displayName(query: string, found: string) {
  const q = query.trim();
  if (/[^\x00-\x7F]/.test(q)) return found; // Urdu input: use the map's English name
  return found.toLowerCase().startsWith(q.toLowerCase()) ? q.replace(/\b\w/g, (c) => c.toUpperCase()) : found;
}

export type PlaceCheck =
  | { status: "pakistan"; place: FoundPlace; district: District | null }
  | { status: "abroad"; place: FoundPlace }
  | { status: "not_found"; query: string }
  | { status: "unavailable"; query: string };

/** Looks a place up on the map and checks whether it is inside Pakistan. */
export async function checkPlace(query: string, districts: District[]): Promise<PlaceCheck> {
  try {
    // A town first; otherwise any place, but not a shop, school or building that happens to share the words.
    const general = (await nominatim(query, true, true)) ? null : await nominatim(query, true);
    const local = (await nominatim(query, true, true)) ?? (general && general.rank <= 22 ? general : null);
    if (local && local.rank < 19) return { status: "pakistan", place: local, district: districtContaining(local, districts) };
    // Only a tiny village matched inside Pakistan: make sure the name is not a big city elsewhere ("Delhi", "Dubai").
    const anywhere = await nominatim(query, false);
    if (local && !(anywhere && anywhere.countryCode !== "pk" && anywhere.rank <= 16)) {
      return { status: "pakistan", place: local, district: districtContaining(local, districts) };
    }
    if (anywhere && anywhere.countryCode !== "pk") return { status: "abroad", place: anywhere };
    return { status: "not_found", query };
  } catch (error) {
    console.warn("[whatsapp] place search unavailable:", error);
    return { status: "unavailable", query };
  }
}

/** Area label in the same "City, Province" form the website stores reports under. */
export function areaLabel(district: District) {
  if (district.name === "Islamabad Capital Territory") return "Islamabad, ICT";
  return `${district.name}, ${district.provinceShort}`;
}

/** Community readings for a district, matched by the same alias rules as the text matcher. */
export async function communityStatsFor(district: District, districts: District[]): Promise<CommunityStats | null> {
  const [risks, trends] = await Promise.all([
    readCommunityWaterAreaRisks().catch(() => []),
    readPublicAreaSourceTrends().catch(() => []),
  ]);
  const memo = new Map<string, boolean>();
  const belongs = (areaKey: string | null | undefined) => {
    if (!areaKey) return false;
    let hit = memo.get(areaKey);
    if (hit === undefined) {
      hit = matchDistrict(areaKey.split(",")[0], districts)?.name === district.name;
      memo.set(areaKey, hit);
    }
    return hit;
  };

  let reports = 0;
  let depthWeight = 0;
  let depthSum = 0;
  let latestMonth: string | null = null;
  let areaKey = "";
  for (const row of trends) {
    if (!belongs(row.areaKey)) continue;
    areaKey ||= row.areaKey;
    reports += row.reportCount;
    if (row.averageDepthM != null && row.reportCount > 0) {
      depthSum += row.averageDepthM * row.reportCount;
      depthWeight += row.reportCount;
    }
    if (row.sampleMonth && (!latestMonth || row.sampleMonth > latestMonth)) latestMonth = row.sampleMonth;
  }
  const risk = risks.filter((r) => belongs(r.areaKey)).sort((a, b) => b.reportCount - a.reportCount)[0];
  if (!reports && !risk) return null;
  return {
    areaKey: areaKey || risk?.areaKey || areaLabel(district),
    reports: reports || risk?.reportCount || 0,
    averageDepthM: depthWeight ? depthSum / depthWeight : null,
    riskLevel: risk?.riskLevel ?? null,
    latestMonth,
  };
}

export type CommunityForecast = {
  /** Metres per year; positive = water going deeper. */
  slopePerYearM: number;
  latestDepthM: number;
  depthInSixMonthsM: number;
  confidence: "Low" | "Moderate" | "Higher";
  lastMonth: string;
  readings: number;
};

/** The website's own forecast model, run on the district's Supabase readings. */
export async function communityForecastFor(district: District, districts: District[]): Promise<CommunityForecast | null> {
  const trends = await readPublicAreaSourceTrends().catch(() => []);
  const months = new Map<string, { sum: number; weight: number }>();
  let readings = 0;
  for (const row of trends) {
    if (!row.sampleMonth || row.averageDepthM == null || row.reportCount <= 0) continue;
    if (matchDistrict(String(row.areaKey ?? "").split(",")[0], districts)?.name !== district.name) continue;
    const month = row.sampleMonth.slice(0, 7);
    const bucket = months.get(month) ?? { sum: 0, weight: 0 };
    bucket.sum += row.averageDepthM * row.reportCount;
    bucket.weight += row.reportCount;
    months.set(month, bucket);
    readings += row.reportCount;
  }
  const points = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({ month, depth: Number((b.sum / b.weight).toFixed(2)), readings: b.weight }));
  const forecast = forecastDepth(points);
  if (!forecast) return null;
  return {
    slopePerYearM: forecast.slopePerMonth * 12,
    latestDepthM: points[points.length - 1].depth,
    depthInSixMonthsM: forecast.depthInSixMonths,
    confidence: forecast.confidence,
    lastMonth: forecast.lastMonth,
    readings,
  };
}

/** Every district name, for the language model's prompt. */
export function districtNames(districts: District[]) {
  return districts.map((d) => `${d.name} (${d.provinceShort})`).sort().join(", ");
}
