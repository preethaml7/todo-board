"use client";

import { useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Search,
  Settings2,
  LogOut,
  Trash,
} from "lucide-react";
import type { Chip } from "@/lib/types";
import ThemeToggle from "@/components/ThemeToggle";
import { logoutAction } from "@/app/actions/auth";
import BoardSettings from "./BoardSettings";
import RemindersBell from "./RemindersBell";
import { BoardGreeting } from "./BoardGreeting";

interface Meta {
  title: string;
  subtitle: string;
  chips: Chip[];
}

export type GreetingStats = {
  dueToday: number;
  overdue: number;
  inProgress: number;
  doneThisWeek: number;
};

export default function Header({
  meta,
  username,
  trashCount,
  greeting,
  onExport,
  onExportCsv,
  onImport,
  onReset,
  onMetaChange,
  onOpenPalette,
  onOpenTrash,
}: {
  meta: Meta;
  username: string;
  trashCount: number;
  greeting: GreetingStats;
  onExport: () => void;
  onExportCsv: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
  onMetaChange: (m: Meta) => void;
  onOpenPalette: () => void;
  onOpenTrash: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <header className="board-header">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 4,
        }}
      >
        <span className="eyebrow gold">Boardspace</span>
        <div
          style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}
        >
          <button
            className="search-box"
            onClick={onOpenPalette}
            aria-label="Search tasks"
            style={{ minWidth: 150 }}
          >
            <Search size={15} />
            <span style={{ fontSize: 13, flex: 1, textAlign: "left" }}>
              Search…
            </span>
            <span className="kbd">⌘K</span>
          </button>
          <RemindersBell />
          <button
            className="btn btn-ghost reminders-btn"
            onClick={onOpenTrash}
            aria-label="Trash"
            title="Trash"
          >
            <Trash size={16} />
            {trashCount > 0 && (
              <span className="reminders-badge">{trashCount}</span>
            )}
          </button>
          <ThemeToggle />
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Import"
          >
            <Upload size={15} /> <span className="btn-label">Import</span>
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="btn"
              onClick={() => setExportOpen((o) => !o)}
              onBlur={() => setTimeout(() => setExportOpen(false), 120)}
              aria-label="Export"
            >
              <Download size={15} /> <span className="btn-label">Export</span>
            </button>
            {exportOpen && (
              <div className="card-menu" style={{ top: 38, minWidth: 168 }}>
                <button
                  className="card-menu-item"
                  onClick={() => {
                    setExportOpen(false);
                    onExport();
                  }}
                >
                  Export Backup (ZIP)
                </button>
                <button
                  className="card-menu-item"
                  onClick={() => {
                    setExportOpen(false);
                    onExportCsv();
                  }}
                >
                  Export as CSV
                </button>
              </div>
            )}
          </div>
          <button
            className="btn"
            onClick={() => {
              if (
                window.confirm(
                  "Clear the board? This permanently deletes all tasks. Consider exporting a backup first.",
                )
              )
                onReset();
            }}
            aria-label="Reset board"
          >
            <RotateCcw size={15} /> <span className="btn-label">Reset</span>
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setSettingsOpen(true)}
            aria-label="Board settings"
            title="Edit board title, description & chips"
          >
            <Settings2 size={15} />
          </button>
          <form action={logoutAction}>
            <button
              className="btn btn-ghost"
              type="submit"
              title={`Signed in as ${username} — sign out`}
            >
              <LogOut size={15} />
            </button>
          </form>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,application/zip,.zip"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (
                f &&
                window.confirm(
                  "Importing replaces all current tasks. Continue?",
                )
              ) {
                onImport(f);
              }
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <BoardGreeting username={username} stats={greeting} />

      <h1 className="board-title">{meta.title}</h1>
      {meta.subtitle && <p className="board-subtitle">{meta.subtitle}</p>}

      {meta.chips.length > 0 && (
        <div className="meta-chips">
          {meta.chips.map((c, i) => (
            <span className="meta-chip" key={i}>
              {c.label}: <strong>{c.value}</strong>
            </span>
          ))}
        </div>
      )}

      {settingsOpen && (
        <BoardSettings
          meta={meta}
          onClose={() => setSettingsOpen(false)}
          onSaved={(m) => {
            onMetaChange(m);
            setSettingsOpen(false);
          }}
        />
      )}
    </header>
  );
}
