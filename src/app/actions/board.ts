"use server";

import { requireUser } from "@/lib/auth";
import {
  taskInputSchema,
  moveTaskSchema,
  categorySchema,
  lifeAreaSchema,
  metaSchema,
} from "@/lib/validation";
import type {
  BoardData,
  Category,
  LifeArea,
  Task,
  ActivityEntry,
  TrashedTask,
  Attachment,
  BoardExport,
} from "@/lib/types";
import {
  addAttachment,
  getAttachments,
  getAttachmentCount,
  getAttachmentRow,
  deleteAttachmentRow,
} from "@/db/repo";
import {
  saveAttachmentFile,
  deleteAttachmentFile,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TASK,
} from "@/lib/attachments-store";
import {
  getBoardData,
  createTask,
  updateTaskFields,
  deleteTask as repoDeleteTask,
  trashTask as repoTrashTask,
  restoreTask as repoRestoreTask,
  getTrashedTasks,
  emptyTrash as repoEmptyTrash,
  moveTask as repoMoveTask,
  toggleTaskPinned,
  setSubtasks,
  getTask,
  createCategory as repoCreateCategory,
  updateCategory as repoUpdateCategory,
  deleteCategory as repoDeleteCategory,
  getCategories,
  createLifeArea as repoCreateLifeArea,
  updateLifeArea as repoUpdateLifeArea,
  deleteLifeArea as repoDeleteLifeArea,
  getLifeAreas,
  setMeta,
  getActivity,
  resetBoard as repoResetBoard,
  exportBoard,
  importBoard,
} from "@/db/repo";

// `ActionResult` and `fail` are defined in `./_helpers` and re-imported here
// for ergonomic client-side imports. The `use server` file restriction
// means we can only export async functions, so the helpers live separately.

import { fail, type ActionResult as _AR } from "./_helpers";
export type ActionResult<T> = _AR<T>;

/* ------------------------------- tasks -------------------------------- */

export async function createTaskAction(
  raw: unknown,
): Promise<ActionResult<Task>> {
  await requireUser();
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid task.");
  const { subtasks, ...fields } = parsed.data;
  const task = createTask(fields);
  if (subtasks?.length) setSubtasks(task.id, subtasks);
  return { ok: true, data: getTask(task.id)! };
}

export async function updateTaskAction(
  id: number,
  raw: unknown,
): Promise<ActionResult<Task>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid task id.");
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid task.");
  const existing = getTask(id);
  if (!existing) return fail("Task not found.");
  const { subtasks, ...fields } = parsed.data;
  updateTaskFields(id, fields);
  setSubtasks(id, subtasks ?? []);
  return { ok: true, data: getTask(id)! };
}

/** Soft-delete: moves the task to the Trash (recoverable). */
export async function deleteTaskAction(id: number): Promise<ActionResult<null>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid task id.");
  repoTrashTask(id);
  return { ok: true, data: null };
}

/* -------------------------------- trash ------------------------------- */

export async function getTrashAction(): Promise<ActionResult<TrashedTask[]>> {
  await requireUser();
  return { ok: true, data: getTrashedTasks() };
}

export async function restoreTaskAction(id: number): Promise<ActionResult<Task>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid task id.");
  const task = repoRestoreTask(id);
  if (!task) return fail("Task not found.");
  return { ok: true, data: task };
}

/** Permanently delete a single trashed task. */
export async function purgeTaskAction(id: number): Promise<ActionResult<null>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid task id.");
  repoDeleteTask(id);
  return { ok: true, data: null };
}

export async function emptyTrashAction(): Promise<ActionResult<null>> {
  await requireUser();
  repoEmptyTrash();
  return { ok: true, data: null };
}

export async function moveTaskAction(raw: unknown): Promise<ActionResult<null>> {
  await requireUser();
  const parsed = moveTaskSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid move.");
  repoMoveTask(parsed.data.taskId, parsed.data.toStatus, parsed.data.orderedIds);
  return { ok: true, data: null };
}

/**
 * Toggle the "pinned" flag on a task. Pinned tasks float to the top of
 * their column regardless of drag order.
 */
export async function togglePinAction(
  id: number,
): Promise<ActionResult<{ pinned: boolean }>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid task id.");
  const pinned = toggleTaskPinned(id);
  return { ok: true, data: { pinned } };
}

export async function getActivityAction(
  taskId: number,
): Promise<ActionResult<ActivityEntry[]>> {
  await requireUser();
  if (!Number.isInteger(taskId) || taskId <= 0) return fail("Invalid task id.");
  return { ok: true, data: getActivity(taskId) };
}

/* ----------------------------- attachments ---------------------------- */

export async function listAttachmentsAction(
  taskId: number,
): Promise<ActionResult<Attachment[]>> {
  await requireUser();
  if (!Number.isInteger(taskId) || taskId <= 0) return fail("Invalid task id.");
  return { ok: true, data: getAttachments(taskId) };
}

