/** @vitest-environment jsdom */
import * as React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OnboardingHero } from "./OnboardingHero";

describe("OnboardingHero", () => {
  beforeEach(() => cleanup());

  it("renders the boardspace wordmark and the hero copy", () => {
    render(<OnboardingHero />);
    expect(screen.getByText(/welcome to boardspace/i)).toBeInTheDocument();
    expect(screen.getByText(/respects your time/i)).toBeInTheDocument();
    // The three feature titles
    expect(screen.getByText(/single-user, password-locked/i)).toBeInTheDocument();
    expect(screen.getByText(/local sqlite, zero telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/zero config, runs anywhere/i)).toBeInTheDocument();
  });

  it("renders the trustline with security details", () => {
    render(<OnboardingHero />);
    expect(screen.getByText(/argon2id · local-only · zero outbound network/i)).toBeInTheDocument();
  });

  it("renders the form area placeholder when no children passed", () => {
    const { container } = render(<OnboardingHero />);
    const aside = container.querySelector('[data-testid="form-panel"]');
    expect(aside).toBeInTheDocument();
  });

  it("renders custom children inside the form panel", () => {
    render(
      <OnboardingHero>
        <div data-testid="child-form">CUSTOM_FORM</div>
      </OnboardingHero>,
    );
    expect(screen.getByTestId("child-form")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM_FORM")).toBeInTheDocument();
  });

  it("uses 'login' variant copy when variant='login'", () => {
    render(<OnboardingHero variant="login" />);
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByText(/right where you left it/i)).toBeInTheDocument();
  });
});
