/**
 * ===========================================================================
 *  WHO EACH THEME CARD IS FOR (round AS)
 * ===========================================================================
 * The owner: "show how it would look using that theme with some creators
 * ... some real offers and real products and newsletter and social icons",
 * "it has those lines in the theme cards, which looks absolutely cheap".
 *
 * Every theme card draws a fictional creator's page: a name, a line about
 * them, a drawn portrait, three socials and a few blocks with real words (a
 * product with its price, a booking link, a newsletter, a plain link). Each
 * creator suits the theme's mood: a ceramicist on Terrazzo, a strength coach
 * on Blocks, a sculptor on Plaster. Nobody here is a real person.
 *
 * The pictures are drawn, not photographed: small SVGs made here from three
 * colours (the portrait, each product's picture), so the file stays small
 * and nothing is fetched. The portraits are faceless busts, a hair cut and
 * a colour each.
 *
 * Loaded on its own (./preview-content-loader) when the Design tab or the
 * onboarding's template step opens, so the editor's first load does not
 * carry it. A theme without its own creator takes its kind's (light,
 * gradient, dark, image).
 *
 * The words are the creators' own, like the words on any real page, so
 * they are not translated.
 */

export type Art =
  | "print" | "book" | "wave" | "vessel" | "kettle" | "photo" | "leaf" | "pixel" | "cup" | "chair" | "star"
  | "film" | "dish" | "plan" | "ticket" | "code" | "vinyl" | "camera" | "glass" | "flower" | "bust" | "swim"

type Cut = "short" | "buzz" | "bob" | "long" | "bun" | "curly" | "wave" | "hat"

export type Face = { skin: string; hair: string; cut: Cut; bg: string; top: string; specs?: boolean }

export type PreviewItem = { title: string; price: string; art: Art }

export type PreviewCreator = {
  name: string
  bio: string
  face: Face
  socials: readonly [string, string, string]
  /** The pictures' colours: ground, shape, accent. */
  palette: readonly [string, string, string]
  products: readonly [PreviewItem, PreviewItem]
  cta: string
  /** A link with a picture: a booking, "work with me". */
  link: { label: string; art: Art }
  link2: string
  news: { headline: string; desc: string; button: string }
  /** The blocks' order under the socials, when it is not the layout's own. */
  order?: readonly Slot[]
}

export type Slot = "product" | "link" | "link2" | "news"

/* Skin tones and hair, so the portraits differ across the grid. */
const S = { a: "#f3d7c2", b: "#e6b897", c: "#c98d64", d: "#a0673f", e: "#6f4529", f: "#4a2c1a" }
const H = { black: "#1d1a18", brown: "#4a2f1f", chestnut: "#7a4a2a", blond: "#c9a46a", grey: "#cfcac2", red: "#a8432a", white: "#ece8df" }

