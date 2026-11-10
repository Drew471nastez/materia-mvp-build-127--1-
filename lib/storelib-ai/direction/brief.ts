/**
 * ===========================================================================
 *  THE CREATIVE BRIEF: WHAT THIS SITE IS FOR, BEFORE ANY LOOK IS CHOSEN
 * ===========================================================================
 * Round O (O2), spec Part 3.1 and prompt section C. A creator types one
 * sentence ("website for my personal training business, black and red,
 * people book a session"). Before a direction, a palette or a font is
 * picked, that sentence becomes a brief: the business, who it is for, what
 * a visitor should do, the pages, the style asked for, and, most of all,
 * what is real (products, booking forms, reviews, photos) and what is
 * missing and must never be invented.
 *
 * `briefFrom(prompt, options, capabilities)` is deterministic: the same
 * words, choices and store give the same brief, so a small change in
 * wording does not restyle the whole site. The plan model refines it in the
 * agent's plan phase (`refineBrief`), within the same shape and never past
 * what the store really has.
 *
 * The business is classified by O5's site stories first
 * (lib/storelib-ai/layout/stories.ts classifyStory, one classifier for both
 * lanes), refined to a finer kind by this file's words where they say more
 * (a cafe inside "food place", a barber inside "local professional"). The
 * brief carries the story id and O5's StoryBrief fields (`businessType`,
 * `primaryAction`, `category`), so `layoutStoryFor(brief)` takes it as is.
 *
 * Pure. Browser safe.
 */
import { classifyStory } from "@/lib/storelib-ai/layout/stories"

/** The kinds of business a direction is fitted to. */
export const BUSINESS_KINDS = [
  "fitness",
  "wellness",
  "beauty",
  "barber-tattoo",
  "restaurant",
  "cafe-bakery",
  "music-producer",
  "music-artist",
  "events-nightlife",
  "agency",
  "architecture",
  "photography",
  "film",
  "fashion",
  "jewellery",
  "hospitality",
  "education",
  "saas",
  "professional",
  "art-gallery",
  "craft",
  "home-goods",
  "creator",
  "podcast",
  "books",
  "non-profit",
  "outdoor",
  "general",
] as const
export type BusinessKind = (typeof BUSINESS_KINDS)[number]

/** What a visitor should do. */
export type Objective = "book" | "buy" | "enquire" | "join" | "view-work" | "read" | "visit" | "donate" | "listen"

export type MotionIntensity = "quiet" | "balanced" | "expressive"
export type Density = "airy" | "balanced" | "dense"

export interface CreativeBrief {
  /** The creator's words, trimmed (at most 2000 characters). */
  prompt: string
  business: { kind: BusinessKind; label: string; name: string | null }
  /** O5's site story id (lib/storelib-ai/layout/stories.ts), the shared classification. */
  story: string
  /** O5 StoryBrief fields, so layoutStoryFor(brief) reads this brief directly. */
  category: string | null
  businessType: string
  primaryAction: string
  audience: string | null
  objective: Objective
  /** Page keys the site needs, home first. */
  pages: string[]
  offer: string | null
  /** The main call to action's words. */
  cta: string
  style: {
    /** Direction ids the creator asked for by name ("Y2K", "brutalist", "Swiss"). These always win. */
    requested: string[]
    /** Plain mood words from the request ("calm", "bold", "warm"). */
    moods: string[]
    era: string | null
    /** Brand colours, hex, as asked for (named colours become hex). */
    colors: string[]
    /** Fonts the creator named, as written. */
    fonts: string[]
    constraints: string[]
  }
  motion: MotionIntensity
  density: Density
  assets: { available: string[]; missing: string[] }
  /** Facts that must not be invented on the page. */
  mustNotFabricate: string[]
  tone: string | null
  language: string | null
  /** Defaults the brief assumed, said out loud. */
  assumptions: string[]
  /** True once the plan model refined it. */
  refined?: boolean
}

/** Options on Describe your website (StartOptions, lib/ai-builder/types.ts), loosely. */
export interface BriefOptions {
  category?: string
  preset?: string
  preferences?: { pages?: string[]; tone?: string; colors?: string[]; language?: string }
}

