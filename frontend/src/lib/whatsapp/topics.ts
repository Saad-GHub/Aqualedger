// Answers for free-form questions the analyzer recognises. Place-aware topics use the
// district's census, monitoring-well and Supabase data when the user names a place.
import { depthM } from "@/lib/units";
import {
  areaLabel,
  communityForecastFor,
  wellStatsFor,
  type District,
} from "@/lib/whatsapp/knowledge";
import type { Topic } from "@/lib/whatsapp/analyzer";
import type { Lang } from "@/lib/whatsapp/understand";

const t = (lang: Lang, en: string, roman: string, ur: string) => (lang === "ur" ? ur : lang === "roman" ? roman : en);

export type TopicContext = { lang: Lang; siteUrl: string; origin: string; district: District | null; districts: District[] };

/** Topics with a ready answer (others are handled by the main bot flows). */
export const ANSWERABLE: Topic[] = [
  "pump_trouble",
  "quality",
  "health",
  "trend",
  "conservation",
  "irrigation",
  "solar",
  "cost",
  "government",
  "rain",
  "impact",
  "about_app",
  "identity",
  "smalltalk",
  "thanks",
  "bye",
];

const askPlace = (lang: Lang) =>
  t(
    lang,
    "Tell me your town or district (or share 📍 location) and I will add the numbers for your area.",
    "Apna shehar ya zila batayein (ya 📍 location bhejein) to main aap ke ilaqe ke numbers bhi bata doon.",
    "اپنا شہر یا ضلع بتائیں (یا 📍 لوکیشن بھیجیں) تو میں آپ کے علاقے کے اعداد بھی بتا دوں۔"
  );

