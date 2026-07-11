"use client";

import { useMemo, useState } from "react";
import { Tags, LayoutGrid, List, CalendarRange, SlidersHorizontal, FolderOpen } from "lucide-react";
import type { Category, LifeArea } from "@/lib/types";
import { useBoard, type ViewMode } from "./board-context";
import ManageCategories from "./ManageCategories";
import ManageLifeAreas from "./ManageLifeAreas";

export default function Toolbar({
  onManageCategories,
  onManageLifeAreas,
}: {
  onManageCategories: (cats: Category[]) => void;
  onManageLifeAreas: (areas: LifeArea[]) => void;
}) {
  const {
    tasks,
    categories,
    lifeAreas,
    categoryFilter,
    setCategoryFilter,
    lifeFilter,
    setLifeFilter,
    view,
    setView,
  } = useBoard();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageLifeOpen, setManageLifeOpen] = useState(false);

  // Counts respect the active life-area filter so numbers stay meaningful.
  const lifeScoped = useMemo(
    () =>
      lifeFilter === "all"
        ? tasks
        : tasks.filter((t) => t.life_area === lifeFilter),
    [tasks, lifeFilter],
  );
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    let uncategorized = 0;
    for (const t of lifeScoped) {
      if (t.categoryIds.length === 0) uncategorized++;
      for (const cid of t.categoryIds) m.set(cid, (m.get(cid) ?? 0) + 1);
    }
    return { byCat: m, all: lifeScoped.length, uncategorized };
  }, [lifeScoped]);

  const views: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "board", label: "Board", icon: <LayoutGrid size={14} /> },
    { key: "list", label: "List", icon: <List size={14} /> },
    { key: "overview", label: "Overview", icon: <CalendarRange size={14} /> },
    { key: "files", label: "Files", icon: <FolderOpen size={14} /> },
  ];

  return (
    <div className="toolbar">
      <div className="filter-tabs">
        <button
          className={`filter-tab ${categoryFilter === "all" ? "active" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          All <span className="count">{counts.all}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`filter-tab ${categoryFilter === c.id ? "active" : ""}`}
            onClick={() => setCategoryFilter(c.id)}
          >
            <span
              className={`chip-dot chip-${c.color}`}
              style={{ background: "currentColor", color: undefined }}
            />
            {c.name} <span className="count">{counts.byCat.get(c.id) ?? 0}</span>
          </button>
        ))}
        <button
          className={`filter-tab ${
            categoryFilter === "uncategorized" ? "active" : ""
          }`}
          onClick={() => setCategoryFilter("uncategorized")}
        >
          Uncategorized <span className="count">{counts.uncategorized}</span>
        </button>
        <button className="filter-tab" onClick={() => setManageOpen(true)}>
          <Tags size={14} /> Manage
        </button>
      </div>

      <div
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <div className="segmented" role="group" aria-label="Life area filter">
          <button
            className={lifeFilter === "all" ? "active" : ""}
            onClick={() => setLifeFilter("all")}
          >
            All
          </button>
          {lifeAreas.map((a) => (
            <button
              key={a.id}
              className={lifeFilter === a.name ? "active" : ""}
              onClick={() => setLifeFilter(a.name)}
            >
              {a.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => setManageLifeOpen(true)}
          title="Manage life areas"
          aria-label="Manage life areas"
          style={{ padding: 7 }}
        >
          <SlidersHorizontal size={15} />
        </button>
      </div>

      <div className="segmented" role="group" aria-label="View">
        {views.map((v) => (
          <button
            key={v.key}
            className={view === v.key ? "active" : ""}
            onClick={() => setView(v.key)}
            title={v.label}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {v.icon}
              {v.label}
            </span>
          </button>
        ))}
      </div>

      {manageOpen && (
        <ManageCategories
          categories={categories}
          onClose={() => setManageOpen(false)}
          onChange={onManageCategories}
        />
      )}
      {manageLifeOpen && (
        <ManageLifeAreas
          lifeAreas={lifeAreas}
          onClose={() => setManageLifeOpen(false)}
          onChange={onManageLifeAreas}
        />
      )}
    </div>
  );
}
