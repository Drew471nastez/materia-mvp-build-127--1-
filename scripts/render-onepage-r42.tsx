/**
 * ROUND 42, for scripts/check-onepage-r42.mjs. The real published OnePage
 * (components/onepage/public-onepage) with every embed it can draw, the
 * product and link buttons in a column, in a group's carousel and in a
 * stack, an image slideshow, and a profile and wallpaper video.
 *
 *   ?theme=<template id>   a theme from the Design tab
 *   &set=embeds            every embed provider, a Calendly inline, music and videos
 *   &set=buttons           a product button, links, a group carousel and stack
 *   &set=slides            an image slideshow of four pictures
 *   &set=video             a profile video and a video wallpaper
 *
 * The providers' documents are answered by the check (stand ins that say
 * their height the way each service does).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

const pic = (n: number, w = 600, h = 450) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 47},45%,52%)"/><text x="40" y="120" font-size="90" fill="#fff">${n}</text></svg>`)}`

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  return realFetch(input as RequestInfo, init)
}

let order = 0
const b = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, enabled: true, sort_order: order++, data }) as never
const product = { product_id: "p-live", show_price: true, show_description: true, product_title: "Night Guide", product_thumbnail: pic(1), product_description: "A guide", product_price_cents: 8230, product_slug: "night-guide", product_type: "digital" }
const link = (id: string, label: string) => b("link_button", { label, url: `https://example.com/${id}` }, id)

const params = new URLSearchParams(location.search)
const named = params.get("theme") || "astrid"
const set = params.get("set") || "embeds"
const template = THEME_TEMPLATES.find((t) => t.id === named)
let theme: Record<string, unknown> = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" }

const header = b("header", { show_avatar: true, show_name: true, show_bio: true }, "header")
const sets: Record<string, never[]> = {
  embeds: [
    b("embed", { url: "https://x.com/maria/status/1234567890" }, "e_x"),
    b("embed", { url: "https://www.instagram.com/p/Cabc123/" }, "e_instagram"),
    b("embed", { url: "https://tally.so/r/w4bcde" }, "e_tally"),
    b("embed", { url: "https://maria.typeform.com/to/abc123" }, "e_typeform"),
    b("embed", { url: "https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform" }, "e_googleforms"),
    b("embed", { url: "https://maria.substack.com" }, "e_substack"),
    b("embed", { url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" }, "e_loom"),
    b("music", { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" }, "m_spotify"),
    b("video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, "v_youtube"),
    b("video", { url: "https://www.tiktok.com/@maria/video/7234567890123456789" }, "v_tiktok"),
    b("calendly", { title: "Book a call", calendly_url: "https://calendly.com/maria/intro", embed_mode: "embedded", embed_type: "inline" }, "c_inline"),
  ],
  buttons: [
    b("product", { ...product, style: "button", cta_text: "Get My Guide" }, "p_button"),
    link("l_one", "Read the blog"),
    link("l_two", "Book a session"),
    b("group", { title: "More", layout: "carousel", carousel_view: "1.2", children: [b("product", { ...product, style: "button", cta_text: "Get My Guide" }, "g_p"), link("g_l1", "Prints"), link("g_l2", "Workshops")] }, "g_carousel"),
    b("group", { title: "Also", layout: "stack", children: [b("product", { ...product, style: "button", cta_text: "Get My Guide" }, "s_p"), link("s_l1", "Newsletter")] }, "g_stack"),
  ],
  slides: [
    b("image", { image_url: pic(1), display_style: "carousel", carousel_view: "1", images: [1, 2, 3, 4].map((n) => ({ id: `i${n}`, image_url: pic(n), alt_text: `Picture ${n}`, link_url: n === 2 ? "https://example.com/two" : null })) }, "slides"),
    b("group", { title: "Links", layout: "carousel", carousel_view: "1", children: [link("gc1", "First"), link("gc2", "Second"), link("gc3", "Third")] }, "g_slides"),
    b("text", { content: "<p>" + "Words to select. ".repeat(40) + "</p>", alignment: "left" }, "words"),
  ],
  video: [b("text", { content: "<p>A page with a profile video and a video wallpaper.</p>", alignment: "center" }, "t")],
}

if (set === "video") theme = { ...theme, background_type: "video", background_video_url: "/__media/clip.webm" }
const blocks = [header, ...(sets[set] || sets.embeds)]
const page = {
  id: "op_r42",
  slug: "maria",
  title: "Maria Clay",
  bio: "Prints and guides",
  avatar_url: pic(9, 160, 160),
  avatar_video_url: set === "video" ? "/__media/clip.webm" : null,
  theme,
  settings: defaultSettings,
  social_links: {},
  blocks,
  seller_id: "seller_probe",
}
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={page as never} />)
