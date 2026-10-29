/**
 * ROUND 43, FOR scripts/check-onepage-r43.mjs: the product sheet, the email signup's eight layouts, product blocks
 * under every product layout, and the editor's pickers.
 *
 *   ?sheet&theme=<id>              a product that ships (colour swatches, an image swatch, sizes with one sold out, a
 *                                  size chart, personalization, a sale price) and a download with two licences,
 *                                  both opening the sheet; the shipped one with "Price on the button"
 *   ?signup&theme=<id>             one email signup in each of the eight layouts
 *   ?products&theme=<id>&pl=<own|grid|rows>   product blocks in every layout, under the theme's product layout
 *   ?editor[&tab=design]           the editor, for the layout pickers and the theme cards
 *
 * The network is stubbed: /api/onepage/product answers here, nothing leaves.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

const px = (n: number, w = 600, h = 600, label = "") =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${n * 47},45%,62%)"/><stop offset="1" stop-color="hsl(${n * 47 + 40},40%,36%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.5}" cy="${h * 0.45}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,0.28)"/><text x="50%" y="88%" font-family="sans-serif" font-size="${Math.round(h / 14)}" fill="rgba(255,255,255,0.85)" text-anchor="middle">${label}</text></svg>`)}`
const white = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fafafa"/><rect x="170" y="150" width="260" height="300" rx="30" fill="#e8e8ea"/></svg>`)}`

const TEE = { black: px(0, 600, 600, "Black"), sand: px(1, 600, 600, "Sand"), ocean: px(4, 600, 600, "Ocean") }
const SIZES = ["S", "M", "L", "XL"]
const COLORS = ["Black", "Sand", "Ocean"]
const teeVariants = COLORS.flatMap((c, ci) =>
  SIZES.map((s, si) => ({
    id: `v-${c}-${s}`,
    name: `${c} / ${s}`,
    description: null,
    priceCents: s === "XL" ? 4900 : 4500,
    pwyw: false,
    options: [c, s, null],
    imageUrl: [TEE.black, TEE.sand, TEE.ocean][ci],
    compareAtCents: 5900,
    available: !(c === "Sand" && s === "M") && !(c === "Ocean" && s === "S"),
    left: c === "Black" && s === "L" ? 3 : null,
    maxQuantity: 5,
    _si: si,
  })),
).map(({ _si, ...v }) => v)

const facts: Record<string, unknown> = {
  "p-tee": {
    product: {
      id: "p-tee",
      title: "Heavyweight Logo Tee",
      slug: "logo-tee",
      type: "physical",
      descriptionHtml: "<p>Boxy fit, 240 gsm organic cotton, printed in Lisbon.</p><ul><li>Pre-shrunk</li><li>Machine wash cold</li></ul>",
      priceCents: 4500,
      compareAtCents: 5900,
      pwyw: false,
      pwywMinCents: 0,
      currency: "eur",
      images: [TEE.black, white, px(6, 600, 600, "Detail")],
      variants: teeVariants,
      soldOut: false,
      left: null,
      pageUrl: "/p/logo-tee",
      ships: true,
      shopId: "seller_probe",
      maxQuantity: 5,
      faqs: [{ question: "When does it ship?", answer: "Within two working days." }],
      sizeChart: { name: "Tees", unit: "cm", columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }], rows: [["S", "96", "68"], ["M", "102", "71"], ["L", "108", "74"], ["XL", "114", "77"]], notes: "Measured flat, side to side.", imageUrl: null },
      options: [
        { name: "Color", values: COLORS, swatches: { Ocean: "photo" } },
        { name: "Size", values: SIZES },
      ],
      personalization: [{ id: "f1name", label: "Name on the sleeve", type: "text", required: false, maxLength: 16, placeholder: "Up to 16 letters", help: "" }],
    },
    seller: { name: "Satori Studio", avatarUrl: px(9, 120, 120) },
    checkout: { instant: false, reason: "This one is bought on its checkout page.", url: "/checkout?productId=p-tee", tax: null, marketingOptIn: false, lastNameRequired: false },
    buyer: null,
  },
  "p-pack": {
    product: {
      id: "p-pack",
      title: "Tech House Master Bundle",
      slug: "tech-house",
      type: "digital",
      descriptionHtml: "<p>Two hundred kicks, eighty loops and twelve presets.</p>",
      priceCents: 2900,
      compareAtCents: null,
      pwyw: false,
      pwywMinCents: 0,
      currency: "eur",
      images: [px(2, 600, 450), px(3, 600, 450)],
      variants: [
        { id: "lic-basic", name: "Personal", description: null, priceCents: 2900, pwyw: false },
        { id: "lic-pro", name: "Commercial", description: null, priceCents: 7900, pwyw: false },
      ],
      soldOut: false,
      left: null,
      pageUrl: "/p/tech-house",
      ships: false,
    },
    seller: { name: "Satori Studio", avatarUrl: px(9, 120, 120) },
    checkout: { instant: true, reason: null, url: "/checkout?productId=p-pack", tax: null, marketingOptIn: false, lastNameRequired: false },
    buyer: null,
  },
}

const realFetch = window.fetch.bind(window)
;(window as any).__posts = []
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/onepage/product") {
    const f = facts[url.searchParams.get("id") || ""]
    return f ? json(f) : json({ error: "This product is not for sale right now." }, 404)
  }
  if (url.pathname.startsWith("/api/onepage/leads")) {
    ;(window as any).__posts.push(String(init?.body ?? ""))
    return json({ ok: true, lead_id: "lead1" })
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
  return realFetch(input as RequestInfo, init)
}
try {
  localStorage.setItem("onepage-onboarding-completed", "true")
} catch {}

let order = 0
const b = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, enabled: true, sort_order: type === "header" ? -1 : order++, data }) as any
const tee = { product_id: "p-tee", product_title: "Heavyweight Logo Tee", product_thumbnail: TEE.black, product_description: "Boxy fit, organic cotton", product_price_cents: 4500, product_compare_at_cents: 5900, product_slug: "logo-tee", product_type: "physical", show_price: true, show_description: true }
const pack = { product_id: "p-pack", product_title: "Tech House Master Bundle", product_thumbnail: px(2, 600, 450), product_description: "Kicks, loops and presets", product_price_cents: 2900, product_slug: "tech-house", product_type: "digital", show_price: true, show_description: true }

const params = new URLSearchParams(location.search)
const named = params.get("theme") || "default"
const template = THEME_TEMPLATES.find((t) => t.id === named)
const pl = params.get("pl")
const theme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default", ...(pl ? { product_layout: pl === "own" ? null : pl } : {}) }

const signupBase = { headline: "Letters from the studio", description: "One email a month: new prints and the stories behind them.", placeholder: "Your email", success_message: "Thanks, you are in." }
const signupBlocks = ["default", "pro", "cover", "bold", "minimal", "connect", "letter", "bar"].map((layout) =>
  b("email_capture", { ...signupBase, layout_type: layout, ...(layout === "connect" ? { button_preset: "custom", custom_button_text: "Connect with" } : {}) }, `s_${layout}`),
)
const productStyles = ["callout", "row", "preview", "side", "tile", "tile", "overlay", "minimal", "button"]
/* ?plain: products as a creator adds them (no layout picked), five in a row, then two inside a group. */
const plainBlocks = [
  ...[0, 1, 2, 3, 4].map((i) => b("product", { ...(i % 2 ? pack : tee), cta_text: "Buy" }, `q_${i}`)),
  b("link_button", { label: "Shop the prints", url: "https://example.com/shop" }, "q_link"),
  b("group", { title: "Bundles", layout: "stack", children: [0, 1].map((i) => ({ id: `qg_${i}`, type: "product", enabled: true, sort_order: i, data: { ...(i ? pack : tee), cta_text: "Buy" } })) }, "q_group"),
]
const productBlocks = params.has("plain") ? plainBlocks : productStyles.map((style, i) => b("product", { ...(i % 2 ? pack : tee), style, cta_text: "Buy", ...(params.get("chosen") ? { style_chosen: true } : {}) }, `p_${style}_${i}`))

