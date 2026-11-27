/**
 * Each template's ground, by its address: the colour its live preview waits
 * on before the website has drawn (theme-preview.tsx), at a computer's width
 * and at a phone's: the colour that holds the most of the home page's first
 * screen on its cover, or its page colour when no colour holds a fifth of it.
 * Written by scripts/build-template-previews.ts; do not edit by hand.
 */
export const TEMPLATE_PREVIEW_GROUNDS: Readonly<Record<string, { desktop: string; phone: string }>> = {
  "storelib-default": { desktop: "#fefefe", phone: "#fefefe" },
  "clothing": { desktop: "#120e05", phone: "#130d04" },
  "merch": { desktop: "#7b8a91", phone: "#050504" },
  "digital-products": { desktop: "#fefefe", phone: "#fefefe" },
  "art-books": { desktop: "#ffffff", phone: "#ffffff" },
  "ebooks": { desktop: "#1a1815", phone: "#ffffff" },
  "fitness": { desktop: "#070707", phone: "#080808" },
  "landing-page": { desktop: "#100f12", phone: "#161616" },
  "creator-landing": { desktop: "#fdfcfb", phone: "#fefdfc" },
  "streetwear": { desktop: "#020303", phone: "#020817" },
  "sample-packs": { desktop: "#24211e", phone: "#1b1b1a" },
  "templates-shop": { desktop: "#fafbf9", phone: "#fafbf9" },
  "space-clothing": { desktop: "#010101", phone: "#030303" },
  "posters": { desktop: "#cdc3eb", phone: "#d4c8f5" },
  "coach": { desktop: "#15130c", phone: "#120d09" },
  "vsl-course": { desktop: "#060606", phone: "#060607" },
  "online-course": { desktop: "#fefefe", phone: "#fefefe" },
  "course-landing": { desktop: "#fefefe", phone: "#fefefe" },
  "retro-merch": { desktop: "#c3c2c2", phone: "#c2c2c2" },
  "author-book": { desktop: "#1a1816", phone: "#1a1816" },
  "content-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "coach-creator": { desktop: "#fefefe", phone: "#fefefe" },
  "personal-trainer": { desktop: "#0b0b0b", phone: "#0c0c0c" },
  "digital-renaissance": { desktop: "#0e0e10", phone: "#0b0a0b" },
  "xp-merch": { desktop: "#fcf8ee", phone: "#fbfcfc" },
  "caps-tees": { desktop: "#e2e1dd", phone: "#e2e1dd" },
  "print-on-demand": { desktop: "#0a0a0a", phone: "#0b0b0b" },
  "outerwear": { desktop: "#070d14", phone: "#ffffff" },
  "vsl-funnel": { desktop: "#0b0b0b", phone: "#0b0b0b" },
  "notion-sales-page": { desktop: "#fdfdfd", phone: "#fdfdfd" },
  "streetwear-drop": { desktop: "#f8f8f6", phone: "#f8f8f7" },
  "notion-creator": { desktop: "#ffffff", phone: "#fefefe" },
  "sound-packs": { desktop: "#0b0c14", phone: "#0b0d17" },
  "digital-studio": { desktop: "#fdfdfd", phone: "#fdfdfd" },
  "notion-template-shop": { desktop: "#f1f1ee", phone: "#f7f7f6" },
  "lut-shop": { desktop: "#0c0e10", phone: "#0e1012" },
  "challenge-funnel": { desktop: "#fbf9f5", phone: "#f3f2ee" },
}
