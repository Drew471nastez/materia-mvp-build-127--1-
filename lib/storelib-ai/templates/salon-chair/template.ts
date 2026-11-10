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
    { key: "about", title: "About", sections: [head(), place(S.about, "ab"), place(S.chairs, "ab-chairs"), place(S.visitSteps, "ab-visit"), place(S.callBand, "ab-call"), foot()] },
    { key: "contact", title: "Contact", sections: [head(), place(S.contact, "ct"), place(S.visit, "ct-hours"), place(S.faq, "ct-faq"), foot()] },
  ]
}

const SHOP = "warm interior photography of a neighbourhood barbershop and salon, tungsten and window light, green tiles, brass and leather, real customers and barbers, candid, 35mm, no text, no logos"

export const salonChair: SiteTemplate = {
  id: "salon-chair",
  name: "Sable, barber or beauty salon",
  summary: "A local barber, salon or beauty studio that leads with booking: today's hours and a Book button always in reach, a price board, booking from real service products, the chairs, recent cuts sideways, hours and directions.",
  industries: ["barber", "hair salon", "beauty salon", "nail studio", "brow and lash", "spa", "local business", "tattoo studio"],
  styles: ["local", "booking-led", "sturdy", "warm"],
  directionIds: ["hospitality-photo", "workshop-craft", "retro-analog"],
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
  imageSlots: [
    slot("home/hero/photo", "7:8", `A barber finishing a skin fade with clippers on a customer, side light from the shop window, ${SHOP}`),
    slot("home/chairs/chairs-b1/photo", "9:11", `Portrait of a male barber in his thirties with tattooed forearms holding clippers, ${SHOP}`),
    slot("home/chairs/chairs-b2/photo", "9:11", `Portrait of a female hair stylist smiling with scissors in hand, ${SHOP}`),
    slot("home/chairs/chairs-b3/photo", "9:11", `Portrait of an older barber stropping a straight razor, ${SHOP}`),
    slot("home/chairs/chairs-b4/photo", "9:11", `Portrait of a young barber cutting a laughing child's hair, ${SHOP}`),
    slot("home/cuts/cuts-b1/photo", "4:5", `Side view of a fresh mid fade with a textured top, close up, ${SHOP}`),
    slot("home/cuts/cuts-b2/photo", "4:5", `Long wavy hair with soft layers seen from behind in a salon chair, ${SHOP}`),
    slot("home/cuts/cuts-b3/photo", "4:5", `A neatly shaped full beard in profile after a hot towel, ${SHOP}`),
    slot("home/cuts/cuts-b4/photo", "4:5", `A short textured crop with a sharp line up, close up, ${SHOP}`),
    slot("home/cuts/cuts-b5/photo", "4:5", `Short grey blended hair on a man in his fifties, close up, ${SHOP}`),
    slot("home/hours/photo", "4:3", `The shop front on a cobbled lane with a striped barber pole and a green door, late afternoon, ${SHOP}`),
    slot("about/ab/photo", "4:3", `Inside the shop: four leather barber chairs, a long mirror and green tiled walls, ${SHOP}`),
  ],
  menus: {
    "main-menu": { title: "Main", links: [{ title: "Prices", url: "/#section-prices" }, { title: "Book", url: "/products", links: [{ title: "All services", url: "/products" }, { title: "Collections", url: "/collections" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
    footer: { title: "Footer", links: [{ title: "Book", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }, { title: "Your bookings", url: "/account" }] },
  },
}
