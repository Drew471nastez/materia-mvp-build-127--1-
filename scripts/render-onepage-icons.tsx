/**
 * The published /links page with every mark it can be asked to draw, for
 * scripts/check-onepage-icons.mjs.
 *
 * One social row holding all 22 platforms the editor offers, each with an
 * address, and one link button per icon in the editor's thumbnail picker,
 * labelled `icon:<name>` so the probe can find each button's picture. The
 * icon list is read from components/onepage/link-icons.ts, the same list the
 * picker shows, so an icon added there is probed without touching this file.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { ONEPAGE_SOCIAL_PLATFORMS } from "@/components/onepage/brand-icons"
import { LINK_ICONS } from "@/components/onepage/link-icons"

const ADDRESS: Record<string, string> = {
  email: "mara@example.com",
  whatsapp: "+44 7700 900123",
  website: "mara.studio",
  applemusic: "https://music.apple.com/us/artist/mara/123",
  spotify: "https://open.spotify.com/artist/abc",
}

const platforms = ONEPAGE_SOCIAL_PLATFORMS.map((p) => ({ platform: p.key, url: ADDRESS[p.key] ?? `@mara` }))

const links = LINK_ICONS.map((icon, i) => ({
  id: `b_icon_${icon.id}`,
  type: "link_button",
  sort_order: 2 + i,
  enabled: true,
  data: { label: `icon:${icon.id}`, url: "https://example.com", icon: icon.id },
}))

/* Three buttons with no icon chosen, whose mark comes from the address. */
const detected = [
  ["wa", "https://wa.me/447700900123"],
  ["tg", "https://t.me/mara"],
  ["ig-dot-me", "https://instagram.com/robert.meyer"],
].map(([id, url], i) => ({
  id: `b_url_${id}`,
  type: "link_button",
  sort_order: 2 + links.length + i,
  enabled: true,
  data: { label: `url:${id}`, url },
}))

const onepage = {
  id: "op_icons",
  title: "Mara Studio",
  bio: "Prints and posters",
  slug: "mara-studio",
  avatar_url: null,
  avatar_video_url: null,
  avatar_video_crop: null,
  theme: {
    background_type: "solid",
    background_color: "#101014",
    text_color: "#ffffff",
    button_color: "#ffffff",
    button_text_color: "#101014",
    button_style: "rounded",
    font_family: "Inter",
    spacing: "normal",
    social_icon_style: "filled",
    social_icon_color: "#ffffff",
  } as any,
  blocks: [
    { id: "b_header", type: "header", sort_order: 0, enabled: true, data: { show_avatar: false, show_name: true, show_bio: true } },
    { id: "b_social", type: "social_row", sort_order: 1, enabled: true, data: { platforms, style: "icons" } },
    ...links,
    ...detected,
  ] as any,
  social_links: {},
  settings: { show_branding: false },
  seller_id: "seller_probe",
}

/* What the probe expects to find, from the same lists. */
;(window as any).__iconProbe = { ONEPAGE_KEYS: ONEPAGE_SOCIAL_PLATFORMS.map((p) => p.key), LINK_IDS: LINK_ICONS.map((i) => i.id) }

createRoot(document.getElementById("root")!).render(<PublicOnePage onepage={onepage as any} />)
