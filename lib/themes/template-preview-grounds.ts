/**
 * Each template's ground, by its address: the colour its live preview waits
 * on before the website has drawn (theme-preview.tsx), at a computer's width
 * and at a phone's: the colour that holds the most of the home page's first
 * screen on its cover, or its page colour when no colour holds a fifth of it.
 * Written by scripts/build-template-previews.ts; do not edit by hand.
 */
export const TEMPLATE_PREVIEW_GROUNDS: Readonly<Record<string, { desktop: string; phone: string }>> = {
  "storelib-default": { desktop: "#fefefd", phone: "#fdfdfd" },
  "clothing": { desktop: "#120e05", phone: "#130d04" },
  "merch": { desktop: "#7b8a91", phone: "#050504" },
  "digital-products": { desktop: "#fefefe", phone: "#fefefe" },
  "art-books": { desktop: "#ffffff", phone: "#ffffff" },
  "ebooks": { desktop: "#1a1815", phone: "#ffffff" },
  "fitness": { desktop: "#070707", phone: "#080808" },
  "landing-page": { desktop: "#100f12", phone: "#161616" },
  "creator-landing": { desktop: "#fdfcfb", phone: "#fdfdfc" },
  "streetwear": { desktop: "#020202", phone: "#020817" },
  "sample-packs": { desktop: "#0a0a0c", phone: "#0a090c" },
  "templates-shop": { desktop: "#fbfbfb", phone: "#fcfbfb" },
  "space-clothing": { desktop: "#010101", phone: "#030303" },
  "posters": { desktop: "#cdc3eb", phone: "#d4c8f5" },
  "coach": { desktop: "#110f09", phone: "#130d09" },
  "vsl-course": { desktop: "#060606", phone: "#060606" },
  "online-course": { desktop: "#fefefe", phone: "#fefefe" },
  "course-landing": { desktop: "#ffffff", phone: "#fefefe" },
  "retro-merch": { desktop: "#c3c2c2", phone: "#c2c2c2" },
  "author-book": { desktop: "#1b1b1d", phone: "#1b1b1d" },
  "content-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "coach-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "digital-renaissance": { desktop: "#0e0e10", phone: "#0b0a0b" },
  "xp-merch": { desktop: "#fcf8ee", phone: "#fbfcfc" },
  "caps-tees": { desktop: "#e8e8e5", phone: "#e2e1dd" },
  "print-on-demand": { desktop: "#0b0a0a", phone: "#0b0b0b" },
  "outerwear": { desktop: "#ffffff", phone: "#cacac9" },
  "vsl-funnel": { desktop: "#fefefe", phone: "#fefefe" },
  "notion-sales-page": { desktop: "#f8f8f7", phone: "#f8f8f6" },
}