/* ?links&bl=<list|grid|cards|compact>: what Design › Layout and each block's own Layout tab set. */
const linkBlocks = [
  b("link_button", { label: "Shop the prints", url: "https://example.com/shop" }, "n_1"),
  b("link_button", { label: "Late night mix", url: "https://example.com/mix" }, "n_2"),
  b("link_button", { label: "Studio tour", url: "https://example.com/tour", thumbnail_url: px(5, 400, 300) }, "n_thumb"),
  b("link_button", { label: "New collection", url: "https://example.com/new", thumbnail_url: px(7, 800, 450), layout_type: "pro" }, "n_pro"),
  b("link_button", { label: "Booking", url: "https://example.com/book" }, "n_3"),
  b("image", { images: [0, 1, 2].map((i) => ({ id: `im${i}`, image_url: px(i + 2, 400, 400) })), display_style: "grid", grid_columns: 3, aspect_ratio: "square" }, "n_img"),
  b("group", { title: "More", layout: "carousel", children: [0, 1, 2].map((i) => ({ id: `ng_${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Card ${i + 1}`, url: "https://example.com", thumbnail_url: px(i + 4, 400, 300), layout_type: "pro" } })) }, "n_group"),
]
const bl = params.get("bl")
if (bl) (theme as Record<string, unknown>).block_layout = bl

