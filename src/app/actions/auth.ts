"use server";

import { redirect } from "next/navigation";
import { onboardingSchema, loginSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createUser, getUser, userExists } from "@/lib/user";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  destroySession,
} from "@/lib/session";
import { checkLock, clearFailures, recordFailure } from "@/lib/rate-limit";
import {
  getClientIp,
  ipThrottle,
  logSecurityEvent,
  sweepThrottle,
} from "@/lib/security";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function formatLockMessage(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return `Too many attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`;
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // Single-user lock — never allow a second account.
  if (userExists()) {
    return { error: "An account already exists. Registration is closed." };
  }

  const ip = await getClientIp();
  sweepThrottle();
  if (ipThrottle(ip).limited) {
    logSecurityEvent("register_throttled", { ip }, "warn");
    return { error: "Too many requests. Please wait a few minutes." };
  }

  const parsed = onboardingSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    createUser(parsed.data.username, passwordHash);
  } catch {
    return { error: "An account already exists. Registration is closed." };
  }

  const user = getUser()!;
  logSecurityEvent("account_created", { ip, username: user.username });
  const { token, expiresAt } = createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/board");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const ip = await getClientIp();
  sweepThrottle();
  if (ipThrottle(ip).limited) {
    logSecurityEvent("login_throttled", { ip }, "warn");
    return { error: "Too many requests. Please wait a few minutes." };
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your username and password." };
  }
  const { username, password } = parsed.data;

  const lock = checkLock(username);
  if (lock.locked) {
    logSecurityEvent("login_locked", { ip, username }, "warn");
    return { error: formatLockMessage(lock.retryAfterMs) };
  }

  const user = getUser();
  const matchesUser = user && user.username === username;

  // Always perform an argon2 computation to equalise timing whether or not
  // the username matched (mitigates user-enumeration by response time).
  const ok = matchesUser
    ? await verifyPassword(user!.password_hash, password)
    : (await hashPassword(password), false);

  if (!ok) {
    const state = recordFailure(username);
    logSecurityEvent(
      "login_failed",
      { ip, username, locked: state.locked },
      "warn",
    );
    if (state.locked) return { error: formatLockMessage(state.retryAfterMs) };
    return { error: "Invalid username or password." };
  }

  clearFailures(username);
  logSecurityEvent("login_success", { ip, username });
  const { token, expiresAt } = createSession(user!.id);
  await setSessionCookie(token, expiresAt);
  redirect("/board");
}

export async function logoutAction() {
  const token = await readSessionCookie();
  destroySession(token);
  await clearSessionCookie();
  redirect("/login");
}
