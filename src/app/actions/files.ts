"use server";

/**
 * File manager server actions.
 *
 * Every action:
 *   - Requires a signed-in user
 *   - Returns ActionResult<T>
 *   - Touches the filesystem (data/files/...) AND the DB atomically per call
 *
 * The repo layer holds the actual logic; this file is the thin auth + shape
 * adapter that the client can call directly.
 */

import { requireUser } from "@/lib/auth";
import { fail, type ActionResult } from "./_helpers";

// Re-export so callers can do `import type { ActionResult } from "@/app/actions/files"`
export type { ActionResult } from "./_helpers";
import {
  ensureFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  createFile as repoCreateFile,
  renameFile as repoRenameFile,
  moveFile as repoMoveFile,
  trashFile as repoTrashFile,
  restoreFile as repoRestoreFile,
  getFile,
  getFileTree,
  getFolderChildren,
  listFilesForTask,
  attachFileToTask as repoAttach,
  detachFileFromTask as repoDetach,
  listAnnotations,
  createAnnotation as repoCreateAnn,
  updateAnnotation as repoUpdateAnn,
  deleteAnnotation as repoDeleteAnn,
} from "@/db/repo";
import type { FileItem, FileNode, Annotation, Folder } from "@/lib/files";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const FILES_ROOT = "data/files";
function filesRoot(): string {
  return join(process.cwd(), FILES_ROOT);
}

/* ------------------------------ folders --------------------------------- */

export async function listFoldersAction(): Promise<ActionResult<Folder[]>> {
  await requireUser();
  return { ok: true, data: [] }; // not exposed; use getFileTreeAction
}

export async function createFolderAction(
  raw: { name: string; parentId: number | null },
): Promise<ActionResult<Folder>> {
  await requireUser();
  if (!raw?.name?.trim()) return fail("Folder name is required");
  try {
    return { ok: true, data: createFolder(raw.name, raw.parentId) };
  } catch (e: any) {
    return fail(e?.message ?? "Could not create folder");
  }
}

export async function renameFolderAction(
  raw: { id: number; name: string },
): Promise<ActionResult<Folder>> {
  await requireUser();
  if (!raw?.id || !raw?.name?.trim()) return fail("Invalid input");
  try {
    return { ok: true, data: renameFolder(raw.id, raw.name) };
  } catch (e: any) {
    return fail(e?.message ?? "Could not rename folder");
  }
}

export async function deleteFolderAction(
  id: number,
): Promise<ActionResult<null>> {
  await requireUser();
  if (!Number.isInteger(id)) return fail("Invalid id");
  try {
    deleteFolder(id);
    return { ok: true, data: null };
  } catch (e: any) {
    return fail(e?.message ?? "Could not delete folder");
  }
}

/* ------------------------------ files ----------------------------------- */

export async function getFileTreeAction(): Promise<ActionResult<FileNode[]>> {
  await requireUser();
  return { ok: true, data: getFileTree() };
}

export async function getFolderChildrenAction(
  folderId: number | null,
): Promise<ActionResult<FileNode[]>> {
  await requireUser();
  return { ok: true, data: getFolderChildren(folderId) };
}

/**
 * Server-side upload. FormData carries the file(s) + folder + name.
 * Writes to disk, then a row in the DB.
 */
export async function uploadFileAction(
  formData: FormData,
): Promise<ActionResult<FileItem>> {
  await requireUser();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || file?.name || "";
  const folderIdRaw = formData.get("folderId");
  const folderId =
    folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== ""
      ? Number(folderIdRaw)
      : null;
  if (!file || !name) return fail("Missing file or name");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const created = await repoCreateFile({ name, bytes, folderId });
    return { ok: true, data: created };
  } catch (e: any) {
    return fail(e?.message ?? "Upload failed");
  }
}

export async function renameFileAction(
  raw: { id: number; name: string },
): Promise<ActionResult<FileItem>> {
  await requireUser();
  if (!raw?.id || !raw?.name?.trim()) return fail("Invalid input");
  try {
    return { ok: true, data: repoRenameFile(raw.id, raw.name) };
  } catch (e: any) {
    return fail(e?.message ?? "Could not rename file");
  }
}

