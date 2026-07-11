/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { Calendar } from "@/components/Calendar";

function ControlledCalendar({
  initial,
  onChange,
  label = "Test date",
}: {
  initial: string | null;
  onChange?: (v: string | null) => void;
  label?: string;
}) {
  const [val, setVal] = useState<string | null>(initial);
  return (
    <Calendar
      value={val}
      label={label}
      onChange={(v) => {
        setVal(v);
        onChange?.(v);
      }}
    />
  );
}

// Find the trigger button by its aria-haspopup attribute (no label dependency).
function getTrigger(): HTMLButtonElement {
  return screen.getByRole("button", { name: /calendar/i }) as HTMLButtonElement;
}

describe("Calendar", () => {
  beforeEach(() => cleanup());

  it("renders the trigger button with placeholder when empty", () => {
    render(<ControlledCalendar initial={null} />);
    const trigger = getTrigger();
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows 'Open Test date calendar' label when empty", () => {
    render(<ControlledCalendar initial={null} />);
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-label")).toMatch(/open .* calendar/i);
  });

  it("shows formatted date in aria-label when set", () => {
    render(<ControlledCalendar initial="2026-07-15" />);
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-label")).toMatch(/Jul 15, 2026/);
  });

  it("opens the popover on trigger click", () => {
    render(<ControlledCalendar initial={null} />);
    const trigger = getTrigger();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: /calendar for test date/i });
    expect(dialog).toBeInTheDocument();
  });

  it("selecting a day calls onChange with ISO yyyy-mm-dd", () => {
    const onChange = vi.fn();
    render(<ControlledCalendar initial={null} onChange={onChange} />);
    fireEvent.click(getTrigger());
    // Click any enabled day button
    const dayButtons = screen.getAllByRole("button", {
      name: /^\w+,\s\w+\s\d+,\s\d{4}$/,
    });
    const target = dayButtons.find((b) => !(b as HTMLButtonElement).disabled);
    expect(target).toBeDefined();
    if (target) {
      fireEvent.click(target);
      expect(onChange).toHaveBeenCalled();
      const callArg = onChange.mock.calls[0]?.[0];
      expect(typeof callArg).toBe("string");
      expect(callArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("disables past dates (min defaults to today)", () => {
    const FAKE_NOW = new Date("2026-07-15T12:00:00Z");
    vi.setSystemTime(FAKE_NOW);

    render(<ControlledCalendar initial={null} />);
    fireEvent.click(getTrigger());

    const dayButtons = screen.getAllByRole("button", {
      name: /^\w+,\s\w+\s\d+,\s\d{4}$/,
    });
    // Find a day that should be disabled (before today)
    const beforeToday = dayButtons.find((b) => {
      const lbl = b.getAttribute("aria-label") || "";
      const m = lbl.match(/(\w+) (\d+), (\d+)/);
      if (!m) return false;
      const monthMap: Record<string, string> = {
        January: "01", February: "02", March: "03", April: "04",
        May: "05", June: "06", July: "07", August: "08",
        September: "09", October: "10", November: "11", December: "12",
      };
      const isoDate = `${m[3]}-${monthMap[m[1]] ?? "01"}-${m[2].padStart(2, "0")}`;
      return new Date(isoDate + "T00:00:00Z") < FAKE_NOW;
    });
    if (beforeToday) {
      expect(beforeToday).toBeDisabled();
    }

    vi.useRealTimers();
  });

  it("clear button removes the date", () => {
    const onChange = vi.fn();
    render(<ControlledCalendar initial="2026-07-15" onChange={onChange} />);
    const clear = screen.getByLabelText(/clear date/i);
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
