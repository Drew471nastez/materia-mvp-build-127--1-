/**
 * Renders the desktop sidebar on its own — no session, no database, no /app —
 * so its geometry can be measured in a browser. Bundled by
 * scripts/check-sidebar.mjs, which stubs `next/link` and `next/navigation`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  DesktopSidebarContent,
  NAV_ICONS,
  type NavItemData,
} from "@/components/app/sidebar-desktop-nav"

const OUT = process.env.OUT_DIR!

const items: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  {
    href: "/app/products",
    label: "Products",
    icon: NAV_ICONS.products,
    children: [{ href: "/app/coupons", label: "Coupons" }],
  },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Orders", icon: NAV_ICONS.orders },
  { href: "/app/onepage", label: "OnePage", icon: NAV_ICONS.onepage, forceNavigation: true },
  { href: "/store-builder", label: "Store Builder", icon: NAV_ICONS.storeBuilder, forceNavigation: true },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder },
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
]

const common = {
  items,
  onToggle: () => {},
  onForceNavigate: () => {},
  linkShortenerLabel: "Link shortener",
  settingsLabel: "Settings",
  upgradeTitle: "Upgrade to Pro",
  upgradeSubtitle: "Unlock more benefits",
}

/**
 * The products group closed, the same group open, and the rail on a DIFFERENT
 * route — the third is how the filled active icon is checked: the same icon,
 * rendered active and rendered resting, has to be a different shape.
 */
const CASES: [string, Set<string>, string, string][] = [
  ["closed", new Set(), "/app", "100vh"],
  ["open", new Set(["/app/products"]), "/app", "100vh"],
  ["elsewhere", new Set(), "/app/orders", "100vh"],
  /*
    The same rail, too short for its own rows, so the nav scrolls. Measured
    against "open": a scrollbar that takes its width out of the rows is what
    moved every label sideways the moment a group opened.
  */
  ["short", new Set(["/app/products"]), "/app", "320px"],
]

for (const [name, expandedGroups, pathname, height] of CASES) {
  ;(globalThis as Record<string, unknown>).__PATHNAME__ = pathname
  const html = renderToStaticMarkup(
    createElement(DesktopSidebarContent, { ...common, expandedGroups }),
  )
  writeFileSync(
    join(OUT, `sidebar-${name}.html`),
    `<!doctype html><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="app.css">
<style>body{margin:0;background:#fff}</style>
<aside id="rail" style="width:240px;height:${height};border-right:1px solid rgba(229,231,235,.6)">${html}</aside>
<pre id="out">pending</pre>`,
  )
}
console.log("emitted")
