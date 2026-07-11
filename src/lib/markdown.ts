/**
 * A tiny, safe markdown renderer for task notes. Deliberately minimal and
 * XSS-safe: the input is HTML-escaped *first*, so the only tags that can ever
 * appear in the output are the whitelisted ones this module emits
 * (<p>, <strong>, <em>, <code>, <pre>, <ul>, <li>, <a>). Pure and
 * deterministic, so it's easy to unit-test.
 *
 * Supports: **bold**, *italic* / _italic_, `inline code`, ```fenced code```,
 * `- ` / `* ` bullet lists, and auto-linked http(s) URLs.
 */

// Private-use-area sentinels (never appear in escaped user text) used to
// protect code spans/blocks from further formatting, then restored at the end.
const CODE_OPEN = "";
const CODE_CLOSE = "";
const BLOCK_OPEN = "";
const BLOCK_CLOSE = "";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline formatting for a single (already HTML-escaped) line. */
function renderInline(s: string): string {
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code class="md-code">${c}</code>`);
    return `${CODE_OPEN}${codes.length - 1}${CODE_CLOSE}`;
  });

  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

  // Auto-link bare http(s) URLs (input is escaped, so no raw < can appear).
  s = s.replace(
    /(https?:\/\/[^\s<]+[^\s<.,!?;:)])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return s.replace(
    new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g"),
    (_m, i: string) => codes[Number(i)],
  );
}

export function renderMarkdown(input: string): string {
  if (!input || !input.trim()) return "";
  const escaped = escapeHtml(input);

  // Pull out fenced code blocks first so their contents are left untouched.
  const blocks: string[] = [];
  const withoutBlocks = escaped.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    const body = code.replace(/^\n/, "").replace(/\n$/, "");
    blocks.push(`<pre class="md-pre"><code>${body}</code></pre>`);
    return `${BLOCK_OPEN}${blocks.length - 1}${BLOCK_CLOSE}`;
  });

  const out: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul class="md-ul">${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  const blockRe = new RegExp(`^${BLOCK_OPEN}(\\d+)${BLOCK_CLOSE}$`);
  for (const line of withoutBlocks.split(/\r?\n/)) {
    const block = blockRe.exec(line);
    if (block) {
      flushList();
      out.push(blocks[Number(block[1])]);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      listItems.push(`<li>${renderInline(li[1])}</li>`);
      continue;
    }
    flushList();
    if (line.trim() === "") continue;
    out.push(`<p class="md-p">${renderInline(line)}</p>`);
  }
  flushList();
  return out.join("");
}
