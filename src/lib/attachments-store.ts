import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { getDataDir } from "@/db/client";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_TASK = 10;

// Only these MIME types are ever served inline (rendered) — everything else is
// forced to download, so a malicious upload can't execute in the app's origin.
const INLINE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isInlineMime(mime: string): boolean {
  return INLINE_MIME.has(mime);
}

function storeDir(): string {
  const d = resolve(getDataDir(), "attachments");
  if (!existsSync(d)) mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

/** A short, safe extension derived from the original filename (or none). */
function safeExt(filename: string): string {
  const e = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(e) ? e : "";
}

/** Store bytes under a random, collision-free name; returns that name. */
export async function saveAttachmentFile(
  bytes: Uint8Array,
  filename: string,
): Promise<string> {
  const stored = randomUUID() + safeExt(filename);
  await writeFile(resolve(storeDir(), stored), bytes, { mode: 0o600 });
  return stored;
}

/** Resolve a stored name to a path, refusing anything but our own names. */
function attachmentPath(storedName: string): string {
  if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i.test(storedName)) return "";
  return resolve(storeDir(), storedName);
}

export async function readAttachmentFile(
  storedName: string,
): Promise<Buffer | null> {
  const p = attachmentPath(storedName);
  if (!p || !existsSync(p)) return null;
  return readFile(p);
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  const p = attachmentPath(storedName);
  if (p && existsSync(p)) {
    try {
      await unlink(p);
    } catch {
      /* file already gone — fine */
    }
  }
}
