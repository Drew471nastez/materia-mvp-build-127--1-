/**
 * The /app computer sidebar on its own, for scripts/check-app-sidebar-z7.mjs:
 * the real DesktopSidebarContent, on /app/integrations with Storelib Reviews
 * open under it (both rows lit, the owner's screenshot), in a sidebar short
 * enough that the list scrolls.
 */
import { createRoot } from "react-dom/client"
import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA, type NavItemData } from "@/components/app/sidebar-desktop-nav"

const items: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  { href: "/app/products", label: "Products", icon: NAV_ICONS.products, children: [{ href: "/app/coupons", label: "Coupons" }] },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Orders", icon: NAV_ICONS.orders },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder },
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
  {
    href: "/app/integrations",
    label: "Integrations",
    icon: NAV_ICONS_EXTRA.integrations,
    children: [
      { href: "/app/integrations?integration=storelib-reviews", label: "Storelib Reviews" },
      { href: "/app/integrations?integration=google-analytics", label: "Google Analytics" },
    ],
  },
]

createRoot(document.getElementById("app")!).render(
  <div id="rail" style={{ width: 260, height: Number(new URLSearchParams(location.search).get("h") ?? 480), borderRight: "1px solid #eee" }}>
    <DesktopSidebarContent
      items={items}
      expandedGroups={new Set(["/app/integrations"])}
      onToggle={() => {}}
      onForceNavigate={() => {}}
      settingsLabel="Settings"
      upgradeTitle="Upgrade to Pro"
      upgradeSubtitle="Unlock more benefits"
    />
  </div>,
)
