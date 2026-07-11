// Domain constants shared by the server and the UI.

export const STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "onhold",
  "done",
] as const;
export type Status = (typeof STATUSES)[number];

export interface StatusMeta {
  key: Status;
  label: string;
  hint: string;
  /** CSS variable name for the soft column tint. */
  tintVar: string;
  /** CSS variable name for the card left-accent / header dot. */
  accentVar: string;
}

export const STATUS_META: Record<Status, StatusMeta> = {
  backlog: {
    key: "backlog",
    label: "Backlog",
    hint: "Captured, not yet committed",
    tintVar: "--col-backlog-tint",
    accentVar: "--col-backlog-accent",
  },
  todo: {
    key: "todo",
    label: "To Do",
    hint: "Committed — ready to start",
    tintVar: "--col-todo-tint",
    accentVar: "--col-todo-accent",
  },
  in_progress: {
    key: "in_progress",
    label: "In Progress",
    hint: "Actively working on it",
    tintVar: "--col-progress-tint",
    accentVar: "--col-progress-accent",
  },
  onhold: {
    key: "onhold",
    label: "On Hold",
    hint: "Waiting on something, or snoozed to revisit later",
    tintVar: "--col-onhold-tint",
    accentVar: "--col-onhold-accent",
  },
  done: {
    key: "done",
    label: "Done",
    hint: "Completed",
    tintVar: "--col-done-tint",
    accentVar: "--col-done-accent",
  },
};

/** Soft WIP limit for the In Progress column (Personal Kanban guidance). */
export const WIP_LIMIT = 3;

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Life areas are user-customizable (stored in the `life_areas` table), so a
// task's life_area is just the area name. `LifeAreaColor` reuses the chip palette.
export const MAX_LIFE_AREA_LEN = 40;

/** Jira-style issue-key prefix shown on cards, e.g. TASK-12. */
export const ISSUE_PREFIX = "TASK";

/** Category chip color keys — map to `.chip-<key>` classes in globals.css. */
export const CATEGORY_COLORS = [
  "blue",
  "indigo",
  "amber",
  "green",
  "red",
  "purple",
  "teal",
  "pink",
  "slate",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