/** The store's real facts, from RuntimeCapabilities (lib/ai-builder/runtime-contract.ts), loosely. */
export interface BriefCapabilities {
  store?: { name?: string | null; brandImage?: string | null; tagline?: string | null }
  products?: { kind?: string }[]
  collections?: unknown[]
  communities?: unknown[]
  forms?: { kind?: string; booking?: boolean }[]
  reviews?: { count: number }
  blog?: { posts: number }
  /** Pictures in the media library, when the caller knows. */
  media?: { images: number }
  features?: string[]
}

/* ── words ─────────────────────────────────────────────────────────────── */

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9#&+]+/g, " ").trim()} `

/** Order matters: the first kind whose words appear wins, specific before general. */
const KIND_WORDS: [BusinessKind, string[]][] = [
  ["music-producer", ["beatmaker", "beat maker", "sample pack", "sample packs", "drum kit", "drum kits", "producer", "beats", "loops", "presets", "stems"]],
  ["barber-tattoo", ["barber", "barbershop", "tattoo", "tattoos", "piercing"]],
  ["fitness", ["personal trainer", "personal training", "trainer", "fitness", "gym", "crossfit", "strength", "boxing", "athlete", "athletic", "running coach", "bootcamp", "boot camp", "hiit", "weightlifting", "powerlifting", "martial arts"]],
  ["wellness", ["pilates", "yoga", "wellness", "meditation", "massage", "therapist", "therapy", "physio", "nutrition", "nutritionist", "breathwork", "spa", "retreat", "reiki", "doula"]],
  ["beauty", ["skincare", "skin care", "cosmetics", "makeup", "nail", "nails", "salon", "lashes", "brows", "esthetician"]],
  ["cafe-bakery", ["bakery", "cafe", "café", "coffee", "patisserie", "sourdough", "roastery"]],
  ["restaurant", ["restaurant", "bistro", "kitchen", "dining", "chef", "bar ", "wine bar", "pizzeria", "food truck", "catering"]],
  ["events-nightlife", ["club night", "nightclub", "festival", "party", "rave", "gig", "dj", "venue", "nightlife"]],
  ["music-artist", ["band", "musician", "singer", "rapper", "album", "record label", "vinyl", "tour dates"]],
  ["podcast", ["podcast", "episodes", "radio show"]],
  ["film", ["filmmaker", "film maker", "director", "videographer", "cinematographer", "production company", "film"]],
  ["photography", ["photographer", "photography", "photo studio", "wedding photos"]],
  ["architecture", ["architect", "architecture", "interior design", "interior designer", "landscape architect"]],
  ["agency", ["agency", "design studio", "creative studio", "branding studio", "studio for brands", "consultancy for brands"]],
  ["jewellery", ["jewellery", "jewelry", "rings", "earrings", "necklace", "watches"]],
  ["fashion", ["fashion", "clothing", "apparel", "streetwear", "menswear", "womenswear", "boutique", "label"]],
  ["hospitality", ["hotel", "guesthouse", "b&b", "bed and breakfast", "cabin", "villa", "airbnb", "hostel", "resort"]],
  ["saas", ["saas", "software", "app ", "startup", "platform", "api", "developer tool", "dashboard"]],
  ["professional", ["accountant", "accounting", "bookkeeping", "lawyer", "solicitor", "law firm", "consultant", "consulting", "financial advisor", "tax", "plumber", "electrician", "builder", "cleaning"]],
  ["education", ["course", "courses", "tutor", "tutoring", "teacher", "lessons", "academy", "school", "workshop", "language"]],
  ["art-gallery", ["gallery", "artist", "painter", "illustrator", "sculptor", "art prints", "exhibition"]],
  ["craft", ["ceramics", "pottery", "handmade", "woodwork", "leather", "knitting", "maker"]],
  ["home-goods", ["candle", "candles", "homeware", "home goods", "furniture", "decor", "soap", "plants", "florist"]],
  ["books", ["author", "writer", "books", "novel", "publisher", "newsletter", "magazine", "zine"]],
  ["non-profit", ["charity", "non profit", "nonprofit", "foundation", "volunteer", "donate", "donations"]],
  ["outdoor", ["outdoor", "surf", "climbing", "hiking", "camping", "bike", "cycling", "ski"]],
  ["creator", ["creator", "influencer", "youtuber", "streamer", "content creator", "community", "membership"]],
]

