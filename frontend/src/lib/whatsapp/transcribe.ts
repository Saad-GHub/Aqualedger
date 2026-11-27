// Voice note → text. Uses Groq's hosted Whisper (free tier) when GROQ_API_KEY is set.
const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

// A short hint steers Whisper towards the words farmers actually use.
const HINT =
  "Pakistani farmer talking about groundwater: tube well, boring, nalka, pani, gehrai, feet, foot, meter, Punjab, Sindh. ٹیوب ویل، بور، نلکا، پانی، گہرائی، فٹ";

export function transcriptionEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  return "ogg";
}

export async function transcribeAudio(data: ArrayBuffer, mimeType: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Voice notes need GROQ_API_KEY (speech-to-text).");
  const form = new FormData();
  const cleanType = mimeType.split(";")[0].trim() || "audio/ogg";
  form.append("file", new Blob([data], { type: cleanType }), `voice.${extensionFor(cleanType)}`);
  form.append("model", process.env.WHISPER_MODEL || "whisper-large-v3");
  form.append("prompt", HINT);
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (process.env.WHISPER_LANGUAGE) form.append("language", process.env.WHISPER_LANGUAGE);
  const res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Speech-to-text failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
