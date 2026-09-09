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
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
]

const common = {
  items,
  onToggle: () => {},
  onForceNavigate: () => {},
  toolsLabel: "Tools",
  linkShortenerLabel: "Link shortener",
  communitiesLabel: "Communities",
  settingsLabel: "Settings",
  upgradeTitle: "Upgrade to Pro",
  upgradeSubtitle: "Unlock more benefits",
}

/** The products group closed, and the same group open. */
const CASES: [string, Set<string>][] = [
  ["closed", new Set()],
  ["open", new Set(["/app/products"])],
]

for (const [name, expandedGroups] of CASES) {
  const html = renderToStaticMarkup(
    createElement(DesktopSidebarContent, { ...common, expandedGroups }),
  )
  writeFileSync(
    join(OUT, `sidebar-${name}.html`),
    `<!doctype html><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="app.css">
<style>body{margin:0;background:#fff}</style>
<aside id="rail" style="width:240px;height:100vh;border-right:1px solid rgba(229,231,235,.6)">${html}</aside>
<pre id="out">pending</pre>`,
  )
}
console.log("emitted")
