/**
 * The real pill and the real menu page, over a page shaped like /app: a dark
 * 68px header, a light scroll container full of cards, at 390x844.
 *
 * Nothing about either component is reimplemented. The probe opens the menu,
 * expands a group, and measures what is drawn.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { MobileMenuPage, MobileNavPill, pillBelongsOn, useLockAppScroll } from "@/components/app/sidebar-mobile-nav"
import { NAV_ICONS, NAV_ICONS_EXTRA, type NavItemData } from "@/components/app/sidebar-desktop-nav"

const ITEMS: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  {
    href: "/app/products",
    label: "Products",
    icon: NAV_ICONS.products,
    children: [{ href: "/app/coupons", label: "Coupons" }],
  },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Sales", icon: NAV_ICONS.orders },
  { href: "/creator-page", label: "Creator page", icon: NAV_ICONS.storeBuilder },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder },
  { href: "/app/onepage", label: "OnePage", icon: NAV_ICONS.onepage, forceNavigation: true },
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
]

function Shell() {
  const [open, setOpen] = React.useState(false)
  const [groups, setGroups] = React.useState<Set<string>>(new Set())
  /* The shell does this too; the probe checks that it works, and
     tests/app-mobile-nav.test.ts checks that the shell still calls it. */
  useLockAppScroll(open)

  /* The probe drives it from node, the way a finger would from the pill. */
  ;(window as unknown as Record<string, unknown>).__menu = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggleGroup: (href: string) =>
      setGroups((g) => {
        const next = new Set(g)
        if (next.has(href)) next.delete(href)
        else next.add(href)
        return next
      }),
  }

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-50 bg-[#111111]"
        style={{ height: "calc(68px + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex h-[68px] items-center px-4">
          <span className="text-[13px] font-medium text-white/90">Materia Themes</span>
        </div>
      </header>

      <main className="h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-4 py-6">
            <h1 className="text-[24px] font-bold text-[#1a1a2e]">Good afternoon</h1>
            {Array.from({ length: 14 }, (_, i) => (
              <div
                key={i}
                data-card={i}
                className="mt-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="h-20 w-full rounded-xl bg-neutral-100" />
                <p className="mt-2 text-[14px] text-[#6b7280]">Row {i}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MobileMenuPage
        open={open}
        items={ITEMS}
        expandedGroups={groups}
        onToggle={(href) =>
          setGroups((g) => {
            const next = new Set(g)
            if (next.has(href)) next.delete(href)
            else next.add(href)
            return next
          })
        }
        onClose={() => setOpen(false)}
        upgradeTitle="Upgrade to Pro"
        upgradeSubtitle="Unlock more benefits"
      />
      {/* The shell mounts it behind the same gate; tests/app-mobile-nav
          checks that it still does. */}
      {pillBelongsOn(usePathname()) ? (
      <MobileNavPill
        menuOpen={open}
        onToggleMenu={() => setOpen((v) => !v)}
        onCloseMenu={() => setOpen(false)}
        /*
          What router.push does that this component can see: the pathname
          moves, a moment later. The probe sets the delay; 0 means never, for
          the checks that want a pick left hanging.
        */
        onNavigate={(href) => {
          const w = window as unknown as Record<string, unknown>
          w.__went = href
          const delay = Number(w.__routeDelay ?? 0)
          if (delay > 0) window.setTimeout(() => (w.__goto as (p: string) => void)(href), delay)
          /*
            What router.push actually costs. The shell renders a whole new
            route when you press an icon, and that is main-thread work — the
            same thread the circle's frame loop runs on. The probe sets how
            many milliseconds of it to spend, in frame-sized pieces, starting
            on the next frame the way React's own work does.
          */
          const cost = Number(w.__navCost ?? 0)
          if (cost > 0) {
            let spent = 0
            const burn = () => {
              const until = performance.now() + 24
              while (performance.now() < until) { /* a route rendering */ }
              spent += 24
              if (spent < cost) requestAnimationFrame(burn)
            }
            requestAnimationFrame(burn)
          }
        }}
        icons={{
          home: NAV_ICONS.dashboard,
          orders: NAV_ICONS.orders,
          products: NAV_ICONS.products,
          analytics: NAV_ICONS.analytics,
          settings: NAV_ICONS_EXTRA.settings,
        }}
      />
      ) : null}
    </>
  )
}

try {
  const root = createRoot(document.getElementById("app")!)
  root.render(<Shell />)
  /* The pill does not appear on every route. The stubbed usePathname reads
     __path at render time, so re-rendering under a new key is enough to put
     the whole thing on a different page. */
  ;(window as unknown as Record<string, unknown>).__setPath = (path: string) => {
    ;(globalThis as unknown as Record<string, unknown>).__path = path
    root.render(<Shell key={path} />)
  }
  ;(window as unknown as Record<string, unknown>).__ran = true
} catch (e) {
  ;(window as unknown as Record<string, unknown>).__threw = String(e)
}