export async function moveFileAction(
  raw: { id: number; folderId: number | null },
): Promise<ActionResult<FileItem>> {
  await requireUser();
  if (!raw?.id) return fail("Invalid input");
  try {
    return { ok: true, data: repoMoveFile(raw.id, raw.folderId ?? null) };
  } catch (e: any) {
    return fail(e?.message ?? "Could not move file");
  }
}

export async function trashFileAction(
  id: number,
): Promise<ActionResult<null>> {
  await requireUser();
  if (!Number.isInteger(id)) return fail("Invalid id");
  try {
    repoTrashFile(id);
    return { ok: true, data: null };
  } catch (e: any) {
    return fail(e?.message ?? "Could not trash file");
  }
}

export async function restoreFileAction(
  id: number,
): Promise<ActionResult<FileItem>> {
  await requireUser();
  if (!Number.isInteger(id)) return fail("Invalid id");
  try {
    return { ok: true, data: repoRestoreFile(id) };
  } catch (e: any) {
    return fail(e?.message ?? "Could not restore file");
  }
}

/** Write text content directly. Used for creating new markdown notes. */
export async function createTextFileAction(
  raw: { name: string; content: string; folderId: number | null },
): Promise<ActionResult<FileItem>> {
  await requireUser();
  if (!raw?.name?.trim()) return fail("File name is required");
  try {
    const bytes = new TextEncoder().encode(raw.content ?? "");
    return {
      ok: true,
      data: await repoCreateFile({ name: raw.name, bytes, folderId: raw.folderId }),
    };
  } catch (e: any) {
    return fail(e?.message ?? "Could not create file");
  }
}

/* ----------------------------- file <-> task ---------------------------- */

export async function attachFileToTaskAction(
  raw: { fileId: number; taskId: number },
): Promise<ActionResult<null>> {
  await requireUser();
  if (!raw?.fileId || !raw?.taskId) return fail("Invalid input");
  try {
    repoAttach(raw.fileId, raw.taskId);
    return { ok: true, data: null };
  } catch (e: any) {
    return fail(e?.message ?? "Could not attach");
  }
}

export async function detachFileFromTaskAction(
  raw: { fileId: number; taskId: number },
): Promise<ActionResult<null>> {
  await requireUser();
  if (!raw?.fileId || !raw?.taskId) return fail("Invalid input");
  repoDetach(raw.fileId, raw.taskId);
  return { ok: true, data: null };
}

export async function listFilesForTaskAction(
  taskId: number,
): Promise<ActionResult<FileItem[]>> {
  await requireUser();
  if (!Number.isInteger(taskId)) return fail("Invalid taskId");
  return { ok: true, data: listFilesForTask(taskId) };
}

/* ----------------------------- annotations ------------------------------ */

export async function listAnnotationsAction(
  fileId: number,
): Promise<ActionResult<Annotation[]>> {
  await requireUser();
  if (!Number.isInteger(fileId)) return fail("Invalid fileId");
  return { ok: true, data: listAnnotations(fileId) };
}

export async function createAnnotationAction(
  raw: {
    fileId: number;
    kind: "line" | "thread";
    line?: number | null;
    body: string;
    color?: string | null;
  },
): Promise<ActionResult<Annotation>> {
  await requireUser();
  if (!raw?.fileId || !raw?.body?.trim()) return fail("Invalid input");
  try {
    return {
      ok: true,
      data: repoCreateAnn({
        fileId: raw.fileId,
        kind: raw.kind,
        line: raw.line ?? null,
        body: raw.body,
        color: raw.color ?? null,
      }),
    };
  } catch (e: any) {
    return fail(e?.message ?? "Could not create annotation");
  }
}

export async function updateAnnotationAction(
  raw: { id: number; body: string; color?: string | null },
): Promise<ActionResult<Annotation>> {
  await requireUser();
  if (!raw?.id || !raw?.body?.trim()) return fail("Invalid input");
  try {
    return {
      ok: true,
      data: repoUpdateAnn(raw.id, raw.body, raw.color ?? null),
    };
  } catch (e: any) {
    return fail(e?.message ?? "Could not update annotation");
  }
}

export async function deleteAnnotationAction(
  id: number,
): Promise<ActionResult<null>> {
  await requireUser();
  if (!Number.isInteger(id)) return fail("Invalid id");
  repoDeleteAnn(id);
  return { ok: true, data: null };
}
