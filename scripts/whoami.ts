/**
 * Backend account inspection — see who the single account belongs to and
 * its current state, without exposing anything in the UI.
 *
 *   npm run whoami
 */
import { getDb } from "../src/db/client";
import { getUser } from "../src/lib/user";

function main() {
  const user = getUser();
  if (!user) {
    console.log("\nNo account exists yet. Complete onboarding in the app first.\n");
    process.exit(0);
  }

  const db = getDb();
  const sessions = (
    db
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?")
      .get(new Date().toISOString()) as { n: number }
  ).n;
  const lock = db
    .prepare("SELECT failed_count, locked_until FROM login_attempts WHERE username = ?")
    .get(user.username) as
    | { failed_count: number; locked_until: string | null }
    | undefined;

  console.log("\n  Personal Boardspace — account\n");
  console.log(`  Username        : ${user.username}`);
  console.log(`  Created         : ${new Date(user.created_at).toLocaleString()}`);
  console.log(`  Active sessions : ${sessions}`);
  if (lock?.locked_until && new Date(lock.locked_until).getTime() > Date.now()) {
    console.log(
      `  Login lock      : locked until ${new Date(lock.locked_until).toLocaleString()} (${lock.failed_count} failed attempts)`,
    );
  } else {
    console.log(`  Login lock      : none`);
  }
  console.log("");
  process.exit(0);
}

main();