const KIND_LABEL: Record<BusinessKind, string> = {
  fitness: "fitness and personal training",
  wellness: "wellness",
  beauty: "beauty",
  "barber-tattoo": "barber or tattoo studio",
  restaurant: "restaurant",
  "cafe-bakery": "cafe or bakery",
  "music-producer": "music producer selling sounds",
  "music-artist": "musician",
  "events-nightlife": "events and nightlife",
  agency: "creative agency",
  architecture: "architecture and interiors",
  photography: "photography",
  film: "film and video",
  fashion: "fashion",
  jewellery: "jewellery",
  hospitality: "hospitality",
  education: "education and courses",
  saas: "software product",
  professional: "professional services",
  "art-gallery": "art",
  craft: "craft and handmade",
  "home-goods": "home goods shop",
  creator: "creator",
  podcast: "podcast",
  books: "writing and books",
  "non-profit": "non-profit",
  outdoor: "outdoor and sport gear",
  general: "business",
}

/** O5's site stories to the kinds directions are fitted to. */
const STORY_KIND: Record<string, BusinessKind> = {
  "fitness-coach": "fitness",
  "wellness-studio": "wellness",
  "sample-pack-store": "music-producer",
  agency: "agency",
  architect: "architecture",
  photographer: "photography",
  "digital-creator": "creator",
  saas: "saas",
  "local-professional": "professional",
  artist: "art-gallery",
  "food-place": "restaurant",
  "product-brand": "home-goods",
}

const CATEGORY_KIND: Record<string, BusinessKind> = { candle_shop: "home-goods", fitness_coach: "fitness", photographer: "photography", online_course: "education" }

const KIND_OBJECTIVE: Record<BusinessKind, Objective> = {
  fitness: "book",
  wellness: "book",
  beauty: "book",
  "barber-tattoo": "book",
  restaurant: "visit",
  "cafe-bakery": "visit",
  "music-producer": "buy",
  "music-artist": "listen",
  "events-nightlife": "buy",
  agency: "enquire",
  architecture: "enquire",
  photography: "view-work",
  film: "view-work",
  fashion: "buy",
  jewellery: "buy",
  hospitality: "book",
  education: "join",
  saas: "join",
  professional: "enquire",
  "art-gallery": "view-work",
  craft: "buy",
  "home-goods": "buy",
  creator: "join",
  podcast: "listen",
  books: "read",
  "non-profit": "donate",
  outdoor: "buy",
  general: "enquire",
}

const OBJECTIVE_WORDS: [Objective, string[]][] = [
  ["book", ["book", "booking", "bookings", "appointment", "appointments", "schedule", "reserve", "consultation", "session", "sessions", "classes"]],
  ["buy", ["sell", "selling", "shop", "store", "storefront", "buy", "checkout", "products", "merch", "packs"]],
  ["donate", ["donate", "donation", "donations", "fundraise"]],
  ["join", ["sign up", "signup", "enrol", "enroll", "membership", "subscribe", "join"]],
  ["enquire", ["enquiry", "inquiry", "quote", "contact", "hire", "commission", "leads"]],
  ["view-work", ["portfolio", "showreel", "gallery of work", "case studies"]],
  ["listen", ["listen", "stream", "tracks", "episodes"]],
]

const CTA: Record<Objective, string> = {
  book: "Book a session",
  buy: "Shop now",
  enquire: "Get in touch",
  join: "Join",
  "view-work": "See the work",
  read: "Start reading",
  visit: "Find us",
  donate: "Give now",
  listen: "Listen",
}