const CREATORS: Record<string, PreviewCreator> = {
  /* ── Light ─────────────────────────────────────────────── */
  default: {
    name: "Juno Park", bio: "Illustrator. Prints, stickers and a sketchbook club.",
    face: { skin: S.a, hair: H.black, cut: "bob", bg: "#f1e4d3", top: "#2b2b2b" },
    socials: ["instagram", "tiktok", "youtube"], palette: ["#f4e1cf", "#e2553f", "#1f3b73"],
    products: [{ title: "Botanical print set", price: "$24.00", art: "print" }, { title: "Sketchbook club, monthly", price: "$6.00", art: "book" }],
    cta: "Buy now", link: { label: "Commission a portrait", art: "star" }, link2: "Latest drawing videos",
    news: { headline: "The Friday sketch", desc: "One drawing and the story behind it.", button: "Join" },
  },
  air: {
    name: "Sofia Lind", bio: "Yoga teacher in Malmö. Slow flows and breathwork.",
    face: { skin: S.a, hair: H.blond, cut: "bun", bg: "#dfe6ee", top: "#9fb3c8" },
    socials: ["instagram", "youtube", "spotify"], palette: ["#e7edf4", "#9cb5cf", "#41617f"],
    products: [{ title: "30 day flow plan", price: "$29.00", art: "leaf" }, { title: "Breathwork audio", price: "$12.00", art: "wave" }],
    cta: "Start the plan", link: { label: "Book a private class", art: "leaf" }, link2: "Weekly class times",
    news: { headline: "Sunday stretch notes", desc: "A short practice for the week ahead.", button: "Join" },
  },
  studio: {
    name: "Tomás Ferreira", bio: "Furniture and objects from a small Porto workshop.",
    face: { skin: S.c, hair: H.brown, cut: "short", bg: "#e8dccb", top: "#4b5a3c", specs: true },
    socials: ["instagram", "pinterest", "youtube"], palette: ["#eadfce", "#b07d4f", "#3c3a33"],
    products: [{ title: "Oak side stool", price: "€240.00", art: "chair" }, { title: "Joinery guide", price: "€18.00", art: "book" }],
    cta: "Order", link: { label: "Visit the workshop", art: "chair" }, link2: "Made to order",
    news: { headline: "From the bench", desc: "New pieces before they go on sale.", button: "Join" },
  },
  paper: {
    name: "Elena Vasquez", bio: "Essays on cooking, memory and small towns.",
    face: { skin: S.b, hair: H.brown, cut: "long", bg: "#e4d8c2", top: "#7b2d26" },
    socials: ["substack", "instagram", "threads"], palette: ["#efe5d3", "#7b2d26", "#e2c9a0"],
    products: [{ title: "Kitchen almanac", price: "$18.00", art: "book" }, { title: "Recipe cards", price: "$9.00", art: "dish" }],
    cta: "Get the book", link: { label: "Read the latest essay", art: "book" }, link2: "Book me for a talk",
    news: { headline: "Letters from the table", desc: "A long essay every other Sunday.", button: "Subscribe" },
    order: ["news", "link", "product", "link2"],
  },
  cream: {
    name: "Hattie Moss", bio: "Sourdough, pies and a bakery open on Fridays.",
    face: { skin: S.a, hair: H.red, cut: "bun", bg: "#f3e3c3", top: "#3f5d4a" },
    socials: ["instagram", "tiktok", "pinterest"], palette: ["#f8ecd2", "#c98a3e", "#6b3f1d"],
    products: [{ title: "Starter kit and guide", price: "£22.00", art: "dish" }, { title: "Baking class", price: "£45.00", art: "cup" }],
    cta: "Get the kit", link: { label: "Friday pre-orders", art: "dish" }, link2: "Find the bakery",
    news: { headline: "Fresh out the oven", desc: "Bake day menus and new recipes.", button: "Join" },
  },
  riso: {
    name: "Kit Moreau", bio: "Risograph prints and zines in two colours.",
    face: { skin: S.b, hair: H.black, cut: "wave", bg: "#ff6f61", top: "#2340c7" },
    socials: ["instagram", "etsy", "website"], palette: ["#f3efe6", "#ff6f61", "#2340c7"],
    products: [{ title: "Two tone print", price: "$35.00", art: "print" }, { title: "Zine no. 7", price: "$12.00", art: "book" }],
    cta: "Buy", link: { label: "Studio open days", art: "print" }, link2: "Stockists",
    news: { headline: "New prints first", desc: "Small runs sell out. Hear first.", button: "Join" },
  },
  blocks: {
    name: "Bo Jensen", bio: "Strength coach. Programs for busy people.",
    face: { skin: S.c, hair: H.black, cut: "buzz", bg: "#111111", top: "#ffd23f" },
    socials: ["instagram", "youtube", "tiktok"], palette: ["#ffd23f", "#111111", "#ff5a36"],
    products: [{ title: "12 week strength plan", price: "$49.00", art: "kettle" }, { title: "Home gym guide", price: "$15.00", art: "plan" }],
    cta: "Start now", link: { label: "Book a coaching call", art: "kettle" }, link2: "Free workout",
    news: { headline: "Monday lift", desc: "A workout in your inbox every week.", button: "Join" },
  },
  editorial: {
    name: "Clara Wendt", bio: "Editor of a quarterly on design and slow travel.",
    face: { skin: S.a, hair: H.chestnut, cut: "bob", bg: "#d9cdb8", top: "#15130f" },
    socials: ["instagram", "substack", "linkedin"], palette: ["#e9e0cf", "#15130f", "#c0392b"],
    products: [{ title: "Issue 12: Coastlines", price: "€16.00", art: "book" }, { title: "Print subscription, a year", price: "€48.00", art: "photo" }],
    cta: "Buy", link: { label: "Pitch a story", art: "book" }, link2: "Where to buy",
    news: { headline: "The editor's letter", desc: "What we read and where we went.", button: "Subscribe" },
  },
  terrazzo: {
    name: "Noor Haddad", bio: "Ceramicist. Stoneware for everyday tables.",
    face: { skin: S.d, hair: H.black, cut: "long", bg: "#e7cdb8", top: "#c26d4a" },
    socials: ["instagram", "pinterest", "etsy"], palette: ["#efe8dd", "#c26d4a", "#2f5d62"],
    products: [{ title: "Speckled mug", price: "$38.00", art: "vessel" }, { title: "Pasta bowl pair", price: "$64.00", art: "dish" }],
    cta: "Add to bag", link: { label: "Wheel throwing class", art: "vessel" }, link2: "Kiln diary",
    news: { headline: "Kiln opening", desc: "First look at each firing.", button: "Join" },
  },
  gallery: {
    name: "Inês Duarte", bio: "Painter. Oil on linen, small editions on paper.",
    face: { skin: S.b, hair: H.brown, cut: "bun", bg: "#e5e0d6", top: "#16150f" },
    socials: ["instagram", "pinterest", "website"], palette: ["#f2efe8", "#b4553a", "#2d4a6b"],
    products: [{ title: "Giclée, edition of 50", price: "€90.00", art: "print" }, { title: "Studio sketchbook", price: "€22.00", art: "book" }],
    cta: "Buy", link: { label: "See the new series", art: "print" }, link2: "Exhibitions",
    news: { headline: "Studio notes", desc: "New work, shows and open studios.", button: "Join" },
  },
  swiss: {
    name: "Lukas Brandt", bio: "Graphic designer. Posters, identities, type.",
    face: { skin: S.a, hair: H.blond, cut: "short", bg: "#d7d6d0", top: "#0b0b0b", specs: true },
    socials: ["instagram", "website", "linkedin"], palette: ["#f2f1ec", "#e3241b", "#0b0b0b"],
    products: [{ title: "Poster 04, A2", price: "€45.00", art: "print" }, { title: "Grid systems PDF", price: "€19.00", art: "plan" }],
    cta: "Buy", link: { label: "Work with me", art: "plan" }, link2: "Selected work",
    news: { headline: "Type notes", desc: "Monthly. Posters and letterforms.", button: "Join" },
  },
  folio: {
    name: "Ada Lindqvist", bio: "Photographer. Landscapes and quiet portraits.",
    face: { skin: S.a, hair: H.blond, cut: "long", bg: "#d5dbe0", top: "#1d2329" },
    socials: ["instagram", "youtube", "website"], palette: ["#dfe6ea", "#3d5566", "#f2c66d"],
    products: [{ title: "Fjord print", price: "$60.00", art: "photo" }, { title: "Film presets", price: "$18.00", art: "camera" }],
    cta: "Buy", link: { label: "Book a shoot", art: "camera" }, link2: "Workshops in Norway",
    news: { headline: "Light notes", desc: "Where I shot this month and how.", button: "Join" },
  },
  notebook: {
    name: "Priya Raman", bio: "Maths tutor. Notes, worksheets and exam prep.",
    face: { skin: S.d, hair: H.black, cut: "long", bg: "#dfe5f5", top: "#5b7bd1", specs: true },
    socials: ["youtube", "instagram", "tiktok"], palette: ["#eef1fb", "#1f2a52", "#f2b84b"],
    products: [{ title: "Algebra workbook", price: "$14.00", art: "plan" }, { title: "Exam crash course", price: "$39.00", art: "book" }],
    cta: "Get it", link: { label: "Book a tutoring slot", art: "plan" }, link2: "Free practice sheets",
    news: { headline: "One problem a week", desc: "With the working, step by step.", button: "Join" },
  },
  gazette: {
    name: "The Hollow Gazette", bio: "Local news every Thursday. Reader funded.",
    face: { skin: S.b, hair: H.grey, cut: "short", bg: "#d8d1bf", top: "#15130f", specs: true },
    socials: ["substack", "x", "facebook"], palette: ["#ece6d6", "#15130f", "#9c2a1f"],
    products: [{ title: "Annual membership", price: "$60.00", art: "book" }, { title: "Print edition", price: "$3.00", art: "print" }],
    cta: "Join", link: { label: "Send us a tip", art: "book" }, link2: "This week's edition",
    news: { headline: "Thursday edition", desc: "The whole paper, free by email.", button: "Subscribe" },
    order: ["news", "product", "link"],
  },
  aqua: {
    name: "Rory Chen", bio: "I make small apps for the Mac and iPhone.",
    face: { skin: S.a, hair: H.black, cut: "wave", bg: "#cfe3f7", top: "#3d84d6" },
    socials: ["github", "x", "youtube"], palette: ["#e3eef9", "#2f78d0", "#ffffff"],
    products: [{ title: "Focus timer app", price: "$9.00", art: "pixel" }, { title: "Icon pack", price: "$5.00", art: "star" }],
    cta: "Download", link: { label: "Request a feature", art: "code" }, link2: "Changelog",
    news: { headline: "Release notes", desc: "New versions and beta invites.", button: "Join" },
  },
  messenger: {
    name: "Lena Brooks", bio: "Streamer and podcast host. Late night chats.",
    face: { skin: S.b, hair: H.chestnut, cut: "long", bg: "#cfe0fb", top: "#2f6fdc" },
    socials: ["twitch", "youtube", "discord"], palette: ["#e6effd", "#2f6fdc", "#7ed957"],
    products: [{ title: "Members club, monthly", price: "$5.00", art: "star" }, { title: "Cozy hoodie", price: "$48.00", art: "pixel" }],
    cta: "Join", link: { label: "Watch tonight's stream", art: "film" }, link2: "Podcast episodes",
    news: { headline: "Stream schedule", desc: "When I'm live, every week.", button: "Join" },
  },
  playful: {
    name: "Pip Andersen", bio: "Stickers, colouring books and silly drawings.",
    face: { skin: S.a, hair: H.red, cut: "curly", bg: "#ffd6a5", top: "#ff6b6b" },
    socials: ["instagram", "tiktok", "etsy"], palette: ["#fdf3e1", "#ff6b6b", "#4ecdc4"],
    products: [{ title: "Sticker sheet", price: "$6.00", art: "star" }, { title: "Colouring book", price: "$14.00", art: "book" }],
    cta: "Grab it", link: { label: "Custom pet drawings", art: "star" }, link2: "Free colouring page",
    news: { headline: "Doodle mail", desc: "A free drawing every month.", button: "Yes please" },
  },
  grunge: {
    name: "The Static Hours", bio: "Four piece from Leeds. New EP out now.",
    face: { skin: S.a, hair: H.black, cut: "hat", bg: "#d7d4cb", top: "#0d0d0d" },
    socials: ["spotify", "bandcamp", "instagram"], palette: ["#e7e5de", "#0d0d0d", "#d42d17"],
    products: [{ title: "Low Tide EP, vinyl", price: "£18.00", art: "vinyl" }, { title: "Tour shirt", price: "£22.00", art: "print" }],
    cta: "Buy", link: { label: "Tour dates", art: "ticket" }, link2: "Listen on Bandcamp",
    news: { headline: "Mailing list", desc: "Shows and presales first.", button: "Sign up" },
  },
  aqua2: {
    name: "Sam Ortega", bio: "Indie developer. Writing tools for the Mac.",
    face: { skin: S.c, hair: H.brown, cut: "short", bg: "#c9ced6", top: "#4c5563", specs: true },
    socials: ["github", "bluesky", "youtube"], palette: ["#dfe2e7", "#4c5563", "#f5f6f8"],
    products: [{ title: "Draft, a writing app", price: "$19.00", art: "code" }, { title: "Theme pack", price: "$4.00", art: "pixel" }],
    cta: "Download", link: { label: "Docs and support", art: "code" }, link2: "Roadmap",
    news: { headline: "Dev log", desc: "What shipped and what's next.", button: "Join" },
  },
  messenger2: {
    name: "Olive & Fern", bio: "Houseplants, cuttings and care guides.",
    face: { skin: S.b, hair: H.brown, cut: "bun", bg: "#dfe4c6", top: "#56701c" },
    socials: ["instagram", "tiktok", "pinterest"], palette: ["#eef0dc", "#56701c", "#c9a227"],
    products: [{ title: "Monstera cutting", price: "£14.00", art: "leaf" }, { title: "Care guide", price: "£7.00", art: "book" }],
    cta: "Order", link: { label: "Plant doctor call", art: "leaf" }, link2: "Shop visits",
    news: { headline: "New arrivals", desc: "Rare plants as they come in.", button: "Join" },
  },
  grunge2: {
    name: "Xerox Club", bio: "Photocopied zines and gig posters.",
    face: { skin: S.c, hair: H.black, cut: "buzz", bg: "#ece6d6", top: "#111111" },
    socials: ["instagram", "bandcamp", "website"], palette: ["#ece6d6", "#111111", "#e6007e"],
    products: [{ title: "Zine bundle", price: "$15.00", art: "book" }, { title: "Gig poster", price: "$10.00", art: "print" }],
    cta: "Buy", link: { label: "Submit your zine", art: "print" }, link2: "Next zine fair",
    news: { headline: "Photocopy post", desc: "New issues, fairs and swaps.", button: "Join" },
  },

  /* ── Gradient ──────────────────────────────────────────── */
  sunset: {
    name: "Lucía Reyes", bio: "Singer and songwriter. On tour this spring.",
    face: { skin: S.c, hair: H.black, cut: "long", bg: "#e48a5c", top: "#3d1810" },
    socials: ["spotify", "instagram", "youtube"], palette: ["#f2b38a", "#8f3b28", "#fff1e0"],
    products: [{ title: "Golden Hour, vinyl", price: "$28.00", art: "vinyl" }, { title: "Signed poster", price: "$20.00", art: "print" }],
    cta: "Buy", link: { label: "Tour tickets", art: "ticket" }, link2: "Listen to the album",
    news: { headline: "Tour updates", desc: "Presales before anyone else.", button: "Join" },
  },
  peach: {
    name: "Bea Laurent", bio: "Skincare routines for sensitive skin.",
    face: { skin: S.a, hair: H.chestnut, cut: "wave", bg: "#fbc49b", top: "#f6efe7" },
    socials: ["tiktok", "instagram", "youtube"], palette: ["#ffe2cc", "#f08a5d", "#ffffff"],
    products: [{ title: "Routine planner", price: "$12.00", art: "plan" }, { title: "Ingredient guide", price: "$9.00", art: "leaf" }],
    cta: "Get it", link: { label: "Skin consult", art: "flower" }, link2: "My shelf",
    news: { headline: "Skin notes", desc: "Honest reviews, twice a month.", button: "Join" },
  },
  sage: {
    name: "Iris Holm", bio: "Kitchen gardener. Seeds, recipes, seasons.",
    face: { skin: S.a, hair: H.blond, cut: "hat", bg: "#c7d3ba", top: "#5b6b4a" },
    socials: ["instagram", "youtube", "pinterest"], palette: ["#dfe7d4", "#5b6b4a", "#e2a33b"],
    products: [{ title: "Heirloom seed box", price: "€24.00", art: "leaf" }, { title: "Seasonal recipes", price: "€12.00", art: "dish" }],
    cta: "Buy", link: { label: "Garden tour", art: "flower" }, link2: "What to sow now",
    news: { headline: "The plot", desc: "What to sow and cook this month.", button: "Join" },
  },
  ocean: {
    name: "Kai Mahina", bio: "Surf coach on the north shore. Lessons all year.",
    face: { skin: S.d, hair: H.brown, cut: "curly", bg: "#7cc3d6", top: "#0c4a6e" },
    socials: ["instagram", "youtube", "tiktok"], palette: ["#bfe6ef", "#0c4a6e", "#ffd27a"],
    products: [{ title: "Beginner surf course", price: "$120.00", art: "swim" }, { title: "Board wax", price: "$8.00", art: "star" }],
    cta: "Book", link: { label: "Book a lesson", art: "swim" }, link2: "Surf report",
    news: { headline: "Swell alerts", desc: "When the waves are good.", button: "Join" },
  },
  aurora: {
    name: "Elin Strand", bio: "Sound baths and guided meditation.",
    face: { skin: S.a, hair: H.blond, cut: "long", bg: "#2f7d6c", top: "#ecfdf5" },
    socials: ["spotify", "youtube", "instagram"], palette: ["#c6f1e1", "#0b3a33", "#7ee0c3"],
    products: [{ title: "Sleep meditation", price: "€9.00", art: "wave" }, { title: "Retreat weekend", price: "€320.00", art: "star" }],
    cta: "Listen", link: { label: "Book a sound bath", art: "wave" }, link2: "Free 10 minute session",
    news: { headline: "Quiet hour", desc: "A new meditation each month.", button: "Join" },
  },
  lagoon: {
    name: "Marco Bellini", bio: "Open water swim coach on Lake Como.",
    face: { skin: S.b, hair: H.brown, cut: "short", bg: "#a8dcd0", top: "#0c3b35" },
    socials: ["instagram", "youtube", "whatsapp"], palette: ["#d6f0ea", "#0c3b35", "#5ccab3"],
    products: [{ title: "Open water plan", price: "€35.00", art: "swim" }, { title: "Technique videos", price: "€19.00", art: "film" }],
    cta: "Start", link: { label: "Book a group swim", art: "swim" }, link2: "Water temperature",
    news: { headline: "Swim week", desc: "Sessions and lake conditions.", button: "Join" },
  },
  cobalt: {
    name: "Dev Malhotra", bio: "Podcast host. Money, work and the long game.",
    face: { skin: S.d, hair: H.black, cut: "short", bg: "#3953d8", top: "#fff4dc", specs: true },
    socials: ["spotify", "youtube", "x"], palette: ["#2343d6", "#fff4dc", "#ffb547"],
    products: [{ title: "Budget spreadsheet", price: "$15.00", art: "plan" }, { title: "Live workshop", price: "$49.00", art: "film" }],
    cta: "Get it", link: { label: "Latest episode", art: "wave" }, link2: "Sponsor the show",
    news: { headline: "The Monday memo", desc: "One idea about money a week.", button: "Join" },
  },
  halo: {
    name: "Selene Ward", bio: "Journaling prompts and slow mornings.",
    face: { skin: S.a, hair: H.brown, cut: "bun", bg: "#e8c3df", top: "#2a2236" },
    socials: ["instagram", "pinterest", "substack"], palette: ["#f4dcec", "#2a2236", "#c79ad8"],
    products: [{ title: "Morning pages journal", price: "$22.00", art: "book" }, { title: "Prompt cards", price: "$14.00", art: "star" }],
    cta: "Buy", link: { label: "1:1 clarity session", art: "flower" }, link2: "Read the blog",
    news: { headline: "Soft Sunday", desc: "Three prompts for the week.", button: "Join" },
  },
  aero: {
    name: "Noah Fischer", bio: "Travel films from the Alps to the Azores.",
    face: { skin: S.a, hair: H.blond, cut: "wave", bg: "#9fd3f3", top: "#2b8be0" },
    socials: ["youtube", "instagram", "tiktok"], palette: ["#c9ebff", "#2b8be0", "#7bd34b"],
    products: [{ title: "Azores travel guide", price: "€19.00", art: "photo" }, { title: "Drone presets", price: "€15.00", art: "camera" }],
    cta: "Get it", link: { label: "Watch the new film", art: "film" }, link2: "My camera gear",
    news: { headline: "Next trip", desc: "Where I'm going and what to pack.", button: "Join" },
  },
  y2k2: {
    name: "Mimi Sato", bio: "Dance covers and a little sticker shop.",
    face: { skin: S.a, hair: H.black, cut: "bun", bg: "#f6c9ec", top: "#a35bd8" },
    socials: ["tiktok", "youtube", "instagram"], palette: ["#f6e6ff", "#d36ad6", "#ffd1f0"],
    products: [{ title: "Sparkle sticker pack", price: "$7.00", art: "star" }, { title: "Dance class", price: "$25.00", art: "film" }],
    cta: "Buy", link: { label: "Learn this dance", art: "film" }, link2: "Fan art wall",
    news: { headline: "Mimi mail", desc: "New covers and shop drops.", button: "Join" },
  },
  vaporwave: {
    name: "Neon Riviera", bio: "Synthwave producer. New album at midnight.",
    face: { skin: S.b, hair: H.black, cut: "hat", bg: "#ff5fa2", top: "#2a0a4f" },
    socials: ["spotify", "soundcloud", "youtube"], palette: ["#2a0a4f", "#ff5fa2", "#3ff3ff"],
    products: [{ title: "Night Drive, cassette", price: "$16.00", art: "vinyl" }, { title: "Sample pack", price: "$25.00", art: "wave" }],
    cta: "Buy", link: { label: "Live set tickets", art: "ticket" }, link2: "Stream the album",
    news: { headline: "Signal", desc: "Releases and shows first.", button: "Tune in" },
  },

  /* ── Dark ──────────────────────────────────────────────── */
  olive: {
    name: "Anders Vik", bio: "Fly fishing guide and knot tier.",
    face: { skin: S.b, hair: H.grey, cut: "hat", bg: "#4b5641", top: "#c9b88a" },
    socials: ["instagram", "youtube", "facebook"], palette: ["#3d4733", "#d9caa0", "#a6612f"],
    products: [{ title: "River day, guided", price: "$180.00", art: "swim" }, { title: "Fly box, 24 flies", price: "$42.00", art: "star" }],
    cta: "Book", link: { label: "Check river dates", art: "photo" }, link2: "Knot tutorials",
    news: { headline: "River report", desc: "Water levels and what's biting.", button: "Join" },
  },
  astrid: {
    name: "Jade Kim", bio: "DJ. House and disco, Thursdays at Lumen.",
    face: { skin: S.a, hair: H.black, cut: "bob", bg: "#2a2a2a", top: "#f2f2f2" },
    socials: ["soundcloud", "instagram", "spotify"], palette: ["#1a1a1a", "#f2f2f2", "#9a9a9a"],
    products: [{ title: "Summer mix, download", price: "$5.00", art: "vinyl" }, { title: "Club tickets", price: "$15.00", art: "ticket" }],
    cta: "Buy", link: { label: "Book me for your event", art: "vinyl" }, link2: "Latest mix",
    news: { headline: "Guest list", desc: "Free entry before 11pm.", button: "Join" },
  },
  night: {
    name: "Theo Grant", bio: "Astrophotographer. Dark skies, long exposures.",
    face: { skin: S.b, hair: H.brown, cut: "short", bg: "#1f2733", top: "#c9c4b8" },
    socials: ["instagram", "youtube", "website"], palette: ["#0f1520", "#f3efe6", "#6c7fa3"],
    products: [{ title: "Milky Way print", price: "$75.00", art: "star" }, { title: "Night sky course", price: "$59.00", art: "camera" }],
    cta: "Buy", link: { label: "Join a night shoot", art: "camera" }, link2: "Moon calendar",
    news: { headline: "Clear skies", desc: "The best nights to shoot, monthly.", button: "Join" },
  },
  graphite: {
    name: "Max Keller", bio: "Honest reviews of cameras and laptops.",
    face: { skin: S.a, hair: H.brown, cut: "wave", bg: "#3a3d42", top: "#d8d8d4", specs: true },
    socials: ["youtube", "x", "instagram"], palette: ["#2b2e33", "#d8d8d4", "#7aa2ff"],
    products: [{ title: "Desk setup guide", price: "$12.00", art: "code" }, { title: "LUT pack", price: "$20.00", art: "camera" }],
    cta: "Get it", link: { label: "Latest review", art: "film" }, link2: "My kit",
    news: { headline: "The short list", desc: "What's worth buying this month.", button: "Join" },
  },
  midnight: {
    name: "Kairo", bio: "Rapper and producer from Lagos.",
    face: { skin: S.f, hair: H.black, cut: "buzz", bg: "#1e2a4a", top: "#0b1020" },
    socials: ["spotify", "youtube", "instagram"], palette: ["#0b1226", "#f8fafc", "#8ea2ff"],
    products: [{ title: "Midnight Run, vinyl", price: "$30.00", art: "vinyl" }, { title: "Beat lease", price: "$40.00", art: "wave" }],
    cta: "Buy", link: { label: "Tour dates", art: "ticket" }, link2: "New video",
    news: { headline: "Drop alerts", desc: "Music and merch before release.", button: "Join" },
  },
  space: {
    name: "Vera Sol", bio: "Science fiction author. Book three out in May.",
    face: { skin: S.b, hair: H.white, cut: "bob", bg: "#1c1c2e", top: "#4b4bd6" },
    socials: ["instagram", "threads", "substack"], palette: ["#0d0d1a", "#e7e7ff", "#ff7a59"],
    products: [{ title: "The Long Orbit", price: "$18.00", art: "book" }, { title: "Signed set", price: "$52.00", art: "star" }],
    cta: "Buy", link: { label: "Read chapter one", art: "book" }, link2: "Events",
    news: { headline: "Transmissions", desc: "Short stories, sent monthly.", button: "Join" },
  },
  neon: {
    name: "Zed Rivera", bio: "Speedrunner. Live most nights.",
    face: { skin: S.c, hair: H.black, cut: "hat", bg: "#1a1a1f", top: "#2bd9a0" },
    socials: ["twitch", "youtube", "discord"], palette: ["#0e0e12", "#2bd9a0", "#ff4fd8"],
    products: [{ title: "Route guide", price: "$10.00", art: "pixel" }, { title: "Glow hoodie", price: "$55.00", art: "star" }],
    cta: "Buy", link: { label: "Watch live", art: "film" }, link2: "World records",
    news: { headline: "Run alerts", desc: "When a record attempt starts.", button: "Join" },
  },
  blueprint: {
    name: "Hana Ito", bio: "Architect. Small houses, drawn by hand.",
    face: { skin: S.a, hair: H.black, cut: "bob", bg: "#1d4d80", top: "#f3f8fd", specs: true },
    socials: ["instagram", "linkedin", "website"], palette: ["#123b66", "#f3f8fd", "#7fb2e5"],
    products: [{ title: "Cabin plans, PDF", price: "$85.00", art: "plan" }, { title: "Sketch course", price: "$45.00", art: "book" }],
    cta: "Buy", link: { label: "Book a consultation", art: "plan" }, link2: "Recent projects",
    news: { headline: "Site visits", desc: "Projects from sketch to keys.", button: "Join" },
  },
  ember: {
    name: "Camille Roux", bio: "Sommelier. Natural wine, small producers.",
    face: { skin: S.a, hair: H.chestnut, cut: "wave", bg: "#3a2a20", top: "#e2a35b" },
    socials: ["instagram", "youtube", "substack"], palette: ["#2a1f18", "#e2a35b", "#7a1f2b"],
    products: [{ title: "Tasting box, 3 bottles", price: "€65.00", art: "glass" }, { title: "Wine notes guide", price: "€14.00", art: "book" }],
    cta: "Order", link: { label: "Private tasting", art: "glass" }, link2: "Where I pour",
    news: { headline: "Cellar notes", desc: "Three bottles worth finding.", button: "Join" },
  },
  ledger: {
    name: "Ruth Abrams", bio: "Bookkeeper for freelancers. Plain numbers.",
    face: { skin: S.b, hair: H.grey, cut: "bob", bg: "#2a2e2a", top: "#ecebe4", specs: true },
    socials: ["linkedin", "youtube", "substack"], palette: ["#1d211d", "#ecebe4", "#8fbf7a"],
    products: [{ title: "Tax year template", price: "$29.00", art: "plan" }, { title: "Invoice kit", price: "$12.00", art: "code" }],
    cta: "Buy", link: { label: "Book a numbers call", art: "plan" }, link2: "Deadlines this year",
    news: { headline: "Quarterly checklist", desc: "What to file and when.", button: "Join" },
  },
  acid: {
    name: "Rhys Okoro", bio: "Streetwear drops, made in small runs.",
    face: { skin: S.e, hair: H.black, cut: "buzz", bg: "#c6ff3d", top: "#0b0b0a" },
    socials: ["instagram", "tiktok", "youtube"], palette: ["#151514", "#c6ff3d", "#f4f4ee"],
    products: [{ title: "Drop 09 tee", price: "$45.00", art: "print" }, { title: "Logo cap", price: "$30.00", art: "star" }],
    cta: "Cop", link: { label: "Lookbook", art: "camera" }, link2: "Next drop",
    news: { headline: "Drop list", desc: "An hour early, every drop.", button: "Join" },
  },
  y2k: {
    name: "Kiki Vale", bio: "Pixel artist and cosplay maker.",
    face: { skin: S.a, hair: H.white, cut: "long", bg: "#3a2f8a", top: "#ff5fd2" },
    socials: ["instagram", "tiktok", "twitch"], palette: ["#1d1846", "#b9a4ff", "#ff5fd2"],
    products: [{ title: "Pixel pet keychain", price: "$12.00", art: "pixel" }, { title: "Cosplay patterns", price: "$20.00", art: "star" }],
    cta: "Buy", link: { label: "Commission a sprite", art: "pixel" }, link2: "Con schedule",
    news: { headline: "Kiki's inbox", desc: "New pixels, cons and drops.", button: "Join" },
  },
  aero2: {
    name: "Mara Quinn", bio: "Marine biologist. Reef films and field notes.",
    face: { skin: S.c, hair: H.brown, cut: "long", bg: "#0e5a83", top: "#e6faff" },
    socials: ["youtube", "instagram", "patreon"], palette: ["#06395a", "#9fe7ff", "#ffb36b"],
    products: [{ title: "Reef field guide", price: "$16.00", art: "book" }, { title: "Ocean print", price: "$35.00", art: "swim" }],
    cta: "Buy", link: { label: "Watch the reef film", art: "film" }, link2: "Support the research",
    news: { headline: "Field notes", desc: "From the boat, every month.", button: "Join" },
  },
  playful2: {
    name: "Bram Doyle", bio: "Comics about cats, coffee and deadlines.",
    face: { skin: S.a, hair: H.chestnut, cut: "curly", bg: "#ffcf4a", top: "#ff5a5f", specs: true },
    socials: ["instagram", "bluesky", "patreon"], palette: ["#262626", "#ffcf4a", "#ff5a5f"],
    products: [{ title: "Comic collection", price: "$22.00", art: "book" }, { title: "Cat mug", price: "$16.00", art: "cup" }],
    cta: "Buy", link: { label: "Read the new strip", art: "star" }, link2: "Patreon extras",
    news: { headline: "New strip Tuesday", desc: "Comics straight to your inbox.", button: "Join" },
  },
  classic98: {
    name: "Gil Navarro", bio: "Restoring old PCs. Guides and spare parts.",
    face: { skin: S.b, hair: H.grey, cut: "short", bg: "#c0c0c0", top: "#000080", specs: true },
    socials: ["youtube", "github", "discord"], palette: ["#c0c0c0", "#000080", "#ffffff"],
    products: [{ title: "Restoration guide", price: "$15.00", art: "code" }, { title: "Floppy art print", price: "$12.00", art: "pixel" }],
    cta: "Buy", link: { label: "Repair requests", art: "code" }, link2: "Parts list",
    news: { headline: "Boot log", desc: "New builds and finds.", button: "Join" },
  },
  arcade: {
    name: "Lou Tanaka", bio: "Chiptune musician and game jam regular.",
    face: { skin: S.a, hair: H.black, cut: "hat", bg: "#2b2b6b", top: "#ff3b5c" },
    socials: ["bandcamp", "youtube", "twitch"], palette: ["#0b0b23", "#ffe66d", "#ff3b5c"],
    products: [{ title: "8 bit album", price: "$8.00", art: "pixel" }, { title: "Sound effects pack", price: "$15.00", art: "wave" }],
    cta: "Buy", link: { label: "Music for your game", art: "pixel" }, link2: "Play my jam games",
    news: { headline: "Player two", desc: "New tracks and jam results.", button: "Join" },
  },
  renaissance: {
    name: "Beatrice Valli", bio: "Oil painter. Portraits from life, in the old way.",
    face: { skin: S.a, hair: H.chestnut, cut: "curly", bg: "#3a2a1c", top: "#7a1f1a" },
    socials: ["instagram", "youtube", "website"], palette: ["#f3ead6", "#7a1f1a", "#b08a3e"],
    products: [{ title: "Portrait commission", price: "€900.00", art: "print" }, { title: "Glazing workshop", price: "€120.00", art: "star" }],
    cta: "Enquire", link: { label: "Sit for a portrait", art: "print" }, link2: "Works in progress",
    news: { headline: "From the easel", desc: "One painting a month, layer by layer.", button: "Subscribe" },
  },
  plaster: {
    name: "Livia Conti", bio: "Sculptor. Figure drawing in plaster and charcoal.",
    face: { skin: S.b, hair: H.black, cut: "bun", bg: "#2a2926", top: "#ece8df" },
    socials: ["instagram", "youtube", "substack"], palette: ["#121211", "#ece8df", "#8f8a80"],
    products: [{ title: "Cast drawing course", price: "€85.00", art: "bust" }, { title: "Charcoal study, A3", price: "€140.00", art: "print" }],
    cta: "Enrol", link: { label: "Life drawing, Thursdays", art: "bust" }, link2: "Studio archive",
    news: { headline: "Studio letter", desc: "One study and how it was made.", button: "Subscribe" },
  },

  /* ── Image ─────────────────────────────────────────────── */
  nature: {
    name: "Esme Rowe", bio: "Trail runner and mountain guide.",
    face: { skin: S.a, hair: H.chestnut, cut: "long", bg: "#6d8a5a", top: "#1a2e1a" },
    socials: ["instagram", "youtube", "website"], palette: ["#2c4a2c", "#e8f0d8", "#f2a541"],
    products: [{ title: "Trail plan, 50k", price: "$39.00", art: "photo" }, { title: "Route maps", price: "$12.00", art: "plan" }],
    cta: "Get it", link: { label: "Guided runs", art: "photo" }, link2: "Race calendar",
    news: { headline: "Trail notes", desc: "Routes and training, monthly.", button: "Join" },
  },
  fusion: {
    name: "Diego Santos", bio: "Chef. Pop up dinners and a cookbook.",
    face: { skin: S.d, hair: H.black, cut: "short", bg: "#3b2f25", top: "#f4efe6" },
    socials: ["instagram", "tiktok", "youtube"], palette: ["#2a221b", "#f0c27b", "#c0442b"],
    products: [{ title: "Fuego, the cookbook", price: "$32.00", art: "dish" }, { title: "Spice blend", price: "$14.00", art: "cup" }],
    cta: "Buy", link: { label: "Next supper club", art: "dish" }, link2: "Recipes",
    news: { headline: "Menu drops", desc: "Seats go fast. Hear first.", button: "Join" },
  },
  darkroom: {
    name: "Ivo Petrov", bio: "35mm film. Darkroom prints by hand.",
    face: { skin: S.a, hair: H.brown, cut: "hat", bg: "#2b2b2b", top: "#6b6b6b" },
    socials: ["instagram", "vimeo", "youtube"], palette: ["#1e1e1e", "#e9e6e0", "#8c8c8c"],
    products: [{ title: "Silver gelatin print", price: "€70.00", art: "camera" }, { title: "Developing guide", price: "€12.00", art: "book" }],
    cta: "Buy", link: { label: "Darkroom workshop", art: "camera" }, link2: "Contact sheets",
    news: { headline: "From the darkroom", desc: "New rolls and prints.", button: "Join" },
  },
  haze: {
    name: "Amélie Roche", bio: "Florist. Dried bouquets and workshops.",
    face: { skin: S.a, hair: H.blond, cut: "bun", bg: "#e6d3c1", top: "#8a6a55" },
    socials: ["instagram", "pinterest", "tiktok"], palette: ["#efe2d4", "#b77b5b", "#6f7f5c"],
    products: [{ title: "Dried bouquet", price: "€48.00", art: "flower" }, { title: "Wreath workshop", price: "€65.00", art: "leaf" }],
    cta: "Order", link: { label: "Wedding flowers", art: "flower" }, link2: "Workshop dates",
    news: { headline: "In season", desc: "What's blooming this month.", button: "Join" },
  },
  atlas: {
    name: "Tenzin Rao", bio: "Alpinist. Expedition films and talks.",
    face: { skin: S.d, hair: H.black, cut: "hat", bg: "#25324a", top: "#e15b3c" },
    socials: ["youtube", "instagram", "patreon"], palette: ["#1b2a40", "#f2f4f7", "#e15b3c"],
    products: [{ title: "Expedition film", price: "$12.00", art: "film" }, { title: "Summit print", price: "$45.00", art: "photo" }],
    cta: "Watch", link: { label: "Watch the summit film", art: "photo" }, link2: "Book a talk",
    news: { headline: "Base camp", desc: "Dispatches from the next climb.", button: "Join" },
  },
}

