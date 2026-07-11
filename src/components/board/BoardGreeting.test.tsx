/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BoardGreeting } from "./BoardGreeting";

const stats = {
  dueToday: 3,
  overdue: 1,
  inProgress: 2,
  doneThisWeek: 5,
};

describe("BoardGreeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders the username + morning greeting at 9am", () => {
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
    render(<BoardGreeting username="alex" stats={stats} />);
    expect(screen.getByText(/good morning, alex\./i)).toBeInTheDocument();
  });

  it("renders afternoon greeting at 2pm", () => {
    vi.setSystemTime(new Date("2026-07-10T14:00:00"));
    render(<BoardGreeting username="alex" stats={stats} />);
    expect(screen.getByText(/good afternoon, alex\./i)).toBeInTheDocument();
  });

  it("renders evening greeting at 8pm", () => {
    vi.setSystemTime(new Date("2026-07-10T20:00:00"));
    render(<BoardGreeting username="alex" stats={stats} />);
    expect(screen.getByText(/good evening, alex\./i)).toBeInTheDocument();
  });

  it("surfaces overdue count when > 0", () => {
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
    render(<BoardGreeting username="alex" stats={stats} />);
    expect(screen.getByText(/1 overdue, 3 due today/i)).toBeInTheDocument();
  });

  it("shows 'All clear.' when no due, overdue, or in-progress", () => {
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
    render(
      <BoardGreeting
        username="alex"
        stats={{ dueToday: 0, overdue: 0, inProgress: 0, doneThisWeek: 0 }}
      />,
    );
    expect(screen.getByText(/all clear\./i)).toBeInTheDocument();
  });

  it("renders stat badges for the visible counters", () => {
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
    render(<BoardGreeting username="alex" stats={stats} />);
    expect(screen.getByLabelText(/your activity this week/i)).toBeInTheDocument();
  });
});