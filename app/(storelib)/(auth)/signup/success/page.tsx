import { Suspense } from "react"
import { redirect } from "next/navigation"
import { NewBusinessScreen } from "@/components/app/business-switch-screen"
import { continueHref, readCarry, withCarry, SELL_PATH } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { SuccessContent } from "./success-content"

/**
 * ===========================================================================
 *  /signup/success, NOW A DOOR RATHER THAN A QUESTION
 * ===========================================================================
 * Every new account used to land here on "I'm a creator" or "I'm a buyer".
 * There is no question any more: a new account is a buyer, and becoming a
 * seller is Sell on Storelib or Become a seller, both of which are /sell.
 * Old links, bookmarks, a Stripe checkout begun before this and the native
 * app's cached routes still arrive here, so each is sent on, on the server,
 * in the same response:
 *
 *   ?business=new                New business from the account menu: the
 *                                creator onboarding, drawn here as before
 *                                (./success-content.tsx)
 *   ?action=become-creator       /sell, keeping a Stripe return
 *                                (stripe_success, tier) so a paid plan
 *                                finishes its setup
 *   anything else                /auth/continue: Discover for a buyer, the
 *                                dashboard for a seller, or the page they
 *                                were going to (lib/auth/continue.ts)
 */
export default async function SignupSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value)
  }

  /* The first HTML is the screen the account menu ended on, not a different spinner. */
  if (query.get("business") === "new") {
    return (
      <Suspense fallback={<NewBusinessScreen />}>
        <SuccessContent />
      </Suspense>
    )
  }

  if (query.get("action") === "become-creator") {
    const sell = new URLSearchParams()
    if (query.get("stripe_success") === "1") sell.set("stripe_success", "1")
    const tier = query.get("tier")
    if (tier === "growth" || tier === "pro") sell.set("tier", tier)
    const q = sell.toString()
    redirect(withCarry(`${SELL_PATH}${q ? `?${q}` : ""}`, { next: readCarry(query, getMainDomain()).next }))
  }

  redirect(continueHref(readCarry(query, getMainDomain())))
}
