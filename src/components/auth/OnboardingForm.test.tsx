/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the server action so the form doesn't actually submit.
vi.mock("@/app/actions/auth", () => ({
  registerAction: vi.fn(async () => ({})),
}));

// Mock next/navigation so redirect calls don't break the test.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import OnboardingForm from "./OnboardingForm";

describe("OnboardingForm", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all form fields with proper labels", () => {
    render(<OnboardingForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("marks required fields with aria-required", () => {
    render(<OnboardingForm />);
    expect(screen.getByLabelText(/username/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute("aria-required", "true");
  });

  it("disables submit when password is shorter than 10 chars", () => {
    render(<OnboardingForm />);
    const submit = screen.getByRole("button", { name: /create account/i });
    expect(submit).toBeDisabled();
  });

  it("enables submit when password is 10+ chars", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    const pw = screen.getByLabelText(/^password/i);
    await user.type(pw, "longenoughpw1");
    const submit = screen.getByRole("button", { name: /create account/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it("password reveal button toggles the input type", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    const pw = screen.getByLabelText(/^password/i) as HTMLInputElement;
    expect(pw.type).toBe("password");
    const reveal = screen.getByLabelText(/show password/i);
    await user.click(reveal);
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).type).toBe("text");
    expect(screen.getByLabelText(/hide password/i)).toBeInTheDocument();
  });

  it("shows the strength meter as password is typed", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    const pw = screen.getByLabelText(/^password/i);
    // Initially no strength visible
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.type(pw, "Abcdefg1!");
    // Now the strength meter should appear with role="status"
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("rejects password with 5 chars as 'Too short' / 'Weak'", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    await user.type(screen.getByLabelText(/^password/i), "abc12");
    const status = screen.getByRole("status");
    expect(status.textContent?.toLowerCase()).toMatch(/too short|weak/);
  });

  it("rates 'Strong' for long mixed-case with digits and symbols", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    await user.type(
      screen.getByLabelText(/^password/i),
      "MyTr0ub4dor&3ngl!sh",
    );
    const status = screen.getByRole("status");
    expect(status.textContent?.toLowerCase()).toMatch(/strong|excellent/);
  });
});
