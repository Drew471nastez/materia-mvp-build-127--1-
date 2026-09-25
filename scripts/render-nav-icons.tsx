/**
 * The /app nav icons, three ways, for scripts/check-nav-icons.mjs:
 *
 *   #sheet   every icon in NAV_ICONS and NAV_ICONS_EXTRA, outline and fill,
 *            at 20px (the rail's size) and 40px (twice it), in rail order
 *   #rail    the real desktop sidebar, 240px wide, on the route the probe sets
 *   #menu    the real phone menu page, open, with the real pill under it
 *
 * Nothing is redrawn here: every glyph is the component the app renders.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA, type NavIconPair, type NavItemData } from "@/components/app/sidebar-desktop-nav"
import { MobileMenuPage, MobileNavPill } from "@/components/app/sidebar-mobile-nav"

/* The order and the labels the shell uses (components/app/sidebar.tsx). */
const ITEMS: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  { href: "/app/products", label: "Products", icon: NAV_ICONS.products, children: [{ href: "/app/coupons", label: "Coupons" }] },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Sales", icon: NAV_ICONS.orders },
  { href: "/creator-page", label: "Creator page", icon: NAV_ICONS.storeBuilder },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder, forceNavigation: true },
  { href: "/app/onepage", label: "OnePage", icon: NAV_ICONS.onepage, forceNavigation: true },
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
]

const SHEET: Array<[string, NavIconPair]> = [
  ...(Object.entries(NAV_ICONS) as Array<[string, NavIconPair]>),
  ...(Object.entries(NAV_ICONS_EXTRA) as Array<[string, NavIconPair]>),
]

function Sheet() {
  return (
    <div style={{ padding: 16, minHeight: "100vh", boxSizing: "border-box", background: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      {[20, 40].map((size) => (
        <div key={size} style={{ display: "grid", gridTemplateColumns: `72px repeat(${SHEET.length}, ${size + 24}px)`, rowGap: 10, marginBottom: 18, alignItems: "center" }}>
          {(["line", "fill"] as const).map((variant) => (
            <React.Fragment key={variant}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{`${size}px ${variant}`}</span>
              {SHEET.map(([name, pair]) => {
                const Glyph = pair[variant]
                return (
                  <span key={name} data-sheet-icon={name} data-variant={variant} data-size={size} style={{ display: "flex", justifyContent: "center", color: variant === "fill" ? "#202020" : "#666666" }}>
                    <Glyph size={size} strokeWidth={1.5} />
                  </span>
                )
              })}
            </React.Fragment>
          ))}
          <span />
          {SHEET.map(([name]) => (
            <span key={name} style={{ fontSize: 9, color: "#9ca3af", textAlign: "center", overflow: "hidden" }}>{name}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function Rail() {
  return (
    <aside id="rail" style={{ width: 240, height: "100vh", borderRight: "1px solid rgba(229,231,235,.6)", background: "#fff" }}>
      <DesktopSidebarContent
        items={ITEMS}
        expandedGroups={new Set()}
        onToggle={() => {}}
        onForceNavigate={() => {}}
        settingsLabel="Settings"
        upgradeTitle="Upgrade to Pro"
        upgradeSubtitle="Unlock more benefits"
      />
    </aside>
  )
}

function Menu() {
  return (
    <div style={{ minHeight: "100svh", background: "#f8f9fa" }}>
      <MobileMenuPage
        open
        items={ITEMS}
        expandedGroups={new Set()}
        onToggle={() => {}}
        onClose={() => {}}
        upgradeTitle="Upgrade to Pro"
        upgradeSubtitle="Unlock more benefits"
      />
      <MobileNavPill
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        onNavigate={() => {}}
        icons={{
          home: NAV_ICONS.dashboard,
          orders: NAV_ICONS.orders,
          products: NAV_ICONS.products,
          analytics: NAV_ICONS.analytics,
          settings: NAV_ICONS_EXTRA.settings,
        }}
      />
    </div>
  )
}

const view = location.hash.slice(1) || "sheet"
createRoot(document.getElementById("app")!).render(view === "rail" ? <Rail /> : view === "menu" ? <Menu /> : <Sheet />)
;(window as unknown as Record<string, unknown>).__ran = true
