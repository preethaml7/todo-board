/**
 * Server-action helpers. Lives in a non-"use server" file so it can export
 * sync helpers (ActionResult + fail). Server-action files import from here
 * and re-export the type for client use.
 *
 * ActionResult is intentionally compatible with the older shape (always
 * includes `ok`, optional `data` and `error`) so legacy callers can read
 * `r.error` without an exhaustive check.
 */

export type ActionResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
