import { filesOf, place, slot } from "../kit-b"
import type { SiteTemplate, TemplateImageSlot } from "../types-b"
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
        place(S.trail, "trail"),
        place(S.series, "series"),
        place(S.gallery, "recent"),
        place(S.places, "places"),
        place(S.index, "index"),
        place(S.strip, "strip"),
        place(S.statement, "statement"),
        place(S.prints, "prints"),
        place(S.commission, "commission"),
        place(S.contactBand, "hello"),
        foot(),
      ],
    },
    { key: "product", title: "Print", sections: [head(), place(S.product, "pd"), place(S.prints, "pd-more", { heading: "More prints" }), place(S.contactBand, "pd-hello"), foot()] },
    { key: "collection", title: "Collection", sections: [head(), place(S.collection, "cl"), place(S.places, "cl-places"), place(S.contactBand, "cl-hello"), foot()] },
    { key: "about", title: "About", sections: [head(), place(S.about, "ab"), place(S.statement, "ab-statement"), place(S.commission, "ab-commission"), place(S.contactBand, "ab-hello"), foot()] },
    { key: "contact", title: "Contact", sections: [head(), place(S.contact, "ct"), place(S.commission, "ct-commission", { heading: "How a commission goes" }), foot()] },
  ]
}

const FILM = "documentary photograph on medium format colour film, natural light, honest colour, gentle grain, real people at work around food and the sea, no posing, no text, no logos"

/** A slot per picture block, prompted from the block's own description. */
function blockSlots(section: string, setting: string, aspect: string, alts: string[]): TemplateImageSlot[] {
  return alts.map((alt, i) => slot(`home/${section}/${section}-b${i + 1}/${setting}`, aspect, `${alt}, ${FILM}`))
}

const alts = (def: { presetBlocks: { settings: Record<string, unknown> }[] }) => def.presetBlocks.map((b) => String(b.settings.alt ?? ""))

export const photoTrail: SiteTemplate = {
  id: "photo-trail",
  name: "Vera Hollis, photographer or artist",
  summary: "A gallery-led portfolio: the name with the work trailing behind the pointer, a full-bleed series, a wall of pictures that open large in place, a series index with covers that follow the pointer, a sideways film strip, prints from the real shop.",
  industries: ["photographer", "artist", "illustrator", "painter", "videographer", "portfolio", "print shop"],
  styles: ["gallery", "minimal", "image-led", "white wall"],
  directionIds: ["art-gallery", "monochrome", "cinematic"],
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#fbfbfa", surface: "#f0f0ee", text: "#121212", muted: "#5f5f5c", accent: "#c4142c", accentText: "#ffffff", border: "#dcdcd8", inverse: { background: "#121212", text: "#f2f2f0", accent: "#ff5a6e" } },
    fonts: { heading: "Instrument Sans", body: "Instrument Sans" },
    typeScale: { base: 16, ratio: 1.333 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1600, gutter: 20 },
    motion: { level: "expressive", tier: "expressive" },
  },
  imageSlots: [
    ...blockSlots("trail", "photo", "4:5", alts(S.trail)),
    slot("home/series/photo", "3:2", `A wide flat beach at low tide in Northumberland with one figure walking a dog far away, overcast silver light, ${FILM}`),
    ...blockSlots("recent", "photo", "4:5", alts(S.gallery)),
    ...blockSlots("index", "cover", "4:5", alts(S.index)),
    ...blockSlots("strip", "photo", "3:2", alts(S.strip)),
    slot("about/ab/photo", "4:5", `Portrait of a woman photographer in her forties holding a medium format camera on a harbour wall, windswept, ${FILM}`),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Work", url: "/" }, { title: "Prints", url: "/products", links: [{ title: "All prints", url: "/products" }, { title: "Series", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Prints", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Orders", url: "/account" }] },
  },
}
