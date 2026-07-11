/**
 * Backend password recovery — run locally on this machine when you're locked
 * out or want to rotate the password. There is no in-app "forgot password"
 * flow by design (single-user, security-first).
 *
 *   npm run reset-password
 *
 * It updates the argon2 hash directly in SQLite and invalidates every existing
 * login session, so you'll sign in fresh with the new password.
 */
import { getDb } from "../src/db/client";
import { getUser, updatePassword } from "../src/lib/user";
import { hashPassword } from "../src/lib/password";
import { askHidden } from "./prompt";

async function main() {
  const user = getUser();
  if (!user) {
    console.log(
      "\nNo account exists yet. Start the app (`npm run dev`) and complete onboarding first.\n",
    );
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

  const hash = await hashPassword(pw1);
  updatePassword(hash);

  // Invalidate all sessions and clear any lockout so you can log in immediately.
  const db = getDb();
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
