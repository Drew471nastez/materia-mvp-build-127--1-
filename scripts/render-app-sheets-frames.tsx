/**
 * The four /app phone sheets the owner named, as they are mounted in /app,
 * for scripts/check-app-sheets-frames.mjs:
 *
 *   SHARE          the real home page (components/app/dashboard-client.tsx)
 *                  with its address pill, its share sheet and its date
 *                  picker, from fixture props. What the pill's tap costs is
 *                  whatever the home page renders again, so it is the home
 *                  page that is mounted, not a stand-in.
 *   ACCOUNT        the real account sheet (components/app/mobile-account-menu)
 *                  in a dark header, as the sidebar mounts it.
 *   NOTIFICATIONS  the real notifications sheet, held in its own host with
 *                  its open state, as the sidebar holds it.
 *   DATE RANGE     the home page's own period picker, on its phone sheet.
 *
 * The server is a stand-in `fetch` and a stand-in Supabase client that
 * answer with fixture rows. `window.__renders.home` counts how many times the
 * home page drew, so the probe can say whether a sheet made it draw again.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { DashboardClient } from "@/components/app/dashboard-client"
import { MobileAccountMenu } from "@/components/app/mobile-account-menu"
import { NotificationsModal } from "@/components/app/notifications-modal"
import type { ConnectedPlatform } from "@/components/app/share/share-data"

declare global {
  interface Window {
    __renders: { home: number }
    __openNotifications: () => void
  }
}
window.__renders = { home: 0 }

/* Nothing leaves the page: a share target or "Open Instagram" is a window.open. */
window.open = (() => null) as typeof window.open

const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const TYPES = ["update", "message", "opportunity", "new_review", "update"]
const rows = Array.from({ length: 20 }, (_, i) => ({
  id: `n${i}`,
  type: TYPES[i % TYPES.length],
  title: ["New 5 star review on Portrait retouching course", "Payout of $184.20 sent", "A message from Maya about the preset pack", "Your OnePage had 312 visits this week"][i % 4],
  message: "It should reach your bank in two working days, and the receipt is in Billing.",
  action_url: null,
  read_at: i % 3 === 0 ? null : at(i * 5 + 2),
  created_at: at(i * 5 + 1),
}))
window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url)
  /* A server a phone actually talks to: not instant. */
  await new Promise((r) => setTimeout(r, 180))
  if (init?.method === "PATCH") return new Response(JSON.stringify({ success: true }), { status: 200 })
  if (u.includes("/api/notifications")) {
    const unread = rows.filter((r) => !r.read_at).length
    if (u.includes("summary=1")) return new Response(JSON.stringify({ unreadCount: unread }), { status: 200 })
    return new Response(JSON.stringify({ notifications: rows, unreadCount: unread, totalCount: rows.length }), { status: 200 })
  }
  return new Response("{}", { status: 200 })
}) as typeof fetch

const avatar = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><radialGradient id="g"><stop offset="0" stop-color="#f4c7a1"/><stop offset="1" stop-color="#7a4b2a"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="200" r="90" fill="#3b2a20"/></svg>`)

const PLATFORMS: ConnectedPlatform[] = [
  { key: "instagram", profileUrl: "https://www.instagram.com/andrewrullz/" },
  { key: "youtube", profileUrl: "https://www.youtube.com/@andrewrullz" },
  { key: "facebook", profileUrl: "https://www.facebook.com/andrewrullz" },
  { key: "twitter", profileUrl: "https://x.com/andrewrullz" },
  { key: "tiktok", profileUrl: "https://www.tiktok.com/@andrewrullz" },
  { key: "linkedin", profileUrl: "https://www.linkedin.com/in/andrewrullz" },
  { key: "pinterest", profileUrl: "https://www.pinterest.com/andrewrullz" },
  { key: "threads", profileUrl: "https://www.threads.net/@andrewrullz" },
]

const DAY = 86_400_000
const orders = Array.from({ length: 120 }, (_, i) => ({
  id: `o${i}`,
  product_id: `p${i % 6}`,
  amount_cents: 900 + ((i * 731) % 5000),
  status: "completed",
  created_at: new Date(Date.now() - (i % 30) * DAY - i * 3_600_000).toISOString(),
  stripe_session_id: `cs_${i}`,
  refund_amount_cents: 0,
}))

const steps = ["welcome", "branding", "product", "payouts", "onepage", "sale"].map((id, i) => ({
  id,
  title: id,
  description: `${id} step`,
  tooltip: "",
  completed: i < 5,
  href: "/app",
}))

/* The home page, counted: its hooks run inside this function, so every time
   the home page renders, for whatever reason, this runs and counts it. */
const HOME_PROPS = {
  creatorId: "c1",
  displayName: "Andrew Rullz",
  initialSetupSteps: steps,
  productIds: ["p0", "p1", "p2", "p3", "p4", "p5"],
  initialOrders: orders as never,
  creatorHandle: "andrewrullz",
  websiteDomain: "andrewrullz.com",
  websitePublished: true,
  brandingDetail: { hasAvatar: true, hasName: true, hasBio: true },
  sharePlatforms: PLATFORMS,
}
function Home() {
  window.__renders.home++
  return DashboardClient(HOME_PROPS)
}

type Handle = { open: () => void }
/* The sidebar's NotificationsHost (components/app/sidebar.tsx), the same shape. */
const NotificationsHost = React.memo(React.forwardRef<Handle>(function NotificationsHost(_, ref) {
  const [open, setOpen] = React.useState(false)
  React.useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), [])
  return <NotificationsModal open={open} onOpenChange={setOpen} stripeConnected stripeStatus="enabled" onePagePublished />
}))

function Shell() {
  const notifications = React.useRef<Handle>(null)
  const noop = React.useCallback(() => {}, [])
  window.__openNotifications = () => notifications.current?.open()
  return (
    <>
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 58, background: "#131316", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
        <MobileAccountMenu avatarSrc={avatar} userDisplayName="AndrewRullz" settingsLabel="Settings" billingLabel="Billing" languageLabel="Language" onOpening={noop} onLanguage={noop} onSignOut={noop} />
        <button type="button" id="bell" onClick={() => notifications.current?.open()} style={{ width: 40, height: 40, color: "#fff" }} aria-label="Notifications">B</button>
      </header>
      <NotificationsHost ref={notifications} />
      <div data-app-nav-pill="" id="pill" style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <button id="pill-tab" style={{ pointerEvents: "auto", width: 256, height: 56, marginBottom: 16, borderRadius: 999, background: "#000", border: 0 }} />
      </div>
      <main style={{ paddingTop: 58, position: "relative" }}>
        <Home />
      </main>
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
