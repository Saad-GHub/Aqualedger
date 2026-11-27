// Web chat endpoint for Aqua Chatbot: the same brain as the WhatsApp bot, but the reply
// comes back as JSON. Public, so it is rate-limited, and it never saves readings in production.
import { handleMessage, type BotInput } from "@/lib/whatsapp/bot";
import type { Lang } from "@/lib/whatsapp/understand";

export const maxDuration = 60;

// ~30 messages a minute per visitor is plenty for a person and stops scripted abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((at) => now - at < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many messages. Please wait a minute. / براہ کرم ایک منٹ رکیں۔" }, { status: 429 });
  }

  const form = await request.formData();
  const from = `web:${String(form.get("from") || "anon").slice(0, 40)}`;
  // Saving test readings is only for local development.
  const reallySave = process.env.NODE_ENV !== "production" && form.get("save") === "true";
  const audio = form.get("audio");
  const lat = Number(form.get("latitude"));
  const lon = Number(form.get("longitude"));

  const langField = String(form.get("lang") ?? "");
  const lang = (["en", "roman", "ur"] as const).find((l) => l === langField) as Lang | undefined;

  let input: BotInput;
  if (form.get("action") === "start") {
    input = { kind: "start", from };
  } else if (audio instanceof Blob && audio.size > 0) {
    if (audio.size > 8 * 1024 * 1024) return Response.json({ error: "Voice note is too long." }, { status: 413 });
    input = { kind: "audio", from, data: await audio.arrayBuffer(), mimeType: audio.type || "audio/webm" };
  } else if (form.has("latitude") && Number.isFinite(lat) && Number.isFinite(lon)) {
    input = { kind: "location", from, latitude: lat, longitude: lon };
  } else {
    const text = String(form.get("text") ?? "").trim().slice(0, 1000);
    if (!text) return Response.json({ error: "Send text, audio or a location." }, { status: 400 });
    input = { kind: "text", from, text };
  }

  const origin = new URL(request.url).origin;
  try {
    const result = await handleMessage(input, {
      origin,
      siteUrl: (process.env.PUBLIC_SITE_URL || origin).replace(/\/$/, ""),
      dryRun: !reallySave,
      lang,
      webChat: !reallySave,
    });
    return Response.json(result);
  } catch (error) {
    console.error("[aqua chatbot]", error);
    return Response.json({ error: "Something went wrong, please try again." }, { status: 500 });
  }
}
