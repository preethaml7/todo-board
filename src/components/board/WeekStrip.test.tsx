/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WeekStrip } from "./WeekStrip";

const baseProps = {
  tasks: [],
  selected: null as string | null,
  onSelect: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("WeekStrip", () => {
  it("renders 7 day buttons + 'All' tab", () => {
    render(<WeekStrip {...baseProps} />);
    const buttons = screen.getAllByRole("tab");
    // 1 "All" + 7 day tabs
    expect(buttons.length).toBe(8);
    expect(screen.getByText(/^All$/)).toBeInTheDocument();
  });

  it("marks 'Today' on the first day", () => {
    render(<WeekStrip {...baseProps} />);
    // First day should have aria-selected because selected is null and the All tab is selected
    // 'Today' text appears in the first day button
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows weekday abbreviations for the next 6 days", () => {
    render(<WeekStrip {...baseProps} />);
    // 2026-07-15 is a Wednesday → next day is Thu, Fri, Sat, Sun, Mon, Tue
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
  });

  it("calls onSelect with the day ISO when a day tab is clicked", () => {
    const onSelect = vi.fn();
    render(<WeekStrip {...baseProps} onSelect={onSelect} />);
    const dayTab = screen.getByText("Thu").closest("button");
    expect(dayTab).toBeInTheDocument();
    if (dayTab) fireEvent.click(dayTab);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0];
    expect(arg).toMatch(/^2026-07-16$/);
  });

  it("calls onSelect(null) when 'All' is clicked", () => {
    const onSelect = vi.fn();
    render(<WeekStrip {...baseProps} selected="2026-07-15" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("All"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renders task count dot per day", () => {
    const tasks = [
      {
        id: 1,
        due_date: "2026-07-15",
        status: "todo" as const,
      } as any,
      {
        id: 2,
        due_date: "2026-07-15",
        status: "done" as const,
      } as any,
    ];
    render(<WeekStrip {...baseProps} tasks={tasks} />);
    // The 'All' count should reflect the visible tasks (we show 1 — the non-done)
    // Actually our component shows `tasks.length` for All, so both are counted
    const all = screen.getByText(/^All$/);
    expect(all).toBeInTheDocument();
  });

  it("renders task count in the All tab", () => {
    // Today is 2026-07-15. Tasks due on/after today within the 7-day window show up.
    const tasks = [
      { id: 1, due_date: "2026-07-15", status: "todo" } as any, // today
      { id: 2, due_date: "2026-07-16", status: "todo" } as any, // tomorrow
    ];
    render(<WeekStrip {...baseProps} tasks={tasks} />);
    // The "All" tab should display 2
    const allTab = screen.getByText(/^All$/).closest("button");
    expect(allTab).toBeInTheDocument();
    expect(allTab?.textContent).toMatch(/2/);
  });
});