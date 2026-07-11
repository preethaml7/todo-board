/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QuickCapture,
  QuickCaptureFab,
  useQuickCaptureHotkey,
} from "./QuickCapture";

function Wrapper({ onSubmit }: { onSubmit: (p: any) => void }) {
  return (
    <QuickCapture
      open={true}
      onClose={() => {}}
      onSubmit={onSubmit}
      categories={[{ id: 1, name: "work", color: "#5b53e8", position: 0 }]}
      lifeAreas={[{ id: 1, name: "Work", color: "indigo", position: 0 }]}
    />
  );
}

describe("QuickCapture", () => {
  beforeEach(() => cleanup());

  it("renders the textarea with placeholder", () => {
    render(<Wrapper onSubmit={() => {}} />);
    const textarea = screen.getByPlaceholderText(/what needs doing/i);
    expect(textarea).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <QuickCapture
        open={false}
        onClose={() => {}}
        onSubmit={() => {}}
        categories={[]}
        lifeAreas={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a preview chip after typing a title with a priority", async () => {
    const user = userEvent.setup();
    render(<Wrapper onSubmit={() => {}} />);
    const textarea = screen.getByPlaceholderText(/what needs doing/i);
    await user.type(textarea, "buy milk !high");
    expect(screen.getByText("buy milk")).toBeInTheDocument();
    // Preview chip should mention 'high' priority somewhere
    expect(screen.getAllByText(/high/i).length).toBeGreaterThan(0);
  });

  it("calls onSubmit and onClose when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <QuickCapture
        open={true}
        onClose={onClose}
        onSubmit={onSubmit}
        categories={[]}
        lifeAreas={[{ id: 1, name: "Personal", color: "slate", position: 0 }]}
      />,
    );
    await user.type(
      screen.getByPlaceholderText(/what needs doing/i),
      "buy milk",
    );
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT submit on Shift+Enter (newline)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <QuickCapture
        open={true}
        onClose={() => {}}
        onSubmit={onSubmit}
        categories={[]}
        lifeAreas={[{ id: 1, name: "Personal", color: "slate", position: 0 }]}
      />,
    );
    await user.type(
      screen.getByPlaceholderText(/what needs doing/i),
      "buy milk",
    );
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("the FAB has aria-label and title", () => {
    render(<QuickCaptureFab onClick={() => {}} />);
    const fab = screen.getByRole("button", { name: /quick capture/i });
    expect(fab).toHaveAttribute("title");
    expect(fab).toHaveAttribute("aria-label");
  });

  it("calls onClick when the FAB is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<QuickCaptureFab onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("the hotkey hook fires on Ctrl+Shift+T", () => {
    let called = 0;
    function Harness() {
      useQuickCaptureHotkey(() => called++);
      return null;
    }
    render(<Harness />);
    fireEvent.keyDown(document, { key: "T", ctrlKey: true, shiftKey: true });
    expect(called).toBe(1);
  });

  it("the hotkey hook fires on Meta+Shift+t (lowercase)", () => {
    let called = 0;
    function Harness() {
      useQuickCaptureHotkey(() => called++);
      return null;
    }
    render(<Harness />);
    fireEvent.keyDown(document, { key: "t", metaKey: true, shiftKey: true });
    expect(called).toBe(1);
  });

  it("the hotkey hook does NOT fire while typing in an input", () => {
    let called = 0;
    function Harness() {
      useQuickCaptureHotkey(() => called++);
      return null;
    }
    render(
      <>
        <input data-testid="typer" />
        <Harness />
      </>,
    );
    const input = screen.getByTestId("typer");
    fireEvent.keyDown(input, { key: "q" });
    expect(called).toBe(0);
  });
});