import { getDb, runMigrations } from "./client";
import type {
  ActivityEntry,
  Attachment,
  BoardData,
  BoardExport,
  Category,
  Chip,
  LifeArea,
  Subtask,
  Task,
  TrashedTask,
} from "@/lib/types";
import type { Priority, Status } from "@/lib/constants";
import { createHash } from "node:crypto";
import {
  writeFile,
  mkdir,
  readFile as fsReadFile,
} from "node:fs/promises";
import {
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, sep } from "node:path";
import { detectMime } from "./mime";
import type { FileItem, Folder, Annotation, FileNode } from "@/lib/files";

const now = () => new Date().toISOString();

/* ----------------------------- row mappers ----------------------------- */

interface TaskRow {
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
  pinned: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapSubtask(r: Record<string, unknown>): Subtask {
  return {
    id: r.id as number,
    task_id: r.task_id as number,
    title: r.title as string,
    done: Boolean(r.done),
    position: r.position as number,
  };
}

/* ------------------------------- board -------------------------------- */

export function getBoardData(): BoardData {
  const db = getDb();
  const taskRows = db
    .prepare(
      "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY position ASC, id ASC",
    )
    .all() as TaskRow[];

  const subtaskRows = db
    .prepare("SELECT * FROM subtasks ORDER BY position ASC, id ASC")
    .all() as Record<string, unknown>[];
  const catLinks = db
    .prepare("SELECT task_id, category_id FROM task_categories")
    .all() as { task_id: number; category_id: number }[];

  const subsByTask = new Map<number, Subtask[]>();
  for (const row of subtaskRows) {
    const s = mapSubtask(row);
    const arr = subsByTask.get(s.task_id) ?? [];
    arr.push(s);
    subsByTask.set(s.task_id, arr);
  }
  const catsByTask = new Map<number, number[]>();
  for (const link of catLinks) {
    const arr = catsByTask.get(link.task_id) ?? [];
    arr.push(link.category_id);
    catsByTask.set(link.task_id, arr);
  }

  const attCounts = db
    .prepare("SELECT task_id, COUNT(*) AS n FROM attachments GROUP BY task_id")
    .all() as { task_id: number; n: number }[];
  const attByTask = new Map(attCounts.map((r) => [r.task_id, r.n]));

  const tasks: Task[] = taskRows.map((r) => ({
    ...r,
    pinned: Boolean(r.pinned),
    categoryIds: catsByTask.get(r.id) ?? [],
    subtasks: subsByTask.get(r.id) ?? [],
    attachmentCount: attByTask.get(r.id) ?? 0,
  }));

  return {
    tasks,
    categories: getCategories(),
    lifeAreas: getLifeAreas(),
    trashCount: getTrashCount(),
    meta: getBoardMeta(),
  };
}

export function getBoardMeta() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  let chips: Chip[] = [];
  try {
    chips = JSON.parse(map.get("chips") ?? "[]");
  } catch {
    chips = [];
  }
  return {
    title: map.get("board_title") ?? "My Boardspace",
    subtitle: map.get("board_subtitle") ?? "",
    chips,
  };
}

export function setMeta(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

/* ----------------------------- categories ----------------------------- */

export function getCategories(): Category[] {
  return getDb()
    .prepare("SELECT * FROM categories ORDER BY position ASC, id ASC")
    .all() as Category[];
}

export function createCategory(name: string, color: string): Category {
  const db = getDb();
  const pos =
    (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories").get() as {
      p: number;
    }).p;
  const info = db
    .prepare("INSERT INTO categories (name, color, position) VALUES (?, ?, ?)")
    .run(name, color, pos);
  return db
    .prepare("SELECT * FROM categories WHERE id = ?")
    .get(info.lastInsertRowid) as Category;
}

export function updateCategory(id: number, name: string, color: string) {
  getDb()
    .prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?")
    .run(name, color, id);
}

export function deleteCategory(id: number) {
  getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
}

/* ----------------------------- life areas ----------------------------- */

export function getLifeAreas(): LifeArea[] {
  return getDb()
    .prepare("SELECT * FROM life_areas ORDER BY position ASC, id ASC")
    .all() as LifeArea[];
}