/** A theme of a kind with no creator of its own takes its kind's. */
const BY_KIND: Record<string, string> = { light: "default", gradient: "peach", dark: "night", image: "nature" }

export function creatorFor(themeId: string, kind?: string | null): PreviewCreator {
  return CREATORS[themeId] ?? CREATORS[BY_KIND[kind ?? ""] ?? "default"] ?? CREATORS.default
}

/** Every theme id with a creator of its own (tests/onepage-as1.test.ts). */
export const PREVIEW_CREATOR_IDS = Object.keys(CREATORS)

/* ── The pictures ─────────────────────────────────────────── */

const uri = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${body}</svg>`)}`
const memo = new Map<string, string>()
const once = (key: string, make: () => string) => {
  let v = memo.get(key)
  if (v === undefined) {
    v = make()
    memo.set(key, v)
  }
  return v
}

/* The hair over the head (front) and behind it (back), for each cut, in a 100 by 100 box with the head at 50,45. */
const HAIR: Record<Cut, { back?: string; front: string }> = {
  short: { front: "M35 44C34 31 41 25 50 25C60 25 66 31 65 44C63 37 60 34 55 33C50 36 42 36 38 34C36 37 35 40 35 44Z" },
  buzz: { front: "M35.5 39C37 29.5 43.5 26.5 50 26.5C56.5 26.5 63 29.5 64.5 39C60 33.5 55 32 50 32C45 32 40 33.5 35.5 39Z" },
  bob: {
    back: "M31 48C30 30 39 22 50 22C61 22 70 30 69 48L69 62C66 64.5 61 64.5 59 62L41 62C39 64.5 34 64.5 31 62Z",
    front: "M34.5 41C35.5 30 43 25.5 50 25.5C58 25.5 64.5 30 65.5 41C60 35 54 33 46 34C41 35 38 37.5 34.5 41Z",
  },
  long: {
    back: "M30 50C29 30 39 21 50 21C61 21 71 30 70 50L73 84C64 88 36 88 27 84Z",
    front: "M34.5 43C35 30 42 25 51 25C59 25 65 30 65.5 43C62.5 36 57 31 50 31C46.5 35.5 40.5 39 34.5 43Z",
  },
  bun: {
    back: "M43 21a7 7 0 1 0 14 0a7 7 0 1 0-14 0Z",
    front: "M34.5 42C35 31 42 26 50 26C58 26 65 31 65.5 42C61 36 56 33 50 33C44 33 39 36 34.5 42Z",
  },
  curly: {
    front: "M30 40a6 6 0 0 1 6-8a7 7 0 0 1 9-6a7 7 0 0 1 11 0a7 7 0 0 1 9 6a6 6 0 0 1 5 9a5 5 0 0 1-3 7C66 41 62 35 50 35S34 41 33 48a5 5 0 0 1-3-8Z",
  },
  wave: { front: "M34 46C32 30 41 23 51 23C62 23 68 31 66 44C64 38 61 35 57 34C50 39 41 40 34 46Z" },
  hat: { front: "M33 40C33 27 41 21 50 21C59 21 67 27 67 40ZM31.5 37.5H68.5A3.5 3.5 0 0 1 68.5 44.5H31.5A3.5 3.5 0 0 1 31.5 37.5Z" },
}