const liveBlocks = params.has("links")
  ? [b("header", { show_avatar: true, show_name: true, show_bio: false }, "header"), ...linkBlocks]
  : params.has("sheet")
  ? [
      b("header", { show_avatar: true, show_name: true, show_bio: true }, "header"),
      b("product", { ...tee, style: "callout", cta_text: "See it", tap_action: "sheet", sheet_button_price: true }, "k_tee"),
      b("product", { ...pack, style: "row", cta_text: "See it", tap_action: "sheet", instant_checkout: true }, "k_pack"),
    ]
  : params.has("signup")
    ? [b("header", { show_avatar: true, show_name: true, show_bio: true }, "header"), ...signupBlocks]
    : [b("header", { show_avatar: true, show_name: true, show_bio: false }, "header"), ...productBlocks]

const root = createRoot(document.getElementById("app")!)
if (location.pathname.startsWith("/onepage-preview")) {
  root.render(<OnePagePreviewDocument />)
} else if (params.has("editor")) {
  const onepage: OnePage = {
    id: "op_r43",
    owner_id: "probe-user",
    slug: "satori",
    title: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    avatar_url: px(9, 120, 120),
    theme: theme as never,
    settings: defaultSettings,
    social_links: { instagram: "https://instagram.com/satori" },
    draft_blocks: [
      b("link_button", { label: "Shop the prints", url: "https://example.com/shop" }, "e_link"),
      b("product", { ...tee, style: "callout", cta_text: "Buy" }, "e_tee"),
      b("email_capture", { ...signupBase, layout_type: "connect", button_preset: "custom", custom_button_text: "Connect with" }, "e_sign"),
    ],
    status: "published",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    onboarding_completed: true,
  } as OnePage
  root.render(<OnePageEditor initialOnePage={onepage} />)
} else {
  const page = { id: "op_r43", slug: "satori", title: "Satori Studio", bio: "Prints, posters and a newsletter", avatar_url: px(9, 120, 120), theme, settings: defaultSettings, social_links: {}, blocks: liveBlocks, seller_id: "seller_probe" }
  root.render(<PublicOnePage onepage={page as any} />)
}
