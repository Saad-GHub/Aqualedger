# AquaLedger WhatsApp bot

Farmers can ask about groundwater or report their own well depth on WhatsApp, by text, voice note or location pin.

## What it does

| The user sends | The bot replies with |
|---|---|
| "Okara mein paani kitna gehra hai?" | Census 2020 depth, brackish share, monitoring-well trend, community readings, status and a tip |
| "Mera tube well Pattoki mein 120 foot par hai" | Confirms the reading, compares it with the area average, saves it for admin review |
| A reading with no place | Asks for the district, or a 📍 location, and finishes the reading with the next message |
| A 📍 location pin | The district report, plus the nearest monitoring well |
| A voice note | The same as text, after speech-to-text, with the transcript shown at the top |
| "hi" / "help" / "مدد" | A short menu with examples |
| "naya bore", or "Mailsi mein solar tube well lagwana hai" | **New water source advisor**: asks the type (hand pump, home bore, tube well, solar tube well), the use (home / farming / both), the acres, and the spot (📍 location or a name). It then gives the estimated water level now and in 5/10/15 years, the Supabase forecast trend, and a rough drilling depth, pump setting, pump HP, solar panels, pipe size, daily water and acres covered. It also warns about brackish water. |

**Withdrawal and re-bore risk** (inside every bore plan, and as a free-form topic):
- Yearly water taken out:
  - farm tube wells pump about **1.3 m of water a year over their land** (diesel/electric), and solar about **1.6 m**. Source: a Lower Indus Basin study of 30 matched solar/diesel farm pairs (Journal of Agriculture and Food Research, 2025).
  - a home bore takes about 1.5 m³ a day, and a hand pump about 0.5 m³ a day.
- Local fall: the area's measured trend, plus your own net pumping spread over a ~750 m radius of influence. This uses specific yield 0.12 and 25% irrigation return flow, both rules of thumb.
- The output gives the years until the pump must be lowered and until the bore needs re-drilling, with and without measures. Measures mean 30% less pumping from drip or laser levelling, plus recharge pits at about 1,000 m³ a year each.
- It also gives a re-bore risk level.

**Free-form questions** (`analyzer.ts` + `topics.ts`):
- Every message's words are scored against topic word lists in English, Roman Urdu and Urdu. Repeated letters are collapsed and small typos are forgiven (same first letter, 1–2 edits).
- The topics are: water quality and health, trend and future, pump trouble, saving water, crops and irrigation, solar, cost, government schemes, rain, the app, and small talk.
- Quality, trend and crops answers use the named district's data.
- If nothing is clear, the bot lists the words it noticed and offers three suggestion buttons. It never stays silent.

The advisor's sizing (`src/lib/whatsapp/advisor.ts`) uses rules of thumb for planning, not an engineering design:
- design for 15 years of decline
- 6 m drawdown for farm wells, 3 m for home bores
- about 24 m³ of water per acre per day, in 8 hours of pumping (6 for solar)
- 50% pump efficiency
- solar sized at 1.4 × pump kW
- a suction hand pump flagged when water is deeper than 7 m

The first message gets a greeting with three buttons (English, Roman Urdu, اردو). Every later reply uses the chosen language; typing *language* brings the buttons back.

Every place name is first looked up on the map (OpenStreetMap Nominatim) and checked to be inside Pakistan. Only then is it mapped to its census district, and the reply adds the monitoring wells within 20 km and plain-language reasons. Places abroad get a "not in Pakistan" reply, and unknown names get a spelling hint. Only the typed place name is sent to Nominatim, never the phone number or GPS position. Nominatim allows about one request per second, so results are cached.

## Files

- `src/app/api/whatsapp/route.ts`: the Meta webhook (verification handshake, signature check, replies sent in `after()`)
- `src/app/api/whatsapp/simulate/route.ts`: web chat endpoint (public, ~30 messages a minute per visitor, never saves in production)
- `src/components/aqualedger/chatbot-launcher.tsx`: floating chat button on every page (label on hover). A click opens the chat as a panel, full screen on phones. `/chatbot` is the full-page version.
- `src/components/aqualedger/whatsapp-tester.tsx`: the chat UI. It starts in the website language (EN / اردو) and follows the site toggle.
- `src/lib/whatsapp/bot.ts`: conversation logic and reply text
- `src/lib/whatsapp/understand.ts`: message understanding (Claude if `ANTHROPIC_API_KEY` is set, keyword rules otherwise)
- `src/lib/whatsapp/knowledge.ts`: census districts, observation wells, Supabase community data
- `src/lib/whatsapp/transcribe.ts`: voice note to text (Groq Whisper)
- `src/lib/whatsapp/save-reading.ts`: saving readings into `water_reports`
- `src/lib/whatsapp/meta.ts`: WhatsApp Cloud API calls

## Test it locally (no Meta account needed)

1. `npm run dev`
2. Open any page and tap the round chat button (bottom right), or open http://localhost:3000/chatbot
3. Type a message, tap the mic for a voice note, or the pin for your location.

In development, the sliders icon in the chat header turns on a grey debug line: what the bot understood and whether the reading would be saved. Nothing is saved unless "Really save readings to Supabase" is ticked and saving is configured.

Optional keys in `.env.local` (see `.env.example`):

- `GROQ_API_KEY` turns on voice notes (free tier at console.groq.com).
- `ANTHROPIC_API_KEY` makes understanding smarter (spelling mistakes, Punjabi, towns not in the alias list). Without it, the keyword parser is used.

## Connect real WhatsApp

1. At developers.facebook.com create an app of type **Business**, then add the **WhatsApp** product. Meta gives a free test number that can message up to 5 verified phone numbers.
2. In Vercel > Project > Settings > Environment Variables add:
   - `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp > API Setup)
   - `WHATSAPP_APP_SECRET` (App settings > Basic)
   - `WHATSAPP_VERIFY_TOKEN` (any random string you choose)
   - `PUBLIC_SITE_URL` (for example `https://your-app.vercel.app`)
   - `GROQ_API_KEY`, and optionally `ANTHROPIC_API_KEY`
3. Redeploy, then in Meta > WhatsApp > Configuration set:
   - Callback URL: `https://your-app.vercel.app/api/whatsapp`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
4. Send "hi" to the test number from one of the verified phones.

The temporary access token from API Setup expires after 24 hours. For anything longer, create a System User token in Meta Business Settings.

## Saving readings from WhatsApp (optional)

By default the bot answers but does not save. To save:

1. In Supabase Auth, create a user such as "WhatsApp bot" and copy its user id.
2. Add `WHATSAPP_REPORTER_USER_ID` (that id) and `SUPABASE_SERVICE_ROLE_KEY` to Vercel. The service role key bypasses RLS, so keep it only in server env vars and never in `NEXT_PUBLIC_*` or git.

Saved readings:
- go in as `under_review` for the admin
- pass the same anomaly guard as the website form
- link up by a hashed source id, so the phone number itself is never stored

## Limits to know

- Pending "which district?" state and duplicate-message protection live in memory. A cold start on Vercel forgets them (the user just sends the district again).
- Vercel Hobby is for non-commercial use.
- Only official Meta APIs are used, so the number cannot be banned for using an unofficial client.
