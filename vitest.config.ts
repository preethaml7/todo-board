import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // `server-only` is a Next.js marker that the module is server-only;
      // it has no runtime export. We alias it to a no-op so tests that
      // transitively import server-only helpers don't fail to load.
      "server-only": resolve(__dirname, "test-shims/server-only.ts"),
    },
  },
  test: {
    // node is the default. jsdom is used for component / DOM tests (configured
    // per-file via the @vitest-environment jsdoc at the top of the file).
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // jest-dom matchers (toBeInTheDocument, toHaveAttribute, toBeDisabled, …)
    // are loaded here so they're available in any test that uses jsdom.
    setupFiles: ["./vitest.setup.ts"],
  },
});
