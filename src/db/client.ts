import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getSessionSecret } from "@/lib/secret";

/**
 * Single shared SQLite connection for the whole app.
 *
 * better-sqlite3 is synchronous and perfect for a single-user local app.
 * The connection is cached on globalThis so Next.js hot-reload / route
 * workers reuse one handle instead of opening many.
 */

const DATA_DIR = resolve(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || resolve(DATA_DIR, "board.db");

/** Directory where the DB (and attachment files) live — the mounted volume. */
export function getDataDir(): string {
  return dirname(DB_PATH);
}

type GlobalWithDb = typeof globalThis & { __todoBoardDb?: Database.Database };
const g = globalThis as GlobalWithDb;

function createConnection(): Database.Database {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  // Provision the session secret eagerly at first DB init (Node-only path),
  // so it exists before any session op and never races on first use.
  getSessionSecret();
  return db;
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  username        TEXT PRIMARY KEY,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_attempt_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  life_area    TEXT NOT NULL DEFAULT 'Personal',
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('backlog','todo','in_progress','onhold','done')),
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  owner        TEXT,
  due_date     TEXT,
  revisit_date TEXT,
  notes        TEXT,
  position     REAL NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
-- Note: idx_tasks_pinned is created in the v6 migration, after the
-- ALTER TABLE that adds the pinned column.

CREATE TABLE IF NOT EXISTS subtasks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS categories (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL UNIQUE,
  color    TEXT NOT NULL DEFAULT 'slate',
  position REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS life_areas (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL UNIQUE,
  color    TEXT NOT NULL DEFAULT 'slate',
  position REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_categories (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_task_categories_cat ON task_categories(category_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_task ON activity_log(task_id);

CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);

/* v7 — file manager (folders, files, annotations) */
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
-- File manager: first-class files in the data/files/ tree, with optional
-- folder_id. file_attachments is the M:N link to tasks; attachments is the
-- legacy per-task list (still supported for backward compat).
CREATE TABLE IF NOT EXISTS files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  folder_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  hash       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted ON files(deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);

CREATE TABLE IF NOT EXISTS file_attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(file_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_file_attachments_file ON file_attachments(file_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_task ON file_attachments(task_id);

-- Annotations: either a line-anchored note on a markdown/code file
-- (kind='line', line=N) or a file-level comment thread
-- (kind='thread', line=NULL). Body is markdown.
CREATE TABLE IF NOT EXISTS annotations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('line','thread')),
  line       INTEGER,
  body       TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_file ON annotations(file_id);
CREATE INDEX IF NOT EXISTS idx_annotations_line ON annotations(file_id, line);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

const SEED_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: "Requirement", color: "blue" },
  { name: "Open Decision", color: "amber" },
  { name: "Action Item", color: "indigo" },
  { name: "Review", color: "green" },
  { name: "Bug / Risk", color: "red" },
];

const SEED_LIFE_AREAS: Array<{ name: string; color: string }> = [
  { name: "Personal", color: "teal" },
  { name: "Work", color: "indigo" },
];

const SCHEMA_VERSION = "7";

// Exact JSON of the old default chips, so the v3 migration can clear them
// (they were leftovers from a work-sprint sample and made no sense here).
const OLD_DEFAULT_CHIPS =
  '[{"label":"Sprint","value":"Current"},{"label":"Focus","value":"Reliability"},{"label":"Owner","value":"Me"}]';

// Old default subtitles (mentioned removed features like "chips"). v4 refreshes
// them to the current copy if the user never customized it.
const OLD_DEFAULT_SUBTITLES = [
  "Track everything on your plate — sprint work, code reviews, open decisions, action items, and personal follow-ups. Click any card to edit; drag cards between columns; filter with the chips below.",
  "Track everything on your plate — sprint work, code reviews, open decisions, action items, and follow-ups. Click any card to edit; drag cards between columns; filter with the chips below.",
];

const SEED_META: Record<string, string> = {
  schema_version: SCHEMA_VERSION,
  board_title: "My Boardspace",
  board_subtitle:
    "Track everything on your plate — capture tasks, set deadlines, drag them across columns, and filter by the tags below.",
  chips: "[]",
};

function seedList(
  db: Database.Database,
  table: "categories" | "life_areas",
  rows: Array<{ name: string; color: string }>,
) {
  const count = (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
  ).n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO ${table} (name, color, position) VALUES (?, ?, ?)`,
  );
  rows.forEach((r, i) => insert.run(r.name, r.color, i));
}

/**
 * v2 migration for databases created before life areas were customizable:
 * the old `tasks.life_area` had a CHECK constraint limiting it to
 * 'personal'/'work'. Rebuild the table to drop the CHECK and capitalize the
 * values so they match the seeded life-area names. Also retitles the board.
 */
function migrateV2(db: Database.Database) {
  const tasksSql = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
      .get() as { sql: string } | undefined
  )?.sql;

  if (tasksSql && tasksSql.includes("CHECK (life_area")) {
    db.pragma("foreign_keys = OFF");
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE tasks_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          title        TEXT NOT NULL,
          life_area    TEXT NOT NULL DEFAULT 'Personal',
          status       TEXT NOT NULL DEFAULT 'todo'
                       CHECK (status IN ('backlog','todo','in_progress','blocked','done','deferred')),
          priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
          owner        TEXT,
          due_date     TEXT,
          revisit_date TEXT,
          notes        TEXT,
          position     REAL NOT NULL DEFAULT 0,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL,
          completed_at TEXT
        );
        INSERT INTO tasks_new
          SELECT id, title,
                 CASE life_area
                   WHEN 'personal' THEN 'Personal'
                   WHEN 'work' THEN 'Work'
                   ELSE life_area END,
                 status, priority, owner, due_date, revisit_date, notes,
                 position, created_at, updated_at, completed_at
          FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      `);
    });
    rebuild();
    db.pragma("foreign_keys = ON");
  }

  // Retitle boards still on the old default.
  db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'board_title' AND value = 'My Personal Boardspace'",
  ).run("My Boardspace");
}

