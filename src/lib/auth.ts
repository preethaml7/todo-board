import "server-only";
import { getUser, type UserRow } from "./user";
import { readSessionCookie, validateSessionToken } from "./session";

/** Resolve the currently authenticated user from the session cookie. */
export async function getCurrentUser(): Promise<UserRow | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const userId = validateSessionToken(token);
  if (userId === null) return null;
  const user = getUser();
  return user && user.id === userId ? user : null;
}

/** Guard for server actions — throws if the request is not authenticated. */
export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}
