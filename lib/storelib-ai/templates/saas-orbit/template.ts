import { filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types-b"
import * as S from "./sections"

const chrome = () => ({ head: place(S.header, "hdr", {}, undefined, "header"), foot: place(S.footer, "ftr", {}, undefined, "footer") })

function pages(): SiteTemplate["pages"] {
  const home = (() => {
    const { head, foot } = chrome()
    return [
      head,
      place(S.hero, "hero"),
      place(S.marquee, "verbs"),
      place(S.walkthrough, "walk"),
      place(S.specs, "specs"),
      place(S.statement, "manifesto"),
      place(S.usecases, "uses"),
      place(S.compare, "compare"),
      place(S.plans, "plans"),
      place(S.faq, "faq"),
      place(S.marquee, "verbs2", { speed: 48, direction: "right", label: "Where notes go" }, ["Changelog", "Docs", "Email", "In-app"].map((word) => ({ type: "word", settings: { word } }))),
      place(S.closing, "close"),
      foot,
    ]
  })()
  const { head, foot } = chrome()
  return [
    { key: "home", title: "Home", sections: home },
    { key: "product", title: "Product", sections: [head, place(S.product, "pd"), place(S.specs, "pd-specs", { heading: "What you get" }), place(S.faq, "pd-faq"), place(S.closing, "pd-close", { heading: "Try it on your next release" }), foot] },
    { key: "collection", title: "Collection", sections: [head, place(S.collection, "cl"), place(S.compare, "cl-compare"), place(S.closing, "cl-close"), foot] },
    { key: "about", title: "About", sections: [head, place(S.about, "ab"), place(S.statement, "ab-line", { line: "We write the tool we wanted at midnight before every launch." }), place(S.marquee, "ab-verbs"), place(S.closing, "ab-close"), foot] },
    { key: "contact", title: "Contact", sections: [head, place(S.contact, "ct"), place(S.faq, "ct-faq", { heading: "Before you write" }), foot] },
  ]
}

const P = "studio product photograph, deep near-black background, soft rim light, acid lime accent light from the left, crisp edges, no text, no logos"

export const saasOrbit: SiteTemplate = {
  id: "saas-orbit",
  name: "Orbit, software product",
  summary: "Dark software launch site: a turning 3D product object in front of a giant wordmark, giant running verbs, a scroll-scrubbed walkthrough, sideways use cases, plans from real products.",
  industries: ["saas", "software", "app", "developer tools", "startup", "ai tool", "productivity"],
  styles: ["dark", "technical", "product-led", "kinetic type", "3d"],
  directionIds: ["dark-immersive", "technical-industrial", "product-led"],
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#0a0c0b", surface: "#141716", text: "#e6eae7", muted: "#98a29c", accent: "#c8f031", accentText: "#0a0c0b", border: "#2b302d", inverse: { background: "#c8f031", text: "#0a0c0b", accent: "#0a0c0b" } },
    fonts: { heading: "Mona Sans", body: "Mona Sans" },
    typeScale: { base: 16, ratio: 1.5 },
    radius: { small: 0, medium: 2, large: 4 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1320, gutter: 24 },
    motion: { level: "expressive", tier: "expressive" },
    custom: { "font-mono": "\"Martian Mono\", ui-monospace, monospace" },
  },
  imageSlots: [
    slot("home/hero/image", "1:1", `The product as an object: a thin floating app window or device at a three quarter angle, ${P}, transparent or black background`),
    slot("home/walk/walk-b1/screen", "16:10", "Clean desktop app screenshot style render of a list of merged code changes grouped by label, dark interface, lime highlights, sharp, no real brand names"),
    slot("home/walk/walk-b2/screen", "16:10", "Desktop app render of a release draft document with grouped plain sentences and edit marks, dark interface, lime highlights, no real brand names"),
    slot("home/walk/walk-b3/screen", "16:10", "Desktop app render of an approve and publish panel with three destinations ticked, dark interface, one lime button, no real brand names"),
    slot("home/uses/uses-b1/photo", "3:2", "Candid photo of a small product team around one laptop in a dim modern office at dusk, monitor glow on faces, shallow depth of field, 35mm"),
    slot("home/uses/uses-b2/photo", "3:2", "Candid photo of a support specialist with headphones reading on a large monitor at night, cool desk light, shallow depth of field"),
    slot("home/uses/uses-b3/photo", "3:2", "Close photo of a hand holding a phone showing a short email update, dark background, soft side light, no readable brand"),
    slot("about/ab/photo", "16:9", "Documentary photo of a small software team at a long wooden table with laptops, evening light through tall windows, relaxed, real people, 35mm film look"),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Product", url: "/products", links: [{ title: "Plans", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Product", url: "/products", links: [{ title: "Plans", url: "/products" }] }, { title: "Company", url: "/about", links: [{ title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] }, { title: "Account", url: "/account" }] },
  },
}