export function createLifeArea(name: string, color: string): LifeArea {
  const db = getDb();
  const pos = (
    db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM life_areas").get() as {
      p: number;
    }
  ).p;
  const info = db
    .prepare("INSERT INTO life_areas (name, color, position) VALUES (?, ?, ?)")
    .run(name, color, pos);
  return db
    .prepare("SELECT * FROM life_areas WHERE id = ?")
    .get(info.lastInsertRowid) as LifeArea;
}

export function updateLifeArea(id: number, name: string, color: string) {
  const db = getDb();
  const before = db
    .prepare("SELECT name FROM life_areas WHERE id = ?")
    .get(id) as { name: string } | undefined;
  db.prepare("UPDATE life_areas SET name = ?, color = ? WHERE id = ?").run(
    name,
    color,
    id,
  );
  // Keep tasks in sync when a life area is renamed (life_area stores the name).
  if (before && before.name !== name) {
    db.prepare("UPDATE tasks SET life_area = ? WHERE life_area = ?").run(
      name,
      before.name,
    );
  }
}

export function deleteLifeArea(id: number) {
  getDb().prepare("DELETE FROM life_areas WHERE id = ?").run(id);
}

/* ------------------------------- tasks -------------------------------- */

export interface TaskInput {
  title: string;
  life_area: string;
  status: Status;
  priority: Priority;
  owner?: string | null;
  due_date?: string | null;
  revisit_date?: string | null;
  notes?: string | null;
  categoryIds?: number[];
  pinned?: boolean;
}

/**
 * Toggle a task's pinned flag. Returns the new pinned state (true/false).
 * Pinned tasks float to the top of their column regardless of position.
 */
export function toggleTaskPinned(id: number): boolean {
  const db = getDb();
  const before = db
    .prepare("SELECT pinned FROM tasks WHERE id = ?")
    .get(id) as { pinned: number } | undefined;
  if (!before) throw new Error("Task not found");
  const next = before.pinned ? 0 : 1;
  const ts = now();
  db.prepare(
    "UPDATE tasks SET pinned = ?, updated_at = ? WHERE id = ?",
  ).run(next, ts, id);
  logActivity(id, next ? "pinned" : "unpinned");
  return Boolean(next);
}

function logActivity(taskId: number, type: string, detail?: string) {
  getDb()
    .prepare(
      "INSERT INTO activity_log (task_id, type, detail, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(taskId, type, detail ?? null, now());
}

export function getTask(id: number): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
    | TaskRow
    | undefined;
  if (!row) return null;
  const categoryIds = (
    db.prepare("SELECT category_id FROM task_categories WHERE task_id = ?").all(id) as {
      category_id: number;
    }[]
  ).map((r) => r.category_id);
  const subtasks = (
    db
      .prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, id ASC")
      .all(id) as Record<string, unknown>[]
  ).map(mapSubtask);
  const attachmentCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM attachments WHERE task_id = ?")
      .get(id) as { n: number }
  ).n;
  return { ...row, pinned: Boolean(row.pinned), categoryIds, subtasks, attachmentCount };
}

export function createTask(input: TaskInput): Task {
  const db = getDb();
  const ts = now();
  const pos =
    (db
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE status = ?")
      .get(input.status) as { p: number }).p;
  const completedAt = input.status === "done" ? ts : null;

  const info = db
    .prepare(
      `INSERT INTO tasks
        (title, life_area, status, priority, owner, due_date, revisit_date, notes, position, created_at, updated_at, completed_at)
       VALUES (@title, @life_area, @status, @priority, @owner, @due_date, @revisit_date, @notes, @position, @created_at, @updated_at, @completed_at)`,
    )
    .run({
      title: input.title,
      life_area: input.life_area,
      status: input.status,
      priority: input.priority,
      owner: input.owner ?? null,
      due_date: input.due_date ?? null,
      revisit_date: input.revisit_date ?? null,
      notes: input.notes ?? null,
      position: pos,
      created_at: ts,
      updated_at: ts,
      completed_at: completedAt,
    });
  const id = Number(info.lastInsertRowid);
  if (input.categoryIds) setTaskCategories(id, input.categoryIds);
  logActivity(id, "created", `Created in ${input.status}`);
  return getTask(id)!;
}

