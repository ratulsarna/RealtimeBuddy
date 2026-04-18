"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const isDark = hydrated && resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = hydrated ? `Switch to ${next} theme` : "Toggle theme";

  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      onClick={() => {
        if (hydrated) setTheme(next);
      }}
      title={label}
      type="button"
    >
      <span className="relative block h-[18px] w-[18px]">
        <svg
          aria-hidden
          className={`absolute inset-0 h-[18px] w-[18px] transition-opacity duration-200 ${hydrated && isDark ? "opacity-100" : "opacity-0"}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
        >
          {/* Sun — shown when current theme is dark (click to go light) */}
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <svg
          aria-hidden
          className={`absolute inset-0 h-[18px] w-[18px] transition-opacity duration-200 ${hydrated && !isDark ? "opacity-100" : "opacity-0"}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
        >
          {/* Moon — shown when current theme is light (click to go dark) */}
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        </svg>
      </span>
    </button>
  );
}
