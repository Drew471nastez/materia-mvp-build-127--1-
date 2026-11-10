/**
 * Round P (P2b): the store, theme and page drawing tests/ai-templates-p2b.test.ts
 * uses, shared with scratch screenshot scripts. A real-shaped store: three
 * products, a collection, two published reviews, the template's menus.
 */
import { withImages } from "@/lib/storelib-ai/templates/kit-b"
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types"
/* The agent's own mapper (set_tokens): it makes the `site` and `site_inverse` schemes the sections name. */
import { tokensToThemeSettings } from "@/lib/ai-builder/agent/tokens"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { MOTION_TIER_SETTING } from "@/lib/storelib-ai/motion"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontData } from "@/lib/storelib-theme/types"

/* ── a real-shaped store ──────────────────────────────────────────────── */

export const PIXEL = "https://media.example.test/photo.svg"
export const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#56606a"/></svg>`

function card(id: string, title: string, slug: string, price: string, kind = "digital") {
  return {
    id,
    type: "product" as const,
    settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: PIXEL, images: [PIXEL, PIXEL], url: `/products/${slug}`, slug, kind, available: true, tag: "", checkout_url: `/checkout?productId=${id}`, variants: [] as { id: string; name: string; price: string; available: boolean; checkout_url: string }[] },
  }
}
export const PRODUCTS = [card("p1", "Starter", "starter", "$12.00"), card("p2", "Team", "team", "$49.00"), card("p3", "Studio", "studio", "$120.00", "service")]
export const CAPS: RuntimeCapabilities = {
  store: { name: "North Field", currency: "USD", brandImage: null, tagline: null },
  products: PRODUCTS.map((p) => ({ id: p.id, title: p.settings.title, kind: p.settings.kind, price: p.settings.price, url: p.settings.url, checkout_url: p.settings.checkout_url, available: true, variants: [] })),
  collections: [{ id: "c1", title: "Everything", url: "/collections/everything", products_count: 3 }],
  communities: [],
  forms: [],
  pages: [{ key: "about", title: "About", url: "/about" }, { key: "contact", title: "Contact", url: "/contact" }],
  menus: [{ handle: "main-menu", title: "Main" }, { handle: "footer", title: "Footer" }],
  blog: { posts: 0 },
  reviews: { count: 2, average: 5 },
  links: { creatorPage: null, social: [] },
  features: ["shop", "reviews"],
}
const REVIEWS = {
  enabled: true,
  sample: false,
  show_date: true,
  show_verified: true,
  all: {
    summary: { count: 2, average: 5, average_label: "5.0", percent: 100, bars: [] },
    items: [
      { id: "r1", rating: 5, title: "Clear and kind", body: "The second module changed how I plan my week. Worth it.", author: "Maya R.", initial: "M", date: "March 2026", verified: true, has_photos: false, photos: [] },
      { id: "r2", rating: 5, title: "", body: "Straight answers to every question I sent.", author: "Tom B.", initial: "T", date: "April 2026", verified: true, has_photos: false, photos: [] },
    ],
    featured_items: [],
  },
}

export function dataFor(t: SiteTemplate): StorefrontData {
  return {
    catalog: PRODUCTS as never,
    menus: (t.menus ?? {}) as never,
    collections: { c1: { id: "c1", title: "Everything", handle: "everything", description: "Every plan and add-on.", image: "", url: "/collections/everything", products_count: 3, products: PRODUCTS } } as never,
    reviews: REVIEWS as never,
    shop: { name: "North Field" },
    creator: { name: "North Field" },
    product: { id: "p2", title: "Team", price: "$49.00", compare_price: "", description: "", description_html: "<p>For teams who ship together.</p>", image: PIXEL, images: [PIXEL, PIXEL], url: "/products/team", includes: ["Five seats"], fields: {}, faqs: [], faqs_html: "" },
  } as StorefrontData
}

const TEMPLATE_OF: Record<string, string> = { home: "index", product: "product", collection: "collection" }
export const templateFor = (key: string) => TEMPLATE_OF[key] ?? `page.${key}`

export function themeOf(t: SiteTemplate): ThemeSettingsValues {
  return { ...tokensToThemeSettings(t.tokens, {}).settings, site_chrome: "home", [MOTION_TIER_SETTING]: t.tokens.motion.tier ?? "balanced" } as unknown as ThemeSettingsValues
}

export function schemaOf(source: string): { type: string; settings?: { id?: string; type: string }[]; blocks?: { type: string; settings?: { id?: string; type: string }[] }[]; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[]; kind?: string } {
  return JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(source)![1])
}

/** A page fills every picture its slots name (what P1 does), then is drawn the way the canvas and live page draw it. */
export function filled(t: SiteTemplate): SiteTemplate["pages"] {
  return withImages(t, Object.fromEntries(t.imageSlots.map((s) => [s.key, PIXEL])))
}

/** The same store with not one picture: products without images (`bare`), for the untouched-template check. */
export const BARE_PRODUCTS = PRODUCTS.map((p) => ({ ...p, settings: { ...p.settings, image: "", images: [] as string[] } }))

export function pageHtml(t: SiteTemplate, sections: SectionInstance[], key: string, opts: { bare?: boolean } = {}): { html: string; failed: string[] } {
  const theme = themeOf(t)
  const base = dataFor(t)
  const products = opts.bare ? BARE_PRODUCTS : PRODUCTS
  const data = opts.bare ? ({ ...base, catalog: BARE_PRODUCTS, product: base.product ? { ...base.product, image: "", images: [] } : null, collections: Object.fromEntries(Object.entries(base.collections ?? {}).map(([k, c]) => [k, { ...c, image: "", products: BARE_PRODUCTS }])) } as StorefrontData) : base
  const page = { template: templateFor(key), ...(key === "product" ? { product: { ...products[1], settings: { ...products[1].settings, description: "" } } } : {}) }
  const parts: string[] = []
  const bad: string[] = []
  for (const s of sections) {
    const out = renderStorelibSection(s, theme, page, t.files, products as never, data)
    if (out.ok) parts.push(`<div data-p2b="${s.id}">${out.css ? `<style>${out.css}</style>` : ""}${out.html}</div>`)
    else bad.push(`${s.id}: ${JSON.stringify((out as { errors?: unknown }).errors).slice(0, 300)}`)
  }
  const vars = Object.entries(themeVars(theme)).map(([k, v]) => `${k}:${String(v).replace(/[;"<>]/g, "")}`).join(";")
  /* The page root is an inline-size container, as on the live page and in the canvas (ThemePage.tsx): the engine writes width @media as @container. */
  return { html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}</style></head><body><div ${THEME_ROOT_ATTRIBUTE}="" style="${vars.replace(/"/g, "&quot;")};container-type:inline-size"><style>${themeStylesheet(theme)}</style>${parts.join("")}</div></body></html>`, failed: bad }
}

