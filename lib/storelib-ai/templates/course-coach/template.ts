import { filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types-b"
import * as S from "./sections"

const head = () => place(S.header, "hdr", {}, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      sections: [
        head(),
        place(S.hero, "hero"),
        place(S.strip, "strip"),
        place(S.outcomes, "outcomes"),
        place(S.curriculum, "lessons"),
        place(S.coach, "coach"),
        place(S.format, "week"),
        place(S.reviews, "reviews"),
        place(S.pricing, "join"),
        place(S.dates, "dates"),
        place(S.faq, "faq"),
        place(S.closing, "last"),
        foot(),
      ],
    },
    { key: "product", title: "Course", sections: [head(), place(S.product, "pd"), place(S.curriculum, "pd-lessons"), place(S.reviews, "pd-reviews"), place(S.faq, "pd-faq"), foot()] },
    { key: "collection", title: "Collection", sections: [head(), place(S.collection, "cl"), place(S.outcomes, "cl-outcomes"), place(S.closing, "cl-last"), foot()] },
    { key: "about", title: "About", sections: [head(), place(S.about, "ab"), place(S.coach, "ab-coach"), place(S.format, "ab-week"), place(S.closing, "ab-last"), foot()] },
    { key: "contact", title: "Contact", sections: [head(), place(S.contact, "ct"), place(S.faq, "ct-faq"), place(S.dates, "ct-dates"), foot()] },
  ]
}

const LOOK = "warm documentary photography, real people, natural window light, candid, Canon 50mm, true skin tones, no stock poses, no text"

export const courseCoach: SiteTemplate = {
  id: "course-coach",
  name: "Floor, online course with a coach",
  summary: "An online course or coaching programme that converts honestly: outcomes in plain words, the whole curriculum week by week, the coach, real reviews from Storelib Reviews only, prices and Buy now from the real products.",
  industries: ["online course", "coach", "cohort course", "workshop", "education", "personal coaching", "masterclass", "fitness coach"],
  styles: ["conversion", "friendly", "bold grotesk", "clear"],
  directionIds: ["one-page-conversion", "bold-performance", "training-ground"],
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#f4f6f2", surface: "#e8ece5", text: "#111511", muted: "#4d564e", accent: "#13b46c", accentText: "#0d1f15", border: "#cdd4cb", inverse: { background: "#0f241a", text: "#eef4ef", accent: "#5ce39d" } },
    fonts: { heading: "Bricolage Grotesque", body: "Hanken Grotesk" },
    typeScale: { base: 17, ratio: 1.5 },
    radius: { small: 0, medium: 2, large: 4 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1280, gutter: 24 },
    motion: { level: "subtle", tier: "balanced" },
  },
  imageSlots: [
    slot("home/hero/photo", "4:5", `A woman in her thirties speaking to a small seated group in a bright room, mid sentence, hands open, relaxed, ${LOOK}`),
    slot("home/coach/photo", "6:7", `Portrait of the same coach laughing beside a studio microphone in a small radio studio, ${LOOK}`),
    slot("about/ab/photo", "6:7", `A small group of adults in a bright room listening to one person speaking, seen from behind the group, ${LOOK}`),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Lessons", url: "/#section-lessons" }, { title: "Join", url: "/products", links: [{ title: "Courses", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Ask", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Courses", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Reviews", url: "/reviews" }, { title: "Your lessons", url: "/account" }] },
  },
}
