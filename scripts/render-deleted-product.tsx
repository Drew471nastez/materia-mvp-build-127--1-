/**
 * The page from the report, drawn twice: once from the blocks as they are
 * stored, and once after they have been resolved against the catalogue.
 *
 * The stored blocks name two products. One of them has been deleted, and the
 * other has been renamed and repriced since the block was made. Both pages
 * mount the real /links component, so the probe measures the page a visitor
 * gets and not a stand-in for it.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { PublicOnePage } from "@/components/onepage/public-onepage"
import { resolveProductBlocks, type LiveProduct } from "@/lib/onepage/live-products"

const GUIDE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
const KEPT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"

const cover = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue},55%,55%)"/></svg>`,
  )}`

const storedBlocks = [
  { id: "b_header", type: "header", sort_order: 0, enabled: true, data: { show_avatar: true, show_name: true, show_bio: true } },
  {
    id: "b_guide",
    type: "product",
    sort_order: 1,
    enabled: true,
    data: {
      product_id: GUIDE,
      cta_text: "Download",
      show_price: true,
      show_description: false,
      style: "callout",
      product_title: "SEO + GEO/AEO Content Guide for Product Brands",
      product_thumbnail: cover(20),
      product_price_cents: 2900,
      product_slug: "seo-geo-aeo-content-guide",
    },
  },
  {
    id: "b_access",
    type: "product",
    sort_order: 2,
    enabled: true,
    data: {
      product_id: KEPT,
      cta_text: "Get Access",
      show_price: true,
      show_description: false,
      style: "callout",
      product_title: "Founder Office Hours",
      product_thumbnail: cover(200),
      product_price_cents: 900,
      product_slug: "office-hours-old",
    },
  },
]

/* The catalogue: the guide is gone, and the other one costs more than the block says. */
const answers = new Map<string, LiveProduct | null>([
  [GUIDE, null],
  [KEPT, { id: KEPT, title: "Founder Office Hours", slug: "office-hours", price_cents: 1200, thumbnail_url: cover(200) }],
])

const page = (blocks: unknown[]) => ({
  id: "op_probe",
  title: "Satori Studio",
  bio: "Guides and office hours",
  slug: "satori-studio",
  avatar_url: cover(280),
  avatar_video_url: null,
  avatar_video_crop: null,
  theme: {
    background_type: "solid",
    background_color: "#ffffff",
    text_color: "#1a1a2e",
    secondary_text_color: "#6b7280",
    button_color: "#1a1a2e",
    button_text_color: "#ffffff",
    button_style: "filled",
    button_border_radius: 12,
    button_border_width: 0,
    font_family: "Inter",
    spacing: "normal",
    card_width: "standard",
  } as any,
  blocks: blocks as any,
  social_links: {},
  settings: { show_branding: false, subscribe_enabled: false, analytics_enabled: false },
  seller_id: "seller_probe",
})

createRoot(document.getElementById("before")!).render(<PublicOnePage onepage={page(storedBlocks) as any} />)
createRoot(document.getElementById("after")!).render(
  <PublicOnePage onepage={page(resolveProductBlocks(storedBlocks, answers)) as any} />,
)
