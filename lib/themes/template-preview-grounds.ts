/**
 * Each template's ground, by its address: the colour its live preview waits
 * on before the website has drawn (theme-preview.tsx), at a computer's width
 * and at a phone's: the colour that holds the most of the home page's first
 * screen on its cover, or its page colour when no colour holds a fifth of it.
 * Written by scripts/build-template-previews.ts; do not edit by hand.
 */
export const TEMPLATE_PREVIEW_GROUNDS: Readonly<Record<string, { desktop: string; phone: string }>> = {
  "storelib-default": { desktop: "#fdfefd", phone: "#fdfdfd" },
  "clothing": { desktop: "#f7f9f9", phone: "#fcfdfd" },
  "merch": { desktop: "#7b8a91", phone: "#050504" },
  "digital-products": { desktop: "#fefefe", phone: "#fefefe" },
  "art-books": { desktop: "#ffffff", phone: "#ffffff" },
  "ebooks": { desktop: "#231d18", phone: "#ffffff" },
  "fitness": { desktop: "#070707", phone: "#080808" },
  "landing-page": { desktop: "#100f11", phone: "#161616" },
  "creator-landing": { desktop: "#f4f1eb", phone: "#fdfdfc" },
  "streetwear": { desktop: "#020203", phone: "#020817" },
  "sample-packs": { desktop: "#0a0a0c", phone: "#0a090c" },
  "templates-shop": { desktop: "#fbfbfb", phone: "#fcfbfb" },
  "space-clothing": { desktop: "#010101", phone: "#030303" },
  "posters": { desktop: "#d4c8f5", phone: "#d4c8f5" },
  "coach": { desktop: "#110f09", phone: "#120d09" },
  "vsl-course": { desktop: "#060606", phone: "#060606" },
  "online-course": { desktop: "#fefefe", phone: "#fefefe" },
  "course-landing": { desktop: "#ffffff", phone: "#fefefe" },
  "retro-merch": { desktop: "#c3c2c2", phone: "#c2c2c2" },
  "author-book": { desktop: "#e8e8e6", phone: "#e8e8e6" },
  "content-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "coach-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "digital-renaissance": { desktop: "#15140c", phone: "#15140b" },
  "xp-merch": { desktop: "#faf8ed", phone: "#fbfcfd" },
  "caps-tees": { desktop: "#e2e1dd", phone: "#e2e1dd" },
  "print-on-demand": { desktop: "#0a0a0a", phone: "#0b0b0b" },
}
