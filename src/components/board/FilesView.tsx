"use client";

/**
 * FilesView — Boardspace file manager.
 *
 * Self-contained 3-pane layout (sidebar / viewer / annotations):
 *   - File tree with lazy folder expansion, search, drag-and-drop upload,
 *     per-file annotation badges.
 *   - File viewer for markdown (with line-annotation markers ①), code
 *     (manual syntax highlight), text, images, and binary files.
 *   - Right-side annotations panel for the open file.
 *
 * Style matches OnboardingHero/OnboardingForm: gold gradient for primary,
 * soft indigo for accents, all colors via CSS variables from globals.css,
 * dark mode inherited from `.dark` on the root.
 *
 * Does NOT use BoardContext — owns its own internal state so it can be
 * dropped into BoardApp.tsx as a black-box.
 */

import * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  Download,
  Edit3,
  FolderPlus,
  Folder as FolderIcon,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquarePlus,
  Search,
  Trash2,
  Upload,
  X,
  Plus,
  Paperclip,
} from "lucide-react";
import type { FileNode, Annotation } from "@/lib/files";
import {
  inferFileKind,
  formatSize,
  type FileContentKind,
} from "@/lib/files";
import {
  getFileTreeAction,
  getFolderChildrenAction,
  uploadFileAction,
  createTextFileAction,
  renameFileAction,
  moveFileAction,
  trashFileAction,
  createFolderAction,
  renameFolderAction,
  listAnnotationsAction,
  createAnnotationAction,
  updateAnnotationAction,
  deleteAnnotationAction,
  attachFileToTaskAction,
} from "@/app/actions/files";
import { readFileContentAction } from "@/app/actions/files-content";
import styles from "./FilesView.module.css";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type TreeFolder = FileNode & {
  type: "folder";
  children?: TreeNode[];
};

type TreeFile = FileNode & {
  type: "file";
  size?: number;
  mime?: string;
};

type TreeNode = TreeFolder | TreeFile;

type RecentTask = {
  id: number;
  title: string;
  status?: string;
};

type PendingUpload = {
  id: number;
  name: string;
  state: "uploading" | "done" | "error";
  error?: string;
};

type Pos = { top: number; left: number };

type Popover =
  | null
  | {
      kind: "new-line";
      fileId: number;
      line: number;
      anchorRect: DOMRect;
      focusExisting?: Annotation; // when editing existing
    };

/**
 * Shape of a successfully-fetched file. Mirrors the success variant returned
 * by `readFileContentAction`. We keep this client-side so the type is available
 * without crossing the server-action import boundary during typing.
 */
type FileContent = {
  ok: true;
  mime: string;
  size: number;
  content: string;
  encoding: "utf8" | "base64";
  name: string;
};

const ANNOTATION_GOLD = "#4DA3FF";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function classifyFileMime(name: string, mime?: string): FileContentKind {
  return inferFileKind(mime ?? "", name);
}

function fileIconChar(name: string, mime?: string): string {
  const lower = name.toLowerCase();
  if (/\.(md|mdx)$/i.test(lower)) return "📝";
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(lower)) return "🖼";
  if (/\.(mp4|mov|webm)$/i.test(lower)) return "🎬";
  if (/\.(mp3|wav|flac|ogg)$/i.test(lower)) return "🎵";
  if (/\.(pdf)$/i.test(lower)) return "📕";
  if (/\.(zip|tar|gz|rar)$/i.test(lower)) return "🗜";
  if (/\.(js|jsx|ts|tsx)$/i.test(lower)) return "🟨";
  if (/\.(py)$/i.test(lower)) return "🐍";
  if (/\.(go|rs|rb|java|swift|kt)$/i.test(lower)) return "📦";
  if (/\.(json|yaml|yml|toml|xml)$/i.test(lower)) return "⚙";
  if (mime && /^image\//.test(mime)) return "🖼";
  return "📄";
}

/**
 * Per-line syntax highlighter. Tokenizes a single line using lightweight regex
 * pass (keywords / strings / numbers / comments) and returns React nodes for
 * the tokens. Designed for code/text view (not markdown inline — markdown has
 * its own inline parser below). Returns a fragment so it composes inside any
 * container; callers provide a `keyPrefix` to keep keys unique.
 */
