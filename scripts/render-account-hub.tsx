/**
 * The buyer's profile (scripts/account-hub-demo.tsx: the real hub, the
 * Overview and Settings) in a shell shaped like app/(storelib)/account/layout.tsx: the
 * black site header at EVERY width, as the library has it, the light page,
 * the footer. The router is the probe's stub
 * (scripts/check-account-hub.mjs): a link's press changes the path a moment
 * later, the way a prefetched page arrives.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AccountDemo } from "./account-hub-demo"
import { LocaleProvider } from "@/components/locale-provider"

function Shell() {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      {/* The site header as it draws on /account now: at every width, exactly as on /library. */}
      <header className="sticky top-0 z-40 block h-[64px] bg-black" data-probe-header="" />
      <main className="flex-1">
        <AccountDemo />
      </main>
      <footer className="bg-[#111] px-4 py-10 text-[13px] text-white/70">Storelib</footer>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Shell />
  </LocaleProvider>,
)