/** A creator's portrait: a faceless bust in flat colour, lit from the upper left. */
export function faceUri(f: Face): string {
  return once(`f${f.skin}${f.hair}${f.cut}${f.bg}${f.top}${f.specs ? 1 : 0}`, () => {
    const hair = HAIR[f.cut]
    return uri(
      `<defs><radialGradient id='l' cx='.32' cy='.28' r='.85'><stop offset='.45' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.14'/></radialGradient></defs>` +
        `<rect width='100' height='100' fill='${f.bg}'/>` +
        (hair.back ? `<path d='${hair.back}' fill='${f.hair}'/>` : "") +
        `<path d='M16 100C18 82 32 72 50 72S82 82 84 100Z' fill='${f.top}'/>` +
        `<path d='M43.5 58H56.5V72C52.5 75 47.5 75 43.5 72Z' fill='${f.skin}'/>` +
        `<path d='M43.5 64C47.5 67 52.5 67 56.5 64V68C52.5 71 47.5 71 43.5 68Z' fill='#000' fill-opacity='.12'/>` +
        `<ellipse cx='35.4' cy='47' rx='2.8' ry='4.2' fill='${f.skin}'/><ellipse cx='64.6' cy='47' rx='2.8' ry='4.2' fill='${f.skin}'/>` +
        `<ellipse cx='50' cy='45' rx='15' ry='18' fill='${f.skin}'/><ellipse cx='50' cy='45' rx='15' ry='18' fill='url(#l)'/>` +
        /* A few lines for a face: eyes at rest, the nose's edge, a small smile. */
        `<path d='M42.6 47.6Q44.6 49.2 46.6 47.6M53.4 47.6Q55.4 49.2 57.4 47.6M50.6 49.5L49.6 53.2L51 53.4M47.4 57Q50 58.8 52.6 57' fill='none' stroke='#000' stroke-opacity='.38' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'/>` +
        `<path d='${hair.front}' fill='${f.hair}'/>` +
        (f.specs ? `<g fill='none' stroke='#161616' stroke-width='1.5'><circle cx='44' cy='47.5' r='4.3'/><circle cx='56' cy='47.5' r='4.3'/><path d='M48.3 47.5H51.7'/></g>` : "") +
        `<path d='M44 73.5L50 80L56 73.5' fill='none' stroke='#000' stroke-opacity='.16' stroke-width='1.4'/>`,
    )
  })
}

