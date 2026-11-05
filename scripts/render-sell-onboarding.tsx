/**
 * /sell as a person arriving on it sees it, for scripts/check-sell-onboarding.mjs:
 * first the route's loading screen (app/(storelib)/(auth)/sell/loading.tsx), then the
 * page (app/(storelib)/(auth)/sell/sell-onboarding.tsx) replacing it, the way the App
 * Router swaps a loading.tsx for the page it was waiting on. `?first=1`
 * opens it for a second business, with the way back to the first one
 * instead of Not now. Supabase, the router and every /api call are stubs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import Loading from "@/app/(storelib)/(auth)/sell/loading"
import { SellOnboarding } from "@/app/(storelib)/(auth)/sell/sell-onboarding"

const params = new URLSearchParams(location.search)
const firstBusiness = params.get("first")
  ? { userId: "u-owner", name: "AndrewRullz Studio", handle: "andrew", avatarUrl: null, ready: true }
  : null

/* `?resume=1`: a setup begun and not finished, as /sell reads it back (lib/account/onboarding-resume). */
const resume = params.get("resume") ? { displayName: "Maya Prints", bio: "Risograph prints of city corners", category: "Art & Illustration", step: 4 as const } : null

const root = createRoot(document.getElementById("app")!)
root.render(createElement(Loading))
;(window as unknown as { __swap: () => void }).__swap = () =>
  root.render(createElement(SellOnboarding, { leaveHref: "/p/prints", resumePlan: null, firstBusiness, resume }))
;(window as unknown as { __ran?: boolean }).__ran = true
