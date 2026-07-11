// RFC-4180 CSV helpers — pure and side-effect-free.

/** Quote a field if it contains a comma, quote, CR or LF; double inner quotes. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvEscape).join(",");
}

/** Build a full CSV document (CRLF line endings) from a header + rows. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [csvRow(header), ...rows.map((r) => csvRow(r))].join("\r\n");
}
