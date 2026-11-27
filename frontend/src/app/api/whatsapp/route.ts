// WhatsApp Cloud API webhook.
// GET  = Meta's one-time verification handshake.
// POST = incoming messages. We answer Meta with 200 at once and do the work in after().
import { after } from "next/server";
import { handleMessage, type BotInput } from "@/lib/whatsapp/bot";
import { downloadMedia, extractMessages, markReadAndTyping, sendReply, sendText, verifySignature, type IncomingMessage } from "@/lib/whatsapp/meta";

export const maxDuration = 60;

// Meta retries a webhook it thinks failed; remember recent message ids so each is answered once.
const seen = new Map<string, number>();
const SEEN_TTL_MS = 60 * 60_000;

function firstTime(id: string) {
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(key);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

function siteUrl(request: Request) {
  return (process.env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function toBotInput(message: IncomingMessage): Promise<BotInput> {
  switch (message.kind) {
    case "text":
      return { kind: "text", from: message.from, text: message.text };
    case "location":
      return { kind: "location", from: message.from, latitude: message.latitude, longitude: message.longitude };
    case "audio": {
      const media = await downloadMedia(message.mediaId);
      return { kind: "audio", from: message.from, data: media.data, mimeType: media.mimeType || message.mimeType };
    }
    default:
      return { kind: "unsupported", from: message.from };
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signed = verifySignature(raw, request.headers.get("x-hub-signature-256"));
  if (!signed) {
    // Without WHATSAPP_APP_SECRET anyone could post fake messages, so production refuses them.
    if (process.env.NODE_ENV === "production" || process.env.WHATSAPP_APP_SECRET) {
      return new Response("Invalid signature", { status: 401 });
    }
    console.warn("[whatsapp] unsigned webhook accepted (development only, WHATSAPP_APP_SECRET not set)");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const site = siteUrl(request);
  const messages = extractMessages(payload).filter((m) => firstTime(m.id));

  after(async () => {
    for (const message of messages) {
      try {
        await markReadAndTyping(message.id);
        const input = await toBotInput(message);
        const result = await handleMessage(input, { origin, siteUrl: site, dryRun: false });
        for (const reply of result.replies) await sendReply(message.from, reply);
      } catch (error) {
        console.error("[whatsapp] failed to answer message:", error);
        try {
          await sendText(
            message.from,
            "⚠️ Maazrat, abhi jawab nahi de saka. Thori der baad dobara koshish karein.\nSorry, something went wrong. Please try again in a little while."
          );
        } catch {
          // Nothing more we can do; the error is already logged.
        }
      }
    }
  });

  return new Response("OK", { status: 200 });
}
