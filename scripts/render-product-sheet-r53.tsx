/**
 * ROUND 53, FOR scripts/check-product-sheet-r53.mjs: the OnePage's product sheet with pictures and a video.
 *
 *   ?theme=<id>      a OnePage with two products that open the sheet:
 *                      p-tee    a shirt with five pictures, colour and size, a size chart and four questions
 *                      p-clip   a product whose gallery is a picture, a video (with its stored first frame), a picture
 *   &cold            the blocks do not build the sheet ahead (no `warm`): the product is read on the tap
 *   &thumb=<url>     the block's own picture differs from the product's first (a creator's custom thumbnail)
 *
 * The network is stubbed: /api/onepage/product answers here. Videos are served from /__media/ by the probe server.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

const px = (n: number, w = 600, h = 600, label = "") =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${n * 47},45%,62%)"/><stop offset="1" stop-color="hsl(${n * 47 + 40},40%,36%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.5}" cy="${h * 0.45}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,0.28)"/><text x="50%" y="88%" font-family="sans-serif" font-size="${Math.round(h / 14)}" fill="rgba(255,255,255,0.85)" text-anchor="middle">${label}</text></svg>`)}`
const white = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="600" height="750" fill="#fafafa"/><rect x="170" y="150" width="260" height="380" rx="30" fill="#e8e8ea"/></svg>`)}`

const params = new URLSearchParams(location.search)
const ext = params.get("ext") || "webm"
const VIDEO = `/__media/clip-1700000000-${ext === "mp4" ? "abd" : "abc"}-4s.${ext}`
const TEE = { black: px(0, 600, 750, "Black"), sand: px(1, 600, 750, "Sand"), ocean: px(4, 600, 750, "Ocean") }
const SIZES = ["S", "M", "L", "XL"]
const COLORS = ["Black", "Sand", "Ocean"]
const teeVariants = COLORS.flatMap((c, ci) =>
  SIZES.map((s) => ({
    id: `v-${c}-${s}`,
    name: `${c} / ${s}`,
    description: null,
    priceCents: 3900,
    pwyw: false,
    options: [c, s, null],
    imageUrl: [TEE.black, TEE.sand, TEE.ocean][ci],
    compareAtCents: 6000,
    available: true,
    left: null,
    maxQuantity: 5,
  })),
)

const shipped = (id: string, title: string, images: string[], extra: Record<string, unknown> = {}) => ({
  product: {
    id,
    title,
    slug: id,
    type: "physical",
    descriptionHtml: "<p>Boxy fit, 240 gsm organic cotton.</p>",
    priceCents: 3900,
    compareAtCents: 6000,
    pwyw: false,
    pwywMinCents: 0,
    currency: "eur",
    images,
    variants: [],
    soldOut: false,
    left: null,
    pageUrl: `/p/${id}`,
    ships: true,
    shopId: "seller_probe",
    maxQuantity: 5,
    faqs: [
      { question: "When does it ship?", answer: "Within two working days." },
      { question: "Can I return it?", answer: "Within 30 days, unworn." },
      { question: "How does it fit?", answer: "Boxy. Take your usual size." },
      { question: "How do I wash it?", answer: "Cold, inside out." },
    ],
    sizeChart: null,
    options: [],
    personalization: [],
    ...extra,
  },
  seller: { name: "Satori Studio", avatarUrl: px(9, 120, 120) },
  checkout: { instant: false, reason: "This one is bought on its checkout page.", url: `/checkout?productId=${id}`, tax: null, marketingOptIn: false, lastNameRequired: false },
  buyer: null,
})

const facts: Record<string, unknown> = {
  "p-tee": shipped("p-tee", "Heavyweight Logo Tee", [TEE.black, white, px(6, 600, 750, "Detail")], {
    variants: teeVariants,
    sizeChart: { name: "Tees", unit: "cm", columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }], rows: [["S", "96"], ["M", "102"], ["L", "108"], ["XL", "114"]], notes: "", imageUrl: null },
    options: [
      { name: "Color", values: COLORS },
      { name: "Size", values: SIZES },
    ],
  }),
  "p-clip": shipped("p-clip", "Studio Overshirt", [px(3, 600, 750, "Front"), VIDEO, px(5, 600, 750, "Back")]),
}

const delay = Number(params.get("delay") || 0)
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/onepage/product") {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    const f = facts[url.searchParams.get("id") || ""]
    return f ? json(f) : json({ error: "This product is not for sale right now." }, 404)
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
  return realFetch(input as RequestInfo, init)
}

let order = 0
const b = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, enabled: true, sort_order: type === "header" ? -1 : order++, data }) as any
const thumb = params.get("thumb")
const tee = { product_id: "p-tee", product_title: "Heavyweight Logo Tee", product_thumbnail: TEE.black, ...(thumb ? { custom_thumbnail: px(8, 400, 400, "Block") } : {}), product_price_cents: 3900, product_compare_at_cents: 6000, product_slug: "p-tee", product_type: "physical", show_price: true }
const clip = { product_id: "p-clip", product_title: "Studio Overshirt", product_thumbnail: px(3, 600, 750, "Front"), product_price_cents: 3900, product_compare_at_cents: 6000, product_slug: "p-clip", product_type: "physical", show_price: true }

const named = params.get("theme") || "default"
const template = THEME_TEMPLATES.find((t) => t.id === named)
const theme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" }
const blocks = [
  b("header", { show_avatar: true, show_name: true, show_bio: false }, "header"),
  b("product", { ...tee, style: "callout", cta_text: "See it", tap_action: "sheet" }, "k_tee"),
  b("product", { ...clip, style: "row", cta_text: "See it", tap_action: "sheet" }, "k_clip"),
]
const page = { id: "op_r53", slug: "satori", title: "Satori Studio", bio: "", avatar_url: px(9, 120, 120), theme, settings: defaultSettings, social_links: {}, blocks, seller_id: "seller_probe" }
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={page as any} />)
