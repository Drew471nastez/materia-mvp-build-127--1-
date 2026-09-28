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
 *
 * On "/" the real homepage hero is drawn under the header, so its two
 * buttons can be measured against the header's.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { Hero } from "@/components/marketing/hero"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "guest"
try {
  localStorage.clear()
} catch {
  /* no storage: the header starts from nothing, which is what is wanted */
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformHeaderClient />
    {w.__nav.path === "/" ? (
      <main className="bg-white">
        <Hero />
      </main>
    ) : (
      <main className="min-h-[1400px] bg-[#f8f9fa] p-6 text-[15px] text-neutral-500">A buyer page under the header.</main>
    )}
  </LocaleProvider>,
)
