/**
 * Round AP's live page performance harness (scripts/check-onepage-perf-ap.mjs):
 * the real published PublicOnePage with what a full page has. A header with a
 * photo, social icons, links (one with an icon, one with a picture), a shelf
 * of digital products as a carousel (filled as the server fills it), a
 * group's carousel, an image slideshow that plays on its own, a booking
 * button, a video and a form set to open in the sheet, testimonials, an email
 * signup, a divider; on an animated gradient with a pattern. ?bg=solid draws a
 * plain colour instead.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"

const px = (n: number, w = 600, h = 600) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="hsl(${n * 47},60%,62%)"/><stop offset="1" stop-color="hsl(${n * 47 + 40},55%,40%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`)}`

const solid = new URLSearchParams(location.search).get("bg") === "solid"
let order = 0
const b = (id: string, type: string, data: Record<string, unknown>) => ({ id, type, enabled: true, sort_order: order++, data })

const items = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, kind: "digital", title: `Strength Blueprint ${i + 1}`, href: `/p/blueprint-${i}`, image: px(i + 3, 800, 1000), price_cents: 500 + i * 300 }))

const onepage = {
  id: "op_probe",
  title: "Radu Stamate",
  bio: "Fitness coach, online and in person",
  slug: "radu",
  avatar_url: px(9, 400, 400),
  avatar_video_url: null,
  avatar_video_crop: null,
  theme: (solid
    ? { background_type: "solid", background_color: "#0e0e10" }
    : { background_type: "gradient", background_gradient: "linear-gradient(160deg,#1a1a2e 0%,#3a2a5e 50%,#0e0e10 100%)", background_color: "#0e0e10", animated_gradient: true, background_pattern: "dots" }) as never,
  blocks: [
    b("h", "header", { show_avatar: true, show_name: true, show_bio: true }),
    b("s", "social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/radu" }, { platform: "tiktok", url: "https://tiktok.com/@radu" }, { platform: "youtube", url: "https://youtube.com/@radu" }] }),
    b("l1", "link_button", { label: "Work with me on WhatsApp", url: "https://wa.me/40751048522", icon: "whatsapp" }),
    b("l2", "link_button", { label: "Gym playlist", url: "https://example.com/playlist", thumbnail_url: px(4, 200, 200) }),
    b("shelf", "storelib_shelf", { source: "digital", layout: "carousel", items }),
    b("g", "group", { title: "Programs", layout: "carousel", children: [b("g1", "link_button", { label: "12 week plan", url: "https://example.com/12", thumbnail_url: px(5, 400, 300), layout_type: "pro" }), b("g2", "link_button", { label: "Meal guide", url: "https://example.com/meal", thumbnail_url: px(6, 400, 300), layout_type: "pro" }), b("g3", "link_button", { label: "Mobility", url: "https://example.com/mob", thumbnail_url: px(7, 400, 300), layout_type: "pro" })] }),
    b("img", "image", { image_url: px(2), display_style: "carousel", carousel_autoplay: true, carousel_view: "1.2", aspect_ratio: "square", border_radius: "md", images: [2, 3, 4, 5].map((n) => ({ id: `i${n}`, image_url: px(n), alt_text: `Photo ${n}` })) }),
    b("cal", "calendly", { title: "Antrenamente 1:1", button_text: "Book a session", calendly_url: "https://calendly.com/radu/30min", open_mode: "sheet" }),
    b("vid", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Gym tour", open_mode: "sheet" }),
    b("form", "contact_form", { title: "Get in touch", open_mode: "sheet" }),
    b("t", "testimonials", { title: "Clients", items: [1, 2, 3].map((n) => ({ id: `t${n}`, quote: "Lost 12kg in four months and I am stronger than ever.", name: `Client ${n}` })) }),
    b("d", "divider", {}),
    b("e", "email_capture", { headline: "Weekly training notes", button_text: "Subscribe" }),
  ] as never,
  social_links: { instagram: "https://instagram.com/radu" },
  settings: { show_branding: true, subscribe_enabled: true },
  seller_id: "seller_probe",
}

createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={onepage as never} />)