function highlightCodeLine(
  line: string,
  lang: string,
  keyPrefix = "",
): React.ReactNode {
  // Comments first — they're greedy from their start to end-of-line.
  const commentRe =
    lang === "python" || lang === "rb" || lang === "sh"
      ? /#.*$/
      : /\/\/.*$/;

  type Tok = { start: number; end: number; cls: string; val: string };
  const found: Tok[] = [];

  const commentMatch = commentRe.exec(line);
  if (commentMatch) {
    found.push({
      start: commentMatch.index,
      end: commentMatch.index + commentMatch[0].length,
      cls: "tkCom",
      val: commentMatch[0],
    });
  }

  // Walk the line outside of comments and match strings / numbers / keywords.
  const ranges = found.length
    ? [{ start: 0, end: found[0].start }]
    : [{ start: 0, end: line.length }];
  for (let i = 0; i < found.length; i++) {
    const next = found[i + 1];
    if (next) ranges.push({ start: found[i].end, end: next.start });
  }

  const kw =
    /\b(if|else|for|while|return|function|const|let|var|class|interface|type|import|export|from|default|null|undefined|true|false|async|await|new|this|def|elif|try|catch|finally|raise|with|as|yield|fn|pub|use|mod|struct|enum|match|impl|self|None|True|False|do|in)\b/g;
  const strSingle = /'([^'\\\n]|\\.)*'/g;
  const strDouble = /"([^"\\\n]|\\.)*"/g;
  const strBack = /`([^`\\]|\\.)*`/g;
  const num = /\b\d+(?:\.\d+)?\b/g;

  for (const r of ranges) {
    const seg = line.slice(r.start, r.end);
    const collect = (re: RegExp, cls: string) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(seg))) {
        found.push({
          start: r.start + m.index,
          end: r.start + m.index + m[0].length,
          cls,
          val: m[0],
        });
        if (m[0].length === 0) re.lastIndex++;
      }
    };
    collect(strSingle, "tkStr");
    collect(strDouble, "tkStr");
    collect(strBack, "tkStr");
    collect(num, "tkNum");
    collect(kw, "tkKey");
  }

  found.sort((a, b) => a.start - b.start);
  const cleaned: Tok[] = [];
  let lastEnd = 0;
  for (const t of found) {
    if (t.start >= lastEnd) {
      cleaned.push(t);
      lastEnd = t.end;
    }
  }

  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (const t of cleaned) {
    if (t.start > cursor) {
      out.push(line.slice(cursor, t.start));
    }
    out.push(
      <span key={`${keyPrefix}${t.start}`} className={styles[t.cls]}>
        {t.val}
      </span>,
    );
    cursor = t.end;
  }
  if (cursor < line.length) out.push(line.slice(cursor));
  return <>{out}</>;
}

/* ------------------------------------------------------------------ */
/* Markdown parser — pure string → blocks → React. No external lib.    */
/*                                                                                                          */
/* Supports:                                                                                             */
/*   • ATX headings  (# / ## / ### / #### / ##### / ######)                  */
/*   • Paragraphs (blank-line separated)                                                          */
/*   • Unordered (- or *) and ordered (1.) lists (incl. nesting-ish)        */
/*   • GFM task lists  `- [ ]` / `- [x]` (case-insensitive)                       */
/*   • Blockquotes  `> ...` (lazy continuation)                                                     */
/*   • Fenced code blocks  ``` lang … ``` (with language)                                    */
/*   • Horizontal rules  --- / *** / ___ (line of ≥3)                                                */
/*   • GFM tables  (| col | col |\n| --- | --- |\n| ... |)                                                */
/*                                                                                                          */
/* Inline (within paragraphs, headings, list items, blockquotes):                  */
/*   • **bold**, *italic*, ~~strike~~                                                                */
/*   • `inline code`                                                                                            */
/*   • [text](url)  + auto-links <https://…>                                                            */
/*                                                                                                          */
/* Each block records its startLine so the gutter annotation system can    */
/* attach notes to the right block.                                                                            */
/* ------------------------------------------------------------------ */

type MdBlock =
  | {
      kind: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
      startLine: number;
    }
  | { kind: "paragraph"; text: string; startLine: number }
  | { kind: "blockquote"; lines: string[]; startLine: number }
  | {
      kind: "list";
      ordered: boolean;
      items: Array<{ text: string; task: "none" | "todo" | "done"; startLine: number }>;
      startLine: number;
    }
  | { kind: "code"; lang: string; content: string; startLine: number }
  | { kind: "hr"; startLine: number }
  | {
      kind: "table";
      headers: string[];
      rows: string[][];
      startLine: number;
    };

/**
 * Top-level markdown parser. Splits source into blocks while tracking each
 * block's starting line (1-indexed) so the annotation gutter can target it.
 */
function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;

    // ---- fenced code block ----
    const fence = line.match(/^```(\s*([\w+-]+))?\s*$/);
    if (fence) {
      const lang = (fence[2] ?? "").trim().toLowerCase();
      const start = i;
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      // skip closing fence if present
      if (i < lines.length && /^```\s*$/.test(lines[i])) i++;
      blocks.push({
        kind: "code",
        lang,
        content: buf.join("\n"),
        startLine: start + 1,
      });
      continue;
    }

    // ---- horizontal rule ----
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr", startLine: lineNo });
      i++;
      continue;
    }

    // ---- ATX heading ----
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && !/^#{7,}/.test(heading[1])) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim(),
        startLine: lineNo,
      });
      i++;
      continue;
    }

    // ---- GFM table ----
    if (
      /^\s*\|.+\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const start = i;
      const parseRow = (r: string): string[] =>
        r
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());
      const headers = parseRow(lines[start]);
      const rows: string[][] = [];
      let j = start + 2;
      while (j < lines.length && /^\s*\|.+\|\s*$/.test(lines[j])) {
        rows.push(parseRow(lines[j]));
        j++;
      }
      blocks.push({ kind: "table", headers, rows, startLine: start + 1 });
      i = j;
      continue;
    }

    // ---- blockquote ----
    if (/^\s{0,3}>/.test(line)) {
      const start = i;
      const buf: string[] = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        if (/^\s{0,3}>/.test(lines[i])) {
          i++;
        } else {
          // blank inside quote; keep going if next line is also a quote
          if (i + 1 < lines.length && /^\s{0,3}>/.test(lines[i + 1])) i++;
          else break;
        }
      }
      blocks.push({ kind: "blockquote", lines: buf, startLine: start + 1 });
      continue;
    }

    // ---- list ----
    const listItemRe = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
    if (listItemRe.test(line)) {
      const start = i;
      const firstMatch = line.match(listItemRe)!;
      const ordered = /\d+\./.test(firstMatch[2]);
      const items: Array<{ text: string; task: "none" | "todo" | "done"; startLine: number }> = [];
      while (i < lines.length) {
        const cur = lines[i];
        const m = cur.match(listItemRe);
        if (m) {
          const indent = m[1].length;
          const marker = m[2];
          const isOrdered = /\d+\./.test(marker);
          // If we started unordered, stay unordered
          if ((ordered && !isOrdered) || (!ordered && isOrdered)) break;
          // Allow up to 2-space indentation difference within the same list
          if (indent > firstMatch[1].length + 2) break;
          const markerLine = i + 1; // 1-indexed
          let body = m[3];
          // GFM task list: `- [ ]` or `- [x]`
          const taskMatch = body.match(/^\[([ xX])\]\s+(.*)$/);
          const task: "none" | "todo" | "done" =
            taskMatch
              ? taskMatch[1].toLowerCase() === "x"
                ? "done"
                : "todo"
              : "none";
          if (taskMatch) body = taskMatch[2];

          // Lazy continuation: join lines until the next list-item marker or blank+non-list
          i++;
          while (i < lines.length && !listItemRe.test(lines[i]) && !/^\s*$/.test(lines[i])) {
            body += " " + lines[i].trim();
            i++;
          }
          // Eat one trailing blank if the next line is a list item (compact list)
          if (i < lines.length && /^\s*$/.test(lines[i]) && i + 1 < lines.length && listItemRe.test(lines[i + 1])) {
            i++;
          }
          items.push({ text: body, task, startLine: markerLine });
        } else if (/^\s+$/.test(cur)) {
          // blank line within list — peek ahead
          if (i + 1 < lines.length && listItemRe.test(lines[i + 1])) {
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      blocks.push({ kind: "list", ordered, items, startLine: start + 1 });
      continue;
    }

    // ---- blank line ----
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // ---- paragraph (consume until blank line / block element) ----
    const start = i;
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !listItemRe.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s{0,3}>/.test(lines[i]) &&
      !/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !(/^\s*\|.+\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({
      kind: "paragraph",
      text: buf.join(" ").replace(/\s+/g, " ").trim(),
      startLine: start + 1,
    });
  }

  return blocks;
}

/* ----------------- inline markdown → React nodes ----------------- */

const ESCAPE_RE = /\\([\\`*_{}\[\]()#+\-.!>~|])/g;

function parseInline(text: string, keyPrefix = ""): React.ReactNode[] {
  // Tokenize left-to-right with a small set of regex passes.
  // Order of precedence (highest first): code spans, links/images, bold, italic, strike, autolinks, escape.
  const out: React.ReactNode[] = [];
  let i = 0;
  let counter = 0;
  const nextKey = () => `${keyPrefix}i${counter++}`;

  while (i < text.length) {
    const rest = text.slice(i);

    // Escape
    const esc = rest.match(ESCAPE_RE);
    if (esc && esc.index === 0) {
      out.push(esc[1]);
      i += esc[0].length;
      continue;
    }

    // Inline code: `…`
    const codeM = rest.match(/^`([^`\n]+)`/);
    if (codeM) {
      out.push(
        <code key={nextKey()} className={styles.mdCode}>
          {codeM[1]}
        </code>,
      );
      i += codeM[0].length;
      continue;
    }

    // Image: ![alt](url)
    const imgM = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgM) {
      out.push(
        <img
          key={nextKey()}
          src={imgM[2]}
          alt={imgM[1]}
          title={imgM[3]}
          className={styles.mdImage}
        />,
      );
      i += imgM[0].length;
      continue;
    }

    // Link: [text](url)
    const linkM = rest.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (linkM) {
      out.push(
        <a
          key={nextKey()}
          href={linkM[2]}
          className={styles.mdLink}
          title={linkM[3]}
        >
          {parseInline(linkM[1], `${keyPrefix}l${counter}-`)}
        </a>,
      );
      i += linkM[0].length;
      continue;
    }

    // Auto-link: <https://…> or <foo@bar>
    const autoM = rest.match(/^<(https?:\/\/[^\s>]+|[^\s@<>]+@[^\s@<>]+)>/);
    if (autoM) {
      const href =
        autoM[1].startsWith("http") || autoM[1].startsWith("//")
          ? autoM[1]
          : `mailto:${autoM[1]}`;
      out.push(
        <a key={nextKey()} href={href} className={styles.mdLink}>
          {autoM[1]}
        </a>,
      );
      i += autoM[0].length;
      continue;
    }

    // Bold + italic: ***…***  or ___…___
    const triM = rest.match(/^(\*\*\*|___)(.+?)\1/);
    if (triM) {
      out.push(
        <strong key={nextKey()} className={styles.mdBold}>
          <em className={styles.mdItalic}>{parseInline(triM[2], `${keyPrefix}b${counter}-`)}</em>
        </strong>,
      );
      i += triM[0].length;
      continue;
    }

    // Bold: **…** or __…__
    const boldM = rest.match(/^(\*\*|__)(.+?)\1/);
    if (boldM) {
      out.push(
        <strong key={nextKey()} className={styles.mdBold}>
          {parseInline(boldM[2], `${keyPrefix}b${counter}-`)}
        </strong>,
      );
      i += boldM[0].length;
      continue;
    }

    // Italic: *…* or _…_
    const italM = rest.match(/^(\*|_)(?!\s)([^*_]+?)\1/);
    if (italM) {
      out.push(
        <em key={nextKey()} className={styles.mdItalic}>
          {parseInline(italM[2], `${keyPrefix}m${counter}-`)}
        </em>,
      );
      i += italM[0].length;
      continue;
    }

    // Strikethrough: ~~…~~
    const strikeM = rest.match(/^~~([^~]+)~~/);
    if (strikeM) {
      out.push(
        <del key={nextKey()} className={styles.mdStrike}>
          {parseInline(strikeM[1], `${keyPrefix}s${counter}-`)}
        </del>,
      );
      i += strikeM[0].length;
      continue;
    }

    // Plain run: consume until next special char
    const plainM = rest.match(/^[^\\`*_\[\]!<~]+/);
    if (plainM) {
      out.push(plainM[0]);
      i += plainM[0].length;
      continue;
    }

    // Fallback: emit one char
    out.push(text[i]);
    i++;
  }

  return out;
}

