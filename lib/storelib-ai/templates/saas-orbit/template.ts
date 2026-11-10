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
      seo: { title: "Orbit: release notes that write themselves", description: "Orbit drafts changelogs, docs and in-app notes from your merged work." },
      sections: [
        head(),
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
        foot(),
      ],
    },
    { key: "product", title: "Product", sections: [head(), place(S.product, "pd"), place(S.specs, "pd-specs", { heading: "What you get" }), place(S.faq, "pd-faq"), place(S.closing, "pd-close", { heading: "Try it on your next release" }), foot()] },
    { key: "collection", title: "Collection", sections: [head(), place(S.collection, "cl"), place(S.compare, "cl-compare"), place(S.closing, "cl-close"), foot()] },
    { key: "products", title: "Plans", sections: [head(), place(S.collection, "all", { heading: "Every plan and add-on" }), place(S.compare, "all-compare"), place(S.closing, "all-close"), foot()] },
    { key: "search", title: "Search", sections: [head(), place(S.collection, "found", { heading: "Search" }), place(S.marquee, "found-verbs"), foot()] },
    {
      key: "about",
      title: "About",
      seo: { title: "About Orbit" },
      sections: [
        head(),
        place(S.about, "ab"),
        place(S.statement, "ab-line", { line: "We write the tool we wanted at midnight before every launch." }),
        place(S.usecases, "ab-uses", { heading: "Who we build it for" }),
        place(S.specs, "ab-specs", { heading: "How we run the company", intro: "<p>A small team with a short list of rules.</p>" }, [
          { type: "spec", settings: { key: "remote", title: "Remote, with overlap", text: "Four time zones, three shared hours a day, one week together each season." } },
          { type: "spec", settings: { key: "money", title: "Paid by customers", text: "No outside investors. The roadmap is what customers ask for most." } },
          { type: "spec", settings: { key: "notes", title: "We use Orbit", text: "Every Orbit release note was drafted by Orbit and edited by a person." } },
        ]),
        place(S.marquee, "ab-verbs"),
        place(S.closing, "ab-close"),
        foot(),
      ],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Contact Orbit" },
      sections: [
        head(),
        place(S.contact, "ct"),
        place(S.faq, "ct-faq", { heading: "Before you write" }),
        place(S.specs, "ct-security", { heading: "Security and data", intro: "<p>The short version of what security teams ask us.</p>" }, [
          { type: "spec", settings: { key: "scope", title: "Read only access", text: "Orbit asks for read access to pull requests and issues, nothing else." } },
          { type: "spec", settings: { key: "storage", title: "No source stored", text: "Titles, labels and descriptions only, deleted 30 days after you leave." } },
          { type: "spec", settings: { key: "region", title: "EU hosting", text: "Data stays in the EU, encrypted at rest and in transit." } },
        ]),
        place(S.compare, "ct-compare"),
        place(S.statement, "ct-line", { line: "A person from the team answers every message. Usually the one who built the thing you are asking about." }),
        place(S.closing, "ct-close"),
        foot(),
      ],
    },
  ]
}

const LOOK = "deep near-black background, soft rim light, one acid lime accent light, crisp, no text, no logos, no real brand names"

export const saasOrbit: SiteTemplate = assembleB({
  id: "saas-orbit",
  name: "Orbit",
  summary: "Dark software launch site: a turning 3D product object in front of a giant wordmark, giant running verbs, a scroll-scrubbed walkthrough, sideways use cases, plans from the real products.",
  industries: ["saas", "creator"],
  stories: ["saas"],
  styles: ["dark", "technical", "product-led", "kinetic type", "3d"],
  directionIds: ["dark-immersive", "technical-industrial", "product-led"],
  keywords: ["software", "app", "developer tools", "startup", "ai tool", "productivity", "platform", "plugin", "api"],
  motion: "expressive",
  prefix: "sw",
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
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Product", url: "/products", links: [{ title: "Plans", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Product", url: "/products", links: [{ title: "Plans", url: "/products" }, { title: "Search", url: "/search" }] }, { title: "Company", url: "/about", links: [{ title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] }, { title: "Account", url: "/account" }] },
  },
  imageSlots: [
    slot("hero-object", "1:1", "product", "The product as a thin floating app window at a three quarter angle", `The product as an object: a thin floating app window or device at a three quarter angle on a plain ground, ${LOOK}`, at("home", "hero", "image")),
    slot("screen-merged", "16:9", "product", "Orbit's list of merged pull requests grouped by label", `Clean desktop app render of a list of merged code changes grouped by label, dark interface, lime highlights, ${LOOK}`, at("home", "walk", "screen", "walk-b1")),
    slot("screen-draft", "16:9", "product", "A release draft with grouped changes and edit marks", `Desktop app render of a release draft document with grouped plain sentences and edit marks, dark interface, ${LOOK}`, at("home", "walk", "screen", "walk-b2")),
    slot("screen-publish", "16:9", "product", "The approve and publish panel with three destinations ticked", `Desktop app render of an approve and publish panel with three destinations ticked and one lime button, ${LOOK}`, at("home", "walk", "screen", "walk-b3")),
    slot("use-team", "3:2", "photo", "A product team around one laptop reviewing a draft", "Candid photo of a small product team around one laptop in a dim modern office at dusk, monitor glow on faces, shallow depth of field, 35mm, no text", at("home", "uses", "photo", "uses-b1"), at("about", "ab-uses", "photo", "ab-uses-b1")),
    slot("use-support", "3:2", "photo", "A support lead with headphones reading release notes", "Candid photo of a support specialist with headphones reading on a large monitor at night, cool desk light, shallow depth of field, no text", at("home", "uses", "photo", "uses-b2"), at("about", "ab-uses", "photo", "ab-uses-b2")),
    slot("use-customer", "3:2", "photo", "A phone showing a short product update email", "Close photo of a hand holding a phone showing a short email update, dark background, soft side light, no readable brand", at("home", "uses", "photo", "uses-b3"), at("about", "ab-uses", "photo", "ab-uses-b3")),
    slot("about-team", "16:9", "photo", "The Orbit team at a long table with laptops open", "Documentary photo of a small software team at a long wooden table with laptops, evening light through tall windows, relaxed, real people, 35mm film look", at("about", "ab", "photo")),
  ],
  bindings: [
    { page: "home", section: "plans", setting: "products", kind: "products", why: "The plans are the store's real products: choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The header reads the site's main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's columns are the footer menu." },
  ],
  design: {
    thesis: "A dark first screen where the product turns as a 3D object in front of a giant wordmark, with one specific promise and one action.",
    layout: ["Split hero over a giant lowercase wordmark the object cuts through", "Ruled spec sheet instead of icon cards", "Pinned walkthrough on wide screens, plain steps on phones", "Plans as a ruled list from real products"],
    imagery: "Product renders on near-black with a lime rim light; candid, dim office photography for the people who use it. No stock smiles, no dashboards floating in space.",
    motion: "Expressive: the 3D object turns slowly, giant verbs run, the walkthrough crossfades with scroll, use cases move sideways.",
    signature: ["giant wordmark behind the 3D product", "giant running verbs", "acid lime used once per screen"],
    avoid: ["purple gradients", "logo walls", "invented customer counts", "icon card grids"],
  },
})
