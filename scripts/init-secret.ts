/**
 * Ensures a strong SESSION_SECRET exists in .env.local before the app runs.
 * The secret is used to sign/verify session cookies (a server-side pepper).
 * It is generated once, stored with 0600 permissions, and never committed
 * (.env.local is git-ignored).
 *
 * Runs automatically via the `predev` / `prebuild` npm hooks.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");

function hasKey(contents: string, key: string): boolean {
  return contents
    .split("\n")
    .some((line) => line.trim().startsWith(`${key}=`) && line.trim().length > key.length + 1);
}

function main() {
  let contents = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  let wrote = false;

  if (!existsSync(ENV_PATH)) {
    writeFileSync(
      ENV_PATH,
      "# Auto-generated local secrets for Personal Boardspace.\n" +
        "# Do NOT commit this file. Losing SESSION_SECRET only invalidates\n" +
        "# existing login sessions (you stay logged out until re-login).\n",
      { mode: 0o600 },
    );
    contents = readFileSync(ENV_PATH, "utf8");
  }

  if (!hasKey(contents, "SESSION_SECRET")) {
    const secret = randomBytes(48).toString("base64url");
    appendFileSync(ENV_PATH, `SESSION_SECRET=${secret}\n`);
    wrote = true;
  }

  // Tighten permissions regardless (in case the file was created elsewhere).
  try {
    chmodSync(ENV_PATH, 0o600);
  } catch {
    /* best effort on non-POSIX */
  }

  if (wrote) {
    console.log("✓ Generated SESSION_SECRET in .env.local (0600).");
  }
}

main();
