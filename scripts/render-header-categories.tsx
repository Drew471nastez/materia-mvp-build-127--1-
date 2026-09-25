/**
 * The real platform header on /explore, for scripts/check-header-categories.mjs.
 * Supabase and the router are stubbed by the probe; nobody is signed in.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformHeaderClient />
    <main className="min-h-[1600px] bg-[#f8f9fa] p-8 text-[15px] text-neutral-500">The page under the header.</main>
  </LocaleProvider>,
)
