import type { Priority } from "./constants";

// Natural-language parsing for quick-add. Pure & deterministic so it's easy to
// unit-test. Recognizes, anywhere in the text:
//   priority   !high / !med / !low   (or !h / !m / !l)
//   category   #Name                 (matched against existing categories)
//   life area  @Name                 (matched against existing life areas)
//   due date   today, tomorrow/tmrw, next week, a weekday (mon..sun),
//              "in N days", "Nd", MM/DD, "20 jul" / "jul 20"
// Matched tokens are stripped from the resulting title.

export interface ParsedQuickAdd {
  title: string;
  priority: Priority | null;
  categoryIds: number[];
  life_area: string | null;
  due_date: string | null;
}

export interface ParseOpts {
  categories: { id: number; name: string }[];
  lifeAreas: { name: string }[];
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseQuickAdd(raw: string, opts: ParseOpts): ParsedQuickAdd {
  let text = ` ${raw} `;
  let priority: Priority | null = null;
  let life_area: string | null = null;
  let due_date: string | null = null;
  const categoryIds: number[] = [];

  const setDue = (d: Date) => {
    if (!due_date) due_date = localISO(d);
  };
  const plusDays = (n: number) => {
    const d = startOfToday();
    d.setDate(d.getDate() + n);
    return d;
  };

  // priority
  text = text.replace(/(^|\s)!(high|h)(?=\s)/i, () => {
    priority = "high";
    return " ";
  });
  text = text.replace(/(^|\s)!(medium|med|m)(?=\s)/i, () => {
    priority = priority ?? "medium";
    return " ";
  });
  text = text.replace(/(^|\s)!(low|l)(?=\s)/i, () => {
    priority = priority ?? "low";
    return " ";
  });

  // life area  @name
  text = text.replace(/(^|\s)@([\p{L}\p{N}_-]{1,30})/giu, (m, _sp, tok: string) => {
    const found = opts.lifeAreas.find((a) => norm(a.name).startsWith(norm(tok)));
    if (found) {
      life_area = found.name;
      return " ";
    }
    return m;
  });

  // categories  #name
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]{1,30})/giu, (m, _sp, tok: string) => {
    const found = opts.categories.find((c) => norm(c.name).includes(norm(tok)));
    if (found && !categoryIds.includes(found.id)) {
      categoryIds.push(found.id);
      return " ";
    }
    return m;
  });

  // relative dates
  text = text.replace(/(^|\s)in (\d{1,3}) days?(?=\s)/i, (_m, _sp, n: string) => {
    setDue(plusDays(parseInt(n, 10)));
    return " ";
  });
  text = text.replace(/(^|\s)(\d{1,3})d(?=\s)/i, (m, _sp, n: string) => {
    if (due_date) return m;
    setDue(plusDays(parseInt(n, 10)));
    return " ";
  });
  text = text.replace(/(^|\s)today(?=\s)/i, () => {
    setDue(startOfToday());
    return " ";
  });
  text = text.replace(/(^|\s)(tomorrow|tmrw)(?=\s)/i, () => {
    setDue(plusDays(1));
    return " ";
  });
  text = text.replace(/(^|\s)next week(?=\s)/i, () => {
    setDue(plusDays(7));
    return " ";
  });
  // weekday (full or 3+ letter abbrev)
  text = text.replace(
    /(^|\s)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thurs?|thu|fri|sat|sun)(?=\s)/i,
    (m, _sp, tok: string) => {
      if (due_date) return m;
      const key = tok.toLowerCase().slice(0, 3);
      const idx = WEEKDAYS.findIndex((d) => d.startsWith(key));
      if (idx < 0) return m;
      const cur = startOfToday().getDay();
      setDue(plusDays((idx - cur + 7) % 7));
      return " ";
    },
  );
  // "jul 20" / "july 20"
  text = text.replace(
    /(^|\s)(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?=\s)/i,
    (m, _sp, mon: string, day: string) => {
      if (due_date) return m;
      const mi = MONTHS.indexOf(mon.toLowerCase().slice(0, 3));
      const d = new Date(new Date().getFullYear(), mi, parseInt(day, 10));
      d.setHours(0, 0, 0, 0);
      if (d < startOfToday()) d.setFullYear(d.getFullYear() + 1);
      setDue(d);
      return " ";
    },
  );
  // "20 jul"
  text = text.replace(
    /(^|\s)(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?=\s)/i,
    (m, _sp, day: string, mon: string) => {
      if (due_date) return m;
      const mi = MONTHS.indexOf(mon.toLowerCase().slice(0, 3));
      const d = new Date(new Date().getFullYear(), mi, parseInt(day, 10));
      d.setHours(0, 0, 0, 0);
      if (d < startOfToday()) d.setFullYear(d.getFullYear() + 1);
      setDue(d);
      return " ";
    },
  );
  // MM/DD
  text = text.replace(/(^|\s)(\d{1,2})\/(\d{1,2})(?=\s)/, (m, _sp, mm: string, dd: string) => {
    if (due_date) return m;
    const now = new Date();
    const d = new Date(now.getFullYear(), parseInt(mm, 10) - 1, parseInt(dd, 10));
    d.setHours(0, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return m;
    if (d < startOfToday()) d.setFullYear(d.getFullYear() + 1);
    setDue(d);
    return " ";
  });

  return {
    title: text.replace(/\s+/g, " ").trim(),
    priority,
    categoryIds,
    life_area,
    due_date,
  };
}