export function updateTaskFields(id: number, input: TaskInput): Task {
  const db = getDb();
  const before = getTask(id);
  if (!before) throw new Error("Task not found");
  const ts = now();

  // Track completed_at transitions when status changes via the modal.
  let completedAt = before.completed_at;
  if (input.status === "done" && before.status !== "done") completedAt = ts;
  if (input.status !== "done") completedAt = null;

  db.prepare(
    `UPDATE tasks SET
       title = @title, life_area = @life_area, status = @status, priority = @priority,
       owner = @owner, due_date = @due_date, revisit_date = @revisit_date, notes = @notes,
       updated_at = @updated_at, completed_at = @completed_at
     WHERE id = @id`,
  ).run({
    id,
    title: input.title,
    life_area: input.life_area,
    status: input.status,
    priority: input.priority,
    owner: input.owner ?? null,
    due_date: input.due_date ?? null,
    revisit_date: input.revisit_date ?? null,
    notes: input.notes ?? null,
    updated_at: ts,
    completed_at: completedAt,
  });

  if (input.categoryIds) setTaskCategories(id, input.categoryIds);

  if (before.status !== input.status) {
    logActivity(id, "moved", `${before.status} → ${input.status}`);
  } else {
    logActivity(id, "updated", "Edited details");
  }
  return getTask(id)!;
}

/** Permanently remove a task (used by "delete forever" in Trash). */
export function deleteTask(id: number) {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

/* -------------------------------- trash ------------------------------- */

/** Soft-delete: move a task to the Trash (keeps everything, hides it). */
export function trashTask(id: number) {
  const db = getDb();
  const ts = now();
  db.prepare(
    "UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
  ).run(ts, ts, id);
  logActivity(id, "trashed", "Moved to trash");
}

/** Restore a trashed task back to the board (keeps its original status). */
export function restoreTask(id: number): Task | null {
  const db = getDb();
  db.prepare(
    "UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
  ).run(now(), id);
  logActivity(id, "restored", "Restored from trash");
  return getTask(id);
}

interface TrashRow extends TaskRow {
  deleted_at: string | null;
}

/** Tasks currently in the trash, most-recently-deleted first. */
export function getTrashedTasks(): TrashedTask[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC",
    )
    .all() as TrashRow[];
  return rows.map((r) => {
    const catIds = (
      db
        .prepare("SELECT category_id FROM task_categories WHERE task_id = ?")
        .all(r.id) as { category_id: number }[]
    ).map((x) => x.category_id);
    return { ...r, pinned: Boolean(r.pinned), categoryIds: catIds, subtasks: [], attachmentCount: 0 };
  });
}

export function getTrashCount(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NOT NULL")
      .get() as { n: number }
  ).n;
}

/** Permanently delete every trashed task. */
export function emptyTrash(): number {
  const info = getDb()
    .prepare("DELETE FROM tasks WHERE deleted_at IS NOT NULL")
    .run();
  return info.changes;
}

/* ----------------------------- attachments ---------------------------- */

interface AttachmentRow extends Attachment {
  stored_name: string;
}

export function addAttachment(input: {
  task_id: number;
  filename: string;
  mime: string;
  size: number;
  stored_name: string;
}): Attachment {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO attachments (task_id, filename, mime, size, stored_name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.task_id,
      input.filename,
      input.mime,
      input.size,
      input.stored_name,
      now(),
    );
  logActivity(input.task_id, "attached", input.filename);
  return db
    .prepare(
      "SELECT id, task_id, filename, mime, size, created_at FROM attachments WHERE id = ?",
    )
    .get(info.lastInsertRowid) as Attachment;
}

export function getAttachments(taskId: number): Attachment[] {
  return getDb()
    .prepare(
      "SELECT id, task_id, filename, mime, size, created_at FROM attachments WHERE task_id = ? ORDER BY created_at ASC, id ASC",
    )
    .all(taskId) as Attachment[];
}

export function getAttachmentCount(taskId: number): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM attachments WHERE task_id = ?")
      .get(taskId) as { n: number }
  ).n;
}

/** Full row (incl. stored_name) — for serving or deleting the file. */
export function getAttachmentRow(id: number): AttachmentRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(id) as AttachmentRow | undefined) ?? null
  );
}

