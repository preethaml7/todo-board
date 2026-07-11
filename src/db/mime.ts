/**
 * MIME type detection — extension-based, with a small content-sniff fallback
 * for the common text/binary split.
 */

const EXT_MAP: Record<string, string> = {
  // text
  md: "text/markdown", mdx: "text/markdown",
  txt: "text/plain", log: "text/plain",
  json: "application/json", xml: "application/xml", yaml: "application/yaml", yml: "application/yaml",
  toml: "application/toml", ini: "text/plain", conf: "text/plain",
  // code (commonly-rendered as text)
  ts: "text/typescript", tsx: "text/tsx",
  js: "text/javascript", jsx: "text/jsx", mjs: "text/javascript", cjs: "text/javascript",
  py: "text/x-python", rb: "text/x-ruby", go: "text/x-go", rs: "text/x-rust",
  java: "text/x-java", kt: "text/x-kotlin", swift: "text/x-swift", m: "text/x-objective-c",
  c: "text/x-c", h: "text/x-c", cpp: "text/x-c++", cc: "text/x-c++", hpp: "text/x-c++",
  cs: "text/x-csharp", scala: "text/x-scala",
  vue: "text/x-vue", svelte: "text/x-svelte",
  css: "text/css", scss: "text/x-scss", sass: "text/x-sass", less: "text/x-less",
  html: "text/html", htm: "text/html",
  sh: "text/x-sh", bash: "text/x-bash", zsh: "text/x-sh",
  sql: "text/x-sql", graphql: "text/x-graphql", gql: "text/x-graphql",
  // web
  svg: "image/svg+xml",
  // images
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon",
  // documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // media
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  // archives
  zip: "application/zip", tar: "application/x-tar", gz: "application/gzip",
  "7z": "application/x-7z-compressed", rar: "application/vnd.rar",
  // fonts
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
};

/**
 * Best-effort MIME detection. Tries extension first, then sniffs the first
 * few bytes of the file (text vs binary).
 */
export function detectMime(name: string, bytes?: Uint8Array | Buffer): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot >= 0) {
    const ext = lower.slice(dot + 1);
    if (EXT_MAP[ext]) return EXT_MAP[ext];
  }
  // Content sniff
  if (bytes && bytes.length > 0) {
    if (isProbablyText(bytes)) return "text/plain";
  }
  return "application/octet-stream";
}

/**
 * Quick heuristic: text files don't contain a NUL byte in the first 1KB.
 */
function isProbablyText(bytes: Uint8Array | Buffer): boolean {
  const sample = bytes.subarray(0, Math.min(1024, bytes.length));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return false;
  }
  return true;
}
