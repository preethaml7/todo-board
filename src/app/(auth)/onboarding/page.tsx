import { redirect } from "next/navigation";
import { userExists } from "@/lib/user";
import { OnboardingHero } from "@/components/auth/OnboardingHero";
import OnboardingForm from "@/components/auth/OnboardingForm";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  // Registration is a one-time event — once an account exists, it's closed.
  if (userExists()) redirect("/login");
  return (
    <OnboardingHero>
      <OnboardingForm />
    </OnboardingHero>
  );
}
