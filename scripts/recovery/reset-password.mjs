/**
 * Self-contained backend password reset for the DOCKER/production image.
 *
 *   docker compose exec -it boardspace node scripts/recovery/reset-password.mjs
 *
 * It has no dev-dependency requirements (no tsx/TypeScript) — only
 * better-sqlite3 and argon2, which are already present in the runtime image.
 * It talks to the SQLite volume directly and invalidates all sessions.
 *
 * argon2 parameters MUST match src/lib/password.ts.
 */
import Database from "better-sqlite3";
import argon2 from "argon2";
import { resolve } from "node:path";

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "board.db");

// Non-interactive (piped) stdin: read it all once and serve lines from a
// buffer, so multiple sequential prompts work (a fresh readline per prompt
// fails on piped input because EOF closes it before the 2nd read).
let bufferedLines = null;
let bufferedIdx = 0;
let loadPromise = null;
function loadPipedInput() {
  if (bufferedLines) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => {
      bufferedLines = data.split(/\r?\n/);
      res();
    });
    process.stdin.resume();
  });
  return loadPromise;
}

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function askHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    process.stdout.write(question);
    await loadPipedInput();
    const line = bufferedLines[bufferedIdx++] ?? "";
    process.stdout.write("\n");
    return line.trim();
  }
  return new Promise((resolvePromise) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === "\n" || ch === "\r" || code === 4) {
          cleanup();
          process.stdout.write("\n");
          return resolvePromise(value);
        } else if (code === 3) {
          cleanup();
          process.stdout.write("\n");
          process.exit(1);
        } else if (code === 127 || code === 8) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (code >= 32) {
          value += ch;
          process.stdout.write("*");
        }
      }
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const user = db.prepare("SELECT username FROM users WHERE id = 1").get();
  if (!user) {
    console.log("\nNo account exists yet. Complete onboarding in the app first.\n");
    process.exit(0);
  }

  console.log(`\nResetting password for user: ${user.username}\n`);
  const pw1 = await askHidden("New password (min 10 chars): ");
  if (pw1.length < 10) {
    console.error("\n✗ Password must be at least 10 characters. Aborted.\n");
    process.exit(1);
  }
  const pw2 = await askHidden("Confirm new password: ");
  if (pw1 !== pw2) {
    console.error("\n✗ Passwords do not match. Aborted.\n");
    process.exit(1);
  }

  const hash = await argon2.hash(pw1, ARGON2_OPTS);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = 1").run(hash);
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM login_attempts").run();

  console.log(
    "\n✓ Password updated. All existing sessions were signed out.\n" +
      "  Log in with your new password.\n",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Failed to reset password:", err?.message ?? err, "\n");
  process.exit(1);
});
