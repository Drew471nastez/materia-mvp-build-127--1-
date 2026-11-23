/**
 * Each template's ground, by its address: the colour its live preview waits
 * on before the website has drawn (theme-preview.tsx), at a computer's width
 * and at a phone's: the colour that holds the most of the home page's first
 * screen on its cover, or its page colour when no colour holds a fifth of it.
 * Written by scripts/build-template-previews.ts; do not edit by hand.
 */
export const TEMPLATE_PREVIEW_GROUNDS: Readonly<Record<string, { desktop: string; phone: string }>> = {
  "storelib-default": { desktop: "#fefefd", phone: "#fdfdfd" },
  "clothing": { desktop: "#e9edf4", phone: "#fefefe" },
  "merch": { desktop: "#e7e9eb", phone: "#fbfcfc" },
  "digital-products": { desktop: "#fefefe", phone: "#fefefe" },
  "art-books": { desktop: "#ffffff", phone: "#ffffff" },
  "ebooks": { desktop: "#231d18", phone: "#ffffff" },
  "fitness": { desktop: "#070707", phone: "#080808" },
  "landing-page": { desktop: "#100f12", phone: "#161616" },
  "creator-landing": { desktop: "#f4f1eb", phone: "#fdfdfc" },
  "streetwear": { desktop: "#020203", phone: "#020817" },
  "sample-packs": { desktop: "#221d2a", phone: "#3b3d43" },
  "templates-shop": { desktop: "#fcfbfc", phone: "#fcfbfb" },
  "space-clothing": { desktop: "#010101", phone: "#030303" },
  "posters": { desktop: "#d4c8f5", phone: "#d4c8f5" },
  "coach": { desktop: "#fefefe", phone: "#fefefe" },
  "vsl-course": { desktop: "#0f0f10", phone: "#070707" },
  "online-course": { desktop: "#fefefe", phone: "#fefefe" },
  "course-landing": { desktop: "#f7f7f5", phone: "#f7f7f6" },
  "retro-merch": { desktop: "#c3c2c2", phone: "#c2c2c2" },
  "author-book": { desktop: "#f5f2ec", phone: "#fdfdfc" },
  "content-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "coach-creator": { desktop: "#15130e", phone: "#14130e" },
  "digital-renaissance": { desktop: "#0b0d15", phone: "#0a0c16" },
  "xp-merch": { desktop: "#fafbfc", phone: "#fbfcfd" },
  "caps-tees": { desktop: "#e2e1dd", phone: "#e2e1dd" },
  "print-on-demand": { desktop: "#0a0a0a", phone: "#0b0b0b" },
}
