"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCheck, Droplets, Languages, MapPin, Mic, RotateCcw, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { useLanguage } from "@/components/aqualedger/language-toggle";

type Lang = "en" | "roman" | "ur";
type ReplyButton = { id: string; title: string };

type ChatItem =
  | { id: number; role: "user"; text: string; time: string }
  | { id: number; role: "bot"; text: string; time: string; buttons?: ReplyButton[]; meta?: string }
  | { id: number; role: "error"; text: string; time: string };

// Omit spread over each member of the union, so role-specific fields stay allowed.
type NewChatItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, "id" | "time"> : never) : never;

type SimResult = {
  replies?: { text: string; buttons?: ReplyButton[] }[];
  lang?: Lang | null;
  places?: string[];
  understood?: { intent: string; depthAsSaid: string | null; sourceType: string | null; engine: string };
  save?: { status: string };
  error?: string;
};

// Any Urdu letters → render the bubble in Nastaliq (see .urdu-text in globals.css).
const URDU = /[\u0600-\u06FF]/;
const urduClass = (text: string) => (URDU.test(text) ? " urdu-text" : "");

const LANG_LABEL: Record<Lang, string> = { en: "English", roman: "Roman Urdu", ur: "اردو" };

const newSessionId = () => `web-${Math.random().toString(36).slice(2, 10)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Renders WhatsApp-style *bold* and _italic_ plus clickable links. */
function formatWhatsApp(text: string) {
  return text.split("\n").map((line, i) => {
    const parts: ReactNode[] = [];
    const pattern = /(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g;
    let last = 0;
    for (const match of line.matchAll(pattern)) {
      const token = match[0];
      if (match.index! > last) parts.push(line.slice(last, match.index));
      if (token.startsWith("http")) {
        parts.push(
          <a key={match.index} href={token} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline underline-offset-2">
            {token.replace(/^https?:\/\//, "")}
          </a>
        );
      } else if (token.startsWith("*")) {
        parts.push(<strong key={match.index}>{token.slice(1, -1)}</strong>);
      } else {
        parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
      }
      last = match.index! + token.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <Fragment key={i}>
        {parts}
        {"\n"}
      </Fragment>
    );
  });
}

// Screen text in the chat's language (bot replies come from the server).
const UI: Record<string, Record<Lang, string>> = {
  online: { en: "Online · groundwater assistant", roman: "Online · zameeni paani", ur: "آن لائن · زیرِ زمین پانی" },
  typing: { en: "typing…", roman: "likh raha hai…", ur: "لکھ رہا ہے…" },
  language: { en: "Language", roman: "Zuban", ur: "زبان" },
  newChat: { en: "New chat", roman: "Nayi chat", ur: "نئی چیٹ" },
  today: { en: "Today", roman: "Aaj", ur: "آج" },
  voice: { en: "🎙️ Voice note", roman: "🎙️ Voice note", ur: "🎙️ وائس نوٹ" },
  location: { en: "📍 Location shared", roman: "📍 Location bheji", ur: "📍 لوکیشن بھیجی" },
  shareLocation: { en: "Share location", roman: "Location bhejein", ur: "لوکیشن بھیجیں" },
  noMic: { en: "Microphone permission was not given.", roman: "Microphone ki ijazat nahi mili.", ur: "مائیکروفون کی اجازت نہیں ملی۔" },
  noLocation: { en: "Location permission was not given.", roman: "Location ki ijazat nahi mili.", ur: "لوکیشن کی اجازت نہیں ملی۔" },
  placeholder: { en: "Type a message…", roman: "Apna sawal likhein…", ur: "پیغام لکھیں…" },
  close: { en: "Close chat", roman: "Chat band karein", ur: "چیٹ بند کریں" },
};

/** The website's language (EN / اردو toggle), read directly so the very first message can use it. */
function siteLanguageNow(): "en" | "ur" {
  try {
    return localStorage.getItem("aqua-lang") === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

const SHOW_DEV_TOOLS = process.env.NODE_ENV !== "production";

type ChatProps = {
  /** "page": the /chatbot page. "widget": the floating panel opened from the corner button. */
  variant?: "page" | "widget";
  onClose?: () => void;
};

export function WhatsAppTester({ variant = "page", onClose }: ChatProps = {}) {
  const isWidget = variant === "widget";
  const siteLang = useLanguage();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lang, setLang] = useState<Lang | null>(null);
  // A new chat id per conversation; made lazily (not during render) so the page can prerender.
  const session = useRef<string | null>(null);
  const [round, setRound] = useState(0);
  const [devOpen, setDevOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [reallySave, setReallySave] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const started = useRef<number | null>(null);

  const push = useCallback((item: NewChatItem) => {
    setItems((list) => [...list, { time: clock(), ...item, id: nextId.current++ } as ChatItem]);
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items, busy]);

  const send = useCallback(
    async (form: FormData, shown?: string) => {
      if (shown) push({ role: "user", text: shown });
      setBusy(true);
      session.current ??= newSessionId();
      form.set("from", session.current);
      form.set("save", String(reallySave));
      if (lang) form.set("lang", lang);
      try {
        const res = await fetch("/api/whatsapp/simulate", { method: "POST", body: form });
        const json = (await res.json()) as SimResult;
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
        if (json.lang) setLang(json.lang);
        const u = json.understood;
        const meta = [
          u ? `intent: ${u.intent}` : "",
          json.places?.length ? `places: ${json.places.join("; ")}` : "",
          u?.depthAsSaid ? `depth: ${u.depthAsSaid}` : "",
          u ? `by ${u.engine}` : "",
          json.save ? `save: ${json.save.status}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        for (const [i, reply] of (json.replies ?? []).entries()) {
          push({ role: "bot", text: reply.text, buttons: reply.buttons, meta: i === 0 && meta ? meta : undefined });
        }
      } catch (error) {
        push({ role: "error", text: error instanceof Error ? error.message : "Request failed" });
      } finally {
        setBusy(false);
      }
    },
    [lang, push, reallySave]
  );

  // Open every new chat with the greeting. If the website is in Urdu, the chat starts in Urdu.
  useEffect(() => {
    if (started.current === round) return;
    started.current = round;
    const form = new FormData();
    form.set("action", "start");
    if (siteLanguageNow() === "ur") form.set("lang", "ur");
    void send(form);
  }, [send, round]);

  // The website's EN / اردو toggle switches the chat too (the user can still pick another in the chat).
  const lastSiteLang = useRef<string | null>(null);
  useEffect(() => {
    if (lastSiteLang.current === null) {
      lastSiteLang.current = siteLanguageNow();
      return;
    }
    if (lastSiteLang.current === siteLang) return;
    lastSiteLang.current = siteLang;
    const form = new FormData();
    form.set("text", `lang:${siteLang === "ur" ? "ur" : "en"}`);
    void send(form);
  }, [siteLang, send]);

  const chatLang: Lang = lang ?? (siteLang === "ur" ? "ur" : "en");
  const ui = (key: keyof typeof UI) => UI[key][chatLang];

  function sendText(value: string, shown = value) {
    const clean = value.trim();
    if (!clean || busy) return;
    const form = new FormData();
    form.set("text", clean);
    setText("");
    void send(form, shown);
  }

  function restart() {
    setItems([]);
    setLang(null);
    session.current = newSessionId();
    setRound((r) => r + 1);
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) return;
        const form = new FormData();
        form.set("audio", blob, "voice.webm");
        void send(form, ui("voice"));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      push({ role: "error", text: ui("noMic") });
    }
  }

  function sendLocation() {
    if (!navigator.geolocation || busy) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const form = new FormData();
        form.set("latitude", String(pos.coords.latitude));
        form.set("longitude", String(pos.coords.longitude));
        void send(form, ui("location"));
      },
      () => push({ role: "error", text: ui("noLocation") }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const lastBotId = [...items].reverse().find((item) => item.role === "bot")?.id;

  return (
    <div className={isWidget ? "h-full" : "mx-auto w-full max-w-3xl"}>
      {/* Mobile: leaves room for the top bar and the bottom tab bar; desktop: fills the window. */}
      <div
        className={
          isWidget
            ? "flex h-full flex-col overflow-hidden bg-slate-50 shadow-2xl sm:rounded-3xl sm:border sm:border-slate-200"
            : "-mx-1 flex h-[calc(100dvh-14rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg sm:mx-0 sm:h-[calc(100dvh-15rem)] sm:rounded-[28px] lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px]"
        }
      >
        {/* Header */}
        <div className="relative flex items-center gap-2.5 bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-600 px-3 py-2.5 text-white sm:gap-3 sm:px-5 sm:py-3">
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40 backdrop-blur">
              <Droplets size={22} />
            </div>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-cyan-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight">Aqua Chatbot</p>
            <p className={`truncate text-xs text-white/80${chatLang === "ur" ? " urdu-text" : ""}`}>{busy ? ui("typing") : ui("online")}</p>
          </div>
          <button
            type="button"
            onClick={() => sendText("language", `🌐 ${ui("language")}`)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
          >
            <Languages size={14} />
            <span className={isWidget ? "sr-only" : "hidden sm:inline"}>{lang ? LANG_LABEL[lang] : ui("language")}</span>
          </button>
          <button type="button" onClick={restart} aria-label={ui("newChat")} title={ui("newChat")} className="rounded-full p-2 hover:bg-white/15">
            <RotateCcw size={17} />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label={ui("close")} title={ui("close")} className="rounded-full p-2 hover:bg-white/15">
              <X size={19} />
            </button>
          )}
          {/* Debug options are for local development only. */}
          {SHOW_DEV_TOOLS && (
            <button
              type="button"
              onClick={() => setDevOpen((v) => !v)}
              aria-label="Developer options"
              aria-expanded={devOpen}
              title="Developer options"
              className="rounded-full p-2 hover:bg-white/15"
            >
              <SlidersHorizontal size={17} />
            </button>
          )}
          {SHOW_DEV_TOOLS && devOpen && (
            <div className="absolute right-3 top-full z-20 mt-2 w-60 space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-lg">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />
                Show what the bot understood
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={reallySave} onChange={(e) => setReallySave(e.target.checked)} />
                Really save readings
              </label>
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          ref={scroller}
          className="flex-1 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-5"
          style={{ backgroundImage: "radial-gradient(rgb(20 184 166 / 0.14) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        >
          <div className="mb-4 flex justify-center">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{ui("today")}</span>
          </div>
          <div className="space-y-3">
            {items.map((item) =>
              item.role === "user" ? (
                <div key={item.id} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div dir="auto" className={`max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-teal-600 px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm${urduClass(item.text)}`}>
                    {item.text}
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/70">
                      {item.time} <CheckCheck size={13} />
                    </span>
                  </div>
                </div>
              ) : item.role === "error" ? (
                <div key={item.id} className="flex justify-center">
                  <p className="rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-700">{item.text}</p>
                </div>
              ) : (
                <div key={item.id} className="flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-sky-500 text-white">
                    <Droplets size={14} />
                  </div>
                  <div className="max-w-[85%]">
                    <div dir="auto" className={`whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm${urduClass(item.text)}`}>
                      {formatWhatsApp(item.text)}
                      {showDebug && item.meta && (
                        <span className="mt-2 block border-t border-slate-100 pt-1.5 font-mono text-[10px] text-slate-400">{item.meta}</span>
                      )}
                      <span className="mt-1 block text-right text-[10px] text-slate-400">{item.time}</span>
                    </div>
                    {item.buttons && (
                      // A long list (the options menu) shows as a grid of tiles; a short one as chips.
                      <div className={item.buttons.length > 3 ? "mt-2 grid gap-2 sm:grid-cols-2" : "mt-2 flex flex-wrap gap-2"}>
                        {item.buttons.map((button) => (
                          <button
                            key={button.id}
                            type="button"
                            dir="auto"
                            disabled={busy || item.id !== lastBotId}
                            onClick={() => sendText(button.id, button.title)}
                            className={`border border-teal-600/40 bg-white text-sm font-semibold text-teal-700 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-600 disabled:translate-y-0 disabled:opacity-50 ${
                              item.buttons!.length > 3 ? "rounded-xl px-3.5 py-2.5 text-start" : "rounded-full px-4 py-1.5"
                            }${urduClass(button.title)}`}
                          >
                            {button.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-end gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-sky-500 text-white">
                  <Droplets size={14} />
                </div>
                <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendText(text);
          }}
          className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:px-4"
        >
          <button
            type="button"
            onClick={sendLocation}
            disabled={busy}
            aria-label={ui("shareLocation")}
            title={ui("shareLocation")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-teal-700 disabled:opacity-50"
          >
            <MapPin size={20} />
          </button>
          <input
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ui("placeholder")}
            className={`h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-teal-600${chatLang === "ur" ? " urdu-text h-12" : ""}`}
          />
          {text.trim() ? (
            <button
              type="submit"
              disabled={busy}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-sky-600 text-white shadow-md transition hover:scale-105 disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={busy && !recording}
              aria-label={recording ? "Stop recording" : "Record voice note"}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-50 ${
                recording ? "animate-pulse bg-red-600" : "bg-gradient-to-br from-teal-500 to-sky-600 hover:scale-105"
              }`}
            >
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
