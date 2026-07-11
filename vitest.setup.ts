/**
 * Vitest setup — runs before every test file.
 * Loads jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) so any
 * test using jsdom can use them.
 *
 * This file is referenced from vitest.config.ts.
 */
import "@testing-library/jest-dom/vitest";
