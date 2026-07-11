/**
 * Public marketing landing at `/`.
 *
 * Access logic (in order):
 *   1. Logged-in user       → redirect to `/board` (the kanban).
 *   2. Account doesn't exist → render the marketing page in "fresh" mode
 *                              ("Get started" → /onboarding).
 *   3. Account exists, not logged in → render the marketing page in
 *                              "returning" mode ("Sign in to your board" → /login).
 *
 * The page itself is server-rendered, so the CTA hrefs are decided on the
 * server without any client-side branching.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { userExists } from "@/lib/user";
import { MarketingPage, type MarketingVariant } from "@/components/marketing/MarketingPage";

export const dynamic = "force-dynamic";

export default async function MarketingLandingPage() {
  // 1. Authenticated user → straight to the kanban.
  if (await getCurrentUser()) redirect("/board");

  // 2/3. No session — but is there an account on disk yet?
  const variant: MarketingVariant = userExists() ? "returning" : "fresh";
  return <MarketingPage variant={variant} />;
}