/** v3: drop the nonsensical default Sprint/Focus/Owner chips if untouched. */
function migrateV3(db: Database.Database) {
  db.prepare(
    "UPDATE meta SET value = '[]' WHERE key = 'chips' AND value = ?",
  ).run(OLD_DEFAULT_CHIPS);
}

/** v4: refresh the stale default subtitle (referenced removed "chips" etc.). */
function migrateV4(db: Database.Database) {
  const update = db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'board_subtitle' AND value = ?",
  );
  for (const old of OLD_DEFAULT_SUBTITLES) {
    update.run(SEED_META.board_subtitle, old);
  }
}

/**
 * v5: merge Blocked + Deferred into a single "On Hold" status, and add a
 * `deleted_at` column for soft-delete (Trash). Rebuilds the tasks table to
 * change the status CHECK and add the column, mapping old values across.
 */
function migrateV5(db: Database.Database) {
  const tasksSql = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
      .get() as { sql: string } | undefined
  )?.sql;
  if (!tasksSql) return;

  const needsRebuild =
    tasksSql.includes("'blocked'") ||
    tasksSql.includes("'deferred'") ||
    !tasksSql.includes("deleted_at");
  if (!needsRebuild) return;

  db.pragma("foreign_keys = OFF");
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE tasks_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL,
        life_area    TEXT NOT NULL DEFAULT 'Personal',
        status       TEXT NOT NULL DEFAULT 'todo'
                     CHECK (status IN ('backlog','todo','in_progress','onhold','done')),
        priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
        owner        TEXT,
        due_date     TEXT,
        revisit_date TEXT,
        notes        TEXT,
        position     REAL NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        completed_at TEXT,
        deleted_at   TEXT
      );
      INSERT INTO tasks_new
        (id, title, life_area, status, priority, owner, due_date, revisit_date,
         notes, position, created_at, updated_at, completed_at, deleted_at)
        SELECT id, title, life_area,
               CASE status
                 WHEN 'blocked' THEN 'onhold'
                 WHEN 'deferred' THEN 'onhold'
                 ELSE status END,
               priority, owner, due_date, revisit_date, notes, position,
               created_at, updated_at, completed_at, NULL
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
    `);
  });
  rebuild();
  db.pragma("foreign_keys = ON");
}

/**
 * v6 — add pinned column to tasks table.
 * Idempotent: skips if the column already exists.
 */
function migrateV6(db: Database.Database) {
  const cols = db
    .prepare("PRAGMA table_info(tasks)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "pinned")) {
    db.exec(
      "ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;" +
        "CREATE INDEX IF NOT EXISTS idx_tasks_pinned ON tasks(pinned);",
    );
  }
}

/**
 * v7 — file manager: folders, files, file_attachments, annotations.
 * Idempotent: skips if tables already exist (the main SCHEMA creates them
 * for fresh DBs, this migration covers DBs that were at v6).
 */
function migrateV7(db: Database.Database) {
  const tableNames = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  const has = (n: string) => tableNames.some((t) => t.name === n);

  if (!has("folders")) {
    db.exec(`
      CREATE TABLE folders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_folders_parent ON folders(parent_id);
    `);
  }
  if (!has("files")) {
    db.exec(`
      CREATE TABLE files (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL UNIQUE,
        folder_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        mime       TEXT NOT NULL,
        size       INTEGER NOT NULL,
        hash       TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_files_folder ON files(folder_id);
      CREATE INDEX idx_files_deleted ON files(deleted_at);
      CREATE INDEX idx_files_hash ON files(hash);
    `);
  }
  if (!has("file_attachments")) {
    db.exec(`
      CREATE TABLE file_attachments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE(file_id, task_id)
      );
      CREATE INDEX idx_file_attachments_file ON file_attachments(file_id);
      CREATE INDEX idx_file_attachments_task ON file_attachments(task_id);
    `);
  }
  if (!has("annotations")) {
    db.exec(`
      CREATE TABLE annotations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('line','thread')),
        line       INTEGER,
        body       TEXT NOT NULL,
        color      TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_annotations_file ON annotations(file_id);
      CREATE INDEX idx_annotations_line ON annotations(file_id, line);
    `);
  }
}

export function runMigrations(db?: Database.Database) {
  migrate(db ?? getDb());
}

function migrate(db: Database.Database) {
  db.exec(SCHEMA);

  const version = Number(
    (
      db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined
    )?.value ?? "1",
  );
  if (version < 2) migrateV2(db);
  if (version < 3) migrateV3(db);
  if (version < 4) migrateV4(db);
  if (version < 5) migrateV5(db);
  if (version < 6) migrateV6(db);
  if (version < 7) migrateV7(db);

  seedList(db, "categories", SEED_CATEGORIES);
  seedList(db, "life_areas", SEED_LIFE_AREAS);

  // Seed meta defaults (INSERT OR IGNORE keeps user edits intact).
  const insertMeta = db.prepare(
    "INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)",
  );
  for (const [key, value] of Object.entries(SEED_META)) {
    insertMeta.run(key, value);
  }
  // Always advance the recorded schema version.
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(SCHEMA_VERSION);
}

export function getDb(): Database.Database {
  if (!g.__todoBoardDb) {
    g.__todoBoardDb = createConnection();
  }
  return g.__todoBoardDb;
}
