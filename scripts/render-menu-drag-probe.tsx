/**
 * A menu's links, for scripts/check-menu-drag.mjs: the header's own links
 * (flat nav_link blocks, a sub-link naming its parent) and a store menu (a
 * nested list named by place), each the real editor, inside a scroller shaped
 * like the sidebar's. What each last saved, and how many times, is on
 * `window`, so the check reads the tree a drop committed.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { HeaderNavLinksEditor } from "@/components/website-builder/editor/controls/link-list-editor"
import { MenuLinksEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider, type LinkTarget } from "@/components/website-builder/link-picker"
import type { NavBlock } from "@/lib/website-builder/nav-links"
import type { MenuLink } from "@/lib/storelib-theme/values"

declare global {
  interface Window {
    __dragBlocks: NavBlock[]
    __dragLinks: MenuLink[]
    __dragSaves: { header: number; menu: number }
  }
}

const TARGETS: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
]

const many = new URLSearchParams(location.search).has("many")
const START: NavBlock[] = [
  { id: "home", type: "nav_link", settings: { label: "Home", url: "/" } },
  { id: "shop", type: "nav_link", settings: { label: "Shop", url: "/products" } },
  { id: "ebooks", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "shop" } },
  { id: "courses", type: "nav_link", settings: { label: "Courses", url: "/products?type=course", parent_id: "shop" } },
  { id: "about", type: "nav_link", settings: { label: "About", url: "/about" } },
  { id: "insta", type: "nav_link", settings: { label: "Instagram", url: "https://www.instagram.com/someone" } },
  ...(many ? Array.from({ length: 14 }, (_, i) => ({ id: `extra${i}`, type: "nav_link", settings: { label: `Extra ${i + 1}`, url: "/" } })) : []),
]
const LINKS: MenuLink[] = [
  { title: "Shop", url: "/products", links: [{ title: "Ebooks", url: "/products?type=ebook" }] },
  { title: "About", url: "/about" },
  { title: "Contact", url: "/contact" },
]
window.__dragBlocks = START
window.__dragLinks = LINKS
window.__dragSaves = { header: 0, menu: 0 }

function Header() {
  const [blocks, setBlocks] = useState<NavBlock[]>(START)
  const commit = (next: NavBlock[]) => {
    window.__dragBlocks = next
    window.__dragSaves.header++
    setBlocks(next)
  }
  return h(HeaderNavLinksEditor, {
    blocks,
    maxLinks: 40,
    onUpdateBlockSetting: () => {},
    onAddBlock: () => {},
    onRemoveBlock: () => {},
    onReorderBlocks: commit,
  })
}

function Menu() {
  const [links, setLinks] = useState<MenuLink[]>(LINKS)
  return h(MenuLinksEditor, {
    links,
    onLinks: (next: MenuLink[]) => {
      window.__dragLinks = next
      window.__dragSaves.menu++
      setLinks(next)
    },
  })
}

function App() {
  const body = h(
    "div",
    { "data-wb-sidebar-scroll": "", id: "scroller", style: { height: many ? "360px" : "100vh", overflowY: "auto", width: "min(100vw, 320px)" }, className: "bg-white p-4" },
    h("div", { id: "header-links" }, h(Header)),
    h("div", { id: "menu-links", className: "mt-8" }, h(Menu)),
    h("div", { style: { height: 200 } }),
  )
  return h(LinkTargetsProvider, { targets: TARGETS, children: body })
}

createRoot(document.getElementById("app")!).render(h(App))
