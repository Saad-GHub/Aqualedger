// WhatsApp Cloud API (Meta) helpers. Server-only: these read secret env vars.
import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MAX_TEXT = 4000; // WhatsApp allows 4096 characters per text message

export type IncomingMessage =
  | { kind: "text"; id: string; from: string; text: string }
  | { kind: "audio"; id: string; from: string; mediaId: string; mimeType: string }
  | { kind: "location"; id: string; from: string; latitude: number; longitude: number; name?: string }
  | { kind: "unsupported"; id: string; from: string; type: string };

function token() {
  const value = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!value) throw new Error("WHATSAPP_ACCESS_TOKEN is not set.");
  return value;
}

function phoneNumberId() {
  const value = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!value) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set.");
  return value;
}

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Pulls the user messages out of a webhook payload (status updates are ignored). */
export function extractMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: { messages?: Record<string, unknown>[] } }[] }[]) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const id = String(m.id ?? "");
        const from = String(m.from ?? "");
        const type = String(m.type ?? "");
        if (!id || !from) continue;
        if (type === "text") {
          out.push({ kind: "text", id, from, text: String((m.text as { body?: string })?.body ?? "") });
        } else if (type === "audio") {
          const audio = m.audio as { id?: string; mime_type?: string };
          if (audio?.id) out.push({ kind: "audio", id, from, mediaId: audio.id, mimeType: audio.mime_type ?? "audio/ogg" });
        } else if (type === "location") {
          const loc = m.location as { latitude?: number; longitude?: number; name?: string };
          if (Number.isFinite(loc?.latitude) && Number.isFinite(loc?.longitude)) {
            out.push({ kind: "location", id, from, latitude: Number(loc.latitude), longitude: Number(loc.longitude), name: loc.name });
          }
        } else if (type === "interactive" || type === "button") {
          // Button ids (e.g. "lang:roman") are what the bot understands; titles are a fallback.
          const interactive = m.interactive as { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
          const reply =
            interactive?.button_reply?.id ??
            interactive?.button_reply?.title ??
            interactive?.list_reply?.id ??
            (m.button as { payload?: string; text?: string })?.payload ??
            (m.button as { text?: string })?.text;
          out.push(reply ? { kind: "text", id, from, text: reply } : { kind: "unsupported", id, from, type });
        } else {
          out.push({ kind: "unsupported", id, from, type });
        }
      }
    }
  }
  return out;
}

async function graphPost(body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Sends a text reply, split into several messages if it is too long. */
export async function sendText(to: string, text: string) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_TEXT) {
    const cut = rest.lastIndexOf("\n", MAX_TEXT) > 0 ? rest.lastIndexOf("\n", MAX_TEXT) : MAX_TEXT;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  for (const body of parts) {
    await graphPost({ to, type: "text", text: { body, preview_url: true } });
  }
}

/** A message with up to 3 tap-to-reply buttons (WhatsApp limits: body 1024 chars, title 20). */
export async function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
  await graphPost({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
      },
    },
  });
}

/** More than 3 choices: WhatsApp's list message (up to 10 rows behind one "Choose" button). */
export async function sendList(to: string, body: string, rows: { id: string; title: string }[], buttonLabel = "Choose / چنیں") {
  await graphPost({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [{ title: "Options", rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) }],
      },
    },
  });
}

/** Sends one bot reply: with buttons when it has them, plain text otherwise. */
export async function sendReply(to: string, reply: { text: string; buttons?: { id: string; title: string }[] }) {
  if (reply.buttons && reply.buttons.length > 3 && reply.text.length <= 1024) return sendList(to, reply.text, reply.buttons);
  if (reply.buttons?.length && reply.text.length <= 1024) return sendButtons(to, reply.text, reply.buttons);
  await sendText(to, reply.text);
  if (reply.buttons?.length) await sendButtons(to, "👇", reply.buttons);
}

/** Blue ticks plus a "typing…" bubble while the bot works. Failures here are harmless. */
export async function markReadAndTyping(messageId: string) {
  try {
    await graphPost({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  } catch (error) {
    console.warn("[whatsapp] could not mark message as read:", error);
  }
}

/** Downloads a voice note: first look up its temporary URL, then fetch the bytes. */
export async function downloadMedia(mediaId: string): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!meta.ok) throw new Error(`Media lookup failed (${meta.status}).`);
  const info = (await meta.json()) as { url?: string; mime_type?: string };
  if (!info.url) throw new Error("Media URL missing.");
  const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!file.ok) throw new Error(`Media download failed (${file.status}).`);
  return { data: await file.arrayBuffer(), mimeType: info.mime_type ?? "audio/ogg" };
}
