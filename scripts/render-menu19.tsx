/**
 * The phone shell's header, the real menu and the real nav pill, over the
 * layers the pill can sit with: Settings as a page, Settings opened over a
 * page, the product editor's layer (PageLayer pill), and a plain page.
 * scripts/check-app-menu19.mjs drives it.
 *
 * The boxes are the ones app/app/layout.tsx and components/app/sidebar.tsx
 * draw, in the same order: the menu, then the phone header, then <main> with
 * the page in `.app-content-scroll`, then the @sheet slot, with the pill
 * beside them, wired the way sidebar.tsx wires it.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { PageLayer } from "@/components/app/page-layer"
import { AppTopCorners } from "@/components/app/app-top-corners"
import { MobileMenuPage, MobileNavPill, useLockAppScroll } from "@/components/app/sidebar-mobile-nav"
import { NAV_ICONS, NAV_ICONS_EXTRA } from "@/components/app/sidebar-desktop-nav"
import { LanguageProvider } from "@/lib/i18n"

const w = window as unknown as { __scene: string; __menuFirst: boolean }
const scene = w.__scene ?? "settings"

const items = [
  { href: "/app", label: "Home", icon: NAV_ICONS.dashboard },
  { href: "/app/orders", label: "Orders", icon: NAV_ICONS.orders },
  { href: "/app/products", label: "Products", icon: NAV_ICONS.products },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/customers", label: "Customers", icon: NAV_ICONS.dashboard },
] as unknown as Parameters<typeof MobileMenuPage>[0]["items"]

function Rows({ label }: { label: string }) {
  return (
    <div className="px-4 py-6">
      <h1 className="text-[24px] font-bold text-[#1a1a2e]">{label}</h1>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="mt-3 flex h-16 items-center rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 text-[15px] text-[#1a1a2e]">
          {label} row {i + 1}
        </div>
      ))}
    </div>
  )
}

function Header() {
  return (
    <header
      data-shell-chrome=""
      className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[#111111]"
      style={{ height: "calc(68px + env(safe-area-inset-top, 0px))", transform: "translateZ(0)" }}
    >
      <div className="flex h-[68px] items-center px-4 text-[16px] text-white">Calvin</div>
      <AppTopCorners className="text-[#111111]" />
    </header>
  )
}

function Shell() {
  const [open, setOpen] = useState(false)
  useLockAppScroll(open)
  const menu = (
    <MobileMenuPage
      open={open}
      items={items}
      expandedGroups={new Set()}
      onToggle={() => {}}
      onClose={() => setOpen(false)}
      upgradeTitle="Upgrade to Pro"
      upgradeSubtitle="More from your store"
    />
  )
  const page =
    scene === "editor" ? (
      <PageLayer pill inset="bar" phoneOnly>
        <div className="page-scroll h-full overflow-y-auto"><Rows label="Edit product" /></div>
      </PageLayer>
    ) : scene === "settings" ? (
      <SettingsSheet><Rows label="Settings" /></SettingsSheet>
    ) : (
      <Rows label="Home" />
    )
  return (
    <div className="h-svh overflow-hidden bg-[#111111] app-no-scrollbar">
      {w.__menuFirst ? menu : null}
      <Header />
      {w.__menuFirst ? null : menu}
      <MobileNavPill
        menuOpen={open}
        onToggleMenu={() => setOpen((v) => !v)}
        onCloseMenu={() => setOpen(false)}
        onNavigate={() => {}}
        icons={{
          home: NAV_ICONS.dashboard,
          orders: NAV_ICONS.orders,
          products: NAV_ICONS.products,
          analytics: NAV_ICONS.analytics,
          settings: NAV_ICONS_EXTRA.settings,
        }}
      />
      <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] bg-[#f8f9fa] overflow-hidden app-main-content">
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
          {scene === "settings-over" ? <Rows label="Home" /> : page}
        </div>
      </main>
      {scene === "settings-over" ? <SettingsSheet overlay><Rows label="Settings" /></SettingsSheet> : null}
    </div>
  )
}

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
