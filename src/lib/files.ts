// File manager types — built on top of the existing attachment system.
// A File is a first-class entity in the file manager. Attachments to tasks
// reference a file by id (so the same file can be attached to multiple tasks).
//
// A Folder is virtual (no folder row required at the top level — files with
// folder_id NULL live at the root). Folders can be nested via parent_id.

export interface FileItem {
  id: number;
  name: string;            // original filename (e.g. "Q3-roadmap.md")
  path: string;            // relative to data/files/, e.g. "research/q3.md"
  folder_id: number | null;
  mime: string;            // detected at upload time
  size: number;            // bytes
  hash: string | null;     // sha256, for dedup
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // soft-delete (trash)
}

export interface Folder {
  id: number;
  name: string;            // "research" or "design"
  parent_id: number | null; // null = root
  created_at: string;
  updated_at: string;
  // derived: full path of nested folders joined with "/"
  path?: string;
}

export type AnnotationKind = "line" | "thread";

export interface Annotation {
  id: number;
  file_id: number;
  kind: AnnotationKind;
  // For kind="line": 1-indexed line number in the file
  // For kind="thread": null
  line: number | null;
  body: string;            // the comment text (markdown allowed)
  color: string | null;    // optional accent color (e.g. "warn" | "accent" | "danger")
  created_at: string;
  updated_at: string;
}

export interface FileNode {
  // Tree-node shape: a folder with its direct children (or a file).
  id: number;
  name: string;
  type: "folder" | "file";
  path: string;
  size?: number;
  mime?: string;
  updated_at?: string;
  // Annotations summary: count + unresolved count, surfaced in the tree view
  annotation_count?: number;
  children?: FileNode[];
}

export type FileContentKind = "markdown" | "code" | "text" | "image" | "binary";

/**
 * Tells the UI how to render a file based on its MIME.
 *   markdown → react-markdown
 *   code     → react-syntax-highlighter (or similar)
 *   text     → plain pre
 *   image    → <img>
 *   binary   → download-only
 */
export function inferFileKind(mime: string, name: string): FileContentKind {
  const lower = name.toLowerCase();
  if (/^text\/markdown$/.test(mime) || lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".txt") || /^text\/plain/.test(mime)) return "text";
  if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(lower)) return "image";
  if (
    /\.(js|ts|jsx|tsx|json|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|css|html|xml|yaml|yml|toml|sh|bash|sql|md|mdx|vue|svelte|scss|sass|less)$/i.test(lower)
    || /^text\//.test(mime) || /^application\/(json|xml)/.test(mime)
  ) return "code";
  return "binary";
}

/**
 * Build the human-readable size string.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Returns a friendly icon hint per file extension. Used by the file tree.
 * Returns a single emoji character.
 */
export function fileIcon(name: string, mime?: string): string {
  const lower = name.toLowerCase();
  if (/\.(md|mdx)$/i.test(lower)) return "📄";
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(lower) || (mime && /^image\//.test(mime))) return "🖼";
  if (/\.(mp4|mov|webm)$/i.test(lower) || (mime && /^video\//.test(mime))) return "🎬";
  if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(lower) || (mime && /^audio\//.test(mime))) return "🎵";
  if (/\.(pdf)$/i.test(lower)) return "📕";
  if (/\.(zip|tar|gz|7z|rar)$/i.test(lower)) return "🗜";
  if (/\.(js|ts|jsx|tsx|json|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|css|html|xml|yaml|yml|toml|sh|bash|sql)$/i.test(lower)) return "💻";
  if (/\.(doc|docx)$/i.test(lower)) return "📝";
  if (/\.(xls|xlsx|csv)$/i.test(lower)) return "📊";
  return "📎";
}
