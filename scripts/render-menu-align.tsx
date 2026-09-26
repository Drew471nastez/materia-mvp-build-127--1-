/**
 * The builder's menus and pickers, mounted side by side for
 * scripts/check-builder-menu-align.mjs: the page menu in both skins and all
 * three of its branches, the link and icon pickers open, the sidebar's menus
 * and link lists, and the Publish panel with a security check that found
 * more than it shows.
 *
 * Every one of them is the real component. Nothing here styles anything: the
 * probe measures what the components draw.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useRef, useState } from "react"

import { PageList, PageSwitcher, type SwitcherPage } from "@/components/website-builder/page-switcher"
import { LinkPicker, LinkTargetsProvider, type LinkTarget } from "@/components/website-builder/link-picker"
import { IconPicker } from "@/components/website-builder/icon-picker"
import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { HeaderNavLinksEditor } from "@/components/website-builder/editor/controls/link-list-editor"
import { MenuPickerControl } from "@/components/website-builder/editor/controls/menu-picker-control"
import { EditorFieldProvider } from "@/components/website-builder/editor/controls/context"
import { PublishPanel } from "@/components/website-builder/publish-panel"
import { SectionLibrary } from "@/components/website-builder/editor/section-library"
import type { NavBlock } from "@/lib/website-builder/nav-links"

const PAGES: SwitcherPage[] = [
  { key: "home", name: "Home page", path: "/" },
  { key: "products", name: "All products", path: "/products" },
  { key: "search", name: "Search", path: "/search" },
  { key: "product", name: "Product page", path: "/products/x" },
  { key: "about", name: "About", path: "/about" },
  { key: "lookbook", name: "Lookbook", path: "/lookbook", custom: true },
  { key: "size-guide", name: "Size guide", path: "/size-guide", custom: true },
  { key: "account", name: "Account", path: "/account" },
  { key: "login", name: "Sign in", path: "/account/login" },
  { key: "wishlist", name: "Wishlist", path: "/wishlist" },
  { key: "contact", name: "Contact", path: "/contact" },
  { key: "refund-policy", name: "Refund policy", path: "/refund-policy", custom: true },
  { key: "privacy-policy", name: "Privacy policy", path: "/privacy-policy", custom: true },
  { key: "terms-of-service", name: "Terms of service", path: "/terms-of-service", custom: true },
]

const PRODUCTS = [
  { id: "p1", title: "Linen shirt" },
  { id: "p2", title: "Field notebook" },
  { id: "p3", title: "Wool scarf" },
  { id: "p4", title: "Canvas tote" },
  { id: "p5", title: "Brass pen" },
  { id: "p6", title: "Desk lamp" },
  { id: "p7", title: "Clay mug" },
]

const TARGETS: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/products/tote", label: "Canvas tote", kind: "product" },
  { href: "/products/pen", label: "Brass pen", kind: "product" },
]

const BLOCKS: NavBlock[] = [
  { id: "home", type: "nav_link", settings: { label: "Home", url: "/", link_type: "custom" } },
  { id: "shop", type: "nav_link", settings: { label: "Shop", url: "/products", link_type: "custom" } },
  { id: "ebooks", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "shop" } },
  { id: "about", type: "nav_link", settings: { label: "About", url: "/about", link_type: "custom" } },
]

const MENUS = {
  "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/products" }] },
  footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }] },
}

const touch = new URLSearchParams(location.search).has("touch")

function Bar() {
  const [current, setCurrent] = useState("home")
  return h(
    "div",
    { id: "dark-bar", className: "flex h-12 items-center justify-center bg-[#1f1f1f] px-3" },
    h(PageSwitcher, {
      pages: PAGES,
      current,
      products: PRODUCTS,
      currentProduct: null,
      onSelect: setCurrent,
      onSelectProduct: () => {},
      onCreate: () => {},
      onDelete: () => {},
      onReload: () => {},
    }),
  )
}

function Publish() {
  const anchor = useRef<HTMLButtonElement>(null)
  return h(
    "div",
    { id: "publish", className: "bg-[#1f1f1f] p-3" },
    h("button", { ref: anchor, type: "button", className: "h-8 rounded-lg bg-white/10 px-3 text-[13px] text-white" }, "Publish"),
    h(PublishPanel, {
      open: true,
      installId: "probe",
      onOpenChange: () => {},
      anchorRef: anchor,
      mobile: false,
      live: true,
      pending: true,
      publishedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      websiteUrl: "https://shop.storelib.com",
      websiteUrlDisplay: "shop.storelib.com",
      busy: false,
      onPublish: () => {},
      backupsReady: true,
    }),
  )
}

/* Four sections in three categories, so the library has a nav worth measuring. */
const SCHEMAS = {
  hero_banner: { name: "Hero banner", category: "hero", settings: [] },
  text_rich: { name: "Rich text", category: "content", settings: [] },
  faq_list: { name: "Questions", category: "faq", settings: [] },
  my_strip: { name: "My strip", category: "content", settings: [] },
} as unknown as Parameters<typeof SectionLibrary>[0]["schemas"]