const KIND_CTA: Partial<Record<BusinessKind, string>> = {
  fitness: "Book a session",
  wellness: "Book a class",
  beauty: "Book an appointment",
  "barber-tattoo": "Book a chair",
  restaurant: "Book a table",
  "cafe-bakery": "Visit us",
  "music-producer": "Get the packs",
  hospitality: "Check dates",
  professional: "Book a call",
  architecture: "Start a project",
  agency: "Start a project",
  photography: "Check availability",
  education: "Start learning",
}

const KIND_PAGES: Record<BusinessKind, string[]> = {
  fitness: ["home", "programmes", "about", "book", "contact"],
  wellness: ["home", "classes", "about", "book", "contact"],
  beauty: ["home", "treatments", "about", "book", "contact"],
  "barber-tattoo": ["home", "work", "artists", "book", "contact"],
  restaurant: ["home", "menu", "about", "visit"],
  "cafe-bakery": ["home", "menu", "about", "visit"],
  "music-producer": ["home", "shop", "about", "contact"],
  "music-artist": ["home", "music", "tour", "about"],
  "events-nightlife": ["home", "events", "about", "contact"],
  agency: ["home", "work", "about", "contact"],
  architecture: ["home", "projects", "studio", "contact"],
  photography: ["home", "work", "about", "contact"],
  film: ["home", "work", "about", "contact"],
  fashion: ["home", "shop", "about", "contact"],
  jewellery: ["home", "shop", "about", "contact"],
  hospitality: ["home", "rooms", "about", "book", "contact"],
  education: ["home", "courses", "about", "contact"],
  saas: ["home", "features", "pricing", "contact"],
  professional: ["home", "services", "about", "contact"],
  "art-gallery": ["home", "work", "about", "contact"],
  craft: ["home", "shop", "about", "contact"],
  "home-goods": ["home", "shop", "about", "contact"],
  creator: ["home", "about", "shop", "contact"],
  podcast: ["home", "episodes", "about", "contact"],
  books: ["home", "books", "about", "contact"],
  "non-profit": ["home", "about", "get-involved", "donate"],
  outdoor: ["home", "shop", "about", "contact"],
  general: ["home", "about", "contact"],
}

/** Style names a creator types, to the direction ids they ask for (directions.ts). Explicit names only, not moods. */
export const STYLE_WORDS: [string, string[]][] = [
  ["y2k", ["y2k", "2000s", "year 2000", "early 2000s", "chrome", "millennium"]],
  ["frutiger-aero", ["frutiger", "aero", "glossy", "aqua", "skeuomorph"]],
  ["neo-brutalist", ["brutalist", "brutalism", "neo brutal", "neobrutal", "raw html"]],
  ["swiss-editorial", ["swiss", "international style", "grid based", "helvetica style"]],
  ["japanese-minimal", ["japanese", "wabi", "zen", "muji"]],
  ["luxury-editorial", ["luxury", "luxurious", "high end", "premium editorial", "couture"]],
  ["cinematic", ["cinematic", "film like", "movie like"]],
  ["experimental-type", ["experimental", "avant garde", "kinetic type", "weird"]],
  ["art-gallery", ["gallery style", "museum", "white cube"]],
  ["playful-creator", ["playful", "fun", "colourful", "colorful", "quirky"]],
  ["bold-performance", ["sporty", "athletic look", "performance", "high energy", "aggressive"]],
  ["modern-wellness", ["calm and warm", "soft and calm", "serene"]],
  ["retro-analog", ["retro", "vintage", "70s", "80s", "90s", "analog", "analogue", "film grain", "risograph"]],
  ["dark-immersive", ["dark mode", "all dark", "moody dark", "immersive"]],
  ["monochrome", ["black and white", "monochrome", "black & white"]],
]

const MOOD_WORDS = ["calm", "warm", "bold", "minimal", "clean", "playful", "dark", "bright", "loud", "quiet", "soft", "premium", "edgy", "friendly", "serious", "elegant", "raw", "energetic", "moody", "fresh", "earthy", "techy", "futuristic"]

