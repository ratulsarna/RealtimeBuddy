"use client";

import type { ReactNode } from "react";

type DrawerShellProps = {
  onClose: () => void;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function DrawerShell({
  onClose,
  title,
  headerExtra,
  children,
}: DrawerShellProps) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="drawer-backdrop absolute inset-0" />
      <aside
        className="slide-in-right absolute bottom-0 right-0 top-0 flex w-full max-w-[26rem] flex-col overflow-hidden border-l border-[var(--panel-border)] bg-[var(--drawer-panel-bg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--line)]/70 px-6 py-4">
          <p className="display text-[1.1rem] font-medium tracking-[-0.01em] text-[var(--foreground-strong)]">
            {title}
          </p>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              aria-label="Close drawer"
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line)]/70 text-[var(--foreground-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
