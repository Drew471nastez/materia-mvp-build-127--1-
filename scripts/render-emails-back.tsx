/**
 * The Emails list (app/app/emails/emails-client.tsx, the real one) inside
 * the real shell pieces that decide how an /app page arrives
 * (NavigationLoadingBar and AppStage), over a shell shaped like
 * app/app/layout.tsx, for scripts/check-emails-back.mjs.
 *
 * The router is only what these components can see of one: `push` writes
 * the address after `__delay` ms and the page for it commits with it; back
 * and forward are the browser's own, committed a moment after the popstate,
 * which is when the real router commits a page it kept. A query written by
 * the page itself (the tab, an email opened over the list) is seen at once,
 * as Next.js syncs history.pushState and replaceState.
 *
 * Two pages: /app/emails (the list) and /app/emails/flow/<id> (a stand-in
 * for an automation, which is all the list needs from the way there and
 * back). The data is a stand-in Supabase with forty automations, so the
 * list is tall enough to be scrolled and left part way down.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname, useRouter } from "next/navigation"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import { EmailsClient } from "@/app/app/emails/emails-client"

const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
window.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  await new Promise((r) => setTimeout(r, 60))
  if (url.startsWith("/api/email/stats")) return reply({ campaigns: [], stats: {}, monthlyUsage: { sent: 0, limit: 500 } })
  return reply({ campaigns: [] })
}

function FlowStandIn() {
  const router = useRouter()
  return (
    <div data-page="flow" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa] p-8">
      <button type="button" data-flow-back="" onClick={() => router.back()}>
        Back to Emails
      </button>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      ))}
    </div>
  )
}

function Shell() {
  const path = usePathname()
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          {path === "/app/emails" ? <EmailsClient key="emails" initialTab="flows" /> : <FlowStandIn key={path} />}
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <Suspense fallback={null}>
      <NavigationLoadingBar />
      <AppStage />
    </Suspense>
    <Shell />
  </>,
)