const ERA_WORDS: [string, string[]][] = [
  ["y2k", ["y2k", "2000s", "early 2000s"]],
  ["90s", ["90s", "1990s", "nineties"]],
  ["80s", ["80s", "1980s", "eighties"]],
  ["70s", ["70s", "1970s", "seventies"]],
  ["future", ["futuristic", "future", "sci fi"]],
  ["vintage", ["vintage", "retro", "heritage"]],
]

/** Named colours a creator types, as the hex a brand would use for them. */
export const NAMED_COLORS: Record<string, string> = {
  black: "#0b0b0c",
  white: "#ffffff",
  red: "#e1251b",
  crimson: "#c1121f",
  orange: "#f26a1b",
  yellow: "#f5c400",
  gold: "#c9a227",
  green: "#1f7a4d",
  lime: "#b8f400",
  olive: "#5f6b2f",
  teal: "#0f7c80",
  blue: "#1f4fd1",
  navy: "#14213d",
  cobalt: "#1846c9",
  purple: "#6a2c91",
  violet: "#6a2c91",
  pink: "#ff5fa2",
  magenta: "#d4148a",
  cream: "#f4ede1",
  beige: "#e9dfcf",
  sand: "#e6d7bf",
  brown: "#5b3a29",
  grey: "#6b6b6b",
  gray: "#6b6b6b",
  silver: "#c0c4c8",
  chrome: "#c9ced6",
  sage: "#9caf88",
  terracotta: "#b5523b",
  burgundy: "#6d1a2a",
  lilac: "#c8a2c8",
  mint: "#9fe2bf",
}

const has = (text: string, word: string) => text.includes(` ${word.toLowerCase()} `) || (word.endsWith(" ") && text.includes(` ${word.trim()} `))

/** The words of `list` found in `text` (already normalised). */
function found(text: string, list: string[]): string[] {
  return list.filter((w) => has(text, w.trim()))
}

function hexes(prompt: string): string[] {
  return [...prompt.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => `#${m[1].toLowerCase()}`)
}

/** Colour words in a request that name the brand's colours ("black and red", "colors: navy, gold"). */
function colorWords(text: string): string[] {
  return Object.keys(NAMED_COLORS).filter((c) => has(text, c) && !has(text, `${c} and white photos`))
}

