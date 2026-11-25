"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// The theme lives on <html class="dark">, set before paint by layout.tsx; read it as an external store.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
const serverTheme = (): Theme | null => null;

/** Current theme, or null during server render / before hydration. */
export function useTheme() {
  return useSyncExternalStore<Theme | null>(subscribe, readTheme, serverTheme);
}

/**
 * Glass control that switches between the White and Black themes and remembers the choice.
 * `compact` is a single round button for phones: the sun and moon swap with a spin.
 */
export function ThemeToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const theme = useTheme();

  const choose = (next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("aqua-theme", next);
    } catch {
      // Private mode or blocked storage: the theme still applies for this visit.
    }
  };

  if (compact) {
    const dark = theme === "dark";
    return (
      <button
        type="button"
        onClick={() => choose(dark ? "light" : "dark")}
        aria-label={dark ? "Switch to White theme" : "Switch to Black theme"}
        className={`glass relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-slate-700 ${className}`}
      >
        <Sun
          size={17}
          strokeWidth={2.2}
          className={`absolute text-amber-500 transition-all duration-500 ${dark ? "-rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        />
        <Moon
          size={16}
          strokeWidth={2.2}
          className={`absolute text-teal-300 transition-all duration-500 ${dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`}
        />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`glass relative inline-flex items-center rounded-full p-1 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 bottom-1 w-8 rounded-full bg-teal-500 shadow-[0_4px_14px_-4px_rgb(20_184_166/0.8)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          theme === null ? "opacity-0" : "opacity-100"
        } ${theme === "dark" ? "translate-x-8" : "translate-x-0"}`}
      />
      {(
        [
          ["light", "White theme", Sun],
          ["dark", "Black theme", Moon],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${
            theme === value ? "text-white" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Icon size={15} strokeWidth={2.2} />
        </button>
      ))}
    </div>
  );
}
