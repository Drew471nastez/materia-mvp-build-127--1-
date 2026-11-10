import { assembleB, at, filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types"
import * as S from "./sections"

const head = () => place(S.header, "hdr", {}, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      seo: { title: "Floor, a six week public speaking course", description: "Six weeks, twelve short lessons and four live practice rooms." },
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
    { key: "products", title: "Courses", sections: [head(), place(S.collection, "all", { heading: "Courses and coaching" }), place(S.dates, "all-dates"), place(S.closing, "all-last"), foot()] },
    { key: "search", title: "Search", sections: [head(), place(S.collection, "found", { heading: "Search" }), place(S.closing, "found-last"), foot()] },
    {
      key: "about",
      title: "About",
      seo: { title: "About Floor and Ana Ruiz" },
      sections: [head(), place(S.about, "ab"), place(S.coach, "ab-coach"), place(S.format, "ab-week"), place(S.outcomes, "ab-outcomes"), place(S.reviews, "ab-reviews"), place(S.closing, "ab-last"), foot()],
    },
    {
      key: "contact",
      title: "Ask",
      seo: { title: "Ask Ana a question" },
      sections: [head(), place(S.contact, "ct"), place(S.faq, "ct-faq"), place(S.dates, "ct-dates"), place(S.strip, "ct-strip"), place(S.format, "ct-week"), place(S.closing, "ct-last"), foot()],
    },
  ]
}

const LOOK = "warm documentary photography, real people, natural window light, candid, 50mm, true skin tones, no stock poses, no text, no logos"
const week = (n: number) => [at("home", "week", "photo", `week-b${n}`), at("about", "ab-week", "photo", `ab-week-b${n}`), at("contact", "ct-week", "photo", `ct-week-b${n}`)]

export const courseCoach: SiteTemplate = assembleB({
  id: "course-coach",
  name: "Floor",
  summary: "An online course or coaching programme that converts honestly: outcomes in plain words, the whole curriculum week by week, the coach, real reviews from Storelib Reviews only, prices and Buy now from the real products.",
  industries: ["education", "creator", "fitness"],
  stories: [],
  styles: ["conversion", "friendly", "bold grotesk", "clear"],
  directionIds: ["one-page-conversion", "bold-performance", "training-ground"],
  keywords: ["online course", "coach", "cohort", "workshop", "masterclass", "bootcamp", "personal coaching", "mentor", "lessons", "class"],
  motion: "balanced",
  prefix: "cc",
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
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Lessons", url: "/#section-lessons" }, { title: "Join", url: "/products", links: [{ title: "Courses", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Ask", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Courses", url: "/products" }, { title: "About", url: "/about" }, { title: "Ask a question", url: "/contact" }, { title: "Search", url: "/search" }, { title: "Your lessons", url: "/account" }] },
  },
  imageSlots: [
    slot("hero-coach", "4:5", "portrait", "The coach speaking to a small room, mid sentence, hands open", `A woman in her thirties speaking to a small seated group in a bright room, mid sentence, hands open, relaxed, ${LOOK}`, at("home", "hero", "photo")),
    slot("coach-portrait", "4:5", "portrait", "The coach laughing at a microphone in a small studio", `Portrait of the same coach laughing beside a studio microphone in a small radio studio, ${LOOK}`, at("home", "coach", "photo"), at("about", "ab-coach", "photo")),
    slot("day-lesson", "4:3", "photo", "A laptop on a kitchen table playing a short lesson video", `A laptop on a kitchen table playing a short video lesson, a mug and a notebook beside it, morning light, ${LOOK}`, ...week(1)),
    slot("day-practice", "4:3", "photo", "A man recording himself speaking on a phone propped on books", `A man in his forties recording himself speaking on a phone propped on a stack of books at home, ${LOOK}`, ...week(2)),
    slot("day-live", "4:3", "photo", "A video call of eight people listening to one speaker", `A laptop screen showing a video call of eight people listening to one person speaking, seen over a shoulder at home, ${LOOK}`, ...week(3)),
    slot("day-notes", "4:3", "photo", "The coach writing notes in a notebook beside a laptop", `The coach writing feedback notes by hand in a notebook beside a laptop at a wooden desk, ${LOOK}`, ...week(4)),
    slot("about-room", "4:5", "photo", "A small group in a bright room listening to one person speak", `A small group of adults in a bright room listening to one person speaking, seen from behind the group, ${LOOK}`, at("about", "ab", "photo")),
  ],
  bindings: [
    { page: "home", section: "join", setting: "products", kind: "products", why: "Ways to join are the store's real course and coaching products: choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The header reads the main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's links are the footer menu." },
  ],
  design: {
    thesis: "What the student will be able to do, in one big line, beside a real photograph of the coach teaching, with the next start date and one Enrol action.",
    layout: ["Split hero with the facts that decide (start, length, time, places)", "Numbered outcomes as large statements", "The full curriculum as disclosures with a scroll progress line", "Join from real products with Buy now"],
    imagery: "Warm documentary photographs of the coach and students in real rooms and at home; no stock handshakes, no laptops on beaches.",
    motion: "Balanced: the hero rises, outcomes step in, the curriculum line fills as you scroll, a short running line of facts.",
    signature: ["the facts that decide, under the hero", "one bright green action", "reviews only from Storelib Reviews"],
    avoid: ["invented testimonials", "student counts", "fake scarcity timers", "three tier pricing cards"],
  },
})