/* ----------------- markdown block renderer ----------------- */

function MarkdownRenderer({
  blocks,
  annotationsByLine,
  onLineClick,
  onMarkerClick,
}: {
  blocks: MdBlock[];
  annotationsByLine: Map<number, Annotation[]>;
  onLineClick: (line: number, target: HTMLElement) => void;
  onMarkerClick: (a: Annotation, line: number) => void;
}) {
  return (
    <>
      {blocks.map((block, idx) => (
        <BlockRow
          key={`b-${idx}-${block.startLine}`}
          block={block}
          annotationsByLine={annotationsByLine}
          onLineClick={onLineClick}
          onMarkerClick={onMarkerClick}
        />
      ))}
    </>
  );
}

function BlockRow({
  block,
  annotationsByLine,
  onLineClick,
  onMarkerClick,
}: {
  block: MdBlock;
  annotationsByLine: Map<number, Annotation[]>;
  onLineClick: (line: number, target: HTMLElement) => void;
  onMarkerClick: (a: Annotation, line: number) => void;
}) {
  const lineNo = block.startLine;
  const marks = annotationsByLine.get(lineNo) ?? [];
  const handleClick = (e: React.MouseEvent) => {
    onLineClick(lineNo, e.currentTarget as HTMLElement);
  };
  return (
    <div
      className={`${styles.annLine} ${styles.mdLine}`}
      data-line={lineNo}
      onClick={handleClick}
    >
      <div className={styles.annGutter}>
        <span className={styles.annLineNumber}>{lineNo}</span>
        <span
          className={styles.annAdd}
          title="Add annotation"
          role="button"
          aria-label={`Add annotation on line ${lineNo}`}
        >
          +
        </span>
        {marks.length > 0 && (
          <span className={styles.annMarkers}>
            {marks.map((m, i) => (
              <span
                key={m.id}
                className={styles.annMarker}
                style={
                  {
                    "--marker-delay": `${i * 0.15}s`,
                  } as React.CSSProperties
                }
                onClick={(ev) => {
                  ev.stopPropagation();
                  onMarkerClick(m, lineNo);
                }}
                title={`Annotation ${i + 1}`}
              >
                ①
              </span>
            ))}
          </span>
        )}
      </div>
      <div className={styles.mdBlockWrap}>
        <BlockContent block={block} />
      </div>
    </div>
  );
}

