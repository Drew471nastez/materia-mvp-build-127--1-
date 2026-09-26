/**
 * The sidebar's link lists, mounted for scripts/check-link-list.mjs: the
 * header's navigation (flat nav_link blocks, saved the way the editor page
 * saves them) and Theme settings › Menus, each inside a scroller shaped like
 * the phone sheet's. What each one last saved is on `window`, so the probe
 * can read the order a drag committed.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { HeaderNavLinksEditor } from "@/components/website-builder/editor/controls/link-list-editor"
import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider, type LinkTarget } from "@/components/website-builder/link-picker"
import type { NavBlock } from "@/lib/website-builder/nav-links"

declare global {
  interface Window {
    __blocks: NavBlock[]
    __menus: unknown
    __saves: { header: number; menus: number }
  }
}

const TARGETS: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/products/tote", label: "Canvas tote", kind: "product" },
]

const many = new URLSearchParams(location.search).has("many")
const START: NavBlock[] = [
  { id: "home", type: "nav_link", settings: { label: "Home", url: "/", link_type: "custom" } },
  { id: "shop", type: "nav_link", settings: { label: "Shop", url: "/products", link_type: "custom" } },
  { id: "ebooks", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "shop" } },
  { id: "courses", type: "nav_link", settings: { label: "Courses", url: "/products?type=course", parent_id: "shop" } },
  { id: "about", type: "nav_link", settings: { label: "About", url: "/about", link_type: "custom" } },
  { id: "insta", type: "nav_link", settings: { label: "Instagram", url: "https://www.instagram.com/someone" } },
  ...(many
    ? Array.from({ length: 10 }, (_, i) => ({ id: `extra${i}`, type: "nav_link", settings: { label: `Extra ${i + 1}`, url: "/contact" } }))
    : []),
]
window.__blocks = START
window.__saves = { header: 0, menus: 0 }
window.__menus = {
  footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
}

function Header() {
  const [blocks, setBlocks] = useState<NavBlock[]>(START)
  const commit = (next: NavBlock[]) => {
    window.__blocks = next
    window.__saves.header++
    setBlocks(next)
  }
  let n = 0
  return h(HeaderNavLinksEditor, {
    blocks,
    maxLinks: 20,
    onUpdateBlockSetting: (id, key, value) =>
      setBlocks((prev) => {
        const next = prev.map((b) => (b.id === id ? { ...b, settings: { ...b.settings, [key]: value } } : b))
        window.__blocks = next
        window.__saves.header++
        return next
      }),
    onAddBlock: (type, settings) => commit([...blocks, { id: `new${Date.now()}${n++}`, type, settings: { ...(settings ?? {}) } }]),
    onRemoveBlock: (id) => commit(blocks.filter((b) => b.id !== id && b.settings.parent_id !== id)),
    onReorderBlocks: (next) => commit(next),
  })
}

function Menus() {
  const [menus, setMenus] = useState<unknown>(window.__menus)
  return h(MenusEditor, {
    value: menus,
    onChange: (next) => {
      window.__menus = next
      window.__saves.menus++
      setMenus(next)
    },
  })
}

function App() {
  const body = h(
    "div",
    { "data-sheet-scroll": "", id: "scroller", style: { height: many ? "420px" : "auto", overflowY: "auto" }, className: "p-3" },
    h("div", { id: "header-links" }, h(Header)),
    h("div", { id: "menus", className: "mt-6" }, h(Menus)),
  )
  return h(LinkTargetsProvider, { targets: TARGETS, children: body })
}

createRoot(document.getElementById("app")!).render(h(App))