export async function uploadAttachmentAction(
  taskId: number,
  formData: FormData,
): Promise<ActionResult<Attachment[]>> {
  await requireUser();
  if (!Number.isInteger(taskId) || taskId <= 0) return fail("Invalid task id.");
  if (!getTask(taskId)) return fail("Task not found.");
  if (getAttachmentCount(taskId) >= MAX_ATTACHMENTS_PER_TASK) {
    return fail(`Up to ${MAX_ATTACHMENTS_PER_TASK} files per task.`);
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("No file provided.");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return fail(
      `File too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`,
    );
  }
  const filename = file.name.replace(/[\r\n"\\/]/g, "").slice(0, 200) || "file";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await saveAttachmentFile(bytes, filename);
  addAttachment({
    task_id: taskId,
    filename,
    mime: file.type || "application/octet-stream",
    size: file.size,
    stored_name: stored,
  });
  return { ok: true, data: getAttachments(taskId) };
}

export async function deleteAttachmentAction(
  id: number,
): Promise<ActionResult<Attachment[]>> {
  await requireUser();
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid attachment id.");
  const row = getAttachmentRow(id);
  if (!row) return fail("Attachment not found.");
  await deleteAttachmentFile(row.stored_name);
  deleteAttachmentRow(id);
  return { ok: true, data: getAttachments(row.task_id) };
}

/* ----------------------------- categories ----------------------------- */

export async function createCategoryAction(
  raw: unknown,
): Promise<ActionResult<Category>> {
  await requireUser();
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid category.");
  try {
    return { ok: true, data: repoCreateCategory(parsed.data.name, parsed.data.color) };
  } catch {
    return fail("A category with that name already exists.");
  }
}

export async function updateCategoryAction(
  id: number,
  raw: unknown,
): Promise<ActionResult<Category[]>> {
  await requireUser();
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid category.");
  try {
    repoUpdateCategory(id, parsed.data.name, parsed.data.color);
  } catch {
    return fail("A category with that name already exists.");
  }
  return { ok: true, data: getCategories() };
}

export async function deleteCategoryAction(
  id: number,
): Promise<ActionResult<Category[]>> {
  await requireUser();
  repoDeleteCategory(id);
  return { ok: true, data: getCategories() };
}

/* ----------------------------- life areas ----------------------------- */

export async function createLifeAreaAction(
  raw: unknown,
): Promise<ActionResult<LifeArea>> {
  await requireUser();
  const parsed = lifeAreaSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid life area.");
  try {
    return { ok: true, data: repoCreateLifeArea(parsed.data.name, parsed.data.color) };
  } catch {
    return fail("A life area with that name already exists.");
  }
}

export async function updateLifeAreaAction(
  id: number,
  raw: unknown,
): Promise<ActionResult<LifeArea[]>> {
  await requireUser();
  const parsed = lifeAreaSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid life area.");
  try {
    repoUpdateLifeArea(id, parsed.data.name, parsed.data.color);
  } catch {
    return fail("A life area with that name already exists.");
  }
  return { ok: true, data: getLifeAreas() };
}

export async function deleteLifeAreaAction(
  id: number,
): Promise<ActionResult<LifeArea[]>> {
  await requireUser();
  repoDeleteLifeArea(id);
  return { ok: true, data: getLifeAreas() };
}

/* ------------------------------- meta --------------------------------- */

export async function setBoardMetaAction(raw: unknown): Promise<ActionResult<null>> {
  await requireUser();
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid board settings.");
  setMeta("board_title", parsed.data.title);
  setMeta("board_subtitle", parsed.data.subtitle);
  setMeta("chips", JSON.stringify(parsed.data.chips));
  return { ok: true, data: null };
}

/* --------------------------- import / export -------------------------- */

export async function resetBoardAction(): Promise<ActionResult<BoardData>> {
  await requireUser();
  repoResetBoard();
  return { ok: true, data: getBoardData() };
}

export async function importBoardAction(
  formData: FormData,
): Promise<ActionResult<BoardData>> {
  await requireUser();
  const file = formData.get("file") as File | null;
  if (!file) {
    return fail("No file provided.");
  }
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let rawObj: any = null;
    
    // Check if it's a zip by signature PK\x03\x04
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(buffer);
      const jsonEntry = zip.getEntry("export.json");
      if (!jsonEntry) {
        return fail("ZIP file is missing export.json");
      }
      const jsonString = jsonEntry.getData().toString("utf8");
      rawObj = JSON.parse(jsonString);
      
      const fs = (await import("fs")).default;
      const path = (await import("path")).default;
      const attachmentsDir = path.join(process.cwd(), "data", "attachments");
      if (!fs.existsSync(attachmentsDir)) {
        fs.mkdirSync(attachmentsDir, { recursive: true });
      }
      
      for (const entry of zip.getEntries()) {
        if (entry.entryName.startsWith("attachments/") && !entry.isDirectory) {
          const fileName = path.basename(entry.entryName);
          const outPath = path.join(attachmentsDir, fileName);
          fs.writeFileSync(outPath, entry.getData());
        }
      }
    } else {
      // Legacy .json import
      rawObj = JSON.parse(buffer.toString("utf8"));
    }

    const obj = rawObj as Record<string, any>;
    const isV1 = obj.version === 1 && Array.isArray(obj.tasks);
    const isV2 = obj.version === 2 && obj.data && Array.isArray(obj.data.tasks);

    if (!isV1 && !isV2) {
      return fail("That file doesn't look like a valid board export.");
    }

    importBoard(rawObj as BoardExport);
    return { ok: true, data: getBoardData() };
  } catch (err) {
    console.error("Import error:", err);
    return fail("Failed to import — the file may be corrupted.");
  }
}
