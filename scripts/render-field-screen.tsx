/**
 * The link picker, at phone width, inside a scroller that stands in for the
 * editor's bottom sheet. See scripts/check-field-screen.mjs.
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { LinkPicker, type LinkTarget } from "@/components/website-builder/link-picker"

const targets: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/privacy-policy", label: "Privacy Policy", kind: "page" },
  { href: "/products/a-bottle", label: "A bottle", kind: "product" },
  { href: "/products/another", label: "Another one", kind: "product" },
]

function Field() {
  const [value, setValue] = useState("/products")
  return createElement(LinkPicker, { value, onChange: setValue, targets })
}

createRoot(document.getElementById("sheet")!).render(createElement(Field))
