/**
 * Each template's ground, by its address: the colour its live preview waits
 * on before the website has drawn (theme-preview.tsx), at a computer's width
 * and at a phone's: the colour that holds the most of the home page's first
 * screen on its cover, or its page colour when no colour holds a fifth of it.
 * Written by scripts/build-template-previews.ts; do not edit by hand.
 */
export const TEMPLATE_PREVIEW_GROUNDS: Readonly<Record<string, { desktop: string; phone: string }>> = {
  "storelib-default": { desktop: "#fefefd", phone: "#fdfdfd" },
  "clothing": { desktop: "#ffffff", phone: "#ffffff" },
  "merch": { desktop: "#ffffff", phone: "#ffffff" },
  "digital-products": { desktop: "#fefefe", phone: "#fefefe" },
  "art-books": { desktop: "#ffffff", phone: "#ffffff" },
  "ebooks": { desktop: "#fefefe", phone: "#fefefe" },
  "fitness": { desktop: "#070707", phone: "#080808" },
  "landing-page": { desktop: "#100f12", phone: "#161616" },
  "creator-landing": { desktop: "#fdfcfb", phone: "#fdfdfc" },
  "streetwear": { desktop: "#020203", phone: "#fbfaf8" },
  "sample-packs": { desktop: "#0b0b0e", phone: "#0b0b0e" },
  "templates-shop": { desktop: "#fcfbfc", phone: "#fcfbfb" },
  "space-clothing": { desktop: "#010101", phone: "#030303" },
  "posters": { desktop: "#fffdf8", phone: "#fffdf8" },
  "coach": { desktop: "#fefefe", phone: "#fefefe" },
  "vsl-course": { desktop: "#060606", phone: "#070707" },
  "online-course": { desktop: "#fefefe", phone: "#fefefe" },
  "course-landing": { desktop: "#f7f7f5", phone: "#f7f7f6" },
  "retro-merch": { desktop: "#ffffff", phone: "#ffffff" },
  "author-book": { desktop: "#f5f2ec", phone: "#fdfdfc" },
  "content-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "coach-creator": { desktop: "#15130e", phone: "#14130e" },
  "digital-renaissance": { desktop: "#06070b", phone: "#06080c" },
  "xp-merch": { desktop: "#ffffff", phone: "#fbfcfd" },
}
