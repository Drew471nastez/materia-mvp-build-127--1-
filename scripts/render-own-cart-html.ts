/**
 * The server half of scripts/check-own-cart.mjs: scripts/fixtures/own-cart.storelib
 * drawn by the real renderer, with two products shaped as lib/website-builder/
 * shop-products.ts shapes them, printed as JSON.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const source = readFileSync(join(process.cwd(), "scripts/fixtures/own-cart.storelib"), "utf8")
const card = (id: string, title: string, price: string, kind: string) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: `/img/${id}.jpg`, images: [], url: `/products/${id}`, slug: id, kind, available: true, tag: "", checkout_url: `/checkout/${id}`, variants: [] },
})
const products = [card("linen-shirt", "Linen shirt", "$48.00", "physical"), card("lookbook-pdf", "Lookbook PDF", "$12.00", "digital")]
const section = { id: "own-cart-1", type: "own_cart", settings: {}, blocks: [] } as unknown as SectionInstance
const out = renderStorelibSection(section, {} as ThemeSettingsValues, { template: "index" }, { "sections/own_cart.storelib": source }, products as never)
process.stdout.write(JSON.stringify(out.ok ? { ok: true, html: out.html, css: out.css } : { ok: false, html: "", css: "", errors: out.errors }))
