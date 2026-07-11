import type { Priority, Status } from "./constants";

export interface Category {
  id: number;
  name: string;
  color: string;
  position: number;
}

/** A user-customizable life area (e.g. Personal, Work, Side project). */
export interface LifeArea {
  id: number;
  name: string;
  color: string;
  position: number;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
  position: number;
}

export interface ActivityEntry {
  id: number;
  task_id: number;
  type: string;
  detail: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  life_area: string;
  status: Status;
  priority: Priority;
  owner: string | null;
  due_date: string | null;
  revisit_date: string | null;
  notes: string | null;
  position: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  categoryIds: number[];
  subtasks: Subtask[];
  attachmentCount: number;
}

export interface TrashedTask extends Task {
  deleted_at: string | null;
}

export interface Chip {
  label: string;
  value: string;
}

export interface BoardData {
  tasks: Task[];
  categories: Category[];
  lifeAreas: LifeArea[];
  trashCount: number;
  meta: {
    title: string;
    subtitle: string;
    chips: Chip[];
  };
}

export interface BoardExportV1 {
  version: 1;
  exportedAt: string;
  meta: {
    title: string;
    subtitle: string;
    chips: Chip[];
  };
  categories: Category[];
  tasks: Array<
    Omit<Task, "categoryIds" | "subtasks" | "attachmentCount"> & {
      categories: string[];
      subtasks: { title: string; done: boolean }[];
    }
  >;
}

export interface BoardExportV2 {
  version: 2;
  exportedAt: string;
  schemaVersion: string;
  data: {
    meta: Record<string, string>;
    lifeAreas: LifeArea[];
    categories: Category[];
    tasks: Record<string, unknown>[];
    subtasks: Record<string, unknown>[];
    taskCategories: Record<string, unknown>[];
    activityLog: Record<string, unknown>[];
    attachments: Record<string, unknown>[];
  };
}

export type BoardExport = BoardExportV1 | BoardExportV2;