export function deleteAttachmentRow(id: number) {
  getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

/**
 * Move a task to a status and rewrite the ordering of the target column.
 * `orderedIds` is the full list of task ids in the destination column,
 * in their new visual order (including the moved task).
 */
export function moveTask(taskId: number, toStatus: Status, orderedIds: number[]) {
  const db = getDb();
  const before = getTask(taskId);
  if (!before) return;
  const ts = now();

  const tx = db.transaction(() => {
    let completedAt = before.completed_at;
    if (toStatus === "done" && before.status !== "done") completedAt = ts;
    if (toStatus !== "done") completedAt = null;

    db.prepare(
      "UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?",
    ).run(toStatus, ts, completedAt, taskId);

    const setPos = db.prepare("UPDATE tasks SET position = ? WHERE id = ?");
    orderedIds.forEach((id, i) => setPos.run(i, id));

    if (before.status !== toStatus) {
      const label =
        toStatus === "done"
          ? "Completed"
          : before.status === "done"
            ? "Reopened"
            : "Moved";
      logActivity(taskId, "moved", `${before.status} → ${toStatus}`);
      if (label === "Completed") logActivity(taskId, "completed");
      if (label === "Reopened") logActivity(taskId, "reopened");
    }
  });
  tx();
}

export function setTaskCategories(taskId: number, categoryIds: number[]) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM task_categories WHERE task_id = ?").run(taskId);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO task_categories (task_id, category_id) VALUES (?, ?)",
    );
    for (const cid of categoryIds) insert.run(taskId, cid);
  });
  tx();
}

/* ------------------------------ subtasks ------------------------------ */

export function setSubtasks(
  taskId: number,
  items: { title: string; done: boolean }[],
) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM subtasks WHERE task_id = ?").run(taskId);
    const insert = db.prepare(
      "INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)",
    );
    items.forEach((s, i) => insert.run(taskId, s.title, s.done ? 1 : 0, i));
  });
  tx();
}

/* ------------------------------ activity ------------------------------ */

export function getActivity(taskId: number): ActivityEntry[] {
  return getDb()
    .prepare(
      "SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
    )
    .all(taskId) as ActivityEntry[];
}

/* --------------------------- import / export -------------------------- */

export function resetBoard() {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM tasks").run();
    // task_categories / subtasks / activity cascade via FK.
  });
  tx();
}

export function exportBoard(): BoardExport {
  const db = getDb();

  const metaRows = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
  const meta = Object.fromEntries(metaRows.map(r => [r.key, r.value]));

  return {
    version: 2,
    exportedAt: now(),
    schemaVersion: meta.schema_version ?? "1",
    data: {
      meta,
      lifeAreas: db.prepare("SELECT * FROM life_areas").all() as LifeArea[],
      categories: db.prepare("SELECT * FROM categories").all() as Category[],
      tasks: db.prepare("SELECT * FROM tasks").all() as Record<string, unknown>[],
      subtasks: db.prepare("SELECT * FROM subtasks").all() as Record<string, unknown>[],
      taskCategories: db.prepare("SELECT * FROM task_categories").all() as Record<string, unknown>[],
      activityLog: db.prepare("SELECT * FROM activity_log").all() as Record<string, unknown>[],
      attachments: db.prepare("SELECT * FROM attachments").all() as Record<string, unknown>[],
    }
  };
}

