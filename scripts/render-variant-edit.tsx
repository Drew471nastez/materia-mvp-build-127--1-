/**
 * Mounts the checkout's option picker (app/(storelib)/checkout/parts/variant-edit.tsx)
 * for scripts/check-variant-edit.mjs: a hoodie with Size and Colour (one
 * combination sold out) and an ebook with two editions, each on a line as
 * the checkout draws it. `window.__picked` is what the page was asked to
 * change each line to.
 */
import { createRoot } from "react-dom/client"
import { createElement, useState } from "react"
import { VariantEdit } from "@/app/(storelib)/checkout/parts/variant-edit"
import type { VariantChoices } from "@/lib/checkout/variant-choices"

const hoodie: VariantChoices = {
  options: [{ name: "Size", values: ["S", "M", "L"] }, { name: "Colour", values: ["Black", "Grey"] }],
  variants: [
    { id: "s-b", name: "S / Black", values: ["S", "Black"], priceCents: 4500, available: true },
    { id: "m-b", name: "M / Black", values: ["M", "Black"], priceCents: 4500, available: true },
    { id: "l-b", name: "L / Black", values: ["L", "Black"], priceCents: 4900, available: false },
    { id: "s-g", name: "S / Grey", values: ["S", "Grey"], priceCents: 4500, available: true },
    { id: "m-g", name: "M / Grey", values: ["M", "Grey"], priceCents: 4500, available: true },
    { id: "l-g", name: "L / Grey", values: ["L", "Grey"], priceCents: 4900, available: true },
  ],
}
const ebook: VariantChoices = {
  options: [],
  variants: [
    { id: "std", name: "Standard", values: [], priceCents: 1500, available: true },
    { id: "dlx", name: "Deluxe", values: [], priceCents: 2900, available: true },
  ],
}
declare global {
  interface Window { __picked: Record<string, string[]>; __ready: boolean }
}
window.__picked = { hoodie: [], ebook: [] }

function Line({ name, title, choices, start }: { name: string; title: string; choices: VariantChoices; start: string }) {
  const [id, setId] = useState(start)
  const v = choices.variants.find((x) => x.id === id)!
  return createElement("li", { "data-line": name, className: "flex items-start gap-3.5" },
    createElement("div", { className: "h-12 w-12 shrink-0 rounded-[8px] border border-black/[0.06] bg-[#f3f4f6]" }),
    createElement("div", { className: "min-w-0 flex-1" },
      createElement("p", { className: "line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]" }, title),
      createElement(VariantEdit, { choices, currentId: id, currentName: v.name, title, onChange: (next: string) => { window.__picked[name].push(next); setId(next) } }),
    ),
    createElement("p", { className: "shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]" }, `$${(v.priceCents / 100).toFixed(2)}`),
  )
}

function Page() {
  return createElement("ul", { className: "mx-auto mt-10 max-w-[420px] space-y-5 rounded-2xl bg-[#f8f9fa] p-6" },
    createElement(Line, { key: "h", name: "hoodie", title: "Hoodie", choices: hoodie, start: "m-b" }),
    createElement(Line, { key: "e", name: "ebook", title: "Field guide", choices: ebook, start: "std" }),
  )
}
createRoot(document.getElementById("mount")!).render(createElement(Page))
window.__ready = true
