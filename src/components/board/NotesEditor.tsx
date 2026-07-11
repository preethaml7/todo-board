"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";

export default function NotesEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Start in preview when there's already content to read; edit otherwise.
  const [mode, setMode] = useState<"edit" | "preview">(
    value.trim() ? "preview" : "edit",
  );
  const html = useMemo(() => renderMarkdown(value), [value]);

  return (
    <div className="notes-editor">
      <div className="notes-editor-bar">
        <span className="notes-hint">
          Markdown: **bold** *italic* `code` - lists, links
        </span>
        <button
          type="button"
          className="btn btn-ghost notes-toggle"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
        >
          {mode === "edit" ? (
            <>
              <Eye size={13} /> Preview
            </>
          ) : (
            <>
              <Pencil size={13} /> Edit
            </>
          )}
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Context, links, follow-ups…  (markdown supported)"
          rows={4}
          style={{ resize: "vertical" }}
          maxLength={5000}
          autoFocus
        />
      ) : html ? (
        <div
          className="notes-preview"
          onClick={() => setMode("edit")}
          title="Click to edit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div
          className="notes-preview notes-empty"
          onClick={() => setMode("edit")}
        >
          No notes yet — click to add.
        </div>
      )}
    </div>
  );
}
