import { describe, it, expect, beforeEach } from "vitest";
// Eagerly import the DB layer (which transitively touches server-only via
// the auth helpers) so vitest doesn't trip on a missing module. After the
// first import it's cached.
import "@/lib/secret";
import { getDb } from "@/db/client";
import {
  createFile,
  getFile,
  getFileByPath,
  listFiles,
  listFilesForTask,
  attachFileToTask,
  detachFileFromTask,
  listTasksForFile,
  trashFile,
  restoreFile,
  listTrashedFiles,
  renameFile,
  moveFile,
  searchFiles,
  listAnnotations,
  createAnnotation,
  getAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getFileTree,
  getFolderChildren,
  folderPathString,
  createFolder,
  getFolder,
  renameFolder,
  ensureFolder,
  deleteFolder,
  readFile,
  resetBoard,
  createTask,
} from "@/db/repo";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
beforeEach(() => {
  resetBoard();
  // Wipe the file-manager tables directly (resetBoard predates the file
  // manager). Wipe in reverse-FK order.
  const db = getDb();
  db.exec("DELETE FROM annotations");
  db.exec("DELETE FROM file_attachments");
  db.exec("DELETE FROM files");
  db.exec("DELETE FROM folders");
  // Clean up the data/files/ tree on disk between tests
  const root = join(process.cwd(), "data", "files");
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function mkBuffer(s: string): Buffer {
  return Buffer.from(s, "utf-8");
}

describe("files: createFile / getFile / getFileByPath", () => {
  it("creates a file at the root", async () => {
    const f = await createFile({ name: "readme.md", bytes: mkBuffer("# hi"), folderId: null });
    expect(f.name).toBe("readme.md");
    expect(f.path).toBe("readme.md");
    // "# hi" is 4 bytes (#=1, space=1, h=1, i=1)
    expect(f.size).toBe(4);
    expect(f.mime).toBe("text/markdown");
    expect(f.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("deduplicates on name collision (adds -N suffix)", async () => {
    await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    const f2 = await createFile({ name: "a.md", bytes: mkBuffer("y"), folderId: null });
    expect(f2.path).toBe("a-1.md");
  });

  it("rejects names with path separators", async () => {
    await expect(
      createFile({ name: "../etc/passwd", bytes: mkBuffer("pwned"), folderId: null }),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects names starting with a dot", async () => {
    await expect(
      createFile({ name: ".env", bytes: mkBuffer("x"), folderId: null }),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects empty names", async () => {
    await expect(
      createFile({ name: "  ", bytes: mkBuffer("x"), folderId: null }),
    ).rejects.toThrow();
  });

  it("getFileByPath finds the file", async () => {
    await createFile({ name: "x.md", bytes: mkBuffer("x"), folderId: null });
    const f = getFileByPath("x.md");
    expect(f).not.toBeNull();
    expect(f?.name).toBe("x.md");
  });

  it("readFile returns the bytes", async () => {
    await createFile({ name: "y.txt", bytes: mkBuffer("hello world"), folderId: null });
    const f = getFileByPath("y.txt")!;
    const result = await readFile(f.id);
    expect(result.bytes.toString("utf-8")).toBe("hello world");
    expect(result.mime).toBe("text/plain");
  });
});

describe("files: folders", () => {
  it("ensureFolder is idempotent", () => {
    const a = ensureFolder("research", null);
    const b = ensureFolder("research", null);
    expect(a.id).toBe(b.id);
  });

  it("supports nested folders", () => {
    const root = ensureFolder("research", null);
    const child = ensureFolder("2024", root.id);
    expect(child.parent_id).toBe(root.id);
    expect(folderPathString(child)).toBe("research/2024");
  });

  it("renames a folder", () => {
    const f = createFolder("drafts", null);
    const renamed = renameFolder(f.id, "archive");
    expect(renamed.name).toBe("archive");
  });

  it("deleteFolder cascades to subfolders and trashes their files", async () => {
    const a = createFolder("a", null);
    const b = createFolder("b", a.id);
    await createFile({ name: "f.md", bytes: mkBuffer("x"), folderId: b.id });
    deleteFolder(a.id);
    expect(getFolder(a.id)).toBeNull();
    expect(getFolder(b.id)).toBeNull();
    const trashed = listTrashedFiles();
    expect(trashed.find((f) => f.name === "f.md")).toBeDefined();
  });
});

describe("files: move / rename / trash / restore", () => {
  it("renameFile updates the name and path", async () => {
    const f = await createFile({ name: "old.md", bytes: mkBuffer("x"), folderId: null });
    const renamed = renameFile(f.id, "new.md");
    expect(renamed.name).toBe("new.md");
    expect(renamed.path).toBe("new.md");
  });

  it("renameFile rejects same-name-with-different-ext", async () => {
    const f = await createFile({ name: "x.md", bytes: mkBuffer("x"), folderId: null });
    await createFile({ name: "x.txt", bytes: mkBuffer("y"), folderId: null });
    expect(() => renameFile(f.id, "x.txt")).toThrow(/already exists/);
  });

  it("moveFile changes folder_id and path", async () => {
    const f = await createFile({ name: "note.md", bytes: mkBuffer("x"), folderId: null });
    const folder = createFolder("stuff", null);
    const moved = moveFile(f.id, folder.id);
    expect(moved.folder_id).toBe(folder.id);
    expect(moved.path).toBe("stuff/note.md");
  });

  it("trashFile and restoreFile are inverses", async () => {
    const f = await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    trashFile(f.id);
    expect(getFile(f.id)).toBeNull();
    expect(listTrashedFiles().some((t) => t.id === f.id)).toBe(true);
    const restored = restoreFile(f.id);
    expect(restored.deleted_at).toBeNull();
    expect(getFile(f.id)).not.toBeNull();
  });

  it("trashFile is idempotent (no-op if already trashed)", async () => {
    const f = await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    trashFile(f.id);
    expect(() => trashFile(f.id)).toThrow();
  });
});

describe("files: search", () => {
  it("finds files by name substring", async () => {
    await createFile({ name: "quarterly.md", bytes: mkBuffer("x"), folderId: null });
    await createFile({ name: "notes.md", bytes: mkBuffer("y"), folderId: null });
    const results = searchFiles("quart");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("quarterly.md");
  });

  it("returns empty for empty query", async () => {
    await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    expect(searchFiles("")).toEqual([]);
  });
});

describe("files: annotations", () => {
  it("creates and lists line-anchored annotations", async () => {
    const f = await createFile({ name: "doc.md", bytes: mkBuffer("x"), folderId: null });
    const a = createAnnotation({ fileId: f.id, kind: "line", line: 12, body: "fix this" });
    expect(a.line).toBe(12);
    const all = listAnnotations(f.id);
    expect(all.length).toBe(1);
    expect(all[0].body).toBe("fix this");
  });

  it("creates file-level thread annotations", async () => {
    const f = await createFile({ name: "doc.md", bytes: mkBuffer("x"), folderId: null });
    const a = createAnnotation({ fileId: f.id, kind: "thread", body: "what is this?" });
    expect(a.line).toBeNull();
  });

  it("rejects line annotation without line number", async () => {
    const f = await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    expect(() =>
      createAnnotation({ fileId: f.id, kind: "line", body: "x" }),
    ).toThrow();
  });

  it("rejects empty body", async () => {
    const f = await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    expect(() =>
      createAnnotation({ fileId: f.id, kind: "thread", body: "  " }),
    ).toThrow();
  });

  it("updates and deletes annotations", async () => {
    const f = await createFile({ name: "a.md", bytes: mkBuffer("x"), folderId: null });
    const a = createAnnotation({ fileId: f.id, kind: "thread", body: "first" });
    const upd = updateAnnotation(a.id, "second");
    expect(upd.body).toBe("second");
    deleteAnnotation(a.id);
    expect(getAnnotation(a.id)).toBeNull();
  });
});

describe("files: tree", () => {
  it("builds a tree with folders and files", async () => {
    const folder = createFolder("design", null);
    await createFile({ name: "spec.md", bytes: mkBuffer("x"), folderId: folder.id });
    await createFile({ name: "README.md", bytes: mkBuffer("x"), folderId: null });
    const tree = getFileTree();
    expect(tree.length).toBe(2); // root has 1 folder + 1 file
    const designNode = tree.find((n) => n.name === "design");
    expect(designNode?.type).toBe("folder");
  });

  it("annotates tree with annotation counts", async () => {
    const f = await createFile({ name: "x.md", bytes: mkBuffer("x"), folderId: null });
    createAnnotation({ fileId: f.id, kind: "thread", body: "one" });
    createAnnotation({ fileId: f.id, kind: "line", line: 1, body: "two" });
    const tree = getFileTree();
    const fileNode = tree.find((n) => n.name === "x.md");
    expect(fileNode?.annotation_count).toBe(2);
  });

  it("getFolderChildren returns direct children only", async () => {
    const a = createFolder("a", null);
    createFolder("b", a.id);
    await createFile({ name: "in_a.md", bytes: mkBuffer("x"), folderId: a.id });
    await createFile({ name: "root.md", bytes: mkBuffer("x"), folderId: null });
    // Root has 2 children: folder "a" + file "root.md"
    const rootChildren = getFolderChildren(null);
    expect(rootChildren.length).toBe(2);
    // Folder "a" has 2 children: folder "b" + file "in_a.md"
    const aChildren = getFolderChildren(a.id);
    expect(aChildren.length).toBe(2);
    expect(aChildren.map((n) => n.name).sort()).toEqual(["b", "in_a.md"]);
  });
});

describe("files: task <-> file link", () => {
  it("attaches and detaches files to tasks", async () => {
    const task = createTask({
      title: "Test task for file link",
      life_area: "Personal",
      status: "todo",
      priority: "medium",
    });
    const f = await createFile({ name: "spec.md", bytes: mkBuffer("x"), folderId: null });
    attachFileToTask(f.id, task.id);
    expect(listFilesForTask(task.id).some((x) => x.id === f.id)).toBe(true);
    expect(listTasksForFile(f.id)).toContain(task.id);
    detachFileFromTask(f.id, task.id);
    expect(listFilesForTask(task.id).every((x) => x.id !== f.id)).toBe(true);
  });
});
