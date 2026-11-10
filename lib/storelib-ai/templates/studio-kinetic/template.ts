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
    { key: "about", title: "About", sections: [head(), place(S.about, "ab"), place(S.process, "ab-how"), place(S.services, "ab-what"), place(S.hello, "ab-hello"), foot()] },
    { key: "contact", title: "Contact", sections: [head(), place(S.contact, "ct"), place(S.process, "ct-how", { heading: "What happens next" }), foot()] },
  ]
}

const LOOK = "editorial photography for a design studio portfolio, true colours, crisp, daylight, printed matter and real materials, no readable brand names, no text overlays"

export const studioKinetic: SiteTemplate = {
  id: "studio-kinetic",
  name: "Fieldwork, creative studio",
  summary: "A creative agency or studio: a hero stacked from type lines the creator styles one by one, case studies pinned and moving sideways, a project index whose picture follows the pointer, disciplines set huge.",
  industries: ["creative agency", "design studio", "branding agency", "web studio", "type foundry", "architecture studio", "production company"],
  styles: ["experimental type", "typographic", "kinetic", "brutalist", "high contrast"],
  directionIds: ["experimental-type", "neo-brutalist", "swiss-editorial"],
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
  imageSlots: [
    slot("home/work/work-b1/photo", "16:11", `Exhibition posters with bold black and yellow typography pasted on a construction fence in a city street, ${LOOK}`),
    slot("home/work/work-b2/photo", "16:11", `Festival tote bags, lanyards and a printed programme laid out on a concrete floor, overhead shot, ${LOOK}`),
    slot("home/work/work-b3/photo", "16:11", `A row of beer bottles with bold typographic labels on a steel bar counter, ${LOOK}`),
    slot("home/work/work-b4/photo", "16:11", `A laptop showing a museum archive website on a desk beside printed proofs and a pencil, ${LOOK}`),
    slot("home/index/index-b1/photo", "4:3", `Black and yellow wayfinding signage inside a bright art hall, ${LOOK}`),
    slot("home/index/index-b2/photo", "4:3", `A typeface specimen poster with a heavy grotesk alphabet pinned to a wall, ${LOOK}`),
    slot("home/index/index-b3/photo", "4:3", `Festival badges on colourful lanyards on a table, close up, ${LOOK}`),
    slot("home/index/index-b4/photo", "4:3", `A hand holding a phone showing an archive website, plain background, ${LOOK}`),
    slot("home/index/index-b5/photo", "4:3", `An open book spread with very large typography on a light table, ${LOOK}`),
    slot("home/studio/studio-b1/photo", "4:3", `Printed poster proofs pinned on a white studio wall, natural window light, ${LOOK}`),
    slot("home/studio/studio-b2/photo", "3:4", `A risograph printer with coloured ink drums on a workbench, ${LOOK}`),
    slot("home/studio/studio-b3/photo", "3:4", `A designer's monitor showing a typeface glyph being edited, over the shoulder, ${LOOK}`),
    slot("home/studio/studio-b4/photo", "4:3", `Four people around a large table covered in printed work during a critique, candid, ${LOOK}`),
    slot("about/ab/photo", "16:10", `A long studio table under a big window covered in printed proofs and paper samples, ${LOOK}`),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Work", url: "/#section-work" }, { title: "Studio", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Editions", url: "/products", links: [{ title: "All editions", url: "/products" }, { title: "Collections", url: "/collections" }] }] },
    footer: { title: "Footer", links: [{ title: "Work", url: "/" }, { title: "Studio", url: "/about" }, { title: "Editions", url: "/products" }, { title: "Contact", url: "/contact" }] },
  },
}
