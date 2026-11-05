import { redirect } from "next/navigation"
import { withCarry, SELL_PATH, safeNext } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"

/**
 * /onboarding is an older name for becoming a seller: the header's Become a
 * Seller and the /app pages that find no creator row still link here. It
 * goes to /sell, the one door into seller onboarding (lib/auth/continue.ts),
 * on the server, so nothing is drawn on the way.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams
  redirect(withCarry(SELL_PATH, { next: safeNext(next, getMainDomain()) }))
}
