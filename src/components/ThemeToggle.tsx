"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const STORAGE_KEY = "boardspace.theme";

function readStored(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function readCurrent(): Theme {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  const data = document.documentElement.dataset.theme;
  if (data === "dark" || data === "light") return data;
  return "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  // Update the meta tag so SSR-rendered pages match
  const meta = document.querySelector('meta[name="theme"]');
  if (meta) meta.setAttribute("content", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // Start with what the inline init script already applied (or "dark" default)
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStored() ?? readCurrent());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
  }

  // Avoid hydration mismatch: render an invisible button until mounted.
  if (!mounted) {
    return <span className={className} aria-hidden style={{ display: "inline-block", width: 32, height: 32 }} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost ${className}`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
