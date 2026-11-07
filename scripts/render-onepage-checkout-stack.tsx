/**
 * The real OnePage product block, product sheet and instant checkout, for scripts/check-onepage-checkout-stack.mjs.
 *
 * The product's main picture is made the way the product editor stores a digital product's cover
 * (processImageToWidescreen in app/(storelib)/app/products/new/product-editor.tsx): a 3:4 portrait drawn
 * in the middle of a 1280x720 light grey canvas, saved as JPEG. That padding is the owner's "empty white
 * bars". The creator's avatar is a different colour, so the probe can tell which one a frame shows.
 *
 *   ?price=free|paid|variants|physical   what is sold
 *   &preview=1                            inside the editor's preview (nothing is charged)
 *   &tap=checkout                         the block's button opens the checkout itself, no sheet
 *   &cover=1                              the product has its cover as uploaded (SQL part 377): the block carries
 *                                         product_cover and the facts' first picture is that unpadded 3:4 file
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const kind = params.get("price") || "free"
if (params.get("preview")) (window as Window & { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

/** A portrait ebook cover: a saturated ground with stripes, so a crop of it is never mistaken for a bar. */
function cover(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#7f2450"
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = "#b8336a"
  for (let i = 0; i < 12; i++) ctx.fillRect(x, y + (i * h) / 12, w, h / 48)
  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${Math.round(w / 12)}px sans-serif`
  ctx.textAlign = "center"
  ctx.fillText("GUIDE", x + w / 2, y + h / 2)
}

/** What the product editor uploads for a portrait cover: letterboxed into 16:9 on a light grey gradient. */
function paddedThumbnail(): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext("2d")!
  const gradient = ctx.createLinearGradient(0, 0, 1280, 720)
  gradient.addColorStop(0, "#f8f8f8")
  gradient.addColorStop(0.5, "#f0f0f0")
  gradient.addColorStop(1, "#e8e8e8")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1280, 720)
  cover(ctx, (1280 - 540) / 2, 0, 540, 720)
  return canvas.toDataURL("image/jpeg", 0.92)
}

function plain(width: number, height: number, color: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = "rgba(255,255,255,0.25)"
  for (let i = 0; i < 10; i++) ctx.fillRect((i * width) / 10, 0, width / 40, height)
  return canvas.toDataURL("image/png")
}

const image = paddedThumbnail()
/* The cover as uploaded: the same portrait, unpadded. */
const uploaded = (() => {
  const canvas = document.createElement("canvas")
  canvas.width = 540
  canvas.height = 720
  cover(canvas.getContext("2d")!, 0, 0, 540, 720)
  return canvas.toDataURL("image/jpeg", 0.92)
})()
const withCover = !!params.get("cover")
const tap = params.get("tap") === "checkout" ? "checkout" : "sheet"
const second = plain(1600, 900, "#187c69")
const avatar = plain(600, 600, "#af6800")
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_probe"
const productId = "11111111-1111-4111-8111-111111111111"
const cost = kind === "free" ? 0 : 2500
const physical = kind === "physical"
const variants =
  kind === "variants"
    ? [
        { id: "22222222-2222-4222-8222-222222222222", name: "Standard", description: null, priceCents: 2500, pwyw: false, available: true, imageUrl: null },
        { id: "33333333-3333-4333-8333-333333333333", name: "Deluxe", description: null, priceCents: 4000, pwyw: false, available: true, imageUrl: null },
      ]
    : [{ id: "22222222-2222-4222-8222-222222222222", name: "Standard", description: null, priceCents: cost, pwyw: false, available: true, imageUrl: null }]

const facts = {
  product: {
    id: productId,
    title: "Gym Starter Guide",
    slug: "gym-guide",
    type: physical ? "physical" : "digital",
    descriptionHtml: "<p>A complete guide, with clear steps.</p>",
    priceCents: kind === "variants" ? 2500 : cost,
    compareAtCents: null,
    pwyw: false,
    pwywMinCents: 0,
    currency: "USD",
    images: [withCover ? uploaded : image, second],
    variants,
    soldOut: false,
    left: null,
    pageUrl: "/p/gym-guide",
    ships: physical,
    ...(physical ? { shopId: "shop", siteOrigin: "https://shop.example.com", maxPerOrder: null } : {}),
    faqs: [
      { question: "How does it work?", answer: "Your guide is available right after purchase.\nRead it on a computer or a phone." },
      { question: "What is included?", answer: "Training, nutrition and a plan." },
    ],
  },
  seller: { name: "Creator account", avatarUrl: avatar },
  checkout: { instant: !physical, reason: null, url: "/checkout?productId=" + productId, tax: null, marketingOptIn: false, lastNameRequired: false },
  buyer: null,
}

const original = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes("/api/onepage/product?")) return new Response(JSON.stringify(facts), { headers: { "Content-Type": "application/json" } })
  return original(input, init)
}
Object.assign(globalThis, { PROBE_USER: null, __productImage: withCover ? uploaded : image, __avatar: avatar })

/* A page taller than the screen, scrolled a little before the sheet opens, so a scroll jump shows. */
document.body.style.paddingBottom = "1600px"

createRoot(document.getElementById("app")!).render(
  <PublicOnePage
    onepage={
      {
        id: "onepage",
        owner_id: "owner",
        seller_id: "seller",
        slug: "creator",
        title: "Creator account",
        bio: "Training and coaching",
        avatar_url: avatar,
        theme: { ...defaultTheme, background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e" },
        settings: defaultSettings,
        blocks: [
          { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_name: true, show_avatar: true, show_bio: true } },
          {
            id: "product",
            type: "product",
            enabled: true,
            sort_order: 1,
            data: {
              product_id: productId,
              product_title: "Gym Starter Guide",
              product_thumbnail: image,
              ...(withCover ? { product_cover: uploaded } : {}),
              product_price_cents: kind === "variants" ? 2500 : cost,
              product_slug: "gym-guide",
              product_type: physical ? "physical" : "digital",
              show_price: true,
              show_description: true,
              style: "callout",
              style_chosen: true,
              tap_action: tap,
              instant_checkout: true,
              cta_text: "View guide",
            },
          },
        ],
      } as never
    }
  />,
)
