import { assembleB, at, filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types"
import * as S from "./sections"

const head = (overlay: boolean) => place(S.header, "hdr", { overlay }, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

const SEASONS = [
  { type: "chapter", settings: { label: "Spring", title: "Boats out, nets mended", text: "The jetty goes back in, the boats get their varnish and the first guests swim in May, bravely.", alt: "Rowing boats being varnished on trestles outside a shed" } },
  { type: "chapter", settings: { label: "Summer", title: "Light until eleven", text: "Dinner moves outside. The sauna is lit every evening and the lake is warm by July.", alt: "A table set on a lawn by the lake under a late evening sky" } },
  { type: "chapter", settings: { label: "Winter", title: "The whole house to yourselves", text: "From November we let the house to one group at a time, with the stoves lit before you arrive.", alt: "The house in snow with smoke rising from the chimney" } },
]

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      seo: { title: "Halden, six rooms on the lake", description: "A restored boatbuilder's house on the north shore with six rooms and one long table." },
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
    { key: "products", title: "Residences", sections: [head(false), place(S.collection, "all", { heading: "Every residence" }), place(S.amenities, "all-house"), place(S.enquire, "all-enquire"), foot()] },
    { key: "search", title: "Search", sections: [head(false), place(S.collection, "found", { heading: "Search" }), place(S.enquire, "found-enquire"), foot()] },
    {
      key: "about",
      title: "The house",
      seo: { title: "The house at Halden" },
      sections: [head(false), place(S.about, "ab"), place(S.chapters, "ab-seasons", { heading: "How a season goes" }, SEASONS), place(S.photoBreak, "ab-break"), place(S.intro, "ab-intro", { heading: "Restoration", body: "<p>Two winters of slow repair: the timber cleaned not replaced, the stone walls repointed with lime, every window rebuilt by the same joiner who made the boats' oars.</p>" }), place(S.amenities, "ab-house"), place(S.enquire, "ab-enquire"), foot()],
    },
    {
      key: "contact",
      title: "Enquire",
      seo: { title: "Enquire at Halden" },
      sections: [head(false), place(S.contact, "ct"), place(S.location, "ct-where"), place(S.faq, "ct-faq"), place(S.photoBreak, "ct-break"), place(S.amenities, "ct-house"), place(S.intro, "ct-intro", { heading: "Groups", body: "<p>From November to March the whole house can be yours: six rooms, the kitchen and the boathouse, for up to fourteen people.</p>" }), foot()],
    },
  ]
}

/** Every page draws the header, so the menu's photograph is written to each. */
const PAGE_KEYS = ["home", "product", "collection", "products", "search", "about", "contact"]

const LIGHT = "natural light, quiet, architectural interiors photography, 35mm, muted Nordic palette of timber, stone, linen and lake blue, no people looking at camera, no text, no logos"

