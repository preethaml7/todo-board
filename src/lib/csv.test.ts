import { describe, it, expect } from "vitest";
import { csvEscape, csvRow, toCsv } from "./csv";

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
  });
  it("renders null/undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("quotes and escapes fields with commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });
});

describe("csvRow / toCsv", () => {
  it("joins fields with commas", () => {
    expect(csvRow(["a", "b", 1])).toBe("a,b,1");
  });
  it("builds a CRLF document with a header", () => {
    const csv = toCsv(["Key", "Title"], [["T-1", "Hi, there"]]);
    expect(csv).toBe('Key,Title\r\nT-1,"Hi, there"');
  });
});
