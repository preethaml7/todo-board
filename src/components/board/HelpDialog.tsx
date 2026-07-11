"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const SHORTCUTS: [string, string][] = [
  ["⌘K  /  /", "Open search & commands"],
  ["N", "New task"],
  ["1 – 6", "Jump to a column"],
  ["?", "Show this help"],
  ["Esc", "Close dialog"],
  ["Enter", "Open focused card"],
];

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="modal anim-pop"
        style={{ maxWidth: 480 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 22 }}>
          <div className="help-grid">
            {SHORTCUTS.map(([k, label]) => (
              <div className="row" key={k}>
                <span>{label}</span>
                <span className="kbd">{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
