import { redirect } from "next/navigation";
import { userExists } from "@/lib/user";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/auth/LoginForm";
import { OnboardingHero } from "@/components/auth/OnboardingHero";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!userExists()) redirect("/onboarding");
  if (await getCurrentUser()) redirect("/board");
  return (
    <OnboardingHero variant="login">
      <LoginForm />
    </OnboardingHero>
  );
}
