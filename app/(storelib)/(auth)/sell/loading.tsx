import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"

/* The same white and spinner the page opens on (./sell-onboarding.tsx), so a link pressed inside the site shows one screen, not two. */
export default function Loading() {
  return <AuthResolvingScreen />
}