function BlockContent({ block }: { block: MdBlock }) {
  switch (block.kind) {
    case "heading": {
      const cls =
        block.level === 1
          ? styles.mdH1
          : block.level === 2
          ? styles.mdH2
          : block.level === 3
          ? styles.mdH3
          : styles.mdH4;
      const inner = parseInline(block.text);
      if (block.level === 1) return <h1 className={cls}>{inner}</h1>;
      if (block.level === 2) return <h2 className={cls}>{inner}</h2>;
      if (block.level === 3) return <h3 className={cls}>{inner}</h3>;
      if (block.level === 4) return <h4 className={cls}>{inner}</h4>;
      if (block.level === 5) return <h5 className={cls}>{inner}</h5>;
      return <h6 className={cls}>{inner}</h6>;
    }
    case "paragraph":
      return <p className={styles.mdP}>{parseInline(block.text)}</p>;
    case "hr":
      return <hr className={styles.mdHr} />;
    case "blockquote":
      return (
        <blockquote className={styles.mdBlockquote}>
          {block.lines
            .filter((l) => l.trim().length > 0)
            .map((l, i) => (
              <p key={i} className={styles.mdBlockquoteLine}>
                {parseInline(l)}
              </p>
            ))}
        </blockquote>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol className={styles.mdOl}>
            {block.items.map((it, i) => (
              <li key={i} className={styles.mdLi}>
                {it.task !== "none" && (
                  <span
                    className={`${styles.mdCheckbox} ${it.task === "done" ? styles.mdCheckboxDone : ""}`}
                    aria-hidden
                  />
                )}
                <span className={styles.mdLiText}>{parseInline(it.text)}</span>
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className={styles.mdUl}>
          {block.items.map((it, i) => (
            <li key={i} className={styles.mdLi}>
              {it.task !== "none" && (
                <span
                  className={`${styles.mdCheckbox} ${it.task === "done" ? styles.mdCheckboxDone : ""}`}
                  aria-hidden
                />
              )}
              <span className={styles.mdLiText}>{parseInline(it.text)}</span>
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className={styles.mdCodeBlock} data-lang={block.lang || "txt"}>
          <code className={styles.mdCodeBlockInner}>
            {block.content.split("\n").map((line, i) => (
              <span key={i} className={styles.mdCodeLine}>
                {highlightCodeLine(line, block.lang || "txt", `cb${i}-`)}
                {i < block.content.split("\n").length - 1 ? "\n" : ""}
              </span>
            ))}
          </code>
        </pre>
      );
    case "table":
      return (
        <div className={styles.mdTableWrap}>
          <table className={styles.mdTable}>
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i}>{parseInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{parseInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function FilesView() {
  /* ----------------- core state ----------------- */
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loadingChildren, setLoadingChildren] = useState<Set<number>>(
    new Set(),
  );
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [searchFocusIdx, setSearchFocusIdx] = useState(0);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);

  // annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);

  // file content (real fetched bytes from the server)
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileContentError, setFileContentError] = useState<string | null>(null);

  // ui
  const [rightOpen, setRightOpen] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [movingTo, setMovingTo] = useState(false);

  /* ----------------- refs ----------------- */
  const viewerScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  /* ----------------- derived ----------------- */
  const flatVisible = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        out.push(n);
        if (
          n.type === "folder" &&
          expanded.has(n.id) &&
          n.children &&
          n.children.length
        ) {
          walk(n.children, depth + 1);
        }
      }
    };
    walk(tree, 0);
    return out;
  }, [tree, expanded]);

  const filteredVisible = useMemo(() => {
    if (!query.trim()) return flatVisible;
    const q = query.toLowerCase();
    return flatVisible.filter((n) => n.name.toLowerCase().includes(q));
  }, [flatVisible, query]);

  const selectedFileNode = useMemo(() => {
    if (selectedFileId == null) return null;
    const find = (nodes: TreeNode[]): TreeFile | null => {
      for (const n of nodes) {
        if (n.type === "file" && n.id === selectedFileId) return n;
        if (n.type === "folder" && n.children) {
          const f = find(n.children);
          if (f) return f;
        }
      }
      return null;
    };
    return find(tree);
  }, [selectedFileId, tree]);

  const isMarkdown = useMemo(() => {
    if (!selectedFileNode) return false;
    return classifyFileMime(
      selectedFileNode.name,
      selectedFileNode.mime,
    ) === "markdown";
  }, [selectedFileNode]);

  const annotationsByLine = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (a.kind === "line" && a.line != null) {
        const arr = map.get(a.line) ?? [];
        arr.push(a);
        map.set(a.line, arr);
      }
    }
    return map;
  }, [annotations]);

  const threadAnnotations = useMemo(
    () => annotations.filter((a) => a.kind === "thread"),
    [annotations],
  );

  /* ----------------- effects ----------------- */

  // detect dark mode by reading the .dark class on <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // initial tree load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTreeLoading(true);
      const res = await getFileTreeAction();
      if (cancelled) return;
      if (res.ok) {
        setTree(buildTreeChildren(res.data ?? []));
      } else {
        setTree([]);
      }
      setTreeLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // load annotations when file changes
  useEffect(() => {
    if (selectedFileId == null) {
      setAnnotations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setAnnotationsLoading(true);
      const res = await listAnnotationsAction(selectedFileId);
      if (cancelled) return;
      if (res.ok) setAnnotations(res.data ?? []);
      else setAnnotations([]);
      setAnnotationsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFileId]);

  // fetch real file content when file changes — replaces the old sample-text demo
  useEffect(() => {
    if (selectedFileId == null) {
      setFileContent(null);
      setFileContentError(null);
      setFileContentLoading(false);
      return;
    }
    let cancelled = false;
    setFileContent(null);
    setFileContentError(null);
    setFileContentLoading(true);
    (async () => {
      try {
        const res = await readFileContentAction(selectedFileId);
        if (cancelled) return;
        if (res.ok) {
          setFileContent(res);
          setFileContentError(null);
        } else {
          setFileContent(null);
          setFileContentError(res.error ?? "Could not load this file.");
        }
      } catch (e) {
        if (cancelled) return;
        setFileContent(null);
        setFileContentError(e instanceof Error ? e.message : "Could not load this file.");
      } finally {
        if (!cancelled) setFileContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFileId]);

  // global key handler for Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // popover first, then any open modal, then close right pane
      if (popover) {
        setPopover(null);
        e.preventDefault();
        return;
      }
      if (renameOpen) {
        setRenameOpen(false);
        e.preventDefault();
        return;
      }
      if (attachOpen) {
        setAttachOpen(false);
        e.preventDefault();
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popover, renameOpen, attachOpen]);

  /* ----------------- tree helpers ----------------- */

  function buildTreeChildren(nodes: FileNode[]): TreeNode[] {
    return nodes.map((n) => {
      if (n.type === "folder") {
        return {
          ...n,
          children: n.children?.length
            ? buildTreeChildren(n.children)
            : [],
        } as TreeFolder;
      }
      return n as TreeFile;
    });
  }

  const toggleFolder = useCallback(
    async (folderId: number) => {
      const isOpen = expanded.has(folderId);
      const next = new Set(expanded);
      if (isOpen) {
        next.delete(folderId);
        setExpanded(next);
        return;
      }
      next.add(folderId);
      setExpanded(next);

      // lazy-load children if folder's children aren't there yet
      const folder = findNode(tree, folderId);
      if (
        folder &&
        folder.type === "folder" &&
        (!folder.children || folder.children.length === 0)
      ) {
        setLoadingChildren((s) => new Set(s).add(folderId));
        const res = await getFolderChildrenAction(folderId);
        setLoadingChildren((s) => {
          const n = new Set(s);
          n.delete(folderId);
          return n;
        });
        if (res.ok) {
          setTree((t) => updateFolderChildren(t, folderId, res.data ?? []));
        }
      }
    },
    [expanded, tree],
  );

  /* ----------------- keyboard nav ----------------- */
  function onTreeKeyDown(e: React.KeyboardEvent) {
    if (e.target !== treeContainerRef.current && !filteredVisible.length)
      return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchFocusIdx((i) => Math.min(filteredVisible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const node = filteredVisible[searchFocusIdx];
      if (!node) return;
      if (node.type === "folder") toggleFolder(node.id);
      else setSelectedFileId(node.id);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const node = filteredVisible[searchFocusIdx];
      if (node?.type === "folder" && !expanded.has(node.id)) toggleFolder(node.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const node = filteredVisible[searchFocusIdx];
      if (node?.type === "folder" && expanded.has(node.id)) toggleFolder(node.id);
    }
  }

  /* ----------------- upload ----------------- */

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    const newUploads: PendingUpload[] = files.map((_, i) => ({
      id: Date.now() + i + Math.random(),
      name: "",
      state: "uploading" as const,
    }));
    setUploads((u) => [...newUploads, ...u]);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const uploadId = newUploads[i].id;
      setUploads((u) =>
        u.map((p) =>
          p.id === uploadId ? { ...p, name: f.name } : p,
        ),
      );
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("name", f.name);
        await uploadFileAction(fd);
        setUploads((u) =>
          u.map((p) =>
            p.id === uploadId ? { ...p, state: "done" } : p,
          ),
        );
      } catch (e) {
        setUploads((u) =>
          u.map((p) =>
            p.id === uploadId
              ? { ...p, state: "error" as const, error: e instanceof Error ? e.message : "failed" }
              : p,
          ),
        );
      }
    }

    // refresh tree
    const tr = await getFileTreeAction();
    if (tr.ok && tr.data) setTree(buildTreeChildren(tr.data ?? []));

    // clear completed uploads after a moment
    setTimeout(() => {
      setUploads((u) => u.filter((p) => p.state === "uploading"));
    }, 2500);
  }

  /* ----------------- tree CRUD ----------------- */

  async function createNewFolder() {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    const res = await createFolderAction({ name, parentId: null });
    if (!res.ok) return;
    const tr = await getFileTreeAction();
    if (tr.ok) setTree(buildTreeChildren(tr.data ?? []));
  }

  async function renameSelected() {
    if (!selectedFileNode) return;
    setRenameValue(selectedFileNode.name);
    setRenameOpen(true);
  }

  async function commitRename() {
    if (!selectedFileNode) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === selectedFileNode.name) {
      setRenameOpen(false);
      return;
    }
    await renameFileAction({ id: selectedFileNode.id, name: trimmed });
    const tr = await getFileTreeAction();
    if (tr.ok) setTree(buildTreeChildren(tr.data ?? []));
    setRenameOpen(false);
  }

  async function trashSelected() {
    if (!selectedFileNode) return;
    if (!window.confirm(`Move "${selectedFileNode.name}" to trash?`)) return;
    await trashFileAction(selectedFileNode.id);
    setSelectedFileId(null);
    const tr = await getFileTreeAction();
    if (tr.ok) setTree(buildTreeChildren(tr.data ?? []));
  }

  /* ----------------- annotation CRUD ----------------- */

  async function addAnnotation(body: string, line?: number) {
    if (!selectedFileNode) return;
    await createAnnotationAction({
      fileId: selectedFileNode.id,
      kind: line != null ? "line" : "thread",
      line: line ?? null,
      body,
      color: "gold",
    });
    const res = await listAnnotationsAction(selectedFileNode.id);
    if (res.ok) setAnnotations(res.data ?? []);
  }

  async function editAnnotation(id: number, body: string) {
    await updateAnnotationAction({ id, body, color: "gold" });
    if (!selectedFileNode) return;
    const res = await listAnnotationsAction(selectedFileNode.id);
    if (res.ok) setAnnotations(res.data ?? []);
  }

  async function removeAnnotation(id: number) {
    await deleteAnnotationAction(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }

  /* ----------------- attach to task ----------------- */

  async function openAttachPicker() {
    if (!selectedFileNode) return;
    setAttachOpen(true);
    // fake "recent tasks" — in production this would query a tasks action.
    // Per spec, this is just a list of recent tasks, no full picker.
    setRecentTasks([
      { id: 101, title: "Ship Q4 launch", status: "in_progress" },
      { id: 102, title: "Review boardspace mocks", status: "todo" },
      { id: 103, title: "Renew hosting cert", status: "backlog" },
      { id: 104, title: "Fix flaky test in repo", status: "blocked" },
      { id: 105, title: "Onboard new device", status: "todo" },
    ]);
  }

  async function attachToTask(taskId: number) {
    if (!selectedFileNode) return;
    const res = await attachFileToTaskAction({
      fileId: selectedFileNode.id,
      taskId,
    });
    setAttachOpen(false);
    if (!res.ok) window.alert(res.error ?? "Could not attach");
  }

  /* ----------------- viewer renderers ----------------- */

  function renderViewer() {
    if (!selectedFileNode) {
      return (
        <div className={styles.noSelection} data-testid="viewer-empty">
          <div className={styles.noSelectionInner}>
            <span className={styles.noSelectionGlyph} aria-hidden>
              <FileText size={26} />
            </span>
            <div>Pick a file from the sidebar.</div>
            <small style={{ color: "var(--text-subtle)" }}>
              Drag anything into the tree to upload.
            </small>
          </div>
        </div>
      );
    }

    const kind = classifyFileMime(
      selectedFileNode.name,
      selectedFileNode.mime,
    );

    // ---- loading / error UI (shared across all text-ish kinds) ----
    const showLoading = fileContentLoading && !fileContent && !fileContentError;
    const showError = !fileContentLoading && !!fileContentError && !fileContent;

    if (kind === "binary") {
      return (
        <div className={styles.binary} data-testid="viewer-binary">
          <span className={styles.binaryIcon} aria-hidden>
            <FileIcon size={26} />
          </span>
          <div className={styles.binaryTitle}>{selectedFileNode.name}</div>
          <small>
            {fileContent
              ? `${formatSize(fileContent.size)} · ${fileContent.mime || "binary"}`
              : "Binary file — preview unavailable."}
          </small>
          <a
            className={styles.downloadBtn}
            href={`/api/files/${selectedFileNode.id}/download`}
            download={selectedFileNode.name}
          >
            <Download size={14} /> Download
          </a>
        </div>
      );
    }

    if (kind === "image") {
      return (
        <div className={styles.imageWrap} data-testid="viewer-image">
          <img
            src={`/api/files/${selectedFileNode.id}/raw`}
            alt={selectedFileNode.name}
          />
          <div className={styles.imageFooter}>
            <span className={styles.imageName}>{selectedFileNode.name}</span>
            <a
              className={styles.downloadBtn}
              href={`/api/files/${selectedFileNode.id}/download`}
              download={selectedFileNode.name}
            >
              <Download size={13} /> Download
            </a>
          </div>
        </div>
      );
    }

    if (showLoading) {
      return (
        <div className={styles.viewerState} data-testid="viewer-loading">
          <span className={styles.spinner} aria-hidden />
          <span>Loading file…</span>
        </div>
      );
    }

    if (showError) {
      return (
        <div className={styles.viewerState} data-testid="viewer-error">
          <span className={styles.viewerStateGlyph} aria-hidden>
            <FileIcon size={22} />
          </span>
          <div className={styles.viewerStateTitle}>Could not load this file.</div>
          <small style={{ color: "var(--text-subtle)" }}>
            {fileContentError}
          </small>
        </div>
      );
    }

    // No content yet but also not loading (e.g. text/image with no fetch yet)
    if (!fileContent) {
      return (
        <div className={styles.viewerState} data-testid="viewer-empty-state">
          <span>Nothing to preview yet.</span>
        </div>
      );
    }

    const text = fileContent.content;

    // ---- markdown (with line-anchored annotation gutter) ----
    if (kind === "markdown" && isMarkdown) {
      const blocks = parseMarkdown(text);
      return (
        <div className={styles.markdownDoc} data-testid="viewer-markdown">
          <MarkdownRenderer
            blocks={blocks}
            annotationsByLine={annotationsByLine}
            onLineClick={(lineNo, target) =>
              openLinePopover(lineNo, target.getBoundingClientRect(), target)
            }
            onMarkerClick={(a, lineNo) => openLinePopoverForEdit(a, lineNo)}
          />
        </div>
      );
    }

    // ---- code (syntax-highlighted, with line numbers) ----
    if (kind === "code") {
      const lines = text.split("\n");
      const lang = extLang(selectedFileNode.name);
      return (
        <div className={styles.codeWrap} data-testid="viewer-code">
          <div className={styles.codeHead}>
            <span className={styles.codeLang}>{lang}</span>
            <span className={styles.codeSize}>
              {formatSize(fileContent.size)}
            </span>
          </div>
          <pre className={styles.codeBlock}>
            <code className={styles.codeInner}>
              {lines.map((line, i) => (
                <span key={i} className={styles.codeLine}>
                  <span className={styles.codeLineNumber}>{i + 1}</span>
                  <span className={styles.codeLineText}>
                    {highlightCodeLine(line, lang, `${i}-`)}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      );
    }

    // ---- plain text (line numbers, monospace) ----
    const lines = text.split("\n");
    return (
      <div className={styles.textWrap} data-testid="viewer-text">
        <div className={styles.textHead}>
          <span className={styles.codeLang}>text</span>
          <span className={styles.codeSize}>
            {formatSize(fileContent.size)}
          </span>
        </div>
        <pre className={styles.textBlock}>
          {lines.map((line, i) => (
            <span key={i} className={styles.codeLine}>
              <span className={styles.codeLineNumber}>{i + 1}</span>
              <span className={styles.codeLineText}>{line || " "}</span>
            </span>
          ))}
        </pre>
      </div>
    );
  }

  function openLinePopover(line: number, rect: DOMRect, target: HTMLElement) {
    // Position the popover near the clicked row.
    const r = target.closest(`.${styles.annLine}`)?.getBoundingClientRect();
    setPopover({
      kind: "new-line",
      fileId: selectedFileNode!.id,
      line,
      anchorRect: r ?? rect,
    });
  }

  function openLinePopoverForEdit(a: Annotation, line: number) {
    const el = document.querySelector(
      `[data-line="${line}"]`,
    ) as HTMLElement | null;
    const rect = el?.getBoundingClientRect() ?? new DOMRect();
    setPopover({
      kind: "new-line",
      fileId: selectedFileNode!.id,
      line,
      anchorRect: rect,
      focusExisting: a,
    });
  }

  /* ----------------- render ----------------- */

  const fileIsMarkdown = isMarkdown;
  const showRightPane =
    rightOpen &&
    !!selectedFileNode &&
    (!fileIsMarkdown ? threadAnnotations.length > 0 || !annotationsLoading || true : true);

  // if tree is empty (no nodes at all), show the empty state
  const showEmptyState =
    !treeLoading && tree.length === 0 && !selectedFileNode;

  return (
    <div
      className={`${styles.shell} ${rightOpen ? "" : styles.rightClosed}`}
      data-testid="files-shell"
      onKeyDown={onTreeKeyDown}
      tabIndex={-1}
    >
      {showEmptyState ? (
        <EmptyState
          onCreateFolder={createNewFolder}
          onUpload={() => fileInputRef.current?.click()}
          onFiles={handleFiles}
          dragOver={dragOver}
        />
      ) : (
        <>
          {/* ====================== SIDEBAR ====================== */}
          <aside className={styles.sidebar} aria-label="File tree">
            <div className={styles.sidebarHead}>
              <h2 className={styles.title}>
                <span className={styles.titleIcon} aria-hidden>
                  <FolderIcon size={13} />
                </span>
                Files
              </h2>
              <div className={styles.sidebarActions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  onClick={createNewFolder}
                  data-testid="new-folder-btn"
                  title="Create folder"
                  aria-label="Create folder"
                >
                  <FolderPlus size={13} aria-hidden /> New
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="upload-btn"
                  title="Upload files"
                  aria-label="Upload files"
                >
                  <Upload size={13} aria-hidden /> Upload
                </button>
              </div>
              <div className={styles.searchWrap}>
                <Search
                  size={14}
                  aria-hidden
                  className={styles.searchIcon}
                />
                <input
                  className={styles.search}
                  placeholder="Search files…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchFocusIdx(0);
                  }}
                  data-testid="search-input"
                  aria-label="Search files"
                />
              </div>
            </div>

            <div
              className={`${styles.treeWrap} ${dragOver ? styles.dropOver : ""}`}
              ref={treeContainerRef}
              data-testid="file-tree"
              onDragEnter={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
              }}
            >
              {treeLoading ? (
                <div className={styles.treeEmpty}>
                  <span className={styles.spinner} aria-hidden />
                  <span>Loading…</span>
                </div>
              ) : tree.length === 0 ? (
                <div className={styles.treeEmpty}>
                  <span>No files yet.</span>
                  <span className={styles.treeEmptyHint}>
                    Use Upload or drag files in.
                  </span>
                </div>
              ) : (
                <TreeList
                  nodes={tree}
                  depth={0}
                  expanded={expanded}
                  loadingChildren={loadingChildren}
                  selectedFileId={selectedFileId}
                  query={query}
                  onToggleFolder={toggleFolder}
                  onSelectFile={(id) => setSelectedFileId(id)}
                />
              )}

              {/* hidden file input for clicking the Upload button */}
              <input
                type="file"
                ref={fileInputRef}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                  e.target.value = "";
                }}
                data-testid="file-input"
                aria-hidden
              />
            </div>

            {uploads.length > 0 && (
              <div className={styles.uploadHint} data-testid="upload-list">
                {uploads.slice(0, 4).map((u) => (
                  <div className={styles.uploadHintItem} key={u.id}>
                    {u.state === "uploading" && (
                      <span className={styles.spinner} aria-hidden />
                    )}
                    {u.state === "done" && (
                      <span aria-hidden style={{ color: "var(--success)" }}>✓</span>
                    )}
                    {u.state === "error" && (
                      <span aria-hidden style={{ color: "var(--danger)" }}>!</span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name || "uploading…"}
                    </span>
                  </div>
                ))}
                {uploads.length > 4 && (
                  <small style={{ color: "var(--text-subtle)" }}>
                    +{uploads.length - 4} more
                  </small>
                )}
              </div>
            )}
          </aside>

          {/* ====================== MAIN VIEWER ====================== */}
          <main className={styles.main} aria-label="File viewer">
            {selectedFileNode && (
              <header className={styles.mainHeader}>
                <div className={styles.crumbRow}>
                  <span className={styles.crumb}>All files</span>
                  <ChevronRight size={11} className={styles.crumbSep} aria-hidden />
                  <span
                    className={`${styles.crumb} ${styles.current}`}
                    title={selectedFileNode.path}
                  >
                    {selectedFileNode.path}
                  </span>
                </div>
                <h3 className={styles.fileTitle}>
                  <span className={styles.fileIcon} aria-hidden>
                    {fileIconChar(selectedFileNode.name, selectedFileNode.mime)}
                  </span>
                  <span className={styles.fileTitleText}>
                    {selectedFileNode.name}
                  </span>
                </h3>
                <div className={styles.fileActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={renameSelected}
                    data-testid="rename-btn"
                    title="Rename"
                    aria-label="Rename file"
                  >
                    <Edit3 size={12} aria-hidden /> Rename
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={openAttachPicker}
                    data-testid="attach-btn"
                    title="Attach to task"
                    aria-label="Attach file to task"
                  >
                    <Paperclip size={12} aria-hidden /> Attach
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.danger}`}
                    onClick={trashSelected}
                    data-testid="trash-btn"
                    title="Move to trash"
                    aria-label="Move file to trash"
                  >
                    <Trash2 size={12} aria-hidden /> Trash
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${rightOpen ? styles.active : ""}`}
                    onClick={() => setRightOpen((v) => !v)}
                    data-testid="toggle-right-btn"
                    title={rightOpen ? "Hide annotations panel" : "Show annotations panel"}
                    aria-pressed={rightOpen}
                  >
                    <MessageSquarePlus size={12} aria-hidden />{" "}
                    {rightOpen ? "Hide" : "Show"} notes
                  </button>
                </div>
              </header>
            )}

            <div
              className={styles.viewerScroll}
              ref={viewerScrollRef}
              data-testid="viewer-scroll"
            >
              {renderViewer()}
            </div>

            {/* hidden folder input ref */}
            <input
              ref={newFolderInputRef}
              hidden
              tabIndex={-1}
              aria-hidden
            />
          </main>

          {/* ====================== RIGHT PANEL ====================== */}
          {rightOpen && (
            <aside
              className={styles.right}
              aria-label="Annotations"
              data-testid="annotations-panel"
            >
              <div className={styles.rightHead}>
                <h4 className={styles.rightTitle}>
                  {fileIsMarkdown ? "Line notes" : "Notes"}
                  <span className={styles.rightCount}>{annotations.length}</span>
                </h4>
                <button
                  type="button"
                  className={styles.rightClose}
                  onClick={() => setRightOpen(false)}
                  aria-label="Close annotations"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
              <div className={styles.rightBody}>
                {annotationsLoading ? (
                  <div className={styles.rightEmpty}>
                    <span className={styles.spinner} aria-hidden />
                    <span>Loading…</span>
                  </div>
                ) : fileIsMarkdown && annotations.length === 0 ? (
                  <div className={styles.rightEmpty}>
                    Hover a line in the file and click ① to start a thread.
                  </div>
                ) : annotations.length === 0 ? (
                  <div className={styles.rightEmpty}>
                    <MessageSquarePlus size={20} aria-hidden />
                    <span>No notes yet for this file.</span>
                  </div>
                ) : (
                  fileIsMarkdown
                    ? Array.from(annotationsByLine.entries())
                        .sort((a, b) => a[0] - b[0])
                        .map(([line, items]) => (
                          <React.Fragment key={`line-${line}`}>
                            {items.map((a) => (
                              <AnnotationCard
                                key={a.id}
                                annotation={a}
                                line={line}
                                onEdit={(body) => editAnnotation(a.id, body)}
                                onDelete={() => removeAnnotation(a.id)}
                              />
                            ))}
                          </React.Fragment>
                        ))
                    : annotations
                        .filter((a) => a.kind === "thread")
                        .map((a) => (
                          <AnnotationCard
                            key={a.id}
                            annotation={a}
                            onEdit={(body) => editAnnotation(a.id, body)}
                            onDelete={() => removeAnnotation(a.id)}
                          />
                        ))
                )}
                {!fileIsMarkdown && annotations.length > 0 && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimaryFile}`}
                    onClick={() => {
                      const body = window.prompt("New thread note")?.trim();
                      if (body) addAnnotation(body);
                    }}
                    data-testid="add-thread-note-btn"
                  >
                    <Plus size={12} aria-hidden /> Add note
                  </button>
                )}
              </div>
            </aside>
          )}
        </>
      )}

      {/* ==================== POPOVERS / MODALS ==================== */}
      {popover && (
        <LinePopover
          popover={popover}
          onClose={() => setPopover(null)}
          onSubmit={(body) => {
            if (popover.focusExisting) {
              editAnnotation(popover.focusExisting.id, body);
            } else {
              addAnnotation(body, popover.line);
            }
            setPopover(null);
          }}
          onDelete={
            popover.focusExisting
              ? () => {
                  removeAnnotation(popover.focusExisting!.id);
                  setPopover(null);
                }
              : undefined
          }
        />
      )}

      {renameOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Rename file">
          <div className={styles.modal} data-testid="rename-modal">
            <div className={styles.modalHead}>
              <h4 className={styles.modalTitle}>Rename file</h4>
              <button
                type="button"
                className={styles.rightClose}
                onClick={() => setRenameOpen(false)}
                aria-label="Close rename dialog"
              >
                <X size={14} />
              </button>
            </div>
            <input
              className={styles.modalInput}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenameOpen(false);
              }}
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimaryFile}`}
                onClick={commitRename}
                data-testid="rename-confirm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {attachOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Attach to task">
          <div className={styles.modal} data-testid="attach-modal">
            <div className={styles.modalHead}>
              <h4 className={styles.modalTitle}>
                <LinkIcon size={14} aria-hidden style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
                Attach to a recent task
              </h4>
              <button
                type="button"
                className={styles.rightClose}
                onClick={() => setAttachOpen(false)}
                aria-label="Close attach dialog"
              >
                <X size={14} />
              </button>
            </div>
            <ul className={styles.attachList}>
              {recentTasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={styles.attachItem}
                    onClick={() => attachToTask(t.id)}
                    data-testid={`attach-task-${t.id}`}
                  >
                    <span>{t.title}</span>
                    <span className={styles.attachMeta}>{t.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === "folder" && n.children) {
      const r = findNode(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

function updateFolderChildren(
  nodes: TreeNode[],
  folderId: number,
  newChildren: FileNode[],
): TreeNode[] {
  return nodes.map((n) => {
    if (n.type !== "folder") return n;
    if (n.id === folderId) {
      return {
        ...n,
        children: buildChildrenHere(newChildren),
      };
    }
    if (n.children) {
      return {
        ...n,
        children: updateFolderChildren(n.children, folderId, newChildren),
      };
    }
    return n;
  });
}

function buildChildrenHere(nodes: FileNode[]): TreeNode[] {
  return nodes.map((n) =>
    n.type === "folder"
      ? ({ ...n, children: [] } as TreeFolder)
      : (n as TreeFile),
  );
}

/**
 * Flat-walk the (already-expanded) tree to get a continuous visible sequence.
 * When the user is searching, this also keeps ancestor folders whose children
 * contain a match — but for the smoke test the simple by-name filter suffices.
 */
function buildFlat(nodes: TreeNode[], expanded: Set<number>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (xs: TreeNode[]) => {
    for (const x of xs) {
      out.push(x);
      if (x.type === "folder" && expanded.has(x.id) && x.children) {
        walk(x.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/**
 * Recursive tree renderer. It walks `nodes` directly (not a pre-flattened list)
 * so each subtree owns its depth and there's no double-rendering.
 */
function TreeList({
  nodes,
  depth,
  expanded,
  loadingChildren,
  selectedFileId,
  query,
  onToggleFolder,
  onSelectFile,
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<number>;
  loadingChildren: Set<number>;
  selectedFileId: number | null;
  query: string;
  onToggleFolder: (id: number) => void;
  onSelectFile: (id: number) => void;
}) {
  const q = query.trim().toLowerCase();

  // Apply name filter at this level. Folders keep showing if their direct
  // children pass; files show only if their name matches.
  const filtered = useMemo(() => {
    if (!q) return nodes;
    return nodes.filter((n) => {
      if (n.name.toLowerCase().includes(q)) return true;
      if (n.type === "folder" && n.children) {
        return n.children.some((c) => c.name.toLowerCase().includes(q));
      }
      return false;
    });
  }, [nodes, q]);

  return (
    <div className={styles.treeChildren} role="tree" data-depth={depth}>
      {filtered.map((node) => {
        if (node.type === "folder") {
          const isOpen = expanded.has(node.id);
          const isLoading = loadingChildren.has(node.id);
          return (
            <div key={`f-${node.id}`} style={{ paddingLeft: depth * 14 }}>
              <div
                role="treeitem"
                aria-expanded={isOpen}
                className={`${styles.treeRow} ${styles.folder}`}
                onClick={() => onToggleFolder(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleFolder(node.id);
                  }
                }}
                title={node.path}
                data-testid={`tree-folder-${node.id}`}
              >
                <span
                  className={`${styles.chevron} ${isOpen ? styles.open : ""}`}
                  aria-hidden
                >
                  <ChevronRight size={12} />
                </span>
                <span
                  className={`${styles.rowIcon} ${styles.folderIcon}`}
                  aria-hidden
                >
                  <FolderIcon size={13} />
                </span>
                <span className={styles.rowName}>{node.name}</span>
                {isLoading && <span className={styles.spinner} aria-hidden />}
              </div>
              {isOpen && node.children && node.children.length > 0 && (
                <TreeList
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  loadingChildren={loadingChildren}
                  selectedFileId={selectedFileId}
                  query={query}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          );
        }
        const annCount = node.annotation_count ?? 0;
        return (
          <div key={`file-${node.id}`} style={{ paddingLeft: depth * 14 }}>
            <div
              role="treeitem"
              aria-selected={selectedFileId === node.id}
              className={`${styles.treeRow} ${styles.row} ${
                selectedFileId === node.id ? styles.selected : ""
              }`}
              onClick={() => onSelectFile(node.id)}
              title={node.path}
              data-testid={`tree-file-${node.id}`}
            >
              <span className={styles.chevronSpacer} aria-hidden />
              <span
                className={`${styles.rowIcon} ${styles.fileIcon}`}
                aria-hidden
                style={{ fontSize: 12 }}
              >
                {fileIconChar(node.name, node.mime)}
              </span>
              <span className={styles.rowName}>{node.name}</span>
              {typeof node.size === "number" && (
                <span className={`${styles.rowMeta} ${styles.size}`}>
                  {formatSize(node.size)}
                </span>
              )}
              {annCount > 0 && (
                <span
                  className={`${styles.badge} ${styles.gold}`}
                  title={`${annCount} annotation${annCount === 1 ? "" : "s"}`}
                >
                  {annCount}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnnotationCard({
  annotation,
  line,
  onEdit,
  onDelete,
}: {
  annotation: Annotation;
  line?: number;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.body);

  useEffect(() => {
    if (!editing) setDraft(annotation.body);
  }, [annotation.body, editing]);

  if (editing) {
    return (
      <div className={styles.annotation} data-testid={`annotation-${annotation.id}`}>
        <div className={styles.annotationHead}>
          {line != null && (
            <span className={styles.annotationLineTag}>line {line}</span>
          )}
          <span>editing</span>
        </div>
        <textarea
          className={styles.popoverTextarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              if (draft.trim()) {
                onEdit(draft.trim());
                setEditing(false);
              }
            }
          }}
        />
        <div className={styles.annotationActions}>
          <button
            type="button"
            className={`${styles.miniBtn} ${styles.danger}`}
            onClick={onDelete}
            data-testid={`annotation-delete-${annotation.id}`}
          >
            Delete
          </button>
          <button
            type="button"
            className={`${styles.miniBtn}`}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.miniBtn}`}
            style={{
              background: "linear-gradient(135deg, #007AFF 0%, #4DA3FF 55%, #006FE6 100%)",
              color: "#fff",
            }}
            onClick={() => {
              if (draft.trim()) {
                onEdit(draft.trim());
                setEditing(false);
              }
            }}
            data-testid={`annotation-save-${annotation.id}`}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.annotation} data-testid={`annotation-${annotation.id}`}>
      <div className={styles.annotationHead}>
        {line != null && (
          <span className={styles.annotationLineTag}>line {line}</span>
        )}
        <span>{annotation.color ?? "note"}</span>
      </div>
      <div className={styles.annotationBody}>{annotation.body}</div>
      <div className={styles.annotationActions}>
        <button
          type="button"
          className={styles.miniBtn}
          onClick={() => setEditing(true)}
          data-testid={`annotation-edit-${annotation.id}`}
        >
          <Edit3 size={11} aria-hidden /> Edit
        </button>
        <button
          type="button"
          className={`${styles.miniBtn} ${styles.danger}`}
          onClick={onDelete}
          data-testid={`annotation-delete-${annotation.id}`}
        >
          <Trash2 size={11} aria-hidden /> Delete
        </button>
      </div>
    </div>
  );
}

function LinePopover({
  popover,
  onClose,
  onSubmit,
  onDelete,
}: {
  popover: NonNullable<Popover>;
  onClose: () => void;
  onSubmit: (body: string) => void;
  onDelete?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(popover.focusExisting?.body ?? "");
  const textareaId = "line-popover-textarea";

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const pos: Pos = {
    top: popover.anchorRect.bottom + window.scrollY + 4,
    left: Math.min(
      window.innerWidth - 300,
      popover.anchorRect.left + window.scrollX,
    ),
  };

  return (
    <>
      <div
        className={styles.popoverBackdrop}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={styles.popover}
        role="dialog"
        aria-label={popover.focusExisting ? "Edit annotation" : "New annotation"}
        style={{ top: pos.top, left: pos.left }}
        data-testid="line-popover"
      >
        <div className={styles.popoverHead}>
          <span>{popover.focusExisting ? "Edit note" : `Line ${popover.line}`}</span>
          <button
            type="button"
            className={styles.rightClose}
            onClick={onClose}
            aria-label="Close annotation"
          >
            <X size={12} />
          </button>
        </div>
        <label htmlFor={textareaId} className="sr-only" style={{ position: "absolute", left: -9999 }}>
          Annotation body
        </label>
        <textarea
          id={textareaId}
          ref={textareaRef}
          className={styles.popoverTextarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note about this line…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              if (body.trim()) onSubmit(body.trim());
            }
            if (e.key === "Escape") onClose();
          }}
          data-testid="line-popover-textarea"
        />
        <div className={styles.popoverActions}>
          {onDelete && (
            <button
              type="button"
              className={`${styles.miniBtn} ${styles.danger}`}
              onClick={onDelete}
              data-testid="line-popover-delete"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimaryFile}`}
            onClick={() => body.trim() && onSubmit(body.trim())}
            disabled={!body.trim()}
            data-testid="line-popover-submit"
          >
            {popover.focusExisting ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </>
  );
}

function EmptyState({
  onCreateFolder,
  onUpload,
  onFiles,
  dragOver,
}: {
  onCreateFolder: () => void;
  onUpload: () => void;
  onFiles: (files: FileList | File[]) => void;
  dragOver: boolean;
}) {
  const [localOver, setLocalOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={styles.emptyShell}
      data-testid="empty-state"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setLocalOver(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
      }}
      onDragLeave={() => setLocalOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setLocalOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      <div className={styles.emptyArt} aria-hidden>
        {/* Inline SVG illustration: a stylized folder with floating papers. */}
        <svg viewBox="0 0 200 160" width="200" height="160" fill="none">
          <defs>
            <linearGradient id="emptyGold" x1="0" y1="0" x2="200" y2="160" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#007AFF" />
              <stop offset="0.5" stopColor="#4DA3FF" />
              <stop offset="1" stopColor="#006FE6" />
            </linearGradient>
            <linearGradient id="emptyIndigo" x1="0" y1="0" x2="0" y2="160" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#5b53e8" stopOpacity="0.55" />
              <stop offset="1" stopColor="#5b53e8" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* dotted background accent */}
          <g opacity="0.32" fill="currentColor">
            {Array.from({ length: 8 }).map((_, i) => (
              <circle key={i} cx={20 + i * 22} cy={20} r="1.2" />
            ))}
          </g>

          {/* back paper */}
          <g transform="translate(60,30) rotate(-7)">
            <rect width="80" height="98" rx="6" fill="var(--surface-2, #fbfbfe)" stroke="var(--border, #e7e4f0)" strokeWidth="1" />
            <rect x="10" y="14" width="60" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.5" />
            <rect x="10" y="22" width="48" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.4" />
            <rect x="10" y="30" width="54" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.4" />
            <rect x="10" y="46" width="40" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.3" />
            <rect x="10" y="54" width="50" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.3" />
            <rect x="10" y="62" width="36" height="3" rx="1.5" fill="var(--text-subtle, #8b869e)" opacity="0.3" />
          </g>

          {/* front folder */}
          <g transform="translate(40,55)">
            <rect width="120" height="80" rx="10" fill="url(#emptyIndigo)" />
            <rect width="120" height="80" rx="10" fill="var(--surface, #fff)" opacity="0.85" />
            {/* tab */}
            <path d="M14 4 H46 a6 6 0 0 1 6 6 V14 H8 V10 a6 6 0 0 1 6 -6 z" fill="url(#emptyGold)" />
            {/* corner gold stamp */}
            <circle cx="106" cy="62" r="14" fill="url(#emptyGold)" />
            <text
              x="106"
              y="66"
              textAnchor="middle"
              fill="#fff"
              fontSize="14"
              fontFamily="ui-sans-serif, system-ui"
              fontWeight="700"
            >
              +
            </text>
          </g>

          {/* floating gold note */}
          <g transform="translate(120,18) rotate(10)">
            <rect width="40" height="38" rx="4" fill="url(#emptyGold)" />
            <rect x="6" y="8" width="28" height="2" rx="1" fill="#fff" opacity="0.7" />
            <rect x="6" y="14" width="22" height="2" rx="1" fill="#fff" opacity="0.5" />
            <rect x="6" y="20" width="24" height="2" rx="1" fill="#fff" opacity="0.5" />
          </g>
        </svg>
      </div>
      <h1 className={styles.emptyTitle}>
        Drop your first file <span className={styles.gold}>here</span>
      </h1>
      <p className={styles.emptyDesc}>
        Drag any document, image, or markdown file anywhere in this view. Or
        start with a folder to keep your work organized.
      </p>
      <div className={styles.emptyActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimaryFile}`}
          onClick={onCreateFolder}
          data-testid="empty-new-folder"
        >
          <FolderPlus size={13} aria-hidden /> New folder
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={onUpload}
          data-testid="empty-upload"
        >
          <Upload size={13} aria-hidden /> Upload files
        </button>
      </div>
      <div
        className={`${styles.emptyDropZone} ${localOver || dragOver ? styles.isDragOver : ""}`}
        data-testid="empty-drop-zone"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} aria-hidden />
        Click or drop files here
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
        aria-hidden
      />
    </div>
  );
}

function extLang(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(ts|tsx|js|jsx)$/.test(lower)) return "ts";
  if (/\.(py)$/.test(lower)) return "python";
  if (/\.(rb)$/.test(lower)) return "rb";
  if (/\.(sh|bash)$/.test(lower)) return "sh";
  return "ts";
}
