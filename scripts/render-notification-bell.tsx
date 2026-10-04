/**
 * The bell for scripts/check-notification-bell.mjs: the real
 * NotificationBell in a bar shaped like the platform header's right side
 * (the buyer header's light chrome, or the marketing header's dark one with
 * ?tone=dark), above a page of placeholder content so the popover is seen
 * over something. The API is answered by the probe; the Supabase client is a
 * stub with a signed in session whose realtime channels are recorded, so the
 * probe can deliver a row as realtime would.
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { headerChrome } from "@/lib/platform/header-chrome"

const params = new URLSearchParams(location.search)
const dark = params.get("tone") === "dark"
const chrome = headerChrome(!dark)

function Page() {
  /* A new header, as a move to a page with another layout draws one: the bell is thrown away and drawn again (window.__bellRemount). */
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    ;(window as unknown as { __bellRemount: () => void }).__bellRemount = () => setGeneration((g) => g + 1)
  }, [])
  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <header className={dark ? "bg-[#111113]" : "border-b border-[#e5e7eb] bg-white"}>
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className={`text-[19px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-[#1a1a2e]"}`}>Storelib</span>
          <div className="flex items-center gap-1 sm:gap-2.5" data-probe-right="">
            <span className={`hidden h-[42px] w-[42px] items-center justify-center rounded-full sm:flex ${chrome.iconBtn}`} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
            </span>
            <NotificationBell key={generation} className={chrome.iconBtn} />
            <span className="flex h-[42px] w-[42px] items-center justify-center" aria-hidden>
              <span className="h-8 w-8 rounded-full border border-gray-200 bg-[#d9dde3] sm:h-[42px] sm:w-[42px]" />
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 h-8 w-64 rounded-lg bg-[#e9ebee]" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="aspect-[4/3] rounded-xl bg-[#eef0f3]" />
              <div className="mt-3 h-3 w-3/4 rounded bg-[#eef0f3]" />
              <div className="mt-2 h-3 w-1/3 rounded bg-[#f3f4f6]" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
