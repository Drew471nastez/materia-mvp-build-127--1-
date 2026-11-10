import { assembleB, at, filesOf, place, slot } from "../kit-b"
import type { ImageSlotTarget, SiteTemplate } from "../types-b"
import * as S from "./sections"

const head = () => place(S.header, "hdr", {}, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      seo: { title: "Vera Hollis, photographer", description: "Photographs of coasts, kitchens and the people in them." },
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
    { key: "collection", title: "Series", sections: [head(), place(S.collection, "cl"), place(S.places, "cl-places"), place(S.contactBand, "cl-hello"), foot()] },
    { key: "products", title: "Prints", sections: [head(), place(S.collection, "all", { heading: "All prints" }), place(S.contactBand, "all-hello"), foot()] },
    { key: "search", title: "Search", sections: [head(), place(S.collection, "found", { heading: "Search" }), place(S.places, "found-places"), foot()] },
    {
      key: "about",
      title: "About",
      seo: { title: "About Vera Hollis" },
      sections: [head(), place(S.about, "ab"), place(S.statement, "ab-statement"), place(S.strip, "ab-strip", { heading: "A working morning" }), place(S.places, "ab-places"), place(S.commission, "ab-commission"), place(S.contactBand, "ab-hello"), foot()],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Book Vera Hollis" },
      sections: [head(), place(S.contact, "ct"), place(S.commission, "ct-commission", { heading: "How a commission goes" }), place(S.series, "ct-series"), place(S.index, "ct-index", { heading: "Recent series" }), place(S.places, "ct-places"), place(S.contactBand, "ct-hello"), foot()],
    },
  ]
}

const FILM = "documentary photograph on medium format colour film, natural light, honest colour, gentle grain, real people at work around food and the sea, no posing, no text, no logos"

/** A gallery picture is also one of the pictures trailing the name, and a series' cover where it fits. */
const recent = (n: number, ...more: ImageSlotTarget[]) => [at("home", "recent", "photo", `recent-b${n}`), at("home", "trail", "photo", `trail-b${n}`), ...more]
const strip = (n: number, ...more: ImageSlotTarget[]) => [at("home", "strip", "photo", `strip-b${n}`), at("about", "ab-strip", "photo", `ab-strip-b${n}`), ...more]
const cover = (n: number) => [at("home", "index", "cover", `index-b${n}`), at("contact", "ct-index", "cover", `ct-index-b${n}`)]

export const photoTrail: SiteTemplate = assembleB({
  id: "photo-trail",
  name: "Vera Hollis",
  summary: "A gallery-led portfolio: the name with the work trailing behind the pointer, a full-bleed series, a wall of pictures that open large in place, a series index with covers that follow the pointer, a sideways film strip, prints from the real shop.",
  industries: ["photography", "art-gallery", "film"],
  stories: ["photographer", "artist"],
  styles: ["gallery", "minimal", "image-led", "white wall"],
  directionIds: ["art-gallery", "monochrome", "cinematic"],
  keywords: ["photographer", "artist", "illustrator", "painter", "videographer", "portfolio", "prints", "fine art", "documentary", "wedding photographer"],
  motion: "expressive",
  prefix: "pf",
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
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Work", url: "/" }, { title: "Prints", url: "/products", links: [{ title: "All prints", url: "/products" }, { title: "Series", url: "/collections" }, { title: "Search", url: "/search" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Prints", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Orders", url: "/account" }] },
  },
  imageSlots: [
    slot("series-cover", "3:2", "photo", "A wide flat beach at low tide with one figure walking a dog far away", `A wide flat beach at low tide in Northumberland with one figure walking a dog far away, overcast silver light, ${FILM}`, at("home", "series", "photo"), at("contact", "ct-series", "photo"), ...cover(1)),
    slot("recent-sardines", "4:5", "photo", "A cook grilling sardines over coals on a street", `A cook grilling sardines over coals on a narrow street in Porto, smoke in evening light, ${FILM}`, ...recent(1)),
    slot("recent-swim", "4:5", "photo", "Swimmers in bright caps in a grey sea pool", `Swimmers in bright caps in a grey tidal sea pool in winter, ${FILM}`, ...recent(2), ...cover(3)),
    slot("recent-pass", "4:5", "photo", "Plates lined up on a steel pass under heat lamps", `Plates lined up on a steel restaurant pass under heat lamps, a chef's hands, ${FILM}`, ...recent(3), ...cover(2)),
    slot("recent-nets", "4:5", "photo", "Coils of green fishing net on a quay", `Coils of green fishing net on a stone quay, a gull, early morning, ${FILM}`, ...recent(4)),
    slot("recent-lunch", "4:5", "photo", "A long outdoor table with a family passing bowls", `A long outdoor table under olive trees with a family passing bowls, ${FILM}`, ...recent(5), ...cover(4)),
    slot("recent-ferry", "4:5", "photo", "A small ferry leaving a jetty at dusk", `A small ferry leaving a jetty at dusk on a Scottish island, ${FILM}`, ...recent(6)),
    slot("strip-boats", "3:2", "photo", "Fishing boats entering a harbour in blue dawn light", `Fishing boats entering a harbour in blue dawn light, ${FILM}`, ...strip(1)),
    slot("strip-ice", "3:2", "photo", "A man shovelling ice into crates of fish", `A fisherman shovelling ice into crates of fish on a harbour, ${FILM}`, ...strip(2)),
    slot("strip-market", "3:2", "photo", "Buyers inspecting fish at an indoor market", `Buyers inspecting fish at an indoor harbour market, ${FILM}`, ...strip(3)),
    slot("strip-breakfast", "3:2", "photo", "Two fishermen eating breakfast in a café window", `Two fishermen eating breakfast in a steamy café window, ${FILM}`, ...strip(4)),
    slot("about-portrait", "4:5", "portrait", "Vera Hollis holding a medium format camera on a harbour wall", `Portrait of a woman photographer in her forties holding a medium format camera on a harbour wall, windswept, ${FILM}`, at("about", "ab", "photo")),
  ],
  bindings: [
    { page: "home", section: "prints", setting: "products", kind: "products", why: "Prints are the store's real products: choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The header reads the main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's links are the footer menu." },
  ],
  design: {
    thesis: "The photographer's name in the middle of a white wall, the work trailing behind the pointer as it moves.",
    layout: ["Image trail around the name, a scattered collage when still", "One series at full bleed", "A wall of uneven columns whose pictures open large in place", "A series index with covers that follow the pointer"],
    imagery: "The photographer's own documentary work on film: harbours, kitchens, tables, people at work. Never stock.",
    motion: "Expressive around the work, quiet around the words: the trail, a slow drift, a sideways film strip; the gallery opens in place.",
    signature: ["the name with the work trailing behind the pointer", "white wall, black type", "one red used like a gallery dot"],
    avoid: ["client logo walls", "invented publications", "rounded image cards", "dark mode for its own sake"],
  },
})
