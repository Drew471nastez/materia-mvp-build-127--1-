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
      seo: { title: "Fieldwork, identities, websites and type for culture" },
      sections: [
        head(),
        place(S.hero, "hero"),
        place(S.marquee, "does"),
        place(S.cases, "work"),
        place(S.services, "what"),
        place(S.manifesto, "opinion"),
        place(S.index, "index"),
        place(S.process, "how"),
        place(S.studio, "studio"),
        place(S.editions, "shop"),
        place(S.hello, "hello"),
        foot(),
      ],
    },
    { key: "product", title: "Edition", sections: [head(), place(S.product, "pd"), place(S.editions, "pd-more", { heading: "More editions" }), place(S.hello, "pd-hello"), foot()] },
    { key: "collection", title: "Collection", sections: [head(), place(S.collection, "cl"), place(S.marquee, "cl-does"), place(S.hello, "cl-hello"), foot()] },
    { key: "products", title: "Editions", sections: [head(), place(S.collection, "all", { heading: "Every edition" }), place(S.hello, "all-hello"), foot()] },
    { key: "search", title: "Search", sections: [head(), place(S.collection, "found", { heading: "Search" }), place(S.marquee, "found-does"), foot()] },
    {
      key: "about",
      title: "Studio",
      seo: { title: "About Fieldwork" },
      sections: [head(), place(S.about, "ab"), place(S.services, "ab-what"), place(S.process, "ab-how"), place(S.studio, "ab-studio", { heading: "The room" }), place(S.manifesto, "ab-opinion", { before: "We would rather make", key: "one thing", after: "properly than six things fast." }), place(S.hello, "ab-hello"), foot()],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Start a project with Fieldwork" },
      sections: [head(), place(S.contact, "ct"), place(S.process, "ct-how", { heading: "What happens next" }), place(S.services, "ct-what", { heading: "What we can help with" }), place(S.index, "ct-index", { heading: "Recent projects" }), place(S.marquee, "ct-does"), place(S.manifesto, "ct-opinion"), foot()],
    },
  ]
}

const LOOK = "editorial photography for a design studio portfolio, true colours, crisp daylight, printed matter and real materials, no readable brand names, no text overlays, no logos"
const idx = (n: number) => [at("home", "index", "photo", `index-b${n}`), at("contact", "ct-index", "photo", `ct-index-b${n}`)]

