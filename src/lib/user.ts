import { getDb } from "@/db/client";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export function userExists(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  return row.n > 0;
}

export function getUser(): UserRow | null {
  return (getDb().prepare("SELECT * FROM users WHERE id = 1").get() as
    | UserRow
    | undefined) ?? null;
}

/**
 * Creates the single account. Hard-refuses if a user already exists —
 * this is the single-user lock: registration is impossible after onboarding.
 */
export function createUser(username: string, passwordHash: string): UserRow {
  const db = getDb();
  if (userExists()) {
    throw new Error("An account already exists. Registration is closed.");
  }
  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)",
  ).run(username, passwordHash, new Date().toISOString());
  return getUser()!;
}

export function updatePassword(passwordHash: string) {
  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = 1")
    .run(passwordHash);
}
