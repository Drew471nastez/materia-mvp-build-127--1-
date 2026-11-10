import { assembleB, at, filesOf, place, slot } from "../kit-b"
import type { SiteTemplate } from "../types-b"
import * as S from "./sections"

const head = () => place(S.header, "hdr", {}, undefined, "header")
const foot = () => place(S.footer, "ftr", {}, undefined, "footer")

function pages(): SiteTemplate["pages"] {
  return [
    {
      key: "home",
      title: "Home",
      seo: { title: "Sable, barbers and colour in Leith", description: "Book a chair online or walk in before five. 41 Mill Lane, Leith." },
      sections: [
        head(),
        place(S.hero, "hero"),
        place(S.prices, "prices"),
        place(S.ticker, "ticker"),
        place(S.booking, "book"),
        place(S.chairs, "chairs"),
        place(S.cuts, "cuts"),
        place(S.visitSteps, "visit"),
        place(S.visit, "hours"),
        place(S.faq, "faq"),
        place(S.callBand, "call"),
        foot(),
      ],
    },
    { key: "product", title: "Service", sections: [head(), place(S.product, "pd"), place(S.prices, "pd-prices", { heading: "All prices" }), place(S.visit, "pd-hours"), foot()] },
    { key: "collection", title: "Collection", sections: [head(), place(S.collection, "cl"), place(S.ticker, "cl-ticker"), place(S.callBand, "cl-call"), foot()] },
    { key: "products", title: "Book", sections: [head(), place(S.collection, "all", { heading: "Book a service" }), place(S.prices, "all-prices"), place(S.callBand, "all-call"), foot()] },
    { key: "search", title: "Search", sections: [head(), place(S.collection, "found", { heading: "Search" }), place(S.callBand, "found-call"), foot()] },
    {
      key: "about",
      title: "About",
      seo: { title: "About Sable" },
      sections: [head(), place(S.about, "ab"), place(S.chairs, "ab-chairs"), place(S.cuts, "ab-cuts"), place(S.visitSteps, "ab-visit"), place(S.ticker, "ab-ticker"), place(S.callBand, "ab-call"), foot()],
    },
    {
      key: "contact",
      title: "Contact",
      seo: { title: "Contact Sable" },
      sections: [head(), place(S.contact, "ct"), place(S.visit, "ct-hours"), place(S.faq, "ct-faq"), place(S.booking, "ct-book"), place(S.ticker, "ct-ticker"), place(S.callBand, "ct-call"), foot()],
    },
  ]
}

const SHOP = "warm interior photography of a neighbourhood barbershop and salon, tungsten and window light, green tiles, brass and leather, real customers and barbers, candid, 35mm, no text, no logos"
const chair = (n: number) => [at("home", "chairs", "photo", `chairs-b${n}`), at("about", "ab-chairs", "photo", `ab-chairs-b${n}`)]
const cut = (n: number) => [at("home", "cuts", "photo", `cuts-b${n}`), at("about", "ab-cuts", "photo", `ab-cuts-b${n}`)]

