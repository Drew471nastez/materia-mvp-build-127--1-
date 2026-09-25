/**
 * The real notifications panel and the real bell badge
 * (components/app/notifications-modal.tsx), for
 * scripts/check-notifications-panel.mjs. The server is a stand-in `fetch`:
 * three rows, two of them unread, and a PATCH that answers after 400ms, with
 * 500 when the page's address has ?fail in it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { NotificationsModal, LiveNotificationBadge } from "@/components/app/notifications-modal"

declare global {
  interface Window {
    __patches: unknown[]
    __openPanel: () => void
  }
}
window.__patches = []
const failing = location.search.includes("fail")
const at = (h: number) => new Date(Date.UTC(2026, 8, 25, 12 - h)).toISOString()
const rows = [
  { id: "n1", type: "new_review", title: "New 5 star review on Portrait retouching course", message: "\"Clear and worth every cent.\"", action_url: null, read_at: null, created_at: at(1) },
  { id: "n2", type: "new_review", title: "New 4 star review on Lightroom presets", message: "\"Good pack, the film looks are my favourite.\"", action_url: null, read_at: null, created_at: at(3) },
  { id: "n3", type: "update", title: "Payout of $184.20 sent", message: "It should reach your bank in two working days.", action_url: null, read_at: at(20), created_at: at(26) },
]

window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url)
  if (init?.method === "PATCH") {
    window.__patches.push(JSON.parse(String(init.body)))
    await new Promise((r) => setTimeout(r, 400))
    return new Response(JSON.stringify(failing ? { error: "x" } : { success: true }), { status: failing ? 500 : 200 })
  }
  const unread = rows.filter((r) => !r.read_at).length
  if (u.includes("summary=1")) return new Response(JSON.stringify({ unreadCount: unread }), { status: 200 })
  return new Response(JSON.stringify({ notifications: rows, unreadCount: unread, totalCount: rows.length }), { status: 200 })
}) as typeof fetch

function Shell() {
  const [open, setOpen] = React.useState(false)
  window.__openPanel = () => setOpen(true)
  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-40 flex h-[58px] items-center justify-end bg-[#131316] px-5">
        <button type="button" data-bell="" onClick={() => setOpen(true)} className="relative flex h-[34px] w-[34px] items-center justify-center text-white" aria-label="Notifications">
          B
          <LiveNotificationBadge stripeConnected stripeStatus="enabled" onePagePublished={false} />
        </button>
      </header>
      <div className="fixed inset-x-0 bottom-0 top-[58px] overflow-y-auto bg-[#f8f9fa]" />
      <NotificationsModal open={open} onOpenChange={setOpen} stripeConnected stripeStatus="enabled" onePagePublished={false} />
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
