"use client";

/**
 * QuickCapture — global keyboard-driven quick-add for tasks.
 *
 * Triggered by:
 *   - Floating action button (bottom-right) — `QuickCaptureFab`
 *   - Keyboard: ⌘+Shift+T (or Ctrl+Shift+T) anywhere on the page
 *   - Keyboard: 'q' when not in an input
 *
 * This is the lightweight path: title is required, but priority/due/category
 * can be added inline via the NLP quick-add syntax (e.g., "buy milk !high
 * tomorrow #errands"). For the full task modal, use ⌘+Enter or 'n'.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { X, Plus, Zap } from "lucide-react";
import type { Category, LifeArea } from "@/lib/types";
import { parseQuickAdd, type ParsedQuickAdd } from "@/lib/nlp";
import styles from "./QuickCapture.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (parsed: ParsedQuickAdd) => void;
  categories: Category[];
  lifeAreas: LifeArea[];
};

export function QuickCapture({ open, onClose, onSubmit, categories, lifeAreas }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setText("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parsed = React.useMemo(
    () => parseQuickAdd(text, { categories, lifeAreas }),
    [text, categories, lifeAreas],
  );

  if (!open) return null;

  function submit() {
    if (!parsed.title.trim()) return;
    onSubmit(parsed);
    onClose();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Quick capture a new task">
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Close quick capture"
      />
      <div className={styles.panel}>
        <header className={styles.head}>
          <span className={styles.eyebrow}>
            <Zap size={13} aria-hidden /> Quick capture
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs doing?  (try: write Q3 review !high tomorrow #work @admin)"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {parsed.title.trim() && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>Will save as:</span>
            <strong>{parsed.title}</strong>
            {parsed.priority && (
              <span className={`chip chip-${parsed.priority}`}>
                {parsed.priority === "high" ? "!" : parsed.priority === "medium" ? "!!" : "i"}
                {parsed.priority}
              </span>
            )}
            {parsed.due_date && <span className={styles.previewDate}>📅 {parsed.due_date}</span>}
            {parsed.life_area && <span className={styles.previewArea}>@ {parsed.life_area}</span>}
            {parsed.categoryIds.map((id) => {
              const c = categories.find((x) => x.id === id);
              return c ? <span key={id} className="chip" style={{ background: c.color + "22", color: c.color }}># {c.name}</span> : null;
            })}
          </div>
        )}
        <footer className={styles.foot}>
          <kbd className="kbd">Enter</kbd>
          <span>to save</span>
          <span className={styles.divider} aria-hidden />
          <kbd className="kbd">Esc</kbd>
          <span>to dismiss</span>
          <span className={styles.spacer} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!parsed.title.trim()}
          >
            <Plus size={14} aria-hidden /> Add task
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * QuickCaptureFab — floating action button.
 * Sits bottom-right, opens the QuickCapture dialog. Hidden when capturing
 * is open. Hidden on small screens since the toolbar already has quick-add.
 */
export function QuickCaptureFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.fab}
      onClick={onClick}
      aria-label="Quick capture a new task (Cmd+Shift+T)"
      title="Quick capture  ⌘⇧T"
    >
      <Zap size={20} aria-hidden />
      <span className={styles.fabLabel}>Quick add</span>
    </button>
  );
}

/**
 * useQuickCaptureHotkey — registers the ⌘+Shift+T / Ctrl+Shift+T hotkey.
 * Returns nothing; calls onTrigger when fired.
 */
export function useQuickCaptureHotkey(onTrigger: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        onTrigger();
      } else if (!mod && !e.shiftKey && !e.altKey && (e.key === "q" || e.key === "Q")) {
        const target = e.target as HTMLElement | null;
        const typing =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!typing) {
          e.preventDefault();
          onTrigger();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onTrigger]);
}