export const salonChair: SiteTemplate = assembleB({
  id: "salon-chair",
  name: "Sable",
  summary: "A local barber, salon or beauty studio that leads with booking: today's hours and a Book button always in reach, a price board, booking from the real service products, the chairs, recent cuts sideways, hours and directions.",
  industries: ["barber-tattoo", "beauty", "wellness"],
  stories: ["local-professional", "wellness-studio"],
  styles: ["local", "booking-led", "sturdy", "warm"],
  directionIds: ["hospitality-photo", "workshop-craft", "retro-analog"],
  keywords: ["barber", "barbershop", "hair salon", "beauty salon", "nail studio", "brows", "lashes", "hairdresser", "tattoo studio", "grooming"],
  motion: "balanced",
  prefix: "sb",
  files: filesOf(S.ALL),
  pages: pages(),
  tokens: {
    colors: { background: "#eceee9", surface: "#e0e3dc", text: "#13201a", muted: "#4b574f", accent: "#d6a21a", accentText: "#13201a", border: "#bfc5bc", inverse: { background: "#13281f", text: "#eceee9", accent: "#e8b931" } },
    fonts: { heading: "Zilla Slab", body: "Albert Sans" },
    typeScale: { base: 17, ratio: 1.414 },
    radius: { small: 0, medium: 2, large: 4 },
    spacing: { scale: 1, sectionY: 96, pageWidth: 1280, gutter: 20 },
    motion: { level: "subtle", tier: "balanced" },
  },
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Prices", url: "/#section-prices" }, { title: "Book", url: "/products", links: [{ title: "All services", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Book", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Search", url: "/search" }, { title: "Your bookings", url: "/account" }] },
  },
  imageSlots: [
    slot("hero-chair", "4:5", "photo", "A barber finishing a fade with clippers in a warm lit shop", `A barber finishing a skin fade with clippers on a customer, side light from the shop window, ${SHOP}`, at("home", "hero", "photo")),
    slot("chair-callum", "4:5", "portrait", "A barber with tattooed forearms holding clippers", `Portrait of a male barber in his thirties with tattooed forearms holding clippers, ${SHOP}`, ...chair(1)),
    slot("chair-nadia", "4:5", "portrait", "A stylist smiling with scissors in hand", `Portrait of a female hair stylist smiling with scissors in hand, ${SHOP}`, ...chair(2)),
    slot("chair-ross", "4:5", "portrait", "A barber stropping a straight razor", `Portrait of an older barber stropping a straight razor, ${SHOP}`, ...chair(3)),
    slot("chair-mei", "4:5", "portrait", "A barber cutting a child's hair, both laughing", `Portrait of a young barber cutting a laughing child's hair, ${SHOP}`, ...chair(4)),
    slot("cut-fade", "4:5", "photo", "Side view of a fresh mid fade with a textured top", `Side view of a fresh mid fade with a textured top, close up, ${SHOP}`, ...cut(1)),
    slot("cut-layers", "4:5", "photo", "Long wavy hair with soft layers from behind", `Long wavy hair with soft layers seen from behind in a salon chair, ${SHOP}`, ...cut(2)),
    slot("cut-beard", "4:5", "photo", "A neatly shaped full beard in profile", `A neatly shaped full beard in profile after a hot towel, ${SHOP}`, ...cut(3)),
    slot("cut-crop", "4:5", "photo", "A short textured crop with a sharp line up", `A short textured crop with a sharp line up, close up, ${SHOP}`, ...cut(4)),
    slot("cut-grey", "4:5", "photo", "Short hair with natural looking blended grey", `Short grey blended hair on a man in his fifties, close up, ${SHOP}`, ...cut(5)),
    slot("place-front", "4:3", "photo", "The shop front on a cobbled lane with a striped pole and green door", `The shop front on a cobbled lane with a striped barber pole and a green door, late afternoon, ${SHOP}`, at("home", "hours", "photo"), at("product", "pd-hours", "photo"), at("contact", "ct-hours", "photo")),
    slot("about-room", "4:3", "photo", "Inside the shop: four leather chairs, a long mirror and green tiles", `Inside the shop: four leather barber chairs, a long mirror and green tiled walls, ${SHOP}`, at("about", "ab", "photo")),
  ],
  bindings: [
    { page: "home", section: "book", setting: "products", kind: "products", why: "Booking is the store's real service products, each with its own checkout: choose them, or the newest show." },
    { page: "home", section: "hdr", setting: "menu", kind: "menu", why: "The header reads the main menu." },
    { page: "home", section: "ftr", setting: "menu", kind: "menu", why: "The footer's links are the footer menu." },
  ],
  design: {
    thesis: "A photograph from the chair beside a sturdy slab promise, with Book a chair in brass and the three facts that decide a booking.",
    layout: ["Today's hours and address in a strip above the header", "A price board with dotted leaders", "Booking from real products with one Book each", "Hours as a real table beside the shop front"],
    imagery: "Warm, candid photographs inside a real neighbourhood shop: tiles, leather, tools, barbers at work and finished cuts.",
    motion: "Balanced: the hero rises, prices and steps arrive in turn, a running line of shop facts, recent cuts move sideways.",
    signature: ["Book button fixed at the bottom of a phone", "price board with dotted leaders", "brass on bottle green"],
    avoid: ["stock spa imagery", "invented star ratings", "pastel gradients", "pill buttons"],
  },
})
