"use client";

/**
 * Boardspace Calendar — date picker component.
 *
 * Drop-in replacement for <input type="date">.
 * - Keyboard-navigable (arrow keys, Enter, Escape)
 * - Theme-aware (uses --color-*, --bg, --text, --accent, --border tokens)
 * - Range-locked: blocks past dates by default; set `min` to override
 * - Calls onChange(value: string | null) with ISO yyyy-mm-dd or null when cleared
 */

import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./Calendar.module.css";

type Props = {
  value: string | null | undefined; // ISO yyyy-mm-dd
  onChange: (v: string | null) => void;
  label?: string;
  placeholder?: string;
  min?: string; // ISO yyyy-mm-dd; defaults to today
  disabled?: boolean;
  id?: string;
};

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatLongDate(s: string | null | undefined): string {
  if (!s) return "";
  try {
    const d = fromISODate(s);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export function Calendar({
  value,
  onChange,
  label,
  placeholder = "Pick a date",
  min,
  disabled = false,
  id,
}: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const popoverId = `${fieldId}-popover`;

  const today = startOfDay(new Date());
  const minDate = min ? fromISODate(min) : today;
  const selected = value ? fromISODate(value) : null;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? today);
  const [focusedDate, setFocusedDate] = useState<Date>(selected ?? today);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function focusGrid() {
    // Focus the selected day button (or focusedDate) on open
    requestAnimationFrame(() => {
      const el = popoverRef.current?.querySelector<HTMLButtonElement>(
        `[data-date="${toISODate(focusedDate)}"]`,
      );
      el?.focus();
    });
  }

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    if (selected) setFocusedDate(selected);
    focusGrid();
  }

  function handleSelect(d: Date) {
    onChange(toISODate(d));
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  function handleKeyDownOnGrid(e: React.KeyboardEvent<HTMLDivElement>) {
    const move = (delta: number, unit: "day" | "week" | "month") => {
      e.preventDefault();
      const next = new Date(focusedDate);
      if (unit === "day") next.setDate(next.getDate() + delta);
      if (unit === "week") next.setDate(next.getDate() + 7 * delta);
      if (unit === "month") setViewMonth(addMonths(viewMonth, delta));
      setFocusedDate(next);
      if (unit !== "month") {
        if (next.getMonth() !== viewMonth.getMonth() || next.getFullYear() !== viewMonth.getFullYear()) {
          setViewMonth(next);
        }
        requestAnimationFrame(() => {
          const el = popoverRef.current?.querySelector<HTMLButtonElement>(
            `[data-date="${toISODate(next)}"]`,
          );
          el?.focus();
        });
      }
    };
    switch (e.key) {
      case "ArrowLeft":  return move(-1, "day");
      case "ArrowRight": return move(+1, "day");
      case "ArrowUp":    return move(-1, "week");
      case "ArrowDown":  return move(+1, "week");
      case "PageUp":     return move(-1, "month");
      case "PageDown":   return move(+1, "month");
      case "Home": {
        e.preventDefault();
        const d = new Date(focusedDate);
        d.setDate(1);
        setFocusedDate(d);
        requestAnimationFrame(() => {
          const el = popoverRef.current?.querySelector<HTMLButtonElement>(
            `[data-date="${toISODate(d)}"]`,
          );
          el?.focus();
        });
        return;
      }
      case "End": {
        e.preventDefault();
        const d = new Date(focusedDate);
        d.setMonth(d.getMonth() + 1);
        d.setDate(0); // last day of current month
        setFocusedDate(d);
        requestAnimationFrame(() => {
          const el = popoverRef.current?.querySelector<HTMLButtonElement>(
            `[data-date="${toISODate(d)}"]`,
          );
          el?.focus();
        });
        return;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedDate >= minDate) handleSelect(focusedDate);
        return;
    }
  }

  // Build the calendar grid
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // Pad to 6 rows = 42 cells for layout stability
  while (cells.length < 42) cells.push(null);

  const isDisabled = (d: Date) => d < minDate;

  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className={styles.row}>
        <button
          type="button"
          ref={triggerRef}
          id={fieldId}
          className={styles.trigger}
          onClick={handleOpen}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          disabled={disabled}
          aria-label={label ? `Open ${label} calendar${value ? `, currently ${formatLongDate(value)}` : ""}` : value ? `Calendar, ${formatLongDate(value)}` : "Open calendar"}
        >
          <CalendarIcon />
          <span className={value ? styles.value : styles.placeholder}>
            {value ? formatLongDate(value) : placeholder}
          </span>
          {value && !disabled && (
            <span
              className={styles.clearBtn}
              onClick={handleClear}
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
            >
              ×
            </span>
          )}
        </button>
      </div>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={styles.popover}
          role="dialog"
          aria-label={`Calendar for ${label ?? "date selection"}`}
        >
          <div className={styles.header}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className={styles.title}>
              {MONTH_NAMES[month]} {year}
            </div>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div
            className={styles.grid}
            role="grid"
            aria-label={`${MONTH_NAMES[month]} ${year}`}
            onKeyDown={handleKeyDownOnGrid}
          >
            {DAY_NAMES.map((d) => (
              <div key={d} className={styles.dayHeader} role="columnheader">
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) {
                return <div key={i} className={styles.empty} aria-hidden />;
              }
              const iso = toISODate(d);
              const isSel = selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              const isFocused = isSameDay(d, focusedDate);
              const disabled = isDisabled(d);
              return (
                /* eslint-disable-next-line jsx-a11y/role-supports-aria-props */
                <button
                  key={i}
                  type="button"
                  data-date={iso}
                  className={`${styles.day} ${isSel ? styles.selected : ""} ${
                    isToday ? styles.today : ""
                  } ${isFocused ? styles.focused : ""} ${
                    disabled ? styles.disabled : ""
                  }`}
                  onClick={() => !disabled && handleSelect(d)}
                  disabled={disabled}
                  aria-label={d.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  aria-selected={!!isSel} /* selected day in calendar grid */
                  tabIndex={isFocused ? 0 : -1}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={() => {
                const d = today;
                setViewMonth(d);
                setFocusedDate(d);
                if (d >= minDate) handleSelect(d);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={() => {
                const d = addMonths(today, 7);
                d.setDate(d.getDate() + 6);
                setViewMonth(d);
                setFocusedDate(d);
                if (d >= minDate) handleSelect(d);
              }}
            >
              In a week
            </button>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={() => {
                setViewMonth(addMonths(today, 1));
                setFocusedDate(addMonths(today, 1));
              }}
            >
              Next month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className={styles.triggerIcon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