function nameOf(prompt: string, caps?: BriefCapabilities): string | null {
  if (caps?.store?.name && caps.store.name.trim()) return caps.store.name.trim().slice(0, 80)
  const m = /\b(?:called|named)\s+["“']?([A-Z0-9][\w&' -]{1,40}?)["”']?(?=[,.;!]|\s+(?:in|for|that|who|which|selling|and)\b|$)/.exec(prompt)
  return m ? m[1].trim() : null
}

function audienceOf(prompt: string): string | null {
  const re = /\b(?:for|helping|serving|aimed at|who work with|working with|speciali[sz]ing in|speciali[sz]es in)\s+((?:busy |young |local |new |small |first[- ]time |older |working )?[a-z][a-z -]{2,50}?)(?=[,.;!]|\s+(?:in|who|that|and want|to|speciali[sz]ing)\b|$)/gi
  for (const m of prompt.matchAll(re)) {
    const a = m[1].trim()
    /* "for my personal training business" names the business, not who it serves. */
    if (/^(my|our|a|an|the|me|us)\b/i.test(a) || /\b(business|website|site|shop|store|brand|company|page)\b/i.test(a)) continue
    return a.slice(0, 80)
  }
  return null
}

function offerOf(prompt: string, kind: BusinessKind): string | null {
  const m = /\b(?:selling|sells|sell|offering|offers|offer|making|makes)\s+([a-z0-9][a-z0-9 ,&'-]{2,80}?)(?=[.;!]|\s+(?:to|for|online|with|and want)\b|$)/i.exec(prompt)
  if (m) return m[1].trim()
  return kind === "general" ? null : KIND_LABEL[kind]
}

/* ── the brief ─────────────────────────────────────────────────────────── */

/**
 * The brief for a request, from the creator's words, their choices on
 * Describe your website and the store's real facts. Deterministic.
 */
export function briefFrom(prompt: string, options?: BriefOptions | null, caps?: BriefCapabilities | null): CreativeBrief {
  const words = String(prompt ?? "").trim().slice(0, 2000)
  const text = norm(words)
  const assumptions: string[] = []

  /* O5's story first (the shared classifier), then the finer kind this file's words name. */
  const story = classifyStory({ prompt: words, category: options?.category ?? null })
  const storyMatched = story.match.test(words) || story.match.test(String(options?.category ?? "").replace(/_/g, " "))
  let kind: BusinessKind = "general"
  for (const [k, list] of KIND_WORDS) {
    if (found(text, list).length) {
      kind = k
      break
    }
  }
  if (kind === "general" && storyMatched && STORY_KIND[story.id]) kind = STORY_KIND[story.id]
  if (kind === "general" && options?.category && CATEGORY_KIND[options.category]) kind = CATEGORY_KIND[options.category]
  if (kind === "general") assumptions.push("The kind of business was not clear, so the brief treats it as a general business.")

  const objectives = OBJECTIVE_WORDS.filter(([, list]) => found(text, list).length).map(([o]) => o)
  const bookingForms = (caps?.forms ?? []).filter((f) => f.booking || f.kind === "booking").length
  const products = caps?.products?.length ?? 0
  let objective: Objective = objectives[0] ?? KIND_OBJECTIVE[kind]
  /* A store that sells and a request to sell: buying wins over a generic contact. */
  if (!objectives.length && products > 0 && (kind === "general" || kind === "creator")) objective = "buy"
  if (!objectives.length) assumptions.push(`The main action is assumed to be "${objective}" for a ${KIND_LABEL[kind]}.`)

  const requested = STYLE_WORDS.filter(([, list]) => found(text, list).length).map(([id]) => id)
  const moods = MOOD_WORDS.filter((m) => has(text, m))
  const era = ERA_WORDS.find(([, list]) => found(text, list).length)?.[0] ?? null
  const named = colorWords(text)
  const colors = [...new Set([...hexes(words), ...(options?.preferences?.colors ?? []).filter((c) => /^#[0-9a-f]{3,6}$/i.test(c)).map((c) => c.toLowerCase()), ...named.map((c) => NAMED_COLORS[c])])].slice(0, 6)
  const fonts = [...words.matchAll(/\b(?:font|typeface|in)\s+["“']([A-Z][\w ]{2,30})["”']/g)].map((m) => m[1].trim())
  const constraints: string[] = []
  if (has(text, "no photos") || has(text, "without photos")) constraints.push("no photography")
  if (has(text, "one page") || has(text, "single page") || has(text, "onepage")) constraints.push("one page")
  if (has(text, "accessible") || has(text, "accessibility")) constraints.push("accessibility first")
  if (/\b(?:no|not|avoid|without)\s+(?:a\s+)?serif/i.test(words)) constraints.push("no serif display")
  if (named.length) constraints.push(`brand colours: ${named.join(", ")}`)

  const quiet = ["calm", "minimal", "quiet", "soft", "serene", "elegant"].some((m) => has(text, m))
  const loud = ["bold", "experimental", "energetic", "loud", "immersive", "animated", "dynamic", "playful", "aggressive", "high energy"].some((m) => has(text, m.trim()))
  const motion: MotionIntensity = requested.includes("experimental-type") || requested.includes("y2k") || (loud && !quiet) ? "expressive" : quiet && !loud ? "quiet" : "balanced"
  const density: Density = has(text, "dense") || has(text, "catalog") || has(text, "catalogue") || has(text, "information") ? "dense" : quiet || has(text, "airy") || has(text, "spacious") ? "airy" : "balanced"

  /* ── what is real, what is missing ─────────────────────────────────── */
  const available: string[] = []
  const missing: string[] = []
  if (products) available.push(`${products} product${products === 1 ? "" : "s"}`)
  else if (objective === "buy") missing.push("products (add them in Products; the shop shows nothing invented)")
  if (bookingForms) available.push(`${bookingForms} booking form${bookingForms === 1 ? "" : "s"}`)
  else if (objective === "book") missing.push("a booking form (the call to action goes to the contact page until one exists)")
  const otherForms = (caps?.forms?.length ?? 0) - bookingForms
  if (otherForms > 0) available.push(`${otherForms} form${otherForms === 1 ? "" : "s"}`)
  if (caps?.reviews?.count) available.push(`${caps.reviews.count} real reviews`)
  if (caps?.store?.brandImage) available.push("a logo")
  if (caps?.media?.images) available.push(`${caps.media.images} photos in the media library`)
  else missing.push("photos of the real business (use designed, editable image slots, never a visible note to the creator)")
  if ((caps?.communities?.length ?? 0) > 0) available.push("a community")
  if ((caps?.blog?.posts ?? 0) > 0) available.push(`${caps!.blog!.posts} blog posts`)

  const mustNotFabricate = [
    "testimonials and quotes",
    "client or press logos",
    "results, statistics and counts",
    "certifications, awards and years in business",
    ...(caps?.reviews?.count ? [] : ["reviews and star ratings"]),
    ...(products ? [] : ["products and prices"]),
    "addresses, opening hours and phone numbers",
    "instructions to the creator in the page copy (\"add your photo here\")",
  ]

  const pages = [...new Set(["home", ...(options?.preferences?.pages ?? []).map((p) => String(p).toLowerCase().replace(/[^a-z0-9-]+/g, "-")).filter(Boolean), ...KIND_PAGES[kind]])].slice(0, 10)
  if (constraints.includes("one page")) pages.splice(1)

  const cta = objective === KIND_OBJECTIVE[kind] && KIND_CTA[kind] ? KIND_CTA[kind]! : CTA[objective]

  return {
    prompt: words,
    business: { kind, label: KIND_LABEL[kind], name: nameOf(words, caps ?? undefined) },
    story: story.id,
    category: options?.category ?? null,
    businessType: KIND_LABEL[kind],
    primaryAction: cta,
    audience: audienceOf(words),
    objective,
    pages,
    offer: offerOf(words, kind),
    cta,
    style: { requested, moods, era, colors, fonts, constraints },
    motion,
    density,
    assets: { available, missing },
    mustNotFabricate,
    tone: options?.preferences?.tone?.trim() || null,
    language: options?.preferences?.language?.trim() || null,
    assumptions,
  }
}

/* ── refinement by the plan model ──────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

/** JSON schema of what the plan model may refine (report_progress `brief`). */
export const BRIEF_REFINE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    audience: { type: "string", description: "Who the site is for, specifically." },
    offer: { type: "string", description: "What is actually sold or offered." },
    cta: { type: "string", description: "The main call to action's words." },
    tone: { type: "string" },
    pages: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" }, description: "Facts the site needs that the creator has not given." },
  },
} as const

/**
 * The plan model's refinements, within the shape. It may sharpen the
 * audience, offer, CTA, tone and pages, and add missing facts; it cannot
 * add assets the store does not have, drop a must-not-fabricate item or
 * change the business, objective or the style the creator asked for.
 */
export function refineBrief(brief: CreativeBrief, raw: unknown): CreativeBrief {
  if (!isObj(raw)) return brief
  const pages = Array.isArray(raw.pages) ? raw.pages.map((p) => String(p).toLowerCase().replace(/[^a-z0-9-]+/g, "-")).filter(Boolean).slice(0, 12) : null
  const missing = Array.isArray(raw.missing) ? raw.missing.map((m) => text(m, 160)).filter((m): m is string => !!m).slice(0, 8) : []
  return {
    ...brief,
    audience: text(raw.audience, 160) ?? brief.audience,
    offer: text(raw.offer, 200) ?? brief.offer,
    cta: (text(raw.cta, 40) ?? brief.cta).replace(/—/g, " "),
    primaryAction: (text(raw.cta, 40) ?? brief.primaryAction).replace(/—/g, " "),
    tone: text(raw.tone, 80) ?? brief.tone,
    pages: pages?.length ? [...new Set(["home", ...pages])] : brief.pages,
    assets: { available: brief.assets.available, missing: [...new Set([...brief.assets.missing, ...missing])] },
    refined: true,
  }
}