/* Each picture from three colours: a ground (a), a shape (b), an accent (c). */
const ART: Record<Art, (a: string, b: string, c: string) => string> = {
  print: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><circle cx='38' cy='40' r='20' fill='${b}'/><path d='M50 88V62a17 17 0 0 1 34 0v26Z' fill='${c}'/><rect x='14' y='76' width='30' height='4' fill='${c}'/>`,
  book: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><rect x='31' y='17' width='42' height='64' rx='3' fill='${b}'/><rect x='31' y='17' width='7' height='64' fill='${c}' fill-opacity='.5'/><rect x='45' y='32' width='21' height='3' fill='${c}'/><rect x='45' y='39' width='14' height='3' fill='${c}'/><rect x='34' y='81' width='39' height='3' fill='#000' fill-opacity='.12'/>`,
  wave: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><g fill='${b}'>${[16, 30, 46, 26, 58, 38, 22, 44, 14].map((h, i) => `<rect x='${17 + i * 7.5}' y='${50 - h / 2}' width='4.5' height='${h}' rx='2.25'/>`).join("")}</g><circle cx='80' cy='22' r='5' fill='${c}'/>`,
  vessel: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><ellipse cx='50' cy='86' rx='26' ry='4' fill='#000' fill-opacity='.12'/><path d='M38 20H62V27C62 31 72 37 74 51C76 67 68 85 50 85S24 67 26 51C28 37 38 31 38 27Z' fill='${b}'/><path d='M26.4 47H73.6C74 50 74.1 53 73.8 56H26.2C25.9 53 26 50 26.4 47Z' fill='${c}'/>`,
  kettle: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M35 44C35 21 65 21 65 44' fill='none' stroke='${b}' stroke-width='8'/><circle cx='50' cy='61' r='24' fill='${b}'/><rect x='39' y='57' width='22' height='8' rx='2' fill='${c}'/>`,
  photo: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><circle cx='68' cy='33' r='11' fill='${c}'/><path d='M0 78L30 46L52 68L66 56L100 84V100H0Z' fill='${b}'/>`,
  leaf: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M50 13C77 30 80 64 50 88C20 64 23 30 50 13Z' fill='${b}'/><path d='M50 22V84M50 42L39 33M50 42L61 33M50 58L37 48M50 58L63 48' stroke='${c}' stroke-width='2.4' fill='none' stroke-linecap='round'/>`,
  pixel: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><g fill='${b}'>${[[2, 1], [3, 1], [5, 1], [6, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [4, 6]].map(([x, y]) => `<rect x='${10 + x * 9}' y='${14 + y * 9}' width='9' height='9'/>`).join("")}</g><rect x='37' y='32' width='9' height='9' fill='${c}'/>`,
  cup: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M27 40H67V60A20 20 0 0 1 27 60Z' fill='${b}'/><path d='M67 46H72A8 8 0 0 1 72 62H66' fill='none' stroke='${b}' stroke-width='5'/><path d='M40 21C36 26 44 28 40 33M53 21C49 26 57 28 53 33' stroke='${c}' stroke-width='3' fill='none' stroke-linecap='round'/>`,
  chair: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M33 46L27 86M67 46L73 86M41 46L39 86M59 46L61 86' stroke='${b}' stroke-width='5' stroke-linecap='round'/><rect x='23' y='36' width='54' height='11' rx='4' fill='${b}'/><rect x='31' y='66' width='38' height='4' fill='${c}'/>`,
  star: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M50 14C54 40 60 46 86 50C60 54 54 60 50 86C46 60 40 54 14 50C40 46 46 40 50 14Z' fill='${b}'/><circle cx='77' cy='23' r='6' fill='${c}'/><circle cx='24' cy='78' r='4' fill='${c}'/>`,
  film: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><rect x='16' y='24' width='68' height='52' rx='6' fill='${b}'/><path d='M44 38L62 50L44 62Z' fill='${c}'/>`,
  dish: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><circle cx='50' cy='52' r='33' fill='${b}'/><circle cx='50' cy='52' r='23' fill='${c}'/><circle cx='43' cy='47' r='6' fill='${b}' fill-opacity='.55'/><circle cx='57' cy='58' r='4' fill='${b}' fill-opacity='.55'/>`,
  plan: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><rect x='26' y='15' width='48' height='70' rx='4' fill='${b}'/>${[30, 45, 60].map((y) => `<rect x='34' y='${y}' width='7' height='7' rx='1.5' fill='${c}'/><rect x='46' y='${y + 2}' width='20' height='3' fill='${c}' fill-opacity='.7'/>`).join("")}`,
  ticket: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M14 32H86V44A6 6 0 0 0 86 56V68H14V56A6 6 0 0 0 14 44Z' fill='${b}'/><path d='M62 34V66' stroke='${a}' stroke-width='2' stroke-dasharray='3 3'/><rect x='24' y='44' width='28' height='4' fill='${c}'/><rect x='24' y='52' width='18' height='4' fill='${c}'/>`,
  code: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><rect x='14' y='22' width='72' height='56' rx='6' fill='${b}'/><path d='M40 40L30 50L40 60M60 40L70 50L60 60' stroke='${c}' stroke-width='5' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`,
  vinyl: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><circle cx='50' cy='50' r='35' fill='${b}'/><circle cx='50' cy='50' r='25' fill='none' stroke='${a}' stroke-opacity='.25'/><circle cx='50' cy='50' r='12' fill='${c}'/><circle cx='50' cy='50' r='2.5' fill='${a}'/>`,
  camera: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><rect x='30' y='26' width='16' height='9' rx='2' fill='${b}'/><rect x='16' y='32' width='68' height='46' rx='7' fill='${b}'/><circle cx='50' cy='55' r='15' fill='${c}'/><circle cx='50' cy='55' r='7' fill='${b}'/>`,
  glass: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M35 17H65C65 41 58 52 50 52S35 41 35 17Z' fill='${b}'/><path d='M36.6 31H63.4C62 44 56.5 52 50 52S38 44 36.6 31Z' fill='${c}'/><rect x='48.5' y='52' width='3' height='25' fill='${b}'/><rect x='37' y='76' width='26' height='4' rx='2' fill='${b}'/>`,
  flower: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M50 56V90' stroke='${c}' stroke-width='3'/><g fill='${b}'>${[0, 72, 144, 216, 288].map((r) => `<ellipse cx='50' cy='30' rx='9' ry='15' transform='rotate(${r} 50 44)'/>`).join("")}</g><circle cx='50' cy='44' r='7' fill='${c}'/>`,
  swim: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><circle cx='70' cy='30' r='10' fill='${c}'/><path d='M0 58C12 50 22 50 34 58S56 66 68 58S88 50 100 58V100H0Z' fill='${b}'/><path d='M0 74C12 66 22 66 34 74S56 82 68 74S88 66 100 74' fill='none' stroke='${a}' stroke-opacity='.45' stroke-width='3'/>`,
  bust: (a, b, c) => `<rect width='100' height='100' fill='${a}'/><path d='M34 98C36 86 44 80 52 79L53 72C49 70 44 69 44 63C40 52 42 32 54 26C64 21 73 28 73 38C73 41 72 42 72 44C74 47 77 50 77 52C77 54 75 54 73 54C74 56 73 58 72 59C73 61 72 63 70 64C70 68 66 70 61 70L60 79C70 81 78 88 80 98Z' fill='${b}'/><path d='M20 34H84M20 54H84M60 14V98' stroke='${c}' stroke-width='.8' fill='none'/><circle cx='58' cy='46' r='26' fill='none' stroke='${c}' stroke-width='.8'/>`,
}

export function artUri(art: Art, palette: readonly [string, string, string]): string {
  const [a, b, c] = palette
  return once(`${art}${a}${b}${c}`, () => uri(ART[art](a, b, c)))
}
