/**
 * ROUND 30, for scripts/check-transitions-round30.mjs (APP): two documents.
 *
 *   /community/...  a dark page of Storelib's own, with the real painter on it (SiteAppearance, which writes the look this
 *                   tab shows), and a plain link to /app, which is a document load as it is in the app.
 *   /app            the dashboard's real AppLayoutWrapper (it takes the head script's canvas off and the veil with it, once
 *                   the shell is on the screen) around a stand in for the shell: the #111111 header and the light page.
 *
 * The probe's server sends each document's <head> at once and its <body> late, so the frames between the press and the
 * shell are the ones the head alone paints.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { SiteAppearance } from "@/components/platform/site-appearance"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"

function DarkPage() {
  return (
    <>
      <SiteAppearance />
      <div className="min-h-svh bg-[#f8f9fa]" data-probe-dark-page="">
        <div className="h-[64px] border-b border-[#e5e7eb] bg-white" />
        <div className="mx-auto max-w-[760px] space-y-3 px-4 py-6">
          <a href="/app" data-probe-to-app="" className="block rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 text-[14px] text-[#1a1a2e]">
            Dashboard
          </a>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[140px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          ))}
        </div>
      </div>
    </>
  )
}

function AppShellStandIn() {
  return (
    <div className="fixed inset-0 bg-[#f8f9fa]" data-probe-app-shell="">
      <div className="h-[68px] bg-[#111111] md:h-[58px] md:bg-[#131316]" />
      <div className="mx-auto max-w-[1200px] space-y-3 px-4 py-6">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">Home</h1>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[120px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        ))}
      </div>
    </div>
  )
}

const app = /^\/app(\/|$)/.test(location.pathname)
createRoot(document.getElementById("app")!).render(
  app ? (
    <>
      <SiteAppearance />
      <AppLayoutWrapper>
        <AppShellStandIn />
      </AppLayoutWrapper>
    </>
  ) : (
    <DarkPage />
  ),
)
