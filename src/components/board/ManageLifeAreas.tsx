"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { LifeArea } from "@/lib/types";
import { CATEGORY_COLORS, type CategoryColor } from "@/lib/constants";
import {
  createLifeAreaAction,
  updateLifeAreaAction,
  deleteLifeAreaAction,
} from "@/app/actions/board";

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: CategoryColor) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={`chip chip-${c}`}
          style={{
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 6,
            boxShadow: value === c ? "0 0 0 2px var(--accent)" : "none",
          }}
        >
          <span
            className="chip-dot"
            style={{ background: "currentColor", margin: "0 auto" }}
          />
        </button>
      ))}
    </div>
  );
}

export default function ManageLifeAreas({
  lifeAreas,
  onClose,
  onChange,
}: {
  lifeAreas: LifeArea[];
  onClose: () => void;
  onChange: (areas: LifeArea[]) => void;
}) {
  const [areas, setAreas] = useState<LifeArea[]>(lifeAreas);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<CategoryColor>("teal");
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function sync(next: LifeArea[]) {
    setAreas(next);
    onChange(next);
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setError("");
    const res = await createLifeAreaAction({ name, color: newColor });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not add life area.");
      return;
    }
    sync([...areas, res.data]);
    setNewName("");
  }

  async function saveEdit(id: number, name: string, color: string) {
    const res = await updateLifeAreaAction(id, { name: name.trim(), color });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not update life area.");
      return;
    }
    sync(res.data);
  }

  async function remove(id: number) {
    if (
      !window.confirm(
        "Delete this life area? Tasks using it keep their label but it won't appear as a preset.",
      )
    )
      return;
    const res = await deleteLifeAreaAction(id);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not delete life area.");
      return;
    }
    sync(res.data);
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
          <h2>Manage life areas</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 20 }}>
          {error && <div className="form-error">{error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {areas.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <input
                  className="input"
                  defaultValue={a.name}
                  style={{ flex: "1 1 140px" }}
                  maxLength={40}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== a.name)
                      saveEdit(a.id, e.target.value, a.color);
                  }}
                />
                <ColorPicker
                  value={a.color}
                  onChange={(color) => saveEdit(a.id, a.name, color)}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => remove(a.id)}
                  aria-label="Delete life area"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="label" style={{ marginBottom: 8 }}>
              Add life area
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <input
                className="input"
                placeholder="e.g. Side project, Health, Family"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                style={{ flex: "1 1 160px" }}
                maxLength={40}
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <button
                className="btn btn-primary"
                onClick={add}
                disabled={!newName.trim()}
              >
                <Plus size={15} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
