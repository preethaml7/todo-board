"use client";

import { CheckCircle2, AlertCircle, Undo2 } from "lucide-react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: "info" | "error";
  action?: ToastAction;
}

export default function Toasts({
  toasts,
  onAction,
}: {
  toasts: ToastItem[];
  onAction: (id: number) => void;
}) {
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast anim-pop ${t.kind}`}>
          {t.kind === "error" ? (
            <AlertCircle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span>{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                onAction(t.id);
              }}
            >
              <Undo2 size={13} /> {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