export function importBoard(data: BoardExport) {
  const db = getDb();
  const tx = db.transaction(() => {
    if (data.version === 2) {
      // V2: Exact data replacement
      db.prepare("DELETE FROM tasks").run(); // cascades to subtasks, activity_log, attachments, task_categories
      db.prepare("DELETE FROM categories").run();
      db.prepare("DELETE FROM life_areas").run();
      db.prepare("DELETE FROM meta").run();

      const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
      for (const [key, value] of Object.entries(data.data.meta)) insertMeta.run(key, value);

      const insertLifeArea = db.prepare("INSERT INTO life_areas (id, name, color, position) VALUES (@id, @name, @color, @position)");
      for (const la of data.data.lifeAreas) insertLifeArea.run(la);

      const insertCat = db.prepare("INSERT INTO categories (id, name, color, position) VALUES (@id, @name, @color, @position)");
      for (const cat of data.data.categories) insertCat.run(cat);

      const insertTask = db.prepare(`INSERT INTO tasks (id, title, life_area, status, priority, owner, due_date, revisit_date, notes, position, created_at, updated_at, completed_at, deleted_at) VALUES (@id, @title, @life_area, @status, @priority, @owner, @due_date, @revisit_date, @notes, @position, @created_at, @updated_at, @completed_at, @deleted_at)`);
      for (const t of data.data.tasks) insertTask.run(t);

      const insertSubtask = db.prepare("INSERT INTO subtasks (id, task_id, title, done, position) VALUES (@id, @task_id, @title, @done, @position)");
      for (const s of data.data.subtasks) insertSubtask.run(s);

      const insertTaskCat = db.prepare("INSERT INTO task_categories (task_id, category_id) VALUES (@task_id, @category_id)");
      for (const tc of data.data.taskCategories) insertTaskCat.run(tc);

      const insertActivity = db.prepare("INSERT INTO activity_log (id, task_id, type, detail, created_at) VALUES (@id, @task_id, @type, @detail, @created_at)");
      for (const a of data.data.activityLog) insertActivity.run(a);

      const insertAtt = db.prepare("INSERT INTO attachments (id, task_id, filename, mime, size, stored_name, created_at) VALUES (@id, @task_id, @filename, @mime, @size, @stored_name, @created_at)");
      for (const a of data.data.attachments) insertAtt.run(a);

    } else {
      // V1: Legacy import (with backward-compatibility mapping)
      db.prepare("DELETE FROM tasks").run();

      const nameToId = new Map(getCategories().map((c) => [c.name, c.id]));
      for (const cat of data.categories ?? []) {
        if (!nameToId.has(cat.name)) {
          const created = createCategory(cat.name, cat.color || "slate");
          nameToId.set(cat.name, created.id);
        }
      }

      for (const t of data.tasks ?? []) {
        // v1 used 'blocked'/'deferred' which are invalid in v5. Map them to 'onhold'.
        // We coerce to string first because v1 exports may contain values
        // outside the current Status enum; the strict type was always
        // narrower than the data we accept from disk.
        const rawStatus: string = String((t as { status?: unknown }).status ?? "");
        const status: Status =
          rawStatus === "blocked" || rawStatus === "deferred"
            ? "onhold"
            : (rawStatus as Status);

        const created = createTask({
          title: t.title,
          life_area: t.life_area,
          status,
          priority: t.priority,
          owner: t.owner,
          due_date: t.due_date,
          revisit_date: t.revisit_date,
          notes: t.notes,
          categoryIds: (t.categories ?? [])
            .map((n) => nameToId.get(n))
            .filter((id): id is number => typeof id === "number"),
        });
        if (t.subtasks?.length) setSubtasks(created.id, t.subtasks);
      }
    }
  });
  
  tx();
  
  if (data.version === 2) {
    runMigrations();
  }
}

/* ========================================================================== *
 *  File manager — folders, files, annotations
 *  Files are stored on disk at data/files/. The DB stores path, mime, size,
 *  hash for dedup. Soft-delete (trash) by setting deleted_at.
 * ========================================================================== */

const FILES_ROOT = "data/files";

function filesRoot(): string {
  return join(process.cwd(), FILES_ROOT);
}

function safePath(rel: string): string {
  const cleaned = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  const full = join(filesRoot(), cleaned);
  const root = filesRoot() + sep;
  if (!full.startsWith(root) && full !== filesRoot()) {
    throw new Error("Path traversal blocked");
  }
  return full;
}

