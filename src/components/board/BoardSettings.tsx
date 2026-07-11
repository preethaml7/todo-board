"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { Chip } from "@/lib/types";
import { setBoardMetaAction } from "@/app/actions/board";

interface Meta {
  title: string;
  subtitle: string;
  chips: Chip[];
}

export default function BoardSettings({
  meta,
  onClose,
  onSaved,
}: {
  meta: Meta;
  onClose: () => void;
  onSaved: (m: Meta) => void;
}) {
  const [title, setTitle] = useState(meta.title);
  const [subtitle, setSubtitle] = useState(meta.subtitle);
  const [chips, setChips] = useState<Chip[]>(meta.chips);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateChip(i: number, patch: Partial<Chip>) {
    setChips((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function save() {
    setSaving(true);
    setError("");
    const cleanChips = chips.filter((c) => c.label.trim() || c.value.trim());
    const next = { title: title.trim(), subtitle, chips: cleanChips };
    const res = await setBoardMetaAction(next);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    onSaved(next);
  }

  return (
    <div className="modal-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="modal anim-pop"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="modal-head">
          <h2>Board settings</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              className="input"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={3}
              maxLength={400}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="field">
            <label>Meta chips</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {chips.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Label"
                    value={c.label}
                    onChange={(e) => updateChip(i, { label: e.target.value })}
                    style={{ flex: "0 0 40%" }}
                    maxLength={40}
                  />
                  <input
                    className="input"
                    placeholder="Value"
                    value={c.value}
                    onChange={(e) => updateChip(i, { value: e.target.value })}
                    maxLength={60}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setChips((cs) => cs.filter((_, idx) => idx !== i))
                    }
                    aria-label="Remove chip"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {chips.length < 12 && (
                <button
                  className="add-task-btn"
                  onClick={() =>
                    setChips((cs) => [...cs, { label: "", value: "" }])
                  }
                >
                  <Plus size={15} /> Add chip
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={save}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
