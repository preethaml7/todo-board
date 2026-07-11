"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, ImageIcon } from "lucide-react";
import type { Attachment } from "@/lib/types";
import {
  listAttachmentsAction,
  uploadAttachmentAction,
  deleteAttachmentAction,
} from "@/app/actions/board";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentsSection({
  taskId,
  onCountChange,
}: {
  taskId: number;
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listAttachmentsAction(taskId).then((r) => {
      if (r.ok && r.data) {
        setItems(r.data);
        onCountChange?.(r.data.length);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadAttachmentAction(taskId, fd);
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Upload failed.");
      return;
    }
    setItems(r.data);
    onCountChange?.(r.data.length);
  }

  async function remove(id: number) {
    const r = await deleteAttachmentAction(id);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not remove.");
      return;
    }
    setItems(r.data);
    onCountChange?.(r.data.length);
  }

  return (
    <div>
      {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}
      {items.map((a) => (
        <div key={a.id} className="attach-row">
          {a.mime.startsWith("image/") ? (
            <ImageIcon size={14} />
          ) : (
            <FileText size={14} />
          )}
          <a
            className="attach-name"
            href={`/api/attachments/${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {a.filename}
          </a>
          <span className="attach-size">{formatSize(a.size)}</span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 5 }}
            onClick={() => remove(a.id)}
            aria-label="Remove attachment"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="add-task-btn"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? (
          "Uploading…"
        ) : (
          <>
            <Upload size={14} /> Attach a file
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        style={{ display: "none" }}
        onChange={onFile}
      />
    </div>
  );
}
