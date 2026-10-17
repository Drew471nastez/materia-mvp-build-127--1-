"use client"

import * as React from "react"

import type { ViewId } from "@/lib/admin/types"

import { cx } from "./ui"

/**
 * ===========================================================================
 *  THE ROOM: A GROUPED LIST OF PLACES ON THE LEFT, THE PLACE ON THE RIGHT
 * ===========================================================================
 * On a desk the navigation is a column, grouped the way the owner thinks
 * about the business: money first, then what the platform runs, then what
 * Storelib publishes itself, then the machinery. On a phone the same list
 * opens from the top bar and closes when a place is picked, and the page
 * underneath keeps its scroll.
 */

export type NavItem = { id: ViewId; label: string } | { href: string; label: string }

export const NAV: { group: string | null; items: NavItem[] }[] = [
  { group: null, items: [{ id: "overview", label: "Overview" }, { id: "ops", label: "Operations" }] },
  {
    group: "Commerce",
    items: [
      { id: "creators", label: "Creators" },
      { id: "products", label: "Products" },
      { id: "orders", label: "Orders" },
      { id: "payouts", label: "Payouts" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/physical-commerce", label: "Physical commerce" },
    ],
  },
  {
    group: "Platform",
    items: [
      { id: "websites", label: "Websites" },
      { id: "email", label: "Email" },
      { id: "audience", label: "Audience" },
      { id: "people", label: "People" },
      { href: "/admin/communities", label: "Communities" },
      { href: "/admin/onboarding", label: "Onboarding" },
      { href: "/admin/payouts-setup", label: "Payout setup" },
    ],
  },
  {
    group: "Storelib",
    items: [
      { href: "/admin/blog/dashboard", label: "Blog" },
      { href: "/admin/blog/seo", label: "Search and moderation" },
      { href: "/admin/resolution", label: "Resolution center" },
      { href: "/admin/reviews", label: "Reported reviews" },
      { href: "/admin/integrations", label: "Integrations" },
      { href: "/admin/ai-runs", label: "Storelib AI runs" },
      { href: "/admin/blog/dashboard/sales-trigger", label: "Test sale" },
    ],
  },
  {
    group: "System",
    items: [
      { id: "system", label: "Health" },
      { href: "/admin/performance", label: "Performance" },
      { href: "/admin/notifications", label: "Notifications" },
      { href: "/admin/emails", label: "Every email" },
      { href: "/admin/security", label: "File security" },
      { id: "audit", label: "Audit log" },
    ],
  },
]

export function viewLabel(view: ViewId): string {
  if (view === "creator") return "Creator"
  for (const g of NAV) for (const i of g.items) if ("id" in i && i.id === view) return i.label
  return "Overview"
}

function NavList({ current, onNavigate }: { current: ViewId; onNavigate: (v: ViewId) => void }) {
  const active = current === "creator" ? "creators" : current
  return (
    <nav aria-label="Admin" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group ?? "top"}>
          {g.group ? <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">{g.group}</p> : null}
          <ul className="space-y-px">
            {g.items.map((item) => {
              const on = "id" in item && item.id === active
              const cls = cx(
                "relative flex h-8 w-full items-center rounded-[7px] px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70",
                on ? "bg-white/[0.07] font-medium text-[#ededf0]" : "text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]",
              )
              return (
                <li key={item.label}>
                  {"id" in item ? (
                    <button type="button" className={cls} aria-current={on ? "page" : undefined} onClick={() => onNavigate(item.id)}>
                      {on ? <span aria-hidden className="absolute left-0 top-2 h-4 w-[2px] rounded-full bg-[#8b5cf6]" /> : null}
                      {item.label}
                    </button>
                  ) : (
                    <a className={cls} href={item.href}>
                      {item.label}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Shell({
  current,
  onNavigate,
  live,
  busy,
  onSignOut,
  children,
}: {
  current: ViewId
  onNavigate: (v: ViewId) => void
  live: number | null
  busy: boolean
  onSignOut: () => void
  children: React.ReactNode
}) {
  const [menu, setMenu] = React.useState(false)

  React.useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menu])

  const go = (v: ViewId) => {
    setMenu(false)
    onNavigate(v)
  }

  const liveLine = (
    <p className="flex items-center gap-2 text-[12px] text-[#9b9ba6] tabular-nums" data-live>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#3fb950]" />
      {live === null ? "Visitors now not read" : `${live.toLocaleString("en-US")} on Storelib now`}
    </p>
  )

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]" data-admin-shell>
      {/* The work in progress, drawn only while a read takes long enough to notice. */}
      <div aria-hidden className={cx("fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-[#8b5cf6] transition-opacity duration-300", busy ? "opacity-100" : "opacity-0")} />

      {/* Desk: the column. */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-white/[0.08] bg-[#0b0b0f] lg:flex"
        data-admin-nav
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Storelib</span>
          <span className="text-[13px] text-[#6b6b76]">admin</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-1">
          <NavList current={current} onNavigate={go} />
        </div>
        <div className="shrink-0 space-y-2 border-t border-white/[0.08] px-5 py-3.5">
          {liveLine}
          <button type="button" onClick={onSignOut} className="-ml-2 h-8 rounded-[7px] px-2 text-[12px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
            Sign out
          </button>
        </div>
      </aside>

      {/* Phone: the bar, and the list it opens. */}
      <header
        className="sticky top-0 z-40 flex h-[52px] items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0b0b0f] px-4 lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" , height: "calc(52px + env(safe-area-inset-top))" }}
        data-admin-bar
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[14px] font-semibold">Storelib</span>
          <span className="truncate text-[13px] text-[#9b9ba6]">{viewLabel(current)}</span>
        </div>
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-controls="admin-menu"
          className="h-8 shrink-0 rounded-[7px] border border-white/[0.1] px-3 text-[13px] text-[#ededf0]"
        >
          {menu ? "Close" : "Menu"}
        </button>
      </header>
      {menu ? (
        <div
          id="admin-menu"
          className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto border-t border-white/[0.08] bg-[#0b0b0f] px-3 pb-8 pt-4 lg:hidden"
          style={{ top: "calc(52px + env(safe-area-inset-top))", paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}
          data-admin-menu
        >
          <NavList current={current} onNavigate={go} />
          <div className="mt-6 space-y-3 border-t border-white/[0.08] px-2.5 pt-4">
            {liveLine}
            <button type="button" onClick={onSignOut} className="-ml-2 h-9 rounded-[7px] px-2 text-[13px] text-[#9b9ba6]">
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 lg:pl-[232px]" data-admin-main>
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</div>
      </main>
    </div>
  )
}

export function ViewHeader({ title, meta, back, actions }: { title: React.ReactNode; meta?: React.ReactNode; back?: { label: string; onClick: () => void }; actions?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {back ? (
        <button type="button" onClick={back.onClick} className="-ml-2 mb-1 h-8 rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          {back.label}
        </button>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-[-0.015em] text-[#ededf0] sm:text-[22px]">{title}</h1>
          {meta ? <p className="mt-0.5 text-[13px] text-[#9b9ba6]">{meta}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
