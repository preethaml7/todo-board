"use server";

/**
 * File content server actions — read the bytes of a file.
 *
 * Sends raw bytes back to the client (text files as UTF-8, binary as
 * base64-ish via a Buffer response). The viewer decides how to render
 * based on the file's MIME type.
 */

import { requireUser } from "@/lib/auth";
import { getFile } from "@/db/repo";
import { readFile as fsReadFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { existsSync } from "node:fs";

export async function readFileContentAction(
  fileId: number,
): Promise<
  | {
      ok: true;
      mime: string;
      size: number;
      content: string;
      encoding: "utf8" | "base64";
      name: string;
    }
  | { ok: false; error: string }
> {
  await requireUser();
  if (!Number.isInteger(fileId)) return { ok: false, error: "Invalid fileId" };
  const file = getFile(fileId);
  if (!file) return { ok: false, error: "File not found" };

  // Path-traversal guard
  const abs = join(process.cwd(), "data", "files", file.path);
  const root = join(process.cwd(), "data", "files") + sep;
  if (!abs.startsWith(root) && abs !== root.slice(0, -1)) {
    return { ok: false, error: "Path traversal blocked" };
  }
  if (!existsSync(abs)) return { ok: false, error: "File missing on disk" };

  const bytes = await fsReadFile(abs);
  const textMime = file.mime.startsWith("text/") ||
    file.mime === "application/json" ||
    file.mime === "application/xml" ||
    file.mime === "application/yaml" ||
    file.mime === "application/toml" ||
    file.mime.startsWith("text/x-");

  if (textMime) {
    return {
      ok: true,
      mime: file.mime,
      size: bytes.length,
      content: bytes.toString("utf-8"),
      encoding: "utf8",
      name: file.name,
    };
  }
  return {
    ok: true,
    mime: file.mime,
    size: bytes.length,
    content: bytes.toString("base64"),
    encoding: "base64",
    name: file.name,
  };
}