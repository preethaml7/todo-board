/**
 * Self-contained account inspection for the DOCKER/production image.
 *
 *   docker compose exec boardspace node scripts/recovery/whoami.mjs
 */
import Database from "better-sqlite3";
import { resolve } from "node:path";

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "board.db");

const db = new Database(DB_PATH, { readonly: true });
const user = db.prepare("SELECT username, created_at FROM users WHERE id = 1").get();
if (!user) {
  console.log("\nNo account exists yet. Complete onboarding in the app first.\n");
  process.exit(0);
}

const sessions = db
  .prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?")
  .get(new Date().toISOString()).n;
const lock = db
  .prepare("SELECT failed_count, locked_until FROM login_attempts WHERE username = ?")
  .get(user.username);

console.log("\n  Personal Boardspace — account\n");
console.log(`  Username        : ${user.username}`);
console.log(`  Created         : ${new Date(user.created_at).toLocaleString()}`);
console.log(`  Active sessions : ${sessions}`);
if (lock?.locked_until && new Date(lock.locked_until).getTime() > Date.now()) {
  console.log(
    `  Login lock      : locked until ${new Date(lock.locked_until).toLocaleString()} (${lock.failed_count} failed attempts)`,
  );
} else {
  console.log("  Login lock      : none");
}
console.log("");
process.exit(0);
