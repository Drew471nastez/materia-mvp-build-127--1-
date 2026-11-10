import { filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types-b"
import * as S from "./sections"

const head = (overlay: boolean) => place(S.header, "hdr", { overlay }, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      sections: [
        head(true),
        place(S.hero, "hero"),
        place(S.intro, "intro"),
        place(S.chapters, "day"),
        place(S.residences, "rooms"),
        place(S.photoBreak, "break"),
        place(S.amenities, "house"),
        place(S.gallery, "interiors"),
        place(S.location, "where"),
        place(S.faq, "faq"),
        place(S.enquire, "enquire"),
        foot(),
      ],
    },
    { key: "product", title: "Residence", sections: [head(false), place(S.product, "pd"), place(S.amenities, "pd-house", { heading: "In the house" }), place(S.faq, "pd-faq"), place(S.enquire, "pd-enquire"), foot()] },
    { key: "collection", title: "Collection", sections: [head(false), place(S.collection, "cl"), place(S.photoBreak, "cl-break"), place(S.enquire, "cl-enquire"), foot()] },
    { key: "about", title: "About", sections: [head(false), place(S.about, "ab"), place(S.chapters, "ab-day", { heading: "How a season goes" }, [
      { type: "chapter", settings: { label: "Spring", title: "Boats out, nets mended", text: "The jetty goes back in, the boats get their varnish and the first guests swim in May, bravely.", alt: "Rowing boats being varnished on trestles outside a shed" } },
      { type: "chapter", settings: { label: "Summer", title: "Light until eleven", text: "Dinner moves outside. The sauna is lit every evening and the lake is warm by July.", alt: "A table set on a lawn by the lake under a late evening sky" } },
      { type: "chapter", settings: { label: "Winter", title: "The whole house to yourselves", text: "From November we let the house to one group at a time, with the stoves lit before you arrive.", alt: "The house in snow with smoke rising from the chimney" } },
    ]), place(S.enquire, "ab-enquire"), foot()] },
    { key: "contact", title: "Contact", sections: [head(false), place(S.contact, "ct"), place(S.location, "ct-where"), place(S.faq, "ct-faq"), foot()] },
  ]
}

const LIGHT = "natural light, quiet, architectural interiors photography, 35mm, muted Nordic palette of timber, stone, linen and lake blue, no people looking at camera, no text"

export const estateCinema: SiteTemplate = {
  id: "estate-cinema",
  name: "Halden, luxury stay or residence",
  summary: "Cinematic real estate and hospitality: full-bleed photographs with a light upright serif over them, chapters whose photographs hold while the words pass, residences from real products, a sideways interior gallery.",
  industries: ["luxury real estate", "hotel", "guest house", "boutique hospitality", "holiday rental", "villa", "architecture", "property developer"],
  styles: ["cinematic", "luxury", "photographic", "calm", "serif"],
  directionIds: ["luxury-editorial", "cinematic", "hospitality-photo"],
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#121310", surface: "#1b1c18", text: "#e9e6de", muted: "#a7a396", accent: "#b89d6c", accentText: "#121310", border: "#35352d", inverse: { background: "#d6d3cb", text: "#121310", accent: "#5d4f32" } },
    fonts: { heading: "Spectral", body: "Jost" },
    typeScale: { base: 16, ratio: 1.5 },
    radius: { small: 0, medium: 0, large: 0 },
    spacing: { scale: 1, sectionY: 120, pageWidth: 1440, gutter: 24 },
    motion: { level: "expressive", tier: "expressive" },
  },
  imageSlots: [
    slot("home/hdr/drawer_photo", "4:5", `A quiet stone hallway in an old timber house, morning light falling across a wooden floor, ${LIGHT}`),
    slot("home/hero/photo", "16:9", `Wide cinematic dusk photograph of a restored timber and stone house on a still lake shore, warm light in every window, pine forest behind, blue hour sky, ${LIGHT}`),
    slot("home/hero/photo_mobile", "9:16", `Tall dusk photograph of the same lakeside house seen from the jetty, warm windows reflected in still water, ${LIGHT}`),
    slot("home/day/day-b1/photo", "4:5", `Two ceramic cups of coffee on a weathered wooden jetty over a misty lake at sunrise, ${LIGHT}`),
    slot("home/day/day-b2/photo", "4:5", `A library inside an old boathouse, shelves of books, a wool blanket on a window seat, afternoon light, ${LIGHT}`),
    slot("home/day/day-b3/photo", "4:5", `A long candlelit dinner table in a timber room, linen, bread and wine, guests out of focus, ${LIGHT}`),
    slot("home/break/photo", "16:9", `Lake and pine forest seen from a high terrace at first light, low mist on the water, ${LIGHT}`),
    slot("home/interiors/interiors-b1/photo", "4:3", `A calm bedroom with linen sheets and a wide window onto a lake, ${LIGHT}`),
    slot("home/interiors/interiors-b2/photo", "3:4", `An old timber staircase lit from a high window, worn treads, ${LIGHT}`),
    slot("home/interiors/interiors-b3/photo", "3:4", `An attic bedroom with exposed beams, a reading lamp and wool throw, ${LIGHT}`),
    slot("home/interiors/interiors-b4/photo", "4:3", `A freestanding stone bath beside a tall window with a view of pines, ${LIGHT}`),
    slot("home/where/photo", "4:5", `A gravel lane through birch trees leading to a timber house, late afternoon sun, ${LIGHT}`),
    slot("home/enquire/photo", "16:9", `The lakeside house at night from across the water, a few lit windows, long exposure, ${LIGHT}`),
    slot("about/ab/photo", "7:9", `Timber facade of a 1930s lakeside house with a wooden rowing boat pulled up on the shore, ${LIGHT}`),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Residences", url: "/products", links: [{ title: "All residences", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "The house", url: "/about" }, { title: "Enquire", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Stay", url: "/products", links: [{ title: "Residences", url: "/products" }] }, { title: "The house", url: "/about", links: [{ title: "Our story", url: "/about" }, { title: "Contact", url: "/contact" }] }, { title: "Account", url: "/account" }] },
  },
}
