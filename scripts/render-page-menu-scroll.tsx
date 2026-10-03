/**
 * The bar's page menu, alone under a dark bar, for
 * scripts/check-page-menu-scroll.mjs. `?pages=long` gives it enough pages
 * and products to scroll with every group open; `?pages=short` gives it a
 * handful, to compare the rows' edges against a list that cannot scroll.
 *
 * The component is the real one. Nothing here styles the menu.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { PageSwitcher, type SwitcherPage } from "@/components/website-builder/page-switcher"

const params = new URLSearchParams(location.search)
const long = params.get("pages") !== "short"

const BASE: SwitcherPage[] = [
  { key: "home", name: "Home page", path: "/" },
  { key: "products", name: "Shop", path: "/products" },
  { key: "search", name: "Search", path: "/search" },
  { key: "product", name: "Product page", path: "/products/x" },
  { key: "about", name: "About page", path: "/about" },
  { key: "account", name: "Account", path: "/account" },
  { key: "login", name: "Sign in", path: "/account/login" },
  { key: "wishlist", name: "Wishlist", path: "/wishlist" },
  { key: "contact", name: "Contact page", path: "/contact" },
  { key: "refund-policy", name: "Refund policy", path: "/refund-policy", custom: true },
  { key: "privacy-policy", name: "Privacy policy", path: "/privacy-policy", custom: true },
  { key: "terms-of-service", name: "Terms of service", path: "/terms-of-service", custom: true },
  { key: "404", name: "404 page", path: "/404" },
]
const CUSTOM = ["Lookbook", "Size guide", "Stockists", "Press", "Wholesale", "Care guide", "Journal", "Gift cards"].map((name) => ({
  key: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  path: `/${name.toLowerCase().replace(/\s+/g, "-")}`,
  custom: true,
}))
const PAGES = long ? [...BASE, ...CUSTOM] : [BASE[0], BASE[1], BASE[4]]
const PRODUCTS = long
  ? ["Linen shirt", "Field notebook", "Wool scarf", "Canvas tote", "Brass pen", "Desk lamp", "Clay mug", "Rope basket"].map((title, i) => ({ id: `p${i}`, title }))
  : []

function Bar() {
  const [current, setCurrent] = useState(params.get("current") ?? "home")
  return h(
    "div",
    { className: "flex h-12 items-center justify-center bg-[#141414]" },
    h(PageSwitcher, {
      pages: PAGES,
      current,
      onSelect: setCurrent,
      onCreate: () => {},
      onDelete: () => {},
      onReload: () => {},
      products: PRODUCTS,
      onSelectProduct: () => setCurrent("product"),
    }),
  )
}

createRoot(document.getElementById("root")!).render(h(Bar))
