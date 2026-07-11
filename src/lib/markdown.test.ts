import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns empty string for blank input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });

  it("escapes HTML to prevent XSS", () => {
    const out = renderMarkdown("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders bold, italic and inline code", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("*em*")).toContain("<em>em</em>");
    expect(renderMarkdown("`code`")).toContain('<code class="md-code">code</code>');
  });

  it("does not mangle real numbers (placeholder-collision regression)", () => {
    const out = renderMarkdown("meet at 3pm with `x` then 5 items");
    expect(out).toContain("meet at 3pm");
    expect(out).toContain("5 items");
    expect(out).toContain("<code");
  });

  it("renders bullet lists", () => {
    const out = renderMarkdown("- one\n- two");
    expect(out).toContain('<ul class="md-ul">');
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li>two</li>");
  });

  it("auto-links http(s) urls with noopener", () => {
    const out = renderMarkdown("see https://example.com/x");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("renders fenced code blocks", () => {
    const out = renderMarkdown("```\nline1\nline2\n```");
    expect(out).toContain('<pre class="md-pre"><code>');
    expect(out).toContain("line1\nline2");
  });
});