export const studioKinetic: SiteTemplate = assembleB({
  id: "studio-kinetic",
  name: "Fieldwork",
  summary: "A creative agency or studio: a hero stacked from type lines the creator styles one by one, case studies pinned and moving sideways, a project index whose picture follows the pointer, disciplines set huge.",
  industries: ["agency", "architecture", "film"],
  stories: ["agency", "architect"],
  styles: ["experimental type", "typographic", "kinetic", "brutalist", "high contrast"],
  directionIds: ["experimental-type", "neo-brutalist", "swiss-editorial"],
  keywords: ["creative agency", "design studio", "branding", "web studio", "type foundry", "production company", "creative director", "freelance designer"],
  motion: "expressive",
  prefix: "ag",
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#e6e8e3", surface: "#d9dcd5", text: "#0d0d0c", muted: "#4a4c47", accent: "#ffd53d", accentText: "#0d0d0c", border: "#0d0d0c", inverse: { background: "#0d0d0c", text: "#e6e8e3", accent: "#ffd53d" } },
    fonts: { heading: "Funnel Display", body: "Chivo" },
    typeScale: { base: 16, ratio: 1.75 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1440, gutter: 20 },
    motion: { level: "expressive", tier: "expressive" },
  },
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Work", url: "/#section-work" }, { title: "Studio", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Editions", url: "/products", links: [{ title: "All editions", url: "/products" }, { title: "Collections", url: "/collections" }, { title: "Search", url: "/search" }] }] },
    footer: { title: "Footer", links: [{ title: "Work", url: "/" }, { title: "Studio", url: "/about" }, { title: "Editions", url: "/products" }, { title: "Contact", url: "/contact" }] },
  },
  imageSlots: [
    slot("case-art-hall", "3:2", "photo", "Exhibition posters for an art hall on a construction fence", `Exhibition posters with bold black and yellow typography pasted on a construction fence in a city street, ${LOOK}`, at("home", "work", "photo", "work-b1")),
    slot("case-festival", "3:2", "photo", "Festival tote bags and a printed programme on a table", `Festival tote bags, lanyards and a printed programme laid out on a concrete floor, overhead shot, ${LOOK}`, at("home", "work", "photo", "work-b2")),
    slot("case-labels", "3:2", "photo", "A row of beer bottles with bold typographic labels", `A row of beer bottles with bold typographic labels on a steel bar counter, ${LOOK}`, at("home", "work", "photo", "work-b3")),
    slot("case-archive", "3:2", "photo", "A laptop showing an archive website beside printed proofs", `A laptop showing a museum archive website on a desk beside printed proofs and a pencil, ${LOOK}`, at("home", "work", "photo", "work-b4")),
    slot("index-signage", "4:3", "photo", "Art hall signage in black and yellow", `Black and yellow wayfinding signage inside a bright art hall, ${LOOK}`, ...idx(1)),
    slot("index-specimen", "4:3", "photo", "Specimen sheet of a heavy grotesk typeface", `A typeface specimen poster with a heavy grotesk alphabet pinned to a wall, ${LOOK}`, ...idx(2)),
    slot("index-badges", "4:3", "photo", "Festival badges on lanyards", `Festival badges on colourful lanyards on a table, close up, ${LOOK}`, ...idx(3)),
    slot("index-phone", "4:3", "photo", "An archive website on a phone", `A hand holding a phone showing an archive website, plain background, ${LOOK}`, ...idx(4)),
    slot("index-book", "4:3", "photo", "An open book spread with large typography", `An open book spread with very large typography on a light table, ${LOOK}`, ...idx(5)),
    slot("studio-proofs", "4:3", "photo", "Printed poster proofs pinned on a studio wall", `Printed poster proofs pinned on a white studio wall, natural window light, ${LOOK}`, at("home", "studio", "photo", "studio-b1"), at("about", "ab-studio", "photo", "ab-studio-b1")),
    slot("studio-riso", "3:4", "photo", "A risograph printer with ink drums on a bench", `A risograph printer with coloured ink drums on a workbench, ${LOOK}`, at("home", "studio", "photo", "studio-b2"), at("about", "ab-studio", "photo", "ab-studio-b2")),
    slot("studio-glyph", "3:4", "photo", "A designer's screen showing a typeface glyph being edited", `A designer's monitor showing a typeface glyph being edited, over the shoulder, ${LOOK}`, at("home", "studio", "photo", "studio-b3"), at("about", "ab-studio", "photo", "ab-studio-b3")),
    slot("studio-crit", "4:3", "photo", "Four people around a table covered in printed work", `Four people around a large table covered in printed work during a critique, candid, ${LOOK}`, at("home", "studio", "photo", "studio-b4"), at("about", "ab-studio", "photo", "ab-studio-b4")),
    slot("about-table", "16:9", "photo", "The studio's long table under a window covered in printed proofs", `A long studio table under a big window covered in printed proofs and paper samples, ${LOOK}`, at("about", "ab", "photo")),
  ],
  bindings: [
    { page: "home", section: "shop", setting: "products", kind: "products", why: "Editions are the store's real products (prints, type licences, books): choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The side drawer and the inline links read the main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's links are the footer menu." },
  ],
  design: {
    thesis: "The first screen is type: a statement stacked from lines the creator styles one by one, with one word resolving from scrambled letters.",
    layout: ["Huge stacked type on a 2px ruled grid", "Case studies as a sideways pinned rail", "A project index list with hover previews", "Disciplines as huge disclosures"],
    imagery: "Crisp daylight photographs of printed matter, signage and the studio at work; real materials, no mockups floating in space.",
    motion: "Expressive: type lines step in, a word scrambles into place, cases move sideways, previews follow the pointer, pictures tilt toward it.",
    signature: ["stacked type lines in solid, outline and highlight", "one signal yellow", "2px black rules"],
    avoid: ["client logo walls", "invented awards", "rounded cards", "gradients"],
  },
})
