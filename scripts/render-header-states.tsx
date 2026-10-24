/**
 * The real platform header, in each of the states the owner described, for
 * scripts/check-header-states.mjs. The probe stubs Supabase and the router;
 * this reads which page and which visitor from the hash:
 *
 *   #path=/explore&who=guest     nobody signed in
 *   #path=/&who=buyer            signed in, no seller access
 *   #path=/&who=seller           signed in, seller onboarding finished
 *   #path=/explore&who=unknown   a first visit: no snapshot, and the session
 *                                read never answers, so the header is still
 *                                waiting to know who is looking
 *   &tone=dark | &tone=light     the admin's header style (/admin, buyer header
 *                                theme), handed to the header as the layout does
 *   &look=dark                   the site's dark look (html[data-sl-dark])
 *
 * On "/" the real homepage hero is drawn under the header, so its two
 * buttons can be measured against the header's. The buyer tab bar is drawn
 * too, so a phone sheet can be seen over it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { Hero } from "@/components/marketing/hero"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "guest"
const tone = params.get("tone")
const buyerHeaderLight = tone === "light" ? true : tone === "dark" ? false : undefined
if (params.get("look") === "dark") document.documentElement.setAttribute("data-sl-dark", "")
try {
  localStorage.clear()
} catch {
  /* no storage: the header starts from nothing, which is what is wanted */
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformHeaderClient buyerHeaderLight={buyerHeaderLight} />
    {w.__nav.path === "/" ? (
      <main className="bg-white">
        <Hero />
      </main>
    ) : (
      <main className="min-h-[1400px] bg-[#f8f9fa] p-6 text-[15px] text-neutral-500">A buyer page under the header.</main>
    )}
    {/* The phone's buyer tab bar, where it belongs (not on the homepage), so the sheets can be seen over it. */}
    <BuyerTabBar />
  </LocaleProvider>,
)