export const estateCinema: SiteTemplate = assembleB({
  id: "estate-cinema",
  name: "Halden",
  summary: "Cinematic real estate and hospitality: full-bleed photographs with a light upright serif over them, chapters whose photographs hold while the words pass, residences from the real products, a sideways interior gallery.",
  industries: ["hospitality", "architecture"],
  stories: ["architect", "food-place"],
  styles: ["cinematic", "luxury", "photographic", "calm", "serif"],
  directionIds: ["luxury-editorial", "cinematic", "hospitality-photo"],
  keywords: ["luxury real estate", "hotel", "guest house", "boutique hotel", "holiday rental", "villa", "property", "estate agent", "bed and breakfast", "retreat"],
  motion: "expressive",
  prefix: "es",
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
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Residences", url: "/products", links: [{ title: "All residences", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "The house", url: "/about" }, { title: "Enquire", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Stay", url: "/products", links: [{ title: "Residences", url: "/products" }, { title: "Search", url: "/search" }] }, { title: "The house", url: "/about", links: [{ title: "Our story", url: "/about" }, { title: "Enquire", url: "/contact" }] }, { title: "Account", url: "/account" }] },
  },
  imageSlots: [
    slot("hero-house", "16:9", "photo", "A stone house on a lake shore at dusk, warm light in every window", `Wide cinematic dusk photograph of a restored timber and stone house on a still lake shore, warm light in every window, pine forest behind, blue hour sky, ${LIGHT}`, at("home", "hero", "photo")),
    slot("hero-house-tall", "9:16", "photo", "The lakeside house seen from the jetty at dusk", `Tall dusk photograph of the same lakeside house seen from the jetty, warm windows reflected in still water, ${LIGHT}`, at("home", "hero", "photo_mobile")),
    slot("chapter-morning", "4:5", "photo", "Two cups of coffee on a wooden jetty over a misty lake", `Two ceramic cups of coffee on a weathered wooden jetty over a misty lake at sunrise, ${LIGHT}`, at("home", "day", "photo", "day-b1")),
    slot("chapter-library", "4:5", "photo", "A library inside an old boathouse with a reading chair", `A library inside an old boathouse, shelves of books, a wool blanket on a window seat, afternoon light, ${LIGHT}`, at("home", "day", "photo", "day-b2")),
    slot("chapter-table", "4:5", "photo", "A long candlelit dinner table in a timber room", `A long candlelit dinner table in a timber room, linen, bread and wine, guests out of focus, ${LIGHT}`, at("home", "day", "photo", "day-b3")),
    slot("place-terrace", "16:9", "photo", "Lake and pine forest from the upper terrace at first light", `Lake and pine forest seen from a high terrace at first light, low mist on the water, ${LIGHT}`, at("home", "break", "photo"), at("collection", "cl-break", "photo"), at("about", "ab-break", "photo"), at("contact", "ct-break", "photo")),
    slot("room-one", "4:3", "photo", "A bedroom with linen sheets and a wide window onto the lake", `A calm bedroom with linen sheets and a wide window onto a lake, ${LIGHT}`, at("home", "interiors", "photo", "interiors-b1")),
    slot("room-stair", "3:4", "photo", "An old timber staircase lit from a high window", `An old timber staircase lit from a high window, worn treads, ${LIGHT}`, at("home", "interiors", "photo", "interiors-b2"), ...PAGE_KEYS.map((k) => at(k, "hdr", "drawer_photo"))),
    slot("room-attic", "3:4", "photo", "An attic bedroom with exposed beams and a reading lamp", `An attic bedroom with exposed beams, a reading lamp and wool throw, ${LIGHT}`, at("home", "interiors", "photo", "interiors-b3")),
    slot("room-bath", "4:3", "photo", "A stone bath beside a window with a view of pines", `A freestanding stone bath beside a tall window with a view of pines, ${LIGHT}`, at("home", "interiors", "photo", "interiors-b4")),
    slot("place-lane", "4:5", "photo", "A gravel lane through birch trees leading to the house", `A gravel lane through birch trees leading to a timber house, late afternoon sun, ${LIGHT}`, at("home", "where", "photo"), at("contact", "ct-where", "photo")),
    slot("place-night", "16:9", "photo", "The lakeside house at night from across the water", `The lakeside house at night from across the water, a few lit windows, long exposure, ${LIGHT}`, at("home", "enquire", "photo"), ...[["product", "pd-enquire"], ["collection", "cl-enquire"], ["products", "all-enquire"], ["search", "found-enquire"], ["about", "ab-enquire"]].map(([k, id]) => at(k, id, "photo"))),
    slot("about-facade", "3:4", "photo", "The timber facade with a rowing boat pulled up on the shore", `Timber facade of a 1930s lakeside house with a wooden rowing boat pulled up on the shore, ${LIGHT}`, at("about", "ab", "photo")),
    slot("chapter-spring", "4:5", "photo", "Rowing boats being varnished on trestles outside a shed", `Rowing boats being varnished on trestles outside a boat shed in spring sun, ${LIGHT}`, at("about", "ab-seasons", "photo", "ab-seasons-b1")),
    slot("chapter-winter", "4:5", "photo", "The house in snow with smoke rising from the chimney", `The lakeside house in deep snow with smoke rising from the chimney, blue winter light, ${LIGHT}`, at("about", "ab-seasons", "photo", "ab-seasons-b3")),
    slot("chapter-summer", "4:5", "photo", "A table set on a lawn by the lake under a late evening sky", `A long table set on a lawn by the lake under a late evening summer sky, lanterns, ${LIGHT}`, at("about", "ab-seasons", "photo", "ab-seasons-b2")),
  ],
  bindings: [
    { page: "home", section: "rooms", setting: "products", kind: "products", why: "The residences or suites are the store's real products: choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The full screen menu reads the site's main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's columns are the footer menu." },
  ],
  design: {
    thesis: "The whole first screen is one cinematic photograph of the place at dusk, with a quiet upright serif line over it and one action.",
    layout: ["Full-bleed photography between calm text chapters", "Sticky chapters: the photograph holds while the words pass", "Residences staggered in two and three columns", "Ruled lists for what the house has and how to get there"],
    imagery: "Natural light architectural and interiors photography in a muted palette of timber, stone, linen and water; people only in passing, never posing.",
    motion: "Expressive but slow: the hero settles from a slight scale, photographs drift slower than the page, chapters crossfade, the interiors move sideways.",
    signature: ["serif set big over the photograph", "photographs that hold while the words pass", "one brass accent"],
    avoid: ["italic display serif", "cream backgrounds", "mono captions", "stock lifestyle photos"],
  },
})
