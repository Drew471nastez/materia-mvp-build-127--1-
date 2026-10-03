/**
 * ===========================================================================
 *  THE MENUS EDITOR, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-menus-editor.mjs. The real MenusEditor twice, as
 * the owner meets it:
 *
 *   #sidebar    in the builder's sidebar (light), opened on the Main menu,
 *               which is still the header's own links (moved over on edit)
 *   #settings   in Website Settings › Navigation (dark), inside its Card,
 *               on the list of menus
 *
 * `window.__menuWrites` records what each editor wrote, so the check can see the
 * first edit of the Main menu point the header at it.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider } from "@/components/website-builder/link-picker"
import { Card } from "@/components/website-builder/website-settings/parts"
import type { Menu } from "@/lib/storelib-theme/values"

declare global {
  interface Window {
    __ready: boolean
    __menuWrites: { menus?: Record<string, Menu>; header?: string }[]
  }
}
window.__menuWrites = []

const HEADER = {
  settings: { menu: "" } as Record<string, unknown>,
  blocks: [
    { id: "a", type: "nav_link", settings: { label: "Home", url: "/" } },
    { id: "b", type: "nav_link", settings: { label: "Shop", url: "/products" } },
    { id: "b1", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "b" } },
    { id: "b2", type: "nav_link", settings: { label: "Courses", url: "/products?type=course", parent_id: "b" } },
    { id: "c", type: "nav_link", settings: { label: "About", url: "/about" } },
    { id: "d", type: "nav_link", settings: { label: "Instagram", url: "https://www.instagram.com/me" } },
  ],
}
const MENUS: Record<string, Menu> = {
  footer: { title: "Footer", links: [{ title: "Terms", url: "/terms" }, { title: "Privacy", url: "/privacy" }] },
}
const TARGETS = [
  { href: "/", label: "Home", kind: "page" as const },
  { href: "/products", label: "Shop", kind: "page" as const },
  { href: "/about", label: "About", kind: "page" as const },
]

function Editor({ openHandle }: { openHandle?: string }) {
  const [menus, setMenus] = React.useState<Record<string, Menu>>(MENUS)
  const [header, setHeader] = React.useState(HEADER)
  return (
    <MenusEditor
      value={menus}
      header={header}
      openHandle={openHandle}
      onChange={(next) => {
        window.__menuWrites.push({ menus: next })
        setMenus(next)
      }}
      onLinkHeader={() => {
        window.__menuWrites.push({ header: "main-menu" })
        setHeader((h) => ({ ...h, settings: { ...h.settings, menu: "main-menu" } }))
      }}
    />
  )
}

function App() {
  return (
    <LinkTargetsProvider targets={TARGETS}>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", padding: 24 }}>
        {/* The builder's sidebar: 288px, white, the panel's own 14px padding. */}
        <div id="sidebar" className="bg-background text-foreground" style={{ width: 288, padding: 14, border: "1px solid #e5e7eb" }}>
          <Editor openHandle="main-menu" />
        </div>
        {/* Website Settings: the dark page and its Card. */}
        <div id="settings" className="dark" style={{ width: 560, background: "#111", color: "#fff", padding: 16 }}>
          <Card title="Menus">
            <div className="dark px-4 py-3 md:px-6" data-nav-menus="">
              <Editor />
            </div>
          </Card>
        </div>
      </div>
    </LinkTargetsProvider>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true }))
