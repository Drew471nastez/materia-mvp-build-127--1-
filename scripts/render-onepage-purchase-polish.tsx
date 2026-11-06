/** Real product block/sheet/checkout, with local product facts and no payments. */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"
const picture = (width: number, height: number, color: string, label: string) =>
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="70">${label}</text></svg>`,
  )
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_probe"
const productId = "11111111-1111-4111-8111-111111111111",
  variantId = "22222222-2222-4222-8222-222222222222"
const ratio = new URLSearchParams(location.search).get("ratio") || "wide",
  image =
    ratio === "tall"
      ? picture(600, 1000, "#7f2450", "PRODUCT")
      : picture(1600, 900, "#187c69", "PRODUCT"),
  avatar = picture(600, 600, "#af6800", "CREATOR")
const cost =
  new URLSearchParams(location.search).get("price") === "paid" ? 2500 : 0
const facts = {
  product: {
    id: productId,
    title: "Gym Starter Guide",
    slug: "gym-guide",
    type: "digital",
    descriptionHtml: "<p>A complete guide, with clear steps.</p>",
    priceCents: cost,
    compareAtCents: null,
    pwyw: false,
    pwywMinCents: 0,
    currency: "USD",
    images: [image],
    variants: [
      {
        id: variantId,
        name: "Standard",
        description: null,
        priceCents: cost,
        pwyw: false,
        available: true,
        imageUrl: image,
      },
    ],
    soldOut: false,
    left: null,
    pageUrl: "/p/gym-guide",
    ships: false,
    faqs: [
      {
        question: "How does it work?",
        answer:
          "Your complete guide is available after purchase.\nYou can read it on desktop or mobile.",
      },
      {
        question: "What is included?",
        answer: "Training, nutrition and a plan.",
      },
    ],
  },
  seller: { name: "Creator account", avatarUrl: avatar },
  checkout: {
    instant: true,
    reason: null,
    url: "/checkout?productId=" + productId,
    tax: null,
    marketingOptIn: false,
    lastNameRequired: false,
  },
  buyer: null,
}
const original = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes("/api/onepage/product?"))
    return new Response(JSON.stringify(facts), {
      headers: { "Content-Type": "application/json" },
    })
  return original(input, init)
}
Object.assign(globalThis, { PROBE_USER: null, __polishImage: image })
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
        theme: {
          ...defaultTheme,
          background_type: "gradient",
          background_gradient: "linear-gradient(150deg,#142b25,#22475b)",
          background_color: "#142b25",
          text_color: "#ffffff",
          header_layout: "hero",
        },
        settings: defaultSettings,
        blocks: [
          {
            id: "header",
            type: "header",
            enabled: true,
            sort_order: 0,
            data: { show_name: true, show_avatar: true, show_bio: true },
          },
          {
            id: "product",
            type: "product",
            enabled: true,
            sort_order: 1,
            data: {
              product_id: productId,
              product_title: "Gym Starter Guide",
              product_thumbnail: image,
              product_price_cents: cost,
              product_slug: "gym-guide",
              product_type: "digital",
              show_price: true,
              show_description: true,
              style: "callout",
              style_chosen: true,
              tap_action: "sheet",
              instant_checkout: true,
              cta_text: "View guide",
            },
          },
        ],
      } as any
    }
  />,
)
