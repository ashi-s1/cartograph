"use client";

import * as React from "react";
import { useTheme } from "next-themes";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="flex h-7 w-36 items-center justify-center rounded-md border border-border/40 bg-muted/30" />
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme switcher"
      className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-label="Follow system theme"
        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
          theme === "system"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        system
      </button>

      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Force light theme"
        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
          theme === "light"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        light
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Force dark theme"
        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
          theme === "dark"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        dark
      </button>
    </div>
  );
}
