/**
 * Scripted answers for the native engine (tests/native-engine-r2.test.ts):
 * what a careful model sends as submit_native_site arguments for six
 * businesses, written here by hand. They exist to drive the real
 * validation, placement, save and render code; nothing here says how good
 * a real model's site would be.
 */
import type { Capabilities } from "@/lib/website-builder/ai-site/capabilities"

type V = string | number | boolean | Record<string, number>
type Block = [string, Record<string, V>]

export const kv = (o: Record<string, V>) => Object.entries(o).map(([id, v]) => ({ id, value: typeof v === "string" ? v : JSON.stringify(v) }))

export function sec(type: string, scheme: "light" | "dark" | "alt", settings: Record<string, V>, blocks: Block[] = [], images: { slot: string; query: string; aspect: "landscape" | "portrait" | "square" }[] = []) {
  return { type, purpose: `The ${type.replace(/_/g, " ")} of the page`, scheme, settings: kv(settings), blocks: blocks.map(([t, s]) => ({ type: t, settings: kv(s) })), images }
}

export function site(input: { name: string; tagline: string; preset: string; palette?: Record<string, string>; heading: string; body: string; theme?: Record<string, V>; pages: { key: string; title: string; sections: ReturnType<typeof sec>[] }[] }) {
  const palette = { background: "", surface: "", text: "", heading: "", accent: "", button: "", button_text: "", ...(input.palette ?? {}) }
  return {
    brand: { name: input.name, tagline: input.tagline },
    voice: "plain, direct, warm",
    audience: "people who want this done well",
    conversion: "get in touch",
    imagery: "real people and real places in daylight",
    theme: { preset: input.preset, palette, font_heading: input.heading, font_body: input.body, settings: kv(input.theme ?? {}) },
    pages: input.pages.map((p) => ({ key: p.key, title: p.title, purpose: `The ${p.title} page`, sections: p.sections })),
  }
}

const points = (...items: [string, string][]): Block[] => items.map(([title, text]) => ["point", { title, text }])
const qas = (...items: [string, string][]): Block[] => items.map(([question, answer]) => ["qa", { question, answer }])

/** The consulting practice's real published form (a native_form takes its id). */
export const CALL_FORM = "6f1f6a3e-1111-4c2b-9a1e-0b6c2d1e3f40"

export interface Scenario {
  id: string
  prompt: string
  caps: Capabilities
  answer: ReturnType<typeof site>
}

const base = (name: string, products: { id: string; title: string; type: string; priceCents: number; url: string }[] = [], collections: { id: string; title: string; handle: string; published: boolean }[] = []): Capabilities => ({
  facts: {
    storeName: name.toLowerCase().replace(/[^a-z]/g, ""),
    live: true,
    totalProducts: products.length,
    publishedProducts: products.length,
    currency: "GBP",
    products: products.map((p) => ({ ...p, published: true })),
    collections,
    reviews: { count: 0, average: null, quotes: [] },
  },
  brand: { name, avatarUrl: null, tagline: null },
  productTypes: Object.fromEntries(products.map((p) => [p.type, 1])),
  communities: [],
  forms: { published: 0, bookings: 0 },
  blog: { posts: 0 },
})

