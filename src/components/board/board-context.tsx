"use client";

import { createContext, useContext } from "react";
import type { Category, LifeArea, Task } from "@/lib/types";
import type { Status } from "@/lib/constants";
import type { ParsedQuickAdd } from "@/lib/nlp";

export type ViewMode = "board" | "list" | "overview" | "files";
export type CategoryFilter = "all" | "uncategorized" | number;
/** "all" or a life-area name. */
export type LifeFilter = string;

export interface BoardContextValue {
  tasks: Task[];
  categories: Category[];
  categoryById: Map<number, Category>;
  lifeAreas: LifeArea[];
  lifeAreaByName: Map<string, LifeArea>;
  /** Contiguous 1..N serial per task id, by creation order. */
  seqById: Map<number, number>;

  // filters / view
  view: ViewMode;
  setView: (v: ViewMode) => void;
  categoryFilter: CategoryFilter;
  setCategoryFilter: (c: CategoryFilter) => void;
  lifeFilter: LifeFilter;
  setLifeFilter: (l: LifeFilter) => void;
  search: string;
  setSearch: (s: string) => void;

  // the tasks visible under current filters
  visibleTasks: Task[];

  // task ops
  openNewTask: (status?: Status) => void;
  openTask: (task: Task) => void;
  moveTask: (taskId: number, toStatus: Status, orderedIds: number[]) => void;
  /** Move a task to the end of another column (used by the card menu). */
  moveTaskToStatus: (taskId: number, toStatus: Status) => void;
  quickAddTask: (status: Status, parsed: ParsedQuickAdd) => void;

  // pin/unpin a task. Pinned tasks float to the top of their column.
  togglePin: (taskId: number) => void;

  // customization
  refreshCategories: (cats: Category[]) => void;
  refreshLifeAreas: (areas: LifeArea[]) => void;

  toast: (message: string, kind?: "info" | "error") => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within BoardApp");
  return ctx;
}
