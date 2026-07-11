import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "./nlp";

const opts = {
  categories: [
    { id: 1, name: "Finance" },
    { id: 2, name: "Bug / Risk" },
  ],
  lifeAreas: [{ name: "Personal" }, { name: "Work" }],
};

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("parseQuickAdd", () => {
  it("returns the plain title when there is nothing to parse", () => {
    expect(parseQuickAdd("Buy milk", opts)).toMatchObject({
      title: "Buy milk",
      priority: null,
      due_date: null,
      categoryIds: [],
      life_area: null,
    });
  });

  it("parses priority, category, life area and strips them from the title", () => {
    const r = parseQuickAdd("Pay rent !high #Finance @Work", opts);
    expect(r.title).toBe("Pay rent");
    expect(r.priority).toBe("high");
    expect(r.categoryIds).toEqual([1]);
    expect(r.life_area).toBe("Work");
  });

  it("parses relative dates", () => {
    expect(parseQuickAdd("ship it today", opts).due_date).toBe(iso(0));
    expect(parseQuickAdd("call bank tomorrow", opts).due_date).toBe(iso(1));
    expect(parseQuickAdd("review in 3 days", opts).due_date).toBe(iso(3));
    expect(parseQuickAdd("deploy 2d", opts).due_date).toBe(iso(2));
  });

  it("matches a fuzzy category token", () => {
    const r = parseQuickAdd("triage #bug", opts);
    expect(r.categoryIds).toEqual([2]);
    expect(r.title).toBe("triage");
  });

  it("leaves unknown #tags and @areas in the title", () => {
    const r = parseQuickAdd("email #nope @nobody", opts);
    expect(r.title).toBe("email #nope @nobody");
    expect(r.categoryIds).toEqual([]);
    expect(r.life_area).toBeNull();
  });

  it("supports !h / !m / !l shortcuts", () => {
    expect(parseQuickAdd("a !h", opts).priority).toBe("high");
    expect(parseQuickAdd("b !m", opts).priority).toBe("medium");
    expect(parseQuickAdd("c !l", opts).priority).toBe("low");
  });
});
