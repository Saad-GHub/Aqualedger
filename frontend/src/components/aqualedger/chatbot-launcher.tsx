"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import { WhatsAppTester } from "@/components/aqualedger/whatsapp-tester";

/**
 * Floating Aqua Chatbot: a round button in the corner of every page (label on hover).
 * A click opens the chat right there as a panel; on phones it fills the screen.
 * The chat stays mounted after the first open, so closing and reopening keeps the conversation.
 */
export function ChatbotLauncher() {
  const pathname = usePathname();
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The full-page chat has no need for a second one.
  if (pathname === "/chatbot") return null;
  const label = tr(lang, "Aqua Chatbot", "ایکوا چیٹ بوٹ");

  return (
    <>
      {opened && (
        <div
          role="dialog"
          aria-label={label}
          aria-hidden={!open}
          inert={!open}
          // Phone: full screen above everything. Tablet / desktop: a panel above the button.
          className={`fixed inset-0 z-50 pt-[env(safe-area-inset-top)] transition duration-200 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(680px,calc(100dvh-8rem))] sm:w-[400px] sm:pt-0 lg:bottom-28 lg:right-8 ${
            open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
          }`}
        >
          <WhatsAppTester variant="widget" onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpened(true);
          setOpen((value) => !value);
        }}
        aria-label={open ? tr(lang, "Close chat", "چیٹ بند کریں") : label}
        aria-expanded={open}
        // Mobile: just above the bottom tab bar (and the iPhone home bar); hidden while the chat covers the screen.
        className={`group fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-50 items-center sm:right-6 lg:bottom-6 lg:right-8 ${
          open ? "hidden sm:flex" : "flex"
        }`}
      >
        {!open && (
          <span
            role="tooltip"
            className={`pointer-events-none mr-3 hidden translate-x-2 whitespace-nowrap rounded-full bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white opacity-0 shadow-lg transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 md:block ${
              lang === "ur" ? "urdu-text" : ""
            }`}
          >
            {label}
          </span>
        )}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-600 text-white shadow-[0_12px_30px_-8px_rgb(13_148_136/0.7)] ring-4 ring-white/70 transition duration-200 group-hover:scale-110 group-active:scale-95">
          {!open && <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/30 [animation-duration:2.5s]" aria-hidden="true" />}
          {open ? <X size={26} strokeWidth={2.2} className="relative" /> : <MessageCircle size={26} strokeWidth={2.2} className="relative" />}
          {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-white" aria-hidden="true" />}
        </span>
      </button>
    </>
  );
}