export async function answerTopic(topic: Topic, ctx: TopicContext): Promise<string> {
  const { lang, district } = ctx;
  switch (topic) {
    case "identity":
      return t(
        lang,
        "I am *Aqua Chatbot* 💧. Ask me about water levels, trends, water quality or a new bore anywhere in Pakistan.",
        "Main *Aqua Chatbot* hoon 💧. Pakistan mein kahin ka bhi paani ki satah, trend, quality ya naye bore ke baare mein poochein.",
        "میں *ایکوا چیٹ بوٹ* ہوں 💧۔ پاکستان میں کہیں کا بھی پانی کی سطح، رجحان، معیار یا نئے بور کے بارے میں پوچھیں۔"
      );
    case "smalltalk":
      return t(
        lang,
        "I'm well, thank you! 😊 How can I help with your water today?",
        "Main theek hoon, shukriya! 😊 Aaj paani ke baare mein kya madad karoon?",
        "میں ٹھیک ہوں، شکریہ! 😊 آج پانی کے بارے میں کیا مدد کروں؟"
      );
    case "thanks":
      return t(lang, "You're welcome! 💧 Ask any time.", "Koi baat nahi! 💧 Jab chahein poochein.", "کوئی بات نہیں! 💧 جب چاہیں پوچھیں۔");
    case "bye":
      return t(lang, "Allah Hafiz! 💧 Save water, and send your reading every 3 months.", "Allah Hafiz! 💧 Paani bachayein, aur har 3 mahine reading bhejein.", "اللہ حافظ! 💧 پانی بچائیں، اور ہر 3 ماہ ریڈنگ بھیجیں۔");

    case "pump_trouble":
      return [
        t(lang, "🔧 *When the pump gives little or no water*", "🔧 *Jab motor paani kam de ya na de*", "🔧 *جب موٹر پانی کم دے یا نہ دے*"),
        t(
          lang,
          "1. *Water level fell below the pump*: the most common cause in summer. The pump (or suction pipe) must be lowered a few feet.",
          "1. *Paani pump se neeche chala gaya*: garmiyon mein sab se aam wajah. Pump (ya suction pipe) ko kuch foot neeche karna padega.",
          "1. *پانی پمپ سے نیچے چلا گیا*: گرمیوں میں سب سے عام وجہ۔ پمپ (یا سکشن پائپ) کو کچھ فٹ نیچے کرنا پڑے گا۔"
        ),
        t(
          lang,
          "2. *Air in the line*: refill (prime) the pump and check the foot valve and joints for leaks.",
          "2. *Pipe mein hawa*: pump ko dobara bharen (priming) aur foot valve aur joints ki leakage check karein.",
          "2. *پائپ میں ہوا*: پمپ کو دوبارہ بھریں اور فٹ والو اور جوڑوں کی لیکیج چیک کریں۔"
        ),
        t(
          lang,
          "3. *Low voltage*: the motor hums but lifts little. Check voltage before running it.",
          "3. *Kam voltage*: motor awaaz deti hai magar paani kam. Chalane se pehle voltage check karein.",
          "3. *کم وولٹیج*: موٹر آواز دیتی ہے مگر پانی کم۔ چلانے سے پہلے وولٹیج چیک کریں۔"
        ),
        t(
          lang,
          "4. *Sand or a clogged strainer*: sandy water means the bore's filter needs cleaning by a driller.",
          "4. *Ret ya band strainer*: paani mein ret aaye to driller se bore ka filter saaf karwayein.",
          "4. *ریت یا بند سٹرینر*: پانی میں ریت آئے تو ڈرلر سے بور کا فلٹر صاف کروائیں۔"
        ),
        "",
        t(
          lang,
          "📏 Measure the water level and send it to me (e.g. \"my bore water is at 90 feet in Kasur\"); I will compare it with your area.",
          "📏 Paani ki satah naap kar mujhe bhejein (maslan \"mera bore Kasur mein 90 foot par hai\"); main aap ke ilaqe se muqabla kar doon ga.",
          "📏 پانی کی سطح ناپ کر مجھے بھیجیں (مثلاً \"میرا بور قصور میں 90 فٹ پر ہے\")؛ میں آپ کے علاقے سے موازنہ کر دوں گا۔"
        ),
      ].join("\n");

    case "quality":
    case "health": {
      const lines: string[] = [];
      if (topic === "health") {
        lines.push(
          t(
            lang,
            "🩺 If someone is ill, please see a doctor first. I can only help with the water side.",
            "🩺 Agar koi bimar hai to pehle doctor ko dikhayein. Main sirf paani wali taraf madad kar sakta hoon.",
            "🩺 اگر کوئی بیمار ہے تو پہلے ڈاکٹر کو دکھائیں۔ میں صرف پانی والی طرف مدد کر سکتا ہوں۔"
          ),
          ""
        );
      }
      lines.push(t(lang, "🧪 *Is the water safe?*", "🧪 *Kya paani mehfooz hai?*", "🧪 *کیا پانی محفوظ ہے؟*"));
      if (district?.brackishPct != null) {
        lines.push(
          t(
            lang,
            `In *${areaLabel(district)}*, brackish (salty) groundwater was found in *${district.brackishPct}%* of villages (Census 2020).`,
            `*${areaLabel(district)}* mein *${district.brackishPct}%* mouzon mein khara paani mila (Census 2020).`,
            `*${areaLabel(district)}* میں *${district.brackishPct}%* موضعوں میں کھارا پانی ملا (مردم شماری 2020)۔`
          )
        );
      }
      lines.push(
        t(
          lang,
          "• Get a *TDS* test: below ~600 mg/L tastes fine, above ~1000 mg/L is not good for drinking.\n• In parts of Punjab and Sindh also test for *arsenic*. PCRWR water labs in major cities test samples.\n• Until tested: boil drinking water for 1 minute or use a proper filter.\n• Keep latrines and drains at least 15 m (50 ft) away from the bore.",
          "• *TDS* test karwayein: ~600 mg/L se kam theek, ~1000 mg/L se zyada peene ke liye acha nahi.\n• Punjab aur Sindh ke kuch hisson mein *arsenic* ka test bhi karwayein. Bare shehron mein PCRWR ki labs paani test karti hain.\n• Test hone tak: peene ka paani 1 minute ubaalein ya acha filter lagayein.\n• Latrine aur naliyan bore se kam az kam 15 m (50 ft) door rakhein.",
          "• *TDS* ٹیسٹ کروائیں: ~600 mg/L سے کم ٹھیک، ~1000 mg/L سے زیادہ پینے کے لیے اچھا نہیں۔\n• پنجاب اور سندھ کے کچھ حصوں میں *آرسینک* کا ٹیسٹ بھی کروائیں۔ بڑے شہروں میں PCRWR کی لیبز پانی ٹیسٹ کرتی ہیں۔\n• ٹیسٹ ہونے تک: پینے کا پانی 1 منٹ ابالیں یا اچھا فلٹر لگائیں۔\n• لیٹرین اور نالیاں بور سے کم از کم 15 میٹر (50 فٹ) دور رکھیں۔"
        )
      );
      if (!district) lines.push("", askPlace(lang));
      return lines.join("\n");
    }

    case "trend": {
      if (!district) {
        return [
          t(lang, "📉 *Is the water going down?*", "📉 *Kya paani neeche ja raha hai?*", "📉 *کیا پانی نیچے جا رہا ہے؟*"),
          t(
            lang,
            "Across Punjab's 3,311 monitoring wells, water fell in about 68% of them, typically by ~5.5 cm a year (1979–2010).",
            "Punjab ke 3,311 monitoring wells mein se taqreeban 68% mein paani neeche gaya, aam taur par ~5.5 cm saalana (1979–2010).",
            "پنجاب کے 3,311 مانیٹرنگ کنوؤں میں سے تقریباً 68% میں پانی نیچے گیا، عام طور پر ~5.5 سینٹی میٹر سالانہ (1979–2010)۔"
          ),
          "",
          askPlace(lang),
        ].join("\n");
      }
      const [wells, forecast] = await Promise.all([
        wellStatsFor(district, ctx.origin).catch(() => null),
        communityForecastFor(district, ctx.districts).catch(() => null),
      ]);
      const lines = [t(lang, `📉 *Water trend in ${areaLabel(district)}*`, `📉 *${areaLabel(district)} mein paani ka trend*`, `📉 *${areaLabel(district)} میں پانی کا رجحان*`)];
      if (wells && wells.medianTrendM != null) {
        const cm = Math.abs(wells.medianTrendM * 100);
        const down = wells.medianTrendM > 0;
        lines.push(
          t(
            lang,
            `• Monitoring wells (${wells.count}, records up to ${wells.lastYear}): ${down ? "falling" : "rising"} about *${cm.toFixed(1)} cm a year*; water dropped in ${wells.deepeningPct}% of wells.`,
            `• Monitoring wells (${wells.count}, ${wells.lastYear} tak): har saal taqreeban *${cm.toFixed(1)} cm ${down ? "neeche" : "upar"}*; ${wells.deepeningPct}% wells mein paani gira.`,
            `• مانیٹرنگ کنویں (${wells.count}، ${wells.lastYear} تک): ہر سال تقریباً *${cm.toFixed(1)} سینٹی میٹر ${down ? "نیچے" : "اوپر"}*؛ ${wells.deepeningPct}% کنوؤں میں پانی گرا۔`
          )
        );
        if (down) {
          lines.push(
            t(
              lang,
              `• At that pace: ~${depthM(wells.medianTrendM * 5)} deeper in 5 years, ~${depthM(wells.medianTrendM * 10)} in 10 years.`,
              `• Isi raftar se: 5 saal mein ~${depthM(wells.medianTrendM * 5)} aur 10 saal mein ~${depthM(wells.medianTrendM * 10)} mazeed gehra.`,
              `• اسی رفتار سے: 5 سال میں ~${depthM(wells.medianTrendM * 5)} اور 10 سال میں ~${depthM(wells.medianTrendM * 10)} مزید گہرا۔`
            )
          );
        }
      }
      if (forecast && forecast.confidence !== "Low") {
        const cm = Math.round(Math.abs(forecast.slopePerYearM) * 100);
        lines.push(
          t(
            lang,
            `• AquaLedger readings (Supabase, ${forecast.readings}): ${cm} cm/year ${forecast.slopePerYearM >= 0 ? "deeper" : "shallower"}; about ${depthM(forecast.depthInSixMonthsM)} expected in 6 months (confidence ${forecast.confidence}).`,
            `• AquaLedger readings (Supabase, ${forecast.readings}): har saal ${cm} cm ${forecast.slopePerYearM >= 0 ? "neeche" : "upar"}; 6 mahine mein taqreeban ${depthM(forecast.depthInSixMonthsM)} (bharosa ${forecast.confidence}).`,
            `• ایکوا لیجر ریڈنگز (Supabase، ${forecast.readings}): ہر سال ${cm} سینٹی میٹر ${forecast.slopePerYearM >= 0 ? "نیچے" : "اوپر"}؛ 6 ماہ میں تقریباً ${depthM(forecast.depthInSixMonthsM)} (اعتماد ${forecast.confidence})۔`
          )
        );
      }
      if (lines.length === 1) lines.push(t(lang, "Not enough trend data for this district yet.", "Is zile ke liye abhi trend ka kaafi data nahi.", "اس ضلع کے لیے ابھی رجحان کا کافی ڈیٹا نہیں۔"));
      lines.push(
        "",
        t(
          lang,
          "Planning a bore here? Type *new bore* and I'll size it for the coming 15 years.",
          "Yahan bore lagwana hai? *naya bore* likhein, main agle 15 saal ke hisaab se andaza bataun ga.",
          "یہاں بور لگوانا ہے؟ *نیا بور* لکھیں، میں اگلے 15 سال کے حساب سے اندازہ بتاؤں گا۔"
        )
      );
      return lines.join("\n");
    }

    case "conservation":
      return [
        t(lang, "💧 *Ways to save groundwater*", "💧 *Zameeni paani bachane ke tareeqe*", "💧 *زیرِ زمین پانی بچانے کے طریقے*"),
        t(
          lang,
          "• *Recharge pit*: a 1–2 m pit with gravel and sand near the bore sends rain and roof water back underground.\n• *Laser land levelling*: saves about a quarter of irrigation water.\n• *Drip / sprinkler* for orchards and vegetables.\n• Irrigate early morning or evening, and fix leaking channels and pipes.\n• Don't run the motor non-stop; use short spells.",
          "• *Recharge pit*: bore ke paas 1–2 m gehra gadha, bajri aur ret ke saath, baarish aur chhat ka paani wapas zameen mein bhejta hai.\n• *Laser se zameen hamwar* karwayein: taqreeban chautha hissa paani bachta hai.\n• Baghon aur sabziyon ke liye *drip / sprinkler*.\n• Subah ya shaam ko paani dein, aur khaalon aur pipes ki leakage theek karein.\n• Motor lagataar na chalayein, waqfe waqfe se chalayein.",
          "• *ریچارج پٹ*: بور کے پاس 1–2 میٹر گہرا گڑھا، بجری اور ریت کے ساتھ، بارش اور چھت کا پانی واپس زمین میں بھیجتا ہے۔\n• *لیزر سے زمین ہموار* کروائیں: تقریباً چوتھا حصہ پانی بچتا ہے۔\n• باغوں اور سبزیوں کے لیے *ڈرپ / سپرنکلر*۔\n• صبح یا شام کو پانی دیں، اور کھالوں اور پائپوں کی لیکیج ٹھیک کریں۔\n• موٹر مسلسل نہ چلائیں، وقفے وقفے سے چلائیں۔"
        ),
      ].join("\n");

    case "irrigation": {
      const lines = [
        t(lang, "🌾 *Crops and water*", "🌾 *Fasal aur paani*", "🌾 *فصل اور پانی*"),
        t(
          lang,
          "• *Rice and sugarcane* need the most water. Where water is falling fast, use alternate wetting and drying for rice, or switch some area to less thirsty crops.\n• *Wheat, maize and cotton* need much less; irrigate at the key stages instead of on a fixed schedule.\n• Laser levelling and furrow / bed planting cut water use noticeably.",
          "• *Chawal aur ganna* sab se zyada paani lete hain. Jahan paani tezi se gir raha ho, dhaan mein waqfe se paani (AWD) dein ya kuch raqba kam paani wali fasal par le jayein.\n• *Gandum, makki aur kapas* kahin kam paani leti hain; muqarrara din ke bajaye zaroori marahil par paani dein.\n• Laser hamwari aur khaliyon / beds par kasht se paani ka kharch kaafi kam hota hai.",
          "• *چاول اور گنا* سب سے زیادہ پانی لیتے ہیں۔ جہاں پانی تیزی سے گر رہا ہو، دھان میں وقفے سے پانی دیں یا کچھ رقبہ کم پانی والی فصل پر لے جائیں۔\n• *گندم، مکئی اور کپاس* کہیں کم پانی لیتی ہیں؛ مقررہ دن کے بجائے ضروری مراحل پر پانی دیں۔\n• لیزر ہمواری اور کھیلیوں / بیڈز پر کاشت سے پانی کا خرچ کافی کم ہوتا ہے۔"
        ),
      ];
      if (district?.medianDepthFt != null) {
        lines.push(
          "",
          t(
            lang,
            `In ${areaLabel(district)} water is usually at ~${district.medianDepthFt} ft. ${district.medianDepthFt >= 100 ? "That is deep, so water-saving methods pay off here." : ""}`,
            `${areaLabel(district)} mein paani aam taur par ~${district.medianDepthFt} ft par hai. ${district.medianDepthFt >= 100 ? "Yeh gehra hai, is liye yahan paani bachane ke tareeqe faida dete hain." : ""}`,
            `${areaLabel(district)} میں پانی عام طور پر ~${district.medianDepthFt} فٹ پر ہے۔ ${district.medianDepthFt >= 100 ? "یہ گہرا ہے، اس لیے یہاں پانی بچانے کے طریقے فائدہ دیتے ہیں۔" : ""}`
          ).trim()
        );
      }
      return lines.join("\n");
    }

    case "solar":
      return t(
        lang,
        "☀️ *Solar tube wells* save the diesel or electricity bill, but because pumping is \"free\" people tend to over-pump, so plan a recharge pit too. Panel size depends on pump HP and water depth. Type *new bore* and choose *Solar tube well* for a size estimate for your spot.",
        "☀️ *Solar tube well* se diesel ya bijli ka bill bachta hai, lekin \"muft\" pumping ki wajah se log zyada paani nikalte hain, is liye recharge pit bhi banayein. Panels ka size pump ke HP aur paani ki gehraai par hai. Apni jagah ka andaza lene ke liye *naya bore* likhein aur *Solar tube well* chunein.",
        "☀️ *سولر ٹیوب ویل* سے ڈیزل یا بجلی کا بل بچتا ہے، لیکن \"مفت\" پمپنگ کی وجہ سے لوگ زیادہ پانی نکالتے ہیں، اس لیے ریچارج پٹ بھی بنائیں۔ پینلز کا سائز پمپ کے HP اور پانی کی گہرائی پر ہے۔ اپنی جگہ کا اندازہ لینے کے لیے *نیا بور* لکھیں اور *سولر ٹیوب ویل* چنیں۔"
      );

    case "cost":
      return t(
        lang,
        "💰 Prices change a lot by area and month, so I don't quote rupees. The cost mostly depends on *drilling depth (ft)*, *pipe size*, *pump HP* and, for solar, *number of panels*. Type *new bore* and I'll work out those sizes for your spot, then ask 2–3 local drillers for a quote on them.",
        "💰 Qeematein ilaqe aur mahine ke hisaab se bohat badalti hain, is liye main rupay nahi batata. Kharcha zyada tar *boring ki gehraai (ft)*, *pipe ka size*, *pump ke HP* aur solar mein *panels ki tadaad* par hota hai. *naya bore* likhein, main aap ki jagah ke liye yeh sizes nikaal doon ga, phir 2–3 maqami drillers se inhi par rate lein.",
        "💰 قیمتیں علاقے اور مہینے کے حساب سے بہت بدلتی ہیں، اس لیے میں روپے نہیں بتاتا۔ خرچہ زیادہ تر *بورنگ کی گہرائی (فٹ)*، *پائپ کا سائز*، *پمپ کے HP* اور سولر میں *پینلز کی تعداد* پر ہوتا ہے۔ *نیا بور* لکھیں، میں آپ کی جگہ کے لیے یہ سائز نکال دوں گا، پھر 2–3 مقامی ڈرلرز سے انہی پر ریٹ لیں۔"
      );

    case "government":
      return t(
        lang,
        "🏛️ For farm water schemes, ask your district's *Agriculture Department (On-Farm Water Management)* office whether a scheme is open right now. For a water quality test, *PCRWR* labs accept samples. For city water supply complaints, contact your city's water agency (e.g. WASA).",
        "🏛️ Kheti ke paani ki schemes ke liye apne zile ke *Agriculture Department (On-Farm Water Management)* daftar se poochein ke abhi koi scheme chal rahi hai. Paani ke test ke liye *PCRWR* ki labs sample leti hain. Shehri paani ki shikayat ke liye apne shehar ke paani ke idare (maslan WASA) se rabta karein.",
        "🏛️ کھیتی کے پانی کی سکیموں کے لیے اپنے ضلع کے *محکمہ زراعت (اصلاحِ آبپاشی)* دفتر سے پوچھیں کہ ابھی کوئی سکیم چل رہی ہے۔ پانی کے ٹیسٹ کے لیے *PCRWR* کی لیبز نمونہ لیتی ہیں۔ شہری پانی کی شکایت کے لیے اپنے شہر کے پانی کے ادارے (مثلاً واسا) سے رابطہ کریں۔"
      );

    case "rain":
      return t(
        lang,
        "🌧️ Monsoon rain is the main natural recharge: water levels usually rise a little after a good monsoon and fall again by early summer. Catch it with a recharge pit near your bore, and keep flood water and sewage away from the bore head.",
        "🌧️ Mon soon ki baarish zameeni paani ko qudrati taur par bharti hai: achi baarish ke baad satah thori upar aati hai aur garmi tak phir girti hai. Bore ke paas recharge pit bana kar ise jama karein, aur sailab ya gande paani ko bore ke munh se door rakhein.",
        "🌧️ مون سون کی بارش زیرِ زمین پانی کو قدرتی طور پر بھرتی ہے: اچھی بارش کے بعد سطح تھوڑی اوپر آتی ہے اور گرمی تک پھر گرتی ہے۔ بور کے پاس ریچارج پٹ بنا کر اسے جمع کریں، اور سیلاب یا گندے پانی کو بور کے منہ سے دور رکھیں۔"
      );

    case "impact":
      return [
        t(lang, "⚖️ *How much water a source takes out, and the re-bore risk*", "⚖️ *Kaun sa zariya kitna paani nikalta hai, aur dobara bore ka khatra*", "⚖️ *کون سا ذریعہ کتنا پانی نکالتا ہے، اور دوبارہ بور کا خطرہ*"),
        t(
          lang,
          "• Hand pump: ~0.5 m³ (500 litres) a day.\n• Home bore with motor: ~1.5 m³ a day.\n• Farm tube well: a diesel/electric farm pumps ~1.3 m of water a year over its land (5,300 m³ per acre); a solar farm ~1.6 m (6,500 m³ per acre), because daytime pumping costs nothing.",
          "• Nalka: rozana ~0.5 m³ (500 liter).\n• Ghar ka motor wala bore: rozana ~1.5 m³.\n• Kheti ka tube well: diesel/bijli wala farm saal mein apni zameen par ~1.3 m paani nikalta hai (fi acre 5,300 m³); solar farm ~1.6 m (fi acre 6,500 m³), kyunke din ki pumping muft hoti hai.",
          "• نلکا: روزانہ ~0.5 مکعب میٹر (500 لیٹر)۔\n• گھر کا موٹر والا بور: روزانہ ~1.5 مکعب میٹر۔\n• کھیتی کا ٹیوب ویل: ڈیزل/بجلی والا فارم سال میں اپنی زمین پر ~1.3 میٹر پانی نکالتا ہے (فی ایکڑ 5,300 مکعب میٹر)؛ سولر فارم ~1.6 میٹر (فی ایکڑ 6,500 مکعب میٹر)، کیونکہ دن کی پمپنگ مفت ہوتی ہے۔"
        ),
        "",
        t(
          lang,
          "Without a recharge pit or water-saving irrigation, this pumping adds to the area's fall. The water drops below the pump first (it must be lowered), and later below the bore's filter, so you have to drill again, deeper and at full cost.",
          "Recharge pit ya paani bachane wali aabpashi ke baghair yeh pumping ilaqe ki girawat mein izafa karti hai. Pehle paani pump se neeche jata hai (pump neeche karna parta hai), phir bore ke filter se bhi neeche, aur dobara gehra bore poore kharche par karwana parta hai.",
          "ریچارج پٹ یا پانی بچانے والی آبپاشی کے بغیر یہ پمپنگ علاقے کی گراوٹ میں اضافہ کرتی ہے۔ پہلے پانی پمپ سے نیچے جاتا ہے (پمپ نیچے کرنا پڑتا ہے)، پھر بور کے فلٹر سے بھی نیچے، اور دوبارہ گہرا بور پورے خرچے پر کروانا پڑتا ہے۔"
        ),
        "",
        t(
          lang,
          "Type *new bore* and share your spot: I'll calculate your yearly withdrawal and in how many years the pump would need lowering or the bore re-drilling, with and without measures.",
          "*naya bore* likhein aur apni jagah batayein: main aap ka saalana paani, aur kitne saal mein pump neeche karna ya dobara bore karna parega, intezam ke saath aur baghair, dono hisaab kar ke bataun ga.",
          "*نیا بور* لکھیں اور اپنی جگہ بتائیں: میں آپ کا سالانہ پانی، اور کتنے سال میں پمپ نیچے کرنا یا دوبارہ بور کرنا پڑے گا، انتظام کے ساتھ اور بغیر، دونوں حساب کر کے بتاؤں گا۔"
        ),
      ].join("\n");

    case "about_app":
      return t(
        lang,
        `🌐 *AquaLedger* tracks groundwater across Pakistan: a live map, area trends, AI depth forecasts and your own well's history. Sign up and log readings at ${ctx.siteUrl}`,
        `🌐 *AquaLedger* poore Pakistan ka zameeni paani track karta hai: live naqsha, ilaqon ke trend, AI gehraai forecast aur aap ke apne bore ki history. Account bana kar readings yahan darj karein: ${ctx.siteUrl}`,
        `🌐 *ایکوا لیجر* پورے پاکستان کا زیرِ زمین پانی ٹریک کرتا ہے: لائیو نقشہ، علاقوں کے رجحان، AI گہرائی کی پیشگوئی اور آپ کے اپنے بور کی ہسٹری۔ اکاؤنٹ بنا کر ریڈنگز یہاں درج کریں: ${ctx.siteUrl}`
      );

    default:
      return "";
  }
}

/** Suggestions when nothing matched clearly. */
export function suggestionButtons(lang: Lang) {
  return [
    { id: "menu:area", title: t(lang, "Water in my area", "Mere ilaqe ka paani", "میرے علاقے کا پانی") },
    { id: "menu:bore", title: t(lang, "New bore plan", "Naya bore plan", "نیا بور پلان") },
    { id: "menu:report", title: t(lang, "Send a reading", "Reading bhejein", "ریڈنگ بھیجیں") },
  ];
}