function Library() {
  const [open, setOpen] = useState(false)
  return h(
    "div",
    { id: "library" },
    h(
      "button",
      { type: "button", id: "open-library", className: "h-9 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px]", onClick: () => setOpen(true) },
      "Add a section",
    ),
    h(SectionLibrary, {
      open,
      onOpenChange: setOpen,
      onAddSection: () => {},
      schemas: SCHEMAS,
      addable: ["hero_banner", "text_rich", "faq_list", "my_strip"],
      ownTypes: ["my_strip"],
      sources: {},
    }),
  )
}

function App() {
  const [blocks, setBlocks] = useState<NavBlock[]>(BLOCKS)
  const [menus, setMenus] = useState<unknown>(MENUS)
  const [icon, setIcon] = useState("star")
  const [link, setLink] = useState("/products")
  const [menu, setMenu] = useState("footer")

  const panel = (id: string, title: string, body: unknown) =>
    h("div", { id, className: "mb-6" }, h("p", { className: "mb-2 text-[11px] uppercase text-neutral-400" }, title), body as never)

  /* Both providers take their children as a prop, which is what their types say. */
  const inside = [
      h(Bar, { key: "bar" }),
      h(
        "div",
        { key: "fields", className: "mx-auto w-full max-w-[340px] p-3", "data-sheet-scroll": "" },
        panel(
          "light-boxed",
          "Pages tab, boxed",
          h(
            "div",
            { className: "h-[420px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" },
            h(PageList, {
              className: "h-full",
              tone: "light",
              boxed: true,
              touch,
              pages: PAGES,
              current: "about",
              currentProduct: null,
              products: PRODUCTS,
              onSelect: () => {},
              onSelectProduct: () => {},
              onCreate: () => {},
              onDelete: () => {},
            }),
          ),
        ),
        panel(
          "light-plain",
          "Pages, plain",
          h(
            "div",
            { className: "h-[420px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" },
            h(PageList, {
              className: "h-full",
              tone: "light",
              touch,
              pages: PAGES,
              current: "about",
              currentProduct: null,
              products: PRODUCTS,
              onSelect: () => {},
              onSelectProduct: () => {},
              onCreate: () => {},
              onDelete: () => {},
            }),
          ),
        ),
        panel("link-picker", "Link", h(LinkPicker, { value: link, targets: TARGETS, onChange: setLink })),
        panel("icon-picker", "Icon", h(IconPicker, { value: icon, onChange: setIcon })),
        panel("menu-picker", "Menu", h(MenuPickerControl, { value: menu, onChange: setMenu, label: "Menu" })),
        panel(
          "link-list",
          "Header links",
          h(HeaderNavLinksEditor, {
            blocks,
            maxLinks: 20,
            onUpdateBlockSetting: (id, key, value) =>
              setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, settings: { ...b.settings, [key]: value } } : b))),
            onAddBlock: (type, settings) => setBlocks((prev) => [...prev, { id: `new${prev.length}`, type, settings: { ...(settings ?? {}) } }]),
            onRemoveBlock: (id) => setBlocks((prev) => prev.filter((b) => b.id !== id)),
            onReorderBlocks: setBlocks,
          }),
        ),
        panel("menus", "Menus", h(MenusEditor, { value: menus, onChange: setMenus })),
        h(Library, { key: "library" }),
      ),
      h(Publish, { key: "publish" }),
    ]
  return h(LinkTargetsProvider, {
    targets: TARGETS,
    children: h(EditorFieldProvider, {
      value: { products: [], menus: MENUS, template: "index", openMenus: () => {} },
      children: inside,
    }),
  })
}

createRoot(document.getElementById("app")!).render(h(App))