interface FolderRow {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: number;
  name: string;
  path: string;
  folder_id: number | null;
  mime: string;
  size: number;
  hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AnnotationRow {
  id: number;
  file_id: number;
  kind: "line" | "thread";
  line: number | null;
  body: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function mapFolder(r: FolderRow): Folder {
  return { id: r.id, name: r.name, parent_id: r.parent_id, created_at: r.created_at, updated_at: r.updated_at };
}
function mapFile(r: FileRow): FileItem {
  return {
    id: r.id, name: r.name, path: r.path, folder_id: r.folder_id,
    mime: r.mime, size: r.size, hash: r.hash,
    created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
  };
}
function mapAnnotation(r: AnnotationRow): Annotation {
  return {
    id: r.id, file_id: r.file_id, kind: r.kind, line: r.line,
    body: r.body, color: r.color,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

/* ------------------------------ folders -------------------------------- */

export function listFolders(): Folder[] {
  return (getDb().prepare("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC")
    .all() as FolderRow[]).map(mapFolder);
}

export function getFolder(id: number): Folder | null {
  const r = getDb().prepare("SELECT * FROM folders WHERE id = ?").get(id) as FolderRow | undefined;
  return r ? mapFolder(r) : null;
}

export function ensureFolder(name: string, parentId: number | null): Folder {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name cannot be empty");
  const existing = getDb().prepare(
    "SELECT * FROM folders WHERE name = ? AND " + (parentId === null ? "parent_id IS NULL" : "parent_id = ?")
  ).get(...(parentId === null ? [trimmed] : [trimmed, parentId])) as FolderRow | undefined;
  if (existing) return mapFolder(existing);
  const ts = now();
  const info = getDb()
    .prepare("INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(trimmed, parentId, ts, ts);
  return getFolder(Number(info.lastInsertRowid))!;
}

export function createFolder(name: string, parentId: number | null): Folder {
  return ensureFolder(name, parentId);
}

export function renameFolder(id: number, newName: string): Folder {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Folder name cannot be empty");
  getDb().prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?")
    .run(trimmed, now(), id);
  return getFolder(id)!;
}

function collectSubfolderIds(rootId: number): (number | null)[] {
  const ids: number[] = [];
  const queue: number[] = [rootId];
  const seen = new Set<number>([rootId]);
  while (queue.length) {
    const id = queue.shift()!;
    ids.push(id);
    const children = getDb().prepare("SELECT id FROM folders WHERE parent_id = ?")
      .all(id) as { id: number }[];
    for (const c of children) {
      if (!seen.has(c.id)) { seen.add(c.id); queue.push(c.id); }
    }
  }
  return [null, ...ids];
}

export function deleteFolder(id: number): void {
  const subFolders = collectSubfolderIds(id);
  const placeholders = subFolders.map(() => "?").join(",");
  const ts = now();
  getDb().prepare(
    `UPDATE files SET deleted_at = ?, updated_at = ?
     WHERE folder_id IN (${placeholders || "NULL"}) AND deleted_at IS NULL`
  ).run(ts, ts, ...subFolders);
  getDb().prepare("DELETE FROM folders WHERE id = ?").run(id);
}

/* ------------------------------ files ---------------------------------- */

export function getFile(id: number): FileItem | null {
  const r = getDb().prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL")
    .get(id) as FileRow | undefined;
  return r ? mapFile(r) : null;
}

export function getFileByPath(path: string): FileItem | null {
  const r = getDb()
    .prepare("SELECT * FROM files WHERE path = ? AND deleted_at IS NULL")
    .get(path) as FileRow | undefined;
  return r ? mapFile(r) : null;
}

export function listFiles(opts?: { folderId?: number | null; includeDeleted?: boolean }): FileItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!opts?.includeDeleted) where.push("deleted_at IS NULL");
  if (opts?.folderId !== undefined) {
    if (opts.folderId === null) where.push("folder_id IS NULL");
    else { where.push("folder_id = ?"); params.push(opts.folderId); }
  }
  const sql = `SELECT * FROM files${where.length ? " WHERE " + where.join(" AND ") : ""}
               ORDER BY updated_at DESC, id DESC`;
  return (getDb().prepare(sql).all(...params) as FileRow[]).map(mapFile);
}

export function folderPathString(folder: Folder): string {
  const parts: string[] = [];
  let current: Folder | null = folder;
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? getFolder(current.parent_id) : null;
  }
  return parts.join("/");
}

export async function createFile(input: {
  name: string;
  bytes: Uint8Array | Buffer;
  folderId: number | null;
  mime?: string;
}): Promise<FileItem> {
  const name = input.name.trim();
  if (!name) throw new Error("File name cannot be empty");
  if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    throw new Error("Invalid file name");
  }
  const folder = input.folderId ? getFolder(input.folderId) : null;
  const folderPath = folder ? folderPathString(folder) : "";
  const baseRel = folderPath ? `${folderPath}/${name}` : name;
  let rel = baseRel;
  let suffix = 1;
  while (existsSync(safePath(rel))) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    rel = folderPath ? `${folderPath}/${stem}-${suffix}${ext}` : `${stem}-${suffix}${ext}`;
    suffix++;
  }
  const abs = safePath(rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, input.bytes);
  const ts = now();
  const mime = input.mime ?? detectMime(name, input.bytes);
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const info = getDb().prepare(
    `INSERT INTO files (name, path, folder_id, mime, size, hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, rel, input.folderId, mime, input.bytes.length, hash, ts, ts);
  return getFile(Number(info.lastInsertRowid))!;
}

export function renameFile(id: number, newName: string): FileItem {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("File name cannot be empty");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.startsWith(".")) {
    throw new Error("Invalid file name");
  }
  const file = getFile(id);
  if (!file) throw new Error("File not found");
  const folder = file.folder_id ? getFolder(file.folder_id) : null;
  const folderPath = folder ? folderPathString(folder) : "";
  const newRel = folderPath ? `${folderPath}/${trimmed}` : trimmed;
  const newAbs = safePath(newRel);
  const oldAbs = safePath(file.path);
  if (existsSync(newAbs) && newAbs !== oldAbs) {
    throw new Error("A file with that name already exists in this folder");
  }
  if (oldAbs !== newAbs) {
mkdirSync(dirname(newAbs), { recursive: true });
    try { renameSync(oldAbs, newAbs); }
    catch {
      const buf = readFileSync(oldAbs);
      writeFileSync(newAbs, buf);
      unlinkSync(oldAbs);
    }
  }
  getDb().prepare("UPDATE files SET name = ?, path = ?, updated_at = ? WHERE id = ?")
    .run(trimmed, newRel, now(), id);
  return getFile(id)!;
}

export function moveFile(id: number, folderId: number | null): FileItem {
  const file = getFile(id);
  if (!file) throw new Error("File not found");
  if (folderId !== null && !getFolder(folderId)) {
    throw new Error("Target folder not found");
  }
  const folder = folderId ? getFolder(folderId) : null;
  const folderPath = folder ? folderPathString(folder) : "";
  const newRel = folderPath ? `${folderPath}/${file.name}` : file.name;
  const newAbs = safePath(newRel);
  const oldAbs = safePath(file.path);
  if (newAbs !== oldAbs) {
    if (existsSync(newAbs)) {
      throw new Error("A file with that name already exists in the target folder");
    }
    // Ensure the target directory exists before renaming
mkdirSync(dirname(newAbs), { recursive: true });
    try { renameSync(oldAbs, newAbs); }
    catch {
      const buf = readFileSync(oldAbs);
      writeFileSync(newAbs, buf);
      unlinkSync(oldAbs);
    }
  }
  getDb().prepare("UPDATE files SET folder_id = ?, path = ?, updated_at = ? WHERE id = ?")
    .run(folderId, newRel, now(), id);
  return getFile(id)!;
}

export function trashFile(id: number): void {
  const ts = now();
  const r = getDb().prepare(
    "UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(ts, ts, id);
  if (r.changes === 0) throw new Error("File not found or already trashed");
}

export function restoreFile(id: number): FileItem {
  getDb().prepare("UPDATE files SET deleted_at = NULL, updated_at = ? WHERE id = ?")
    .run(now(), id);
  return getFile(id)!;
}

export function listTrashedFiles(): FileItem[] {
  return (getDb().prepare(
    "SELECT * FROM files WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
  ).all() as FileRow[]).map(mapFile);
}

/* ----------------------------- tree ------------------------------------ */

export function getFileTree(): FileNode[] {
  const folders = listFolders();
  const files = listFiles();
  const annotationCounts = countAnnotationsByFile();
  const byParent = new Map<number | null, FileNode[]>();
  for (const f of folders) {
    const node: FileNode = {
      id: f.id, name: f.name, type: "folder",
      path: "/" + folderPathString(f), updated_at: f.updated_at, children: [],
    };
    const arr = byParent.get(f.parent_id) ?? [];
    arr.push(node);
    byParent.set(f.parent_id, arr);
  }
  for (const f of files) {
    const node: FileNode = {
      id: f.id, name: f.name, type: "file",
      path: "/" + f.path, size: f.size, mime: f.mime, updated_at: f.updated_at,
      annotation_count: annotationCounts.get(f.id) ?? 0,
    };
    const arr = byParent.get(f.folder_id) ?? [];
    arr.push(node);
    byParent.set(f.folder_id, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }
  return byParent.get(null) ?? [];
}

export function getFolderChildren(folderId: number | null): FileNode[] {
  const folders = (getDb().prepare(
    "SELECT * FROM folders WHERE " +
      (folderId === null ? "parent_id IS NULL" : "parent_id = ?") +
      " ORDER BY name COLLATE NOCASE ASC"
  ).all(...(folderId === null ? [] : [folderId])) as FolderRow[]).map(mapFolder);
  const files = listFiles({ folderId });
  const annotationCounts = countAnnotationsByFile();
  const out: FileNode[] = [];
  for (const f of folders) {
    out.push({ id: f.id, name: f.name, type: "folder", path: "/" + folderPathString(f), updated_at: f.updated_at, children: [] });
  }
  for (const f of files) {
    out.push({
      id: f.id, name: f.name, type: "file", path: "/" + f.path,
      size: f.size, mime: f.mime, updated_at: f.updated_at,
      annotation_count: annotationCounts.get(f.id) ?? 0,
    });
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}

function countAnnotationsByFile(): Map<number, number> {
  const rows = getDb().prepare("SELECT file_id, COUNT(*) as n FROM annotations GROUP BY file_id")
    .all() as { file_id: number; n: number }[];
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.file_id, r.n);
  return m;
}

/* ----------------------------- search ---------------------------------- */

export function searchFiles(q: string): FileItem[] {
  if (!q.trim()) return [];
  const term = `%${q.trim()}%`;
  return (getDb().prepare(
    `SELECT * FROM files WHERE deleted_at IS NULL AND name LIKE ?
     ORDER BY updated_at DESC LIMIT 200`
  ).all(term) as FileRow[]).map(mapFile);
}

/* ----------------------------- annotations ---------------------------- */

export function listAnnotations(fileId: number): Annotation[] {
  return (getDb().prepare(
    "SELECT * FROM annotations WHERE file_id = ? ORDER BY line ASC, id ASC"
  ).all(fileId) as AnnotationRow[]).map(mapAnnotation);
}

export function createAnnotation(input: {
  fileId: number;
  kind: "line" | "thread";
  line?: number | null;
  body: string;
  color?: string | null;
}): Annotation {
  if (!input.body.trim()) throw new Error("Annotation body cannot be empty");
  if (input.kind === "line" && (input.line == null || input.line < 1)) {
    throw new Error("Line annotations require a positive line number");
  }
  const ts = now();
  const info = getDb().prepare(
    `INSERT INTO annotations (file_id, kind, line, body, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(input.fileId, input.kind, input.line ?? null, input.body, input.color ?? null, ts, ts);
  return getAnnotation(Number(info.lastInsertRowid))!;
}

export function getAnnotation(id: number): Annotation | null {
  const r = getDb().prepare("SELECT * FROM annotations WHERE id = ?")
    .get(id) as AnnotationRow | undefined;
  return r ? mapAnnotation(r) : null;
}

export function updateAnnotation(id: number, body: string, color?: string | null): Annotation {
  if (!body.trim()) throw new Error("Annotation body cannot be empty");
  getDb().prepare(
    "UPDATE annotations SET body = ?, color = ?, updated_at = ? WHERE id = ?"
  ).run(body, color ?? null, now(), id);
  return getAnnotation(id)!;
}

export function deleteAnnotation(id: number): void {
  getDb().prepare("DELETE FROM annotations WHERE id = ?").run(id);
}

/* ----------------------------- file <-> task --------------------------- */

export function attachFileToTask(fileId: number, taskId: number): void {
  getDb().prepare(
    "INSERT OR IGNORE INTO file_attachments (file_id, task_id, created_at) VALUES (?, ?, ?)"
  ).run(fileId, taskId, now());
}

export function detachFileFromTask(fileId: number, taskId: number): void {
  getDb().prepare("DELETE FROM file_attachments WHERE file_id = ? AND task_id = ?")
    .run(fileId, taskId);
}

export function listFilesForTask(taskId: number): FileItem[] {
  return (getDb().prepare(
    `SELECT f.* FROM files f
     JOIN file_attachments fa ON fa.file_id = f.id
     WHERE fa.task_id = ? AND f.deleted_at IS NULL
     ORDER BY fa.created_at DESC`
  ).all(taskId) as FileRow[]).map(mapFile);
}

export function listTasksForFile(fileId: number): number[] {
  return (getDb().prepare(
    "SELECT task_id FROM file_attachments WHERE file_id = ? ORDER BY created_at DESC"
  ).all(fileId) as { task_id: number }[]).map((r) => r.task_id);
}

/* ----------------------------- read file body -------------------------- */

export async function readFile(id: number): Promise<{ bytes: Buffer; mime: string; name: string }> {
  const file = getFile(id);
  if (!file) throw new Error("File not found");
  const abs = safePath(file.path);
  const bytes = await fsReadFile(abs);
  return { bytes, mime: file.mime, name: file.name };
}