export const SCENARIOS: Scenario[] = [
  {
    id: "fitness",
    prompt: "A premium fitness coach in Leeds: small group strength training for beginners, book a free intro session.",
    caps: base("Iron North Coaching", [{ id: "p-strength", title: "Eight week strength block", type: "service", priceCents: 12000, url: "/products/eight-week-strength" }]),
    answer: site({
      name: "Iron North Coaching",
      tagline: "Strength training for beginners in Leeds",
      preset: "performance_sport",
      palette: { background: "#0e1116", surface: "#171c24", text: "#e8edf2", heading: "#ffffff", accent: "#d7ff3a", button: "#d7ff3a", button_text: "#0e1116" },
      heading: "Oswald",
      body: "Inter",
      theme: { button_shape: "square", border_radius: 2, spacing_scale: 1.1 },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_media", "dark", { eyebrow: "Small groups in Leeds", heading: "Get strong without guessing", subheading: "Coached strength sessions for people who have never lifted, four to a group.", button_text: "Book a free intro", button_url: "/book", position: "bottom_left", height: "100" }, [], [{ slot: "image", query: "coach spotting barbell squat", aspect: "landscape" }]),
            sec("marquee", "dark", { size: "display", separator: "slash" }, [["item", { text: "Squat" }], ["item", { text: "Hinge" }], ["item", { text: "Press" }], ["item", { text: "Carry" }]]),
            sec("features_cards", "light", { eyebrow: "How it works", heading: "Three sessions, one plan", columns: { desktop: 3, mobile: 1 } }, [["card", { title: "An intro session", text: "We watch how you move and set your starting weights." }], ["card", { title: "Coached sessions", text: "Two a week, four people, one coach watching every rep." }], ["card", { title: "A written plan", text: "Your weights and notes in one place after each session." }]]),
            sec("sticky_story", "alt", { heading: "Your first month", subheading: "What changes, week by week." }, [["step", { title: "Week one", text: "Learn the five lifts with an empty bar." }], ["step", { title: "Week two", text: "Add weight where your form is steady." }], ["step", { title: "Week four", text: "Lift more than you thought you could, with good form." }]], [{ slot: "image", query: "woman deadlift gym chalk", aspect: "portrait" }]),
            sec("hero_product", "light", { heading: "The eight week strength block", subheading: "Sixteen coached sessions and a plan to keep going after.", button_text: "Join the next block", button_url: "/products/eight-week-strength" }, [], [{ slot: "image", query: "small group strength class", aspect: "square" }]),
            sec("faq_accordion", "light", { heading: "Before you book" }, qas(["Do I need any experience?", "No. Most people start with an empty bar."], ["What should I bring?", "Flat shoes, water and something you can move in."], ["Can I pause a block?", "Yes, once, for up to two weeks."])),
            sec("cta_banner", "dark", { heading: "Your first session is free", subheading: "Forty five minutes, no pressure to join.", button_text: "Book a free intro", button_url: "/book", background: "colour" }),
          ],
        },
        { key: "book", title: "Book", sections: [sec("contact", "light", { heading: "Book your free intro", text: "Tell us when suits you and what you want to get stronger for.", button_text: "Send", layout: "split" })] },
      ],
    }),
  },
  {
    id: "clothing",
    prompt: "A contemporary clothing brand from Glasgow: heavyweight basics, small runs, made locally.",
    caps: base("Kelvin Cloth", [{ id: "p-tee", title: "Heavy tee", type: "physical", priceCents: 4500, url: "/products/heavy-tee" }, { id: "p-hood", title: "Loopback hood", type: "physical", priceCents: 9500, url: "/products/loopback-hood" }], [{ id: "c-basics", title: "Basics", handle: "basics", published: true }]),
    answer: site({
      name: "Kelvin Cloth",
      tagline: "Heavyweight basics, cut and sewn in Glasgow",
      preset: "swiss_grid",
      heading: "Space Grotesk",
      body: "DM Sans",
      theme: { button_shape: "pill", page_width: 1440, card_shadow: "none" },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_editorial", "light", { eyebrow: "Run 07", heading: "Basics that outlast the trend", subheading: "Heavy cotton, cut and sewn ten minutes from the shop.", button_text: "Shop the run", button_url: "/products", layout: "split", image_side: "right" }, [], [{ slot: "image", query: "model heavyweight grey tshirt", aspect: "portrait" }]),
            sec("product_grid", "light", { heading: "This run", source: "chosen", chosen: "p-tee,p-hood", columns: { desktop: 4, mobile: 2 } }),
            sec("collections_grid", "alt", { heading: "Shop by kind", source: "chosen", chosen: "c-basics" }),
            sec("media_collage", "light", { heading: "Made on Argyle Street", big_side: "left" }, [["picture", { caption: "Cutting the hood panels" }], ["picture", { caption: "The knit, up close" }], ["picture", { caption: "Finished and folded" }]], [{ slot: "block:picture", query: "garment workshop sewing machine", aspect: "square" }]),
            sec("text_columns", "light", { heading: "Why heavyweight", columns: { desktop: 2, mobile: 1 } }, [["column", { heading: "It keeps its shape", body: "Thick cotton does not twist or sag after washing." }], ["column", { heading: "It is made here", body: "Every piece is cut and sewn in our own workroom." }]]),
            sec("newsletter_split", "dark", { heading: "Hear about the next run", subheading: "One email when it drops, nothing else.", button_text: "Sign up", layout: "text" }),
          ],
        },
        { key: "about", title: "About", sections: [sec("about_image", "light", { heading: "Two people, one workroom", body: "We started with one machine and a bolt of cotton.", image_side: "left" }, [], [{ slot: "image", query: "two tailors workroom glasgow", aspect: "landscape" }])] },
      ],
    }),
  },
  {
    id: "photography",
    prompt: "An editorial photography portfolio for a documentary photographer in Lisbon, commissions by enquiry.",
    caps: base("Rita Valente"),
    answer: site({
      name: "Rita Valente",
      tagline: "Documentary photographs from Lisbon",
      preset: "noir_gallery",
      heading: "Raleway",
      body: "Lato",
      theme: { image_border_radius: 0, animation_style: "fade-in" },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_centered", "dark", { heading: "Rita Valente", subheading: "Documentary photographs of people at work in Lisbon.", button_text: "See the work", button_url: "/work", background: "image" }, [], [{ slot: "image", query: "lisbon fishmonger market morning", aspect: "landscape" }]),
            sec("gallery_scroll", "dark", { heading: "Recent stories", size: "large", ratio: "4 / 5" }, [["picture", { caption: "The night bakers" }], ["picture", { caption: "Tram 28 drivers" }], ["picture", { caption: "Cork harvest" }]], [{ slot: "block:picture", query: "documentary portrait worker lisbon", aspect: "portrait" }]),
            sec("text_rich", "light", { heading: "Slow photographs", body: "<p>I spend weeks with the people I photograph, so the pictures are theirs as much as mine.</p>", align: "left" }),
            sec("multirow", "alt", { heading: "Ways to work together", alternate: true }, [["row", { heading: "Editorial", text: "Stories for magazines and newspapers." }], ["row", { heading: "Organisations", text: "Long projects about the people behind the work." }]], [{ slot: "block:row", query: "photographer camera street portrait", aspect: "landscape" }]),
            sec("about_timeline", "light", { heading: "Ten years of stories" }, [["moment", { when: "Spring", title: "First commission", text: "A week with Lisbon's tram drivers." }], ["moment", { when: "Autumn", title: "The cork harvest", text: "Three months in the Alentejo." }]]),
            sec("cta_simple", "dark", { heading: "Have a story in mind?", button_text: "Write to me", button_url: "/contact", align: "center" }),
          ],
        },
        { key: "work", title: "Work", sections: [sec("media_gallery", "dark", { heading: "Selected work", columns: { desktop: 3, mobile: 1 }, shape: "4 / 3" }, [["picture", { caption: "Bakers" }], ["picture", { caption: "Drivers" }], ["picture", { caption: "Harvest" }]], [{ slot: "block:picture", query: "black and white documentary photo", aspect: "landscape" }])] },
        { key: "contact", title: "Contact", sections: [sec("contact", "light", { heading: "Write to me", text: "Tell me about the story and when it happens.", button_text: "Send", layout: "stacked" })] },
      ],
    }),
  },
  {
    id: "skincare",
    prompt: "A luxury skincare brand: three products, plant oils, refillable glass, calm and expensive feeling.",
    caps: base("Maren", [{ id: "p-oil", title: "Face oil", type: "physical", priceCents: 6800, url: "/products/face-oil" }, { id: "p-balm", title: "Cleansing balm", type: "physical", priceCents: 5200, url: "/products/cleansing-balm" }, { id: "p-mist", title: "Toning mist", type: "physical", priceCents: 3800, url: "/products/toning-mist" }]),
    answer: site({
      name: "Maren",
      tagline: "Plant oils in refillable glass",
      preset: "quiet_luxury",
      palette: { background: "#f3f1ec", surface: "#e9e5dc", text: "#2b2a27", heading: "#1c1b19", accent: "#5b6b4f", button: "#1c1b19", button_text: "#f3f1ec" },
      heading: "Montserrat",
      body: "Lato",
      theme: { button_style: "outline", spacing_scale: 1.3 },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_split", "light", { heading: "Three oils, nothing else", subheading: "Cold pressed plant oils in glass you send back to refill.", button_text: "See the three", button_url: "/products", image_side: "left" }, [], [{ slot: "image", query: "amber glass dropper bottle stone", aspect: "portrait" }]),
            sec("product_spotlight", "alt", { heading: "The face oil", subheading: "Rosehip and sea buckthorn, pressed cold.", button_text: "Add to bag", button_url: "/products/face-oil" }, [["point", { label: "Skin", text: "Dry and normal" }], ["point", { label: "Use", text: "Three drops at night" }]]),
            sec("features_image", "light", { heading: "Why glass", marker: "number" }, points(["It comes back", "Send the empty bottle back in the same box."], ["It is refilled", "We clean it and fill it again."], ["Nothing is thrown away", "The box is paper and the label washes off."]), [{ slot: "image", query: "glass bottles refill counter", aspect: "landscape" }]),
            sec("feature_tabs", "light", { heading: "The ritual", media_side: "right" }, [["tab", { label: "Cleanse", text: "Melt the balm on dry skin, rinse warm." }], ["tab", { label: "Tone", text: "Two sprays of mist on damp skin." }], ["tab", { label: "Oil", text: "Three drops pressed in, not rubbed." }]]),
            sec("faq_columns", "alt", { heading: "Questions" }, qas(["How do refills work?", "Post the empty bottle back with the label we send."], ["Is it scented?", "Only by the plants it is made from."])),
            sec("cta_split", "dark", { heading: "Start with the face oil", button_text: "Add to bag", button_url: "/products/face-oil", style: "panel" }, [], [{ slot: "image", query: "skin oil drop hand", aspect: "square" }]),
          ],
        },
      ],
    }),
  },
  {
    id: "architecture",
    prompt: "A modern architecture studio in Copenhagen: housing and small public buildings, timber and light.",
    caps: base("Fjord Arkitekter"),
    answer: site({
      name: "Fjord Arkitekter",
      tagline: "Housing and small public buildings in timber",
      preset: "nordic_calm",
      heading: "DM Sans",
      body: "Inter",
      theme: { page_width: 1600, border_radius: 0, button_shape: "square" },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_media", "dark", { heading: "Buildings made of timber and light", button_text: "See the projects", button_url: "/projects", position: "bottom_left", overlay_style: "bottom" }, [], [{ slot: "image", query: "timber housing copenhagen facade", aspect: "landscape" }]),
            sec("bento_grid", "light", { heading: "Projects" }, [["tile", { title: "Nordhavn housing", text: "Forty homes around a shared courtyard." }], ["tile", { title: "Valby library", text: "A reading room under one timber roof." }], ["tile", { title: "Amager kindergarten", text: "Low rooms, big windows, a garden roof." }]], [{ slot: "block:tile", query: "timber building interior daylight", aspect: "square" }]),
            sec("text_image", "alt", { heading: "Why timber", body: "<p>It stores carbon, it is quick to build and it feels warm to live with.</p>", image_side: "right" }, [], [{ slot: "image", query: "cross laminated timber construction", aspect: "landscape" }]),
            sec("sticky_story", "light", { heading: "How a project goes" }, [["step", { title: "Listening", text: "We start with the people who will use the building." }], ["step", { title: "Drawing", text: "Sketches and models until the plan feels right." }], ["step", { title: "Building", text: "We stay on site until the keys are handed over." }]]),
            sec("text_columns", "light", { heading: "What we design" }, [["column", { heading: "Housing", body: "Homes for cooperatives and city housing companies." }], ["column", { heading: "Public buildings", body: "Libraries, schools and kindergartens." }]]),
            sec("cta_simple", "dark", { heading: "Planning a building?", button_text: "Talk to us", button_url: "/contact" }),
          ],
        },
        { key: "projects", title: "Projects", sections: [sec("multirow", "light", { heading: "All projects" }, [["row", { heading: "Nordhavn housing", text: "Forty homes, finished in spring." }], ["row", { heading: "Valby library", text: "A reading room for the neighbourhood." }]], [{ slot: "block:row", query: "modern timber library", aspect: "landscape" }])] },
        { key: "contact", title: "Contact", sections: [sec("contact", "light", { heading: "Talk to us", text: "Tell us about the site and who the building is for.", button_text: "Send" })] },
      ],
    }),
  },
  {
    id: "consulting",
    prompt: "A professional consulting practice: operations advice for family owned manufacturers, book a first call.",
    caps: { ...base("Calder Advisory"), forms: { published: 1, bookings: 1 } },
    answer: site({
      name: "Calder Advisory",
      tagline: "Operations advice for family manufacturers",
      preset: "heritage_navy",
      heading: "Plus Jakarta Sans",
      body: "Source Sans 3",
      theme: { button_shape: "rounded", card_shadow: "sm" },
      pages: [
        {
          key: "home",
          title: "Home",
          sections: [
            sec("hero_split", "light", { eyebrow: "For family manufacturers", heading: "Run the factory, not the fires", subheading: "Practical operations advice from people who have run plants themselves.", button_text: "Book a first call", button_url: "/call", image_side: "right" }, [], [{ slot: "image", query: "factory floor manager conversation", aspect: "landscape" }]),
            sec("features_grid", "light", { heading: "Where we help", columns: { desktop: 3, mobile: 1 }, marker: "number" }, points(["Planning", "A weekly plan the floor can actually follow."], ["Handovers", "From the founder to the next generation."], ["Cost", "Where the money goes, line by line."])),
            sec("text_image", "alt", { heading: "We have run plants", body: "<p>Before advising, each of us ran a factory floor for years.</p>", image_side: "left" }, [], [{ slot: "image", query: "industrial workshop family business", aspect: "landscape" }]),
            sec("comparison_table", "light", { heading: "Two ways to work with us" }, [["comparison_column", { name: "A review", description: "Two weeks on site and a written plan." }], ["comparison_column", { name: "Ongoing", description: "A day a week for six months." }], ["comparison_row", { feature: "On site visits" }], ["comparison_row", { feature: "Written plan" }]]),
            sec("faq_accordion", "light", { heading: "Questions owners ask" }, qas(["Do you only work with family firms?", "Mostly, because that is where we are most useful."], ["How does the first call work?", "Thirty minutes about where it hurts most."])),
            sec("native_form", "alt", { form_url: CALL_FORM, button_text: "Book a first call", presentation: "card" }),
          ],
        },
        { key: "call", title: "Book a call", sections: [sec("contact", "light", { heading: "Book a first call", text: "Tell us about the plant and the problem.", button_text: "Send" })] },
      ],
    }),
  },
]
