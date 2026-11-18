/**
 * The server half of scripts/check-ai-site-function-r56.mjs: the sections a
 * generated website can hold, drawn by the real renderer as the live site
 * prerenders them, printed as JSON.
 *
 *   agent   scripts/fixtures/ai-function-r56.storelib, a component written to
 *           the runtime contract (lib/ai-builder/runtime-contract.ts) the way
 *           the agent engine writes one: product cards with an option picker
 *           and a quantity box, add to cart, Buy now, its own cart panel,
 *           contact, sign up, a form that goes nowhere, search, links, a
 *           published booking form
 *   native  the default theme's own sections the native engine places:
 *           contact, promo_newsletter, newsletter_split, hero_product
 *
 * Products are shaped as lib/website-builder/shop-products.ts shapes them.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { chromePlatformCss } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const source = readFileSync(join(process.cwd(), "scripts/fixtures/ai-function-r56.storelib"), "utf8")
const variant = (id: string, name: string, price: string) => ({ id, name, price, compare_price: "", free: false, available: true, checkout_url: `/checkout/linen-shirt?variant=${id}` })
const card = (id: string, title: string, price: string, kind: string, variants: ReturnType<typeof variant>[] = []) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: `/img/${id}.jpg`, images: [], url: `/products/${id}`, slug: id, kind, available: true, tag: "", checkout_url: variants.length ? "" : `/checkout/${id}`, variants, description: "", description_html: "" },
})
export const PRODUCTS = [
  card("linen-shirt", "Linen shirt", "$48.00", "physical", [variant("shirt-s", "Small", "$48.00"), variant("shirt-l", "Large", "$52.00")]),
  card("lookbook-pdf", "Lookbook PDF", "$12.00", "digital"),
]
const theme = {} as ThemeSettingsValues
const draw = (section: SectionInstance, overrides?: Record<string, string>) => {
  const out = renderStorelibSection(section, theme, { template: "index" }, overrides, PRODUCTS as never)
  return out.ok ? { ok: true, html: out.html, css: out.css, section } : { ok: false, html: "", css: "", section, errors: out.errors }
}
const sec = (id: string, type: string, settings: Record<string, unknown> = {}) => ({ id, type, name: "", settings, blocks: [] }) as unknown as SectionInstance

const out = {
  agent: draw(sec("fx-1", "ai_function_r56"), { "sections/ai_function_r56.storelib": source }),
  contact: draw(sec("contact-1", "contact", { show_subject: true, show_consent: true })),
  promo_newsletter: draw(sec("promo-1", "promo_newsletter")),
  newsletter_split: draw(sec("split-1", "newsletter_split")),
  hero_product: draw(sec("hero-1", "hero_product", { button_url: "/products/lookbook-pdf", show_offers: false })),
  /* The part of every site's stylesheet the hooks rely on (a shut cart panel is not drawn), under the probe's root. */
  platformCss: chromePlatformCss("#app"),
}
process.stdout.write(JSON.stringify(out))
