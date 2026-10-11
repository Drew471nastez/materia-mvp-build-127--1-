/**
 * ===========================================================================
 *  WHAT KIND OF WEBSITE THIS IS, BEFORE ANYTHING IS BUILT
 * ===========================================================================
 * Asked for "a complete smooth modern website for Bandidos, a bachata club",
 * the assistant recoloured the hero it already had and kept the generic
 * sections under it. Nothing in the request was wrong; what was missing was
 * any idea of what a real nightlife site is made of. A bachata party is the
 * next event, the music, the floor, the people and a ticket. A course is the
 * outcome, the curriculum, the teacher and the proof. Neither is "hero,
 * three features, testimonials, CTA".
 *
 * These are the categories a creator on Storelib actually builds, each with
 * the decisions a studio would make before a single section: who it is for,
 * how it should feel, what the page is made of and in what order, the type,
 * the palette, the imagery and the motion. They are starting points that a
 * brief overrides, not templates: the planner reads the one that matches and
 * then decides for this business.
 *
 * Pure text and one matcher. Read by the builder's planner
 * (lib/website-builder/agent/creative-plan.ts), by its read_design_patterns
 * tool, and by agents outside the builder through the redesign skill
 * (lib/agent-skills), so every agent starts from the same judgement.
 *
 * Fonts are the families the theme can load (lib/website-builder/font-link,
 * OFFERED_FAMILIES); a family outside that list is never drawn.
 */

export interface Archetype {
  id: string
  label: string
  /** Words that say a request is this kind of site. Scored, not just matched. */
  match: RegExp[]
  /** Who the site is for and what they come to do. */
  audience: string
  /** How it should feel, in a few adjectives a designer would use. */
  personality: string
  /** What real sites in this category are like, so the result is recognisable without the prompt. */
  reference: string
  /** The page, top to bottom, as pattern ids (lib/storelib-ai/patterns.ts) with what each does here. */
  architecture: string[]
  typography: { heading: string; body: string; note: string }
  palette: string
  imagery: string
  motion: string
  /** The one thing the page is for. */
  conversion: string
  /** What would make it look like any other site. */
  avoid: string
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "nightlife",
    label: "Nightlife, dance club or party",
    match: [/\b(club|party|parties|nightlife|night ?club|rave|dj|dance|dancing|bachata|salsa|kizomba|tango|zouk|reggaeton|festival|social night|lounge|bar)\b/i, /\b(events?|tickets?|line ?up|venue|dance floor)\b/i],
    audience: "Dancers and party goers deciding where to go this week, mostly on a phone, often late in the evening.",
    personality: "Energetic, sensual, nocturnal, musical. Confident and warm rather than corporate.",
    reference: "A club or party brand's own site: a full bleed photo or video of the floor, the next date in big type, a running line of dates or words, the residents and DJs, a gallery that feels like the night, and tickets that are one tap away.",
    architecture: [
      "header: transparent over the hero, logo left, Tickets as the one button",
      "hero_immersive: full screen photo or video of dancers, the party name huge, the next date and venue, Get tickets",
      "marquee: the dates, the cities or the music styles running across",
      "event_spotlight: the next party with date, doors, price and a countdown",
      "schedule: the upcoming nights as a list you can scan, each with its ticket link",
      "gallery: the night itself, asymmetric, large",
      "experience: what a night is like, told in three or four short beats with pictures",
      "classes: levels or workshops before the party, if they teach",
      "team: the DJs, teachers and hosts with their photos",
      "tickets: entry options or membership, side by side",
      "venue: where it is, how to get there, the hours",
      "faq: dress code, age, bringing a partner, beginners",
      "cta_final: the next date again, Get tickets",
      "footer: socials first, the venue address",
    ],
    typography: { heading: "Bebas Neue", body: "DM Sans", note: "Condensed display type set very large and tight for the party name and dates; plain sans for everything you read." },
    palette: "Near black backgrounds with one hot accent taken from the brand or the music (a deep red, a warm magenta, a gold). Light text. One colour scheme dark, one darker, the accent kept for tickets and dates.",
    imagery: "Real dancers in low light, motion blur, close couples, the DJ booth, the crowd. Large, cropped tight, edge to edge.",
    motion: "Marquee lines, images that scale slightly on scroll, staggered entrances, a pulsing date or countdown. Fast and rhythmic, but never in the way of reading the date.",
    conversion: "Buy a ticket for the next party.",
    avoid: "A white SaaS layout, pastel colours, stock handshake photos, a centred badge heading paragraph two buttons hero.",
  },
  {
    id: "course",
    label: "Online course or programme",
    match: [/\b(course|courses|masterclass|class(es)?|program(me)?|cohort|curriculum|lessons?|module|bootcamp|academy|workshop|learn)\b/i, /\b(teach|teacher|students?|enrol|enroll)\b/i],
    audience: "Someone who wants a specific result and is deciding whether this teacher can get them there.",
    personality: "Clear, credible, encouraging. Shows the outcome before the method.",
    reference: "A good course sales page: the result in the first screen, who it is for, what you will be able to do, the modules, the teacher, real student work, the price, a guarantee, questions.",
    architecture: [
      "header: logo, two links, Enrol button",
      "hero_split: the outcome as the heading, who it is for, the price or start date, Enrol, a picture of the result",
      "proof_logos or stats: where the teacher has been featured or real numbers from the store",
      "outcomes: what you will be able to do, four to six concrete results",
      "curriculum: modules and lessons, open one at a time",
      "creator_profile: the teacher, why them, their own work",
      "gallery or before_after: student results",
      "testimonials: named students, specific results",
      "pricing: one to three ways to buy, what each includes",
      "faq: time needed, level, access, refunds",
      "cta_final: the outcome again, Enrol",
      "footer",
    ],
    typography: { heading: "Plus Jakarta Sans", body: "Inter", note: "A confident sans for headings, generous body size for long reading." },
    palette: "Calm base with one strong accent used only for the buy buttons and progress. A light page with one dark band for the price.",
    imagery: "The result the student gets, the teacher at work, screenshots of lessons.",
    motion: "Restrained: fade up on scroll, a smooth accordion, a counter on real numbers.",
    conversion: "Enrol in the course.",
    avoid: "Vague promises, invented testimonials, a wall of feature cards with icons.",
  },
  {
    id: "photographer",
    label: "Photographer, filmmaker or visual artist",
    match: [/\b(photograph(y|er)|photos?|portfolio|film ?maker|cinematographer|videographer|visual artist|lightroom|presets?|shoots?|wedding photo)\b/i],
    audience: "Clients judging the eye in ten seconds, or buyers of presets and prints judging the look.",
    personality: "Image first, quiet, editorial. The work speaks and the interface steps back.",
    reference: "A photographer's portfolio: one big image on arrival, a grid or collage of work, short words, a clear way to book or buy.",
    architecture: [
      "header: minimal, logo as wordmark, three links",
      "hero_editorial: one photograph edge to edge with a short line of type over a corner",
      "gallery: selected work in a collage with varied sizes",
      "image_with_text: the approach in a few sentences beside a portrait",
      "product_grid: presets or prints, if they sell",
      "before_after: a preset on a real photo, if they sell presets",
      "testimonials: one or two clients, named",
      "cta_final: book a shoot or shop the presets",
      "footer",
    ],
    typography: { heading: "Cormorant Garamond", body: "Inter", note: "A refined serif at modest sizes; lots of space; small caps labels used sparingly." },
    palette: "Neutral: off white or near black so the photos carry the colour. No accent colour unless the brand has one.",
    imagery: "Their own work, large, varied crops, never stock.",
    motion: "Slow fades, subtle scale on hover, horizontal scroll through a series.",
    conversion: "Book a shoot or buy presets.",
    avoid: "Cards with shadows around photos, icons, busy colour, small thumbnails.",
  },
  {
    id: "apparel",
    label: "Clothing, streetwear or apparel brand (a real online store)",
    match: [/\b(cloth(ing|es)|apparel|streetwear|street ?wear|fashion brand|clothing brand|hoodies?|t-?shirts?|tees|sneakers?|merch|activewear|athleisure|swimwear|denim|outerwear|garments?|wear brand)\b/i, /\b(drop|collection|sizes?|fits?|new arrivals|best sellers)\b/i],
    audience: "Shoppers who arrive from Instagram or TikTok on a phone, want to see the clothes on people, check the price and their size, and buy in a few taps.",
    personality: "Confident, current, product first. The brand's attitude in the photography and a few words, never in long copy.",
    reference: "The structure the highest converting apparel stores share: an announcement bar with a real offer, a clean header with the menu, search and cart, a full width campaign image with one button to the new collection, best sellers as a product grid with prices, shop by category, the brand's story beside a strong photo, trust points (shipping, returns, secure checkout), real reviews or UGC, a lookbook, an email sign up with a reason to join, and a full footer.",
    architecture: [
      "announcement: one real offer or the shipping and returns promise",
      "header: logo, Shop, the collections, About; search and cart; transparent over the campaign image",
      "hero_immersive: full width campaign photo of the clothes on people, the collection name, Shop the collection",
      "product_grid: best sellers or the new drop from the store, image, name, price, four across on a laptop, two on a phone",
      "collection_grid: shop by category (tops, bottoms, outerwear, accessories)",
      "image_with_text: the brand's story in three sentences beside a strong photo",
      "features: three trust points: shipping, free returns, secure checkout",
      "gallery: the lookbook, the clothes worn in real places",
      "testimonials: real reviews with names, or the slot left for the creator",
      "newsletter: early access to drops",
      "footer: shop and help menus, policies, socials",
    ],
    typography: { heading: "Montserrat", body: "Inter", note: "Bold, tight sans headings in capitals for collection names; small clean body type; prices clear." },
    palette: "Neutral base (white or near black) so the product photography carries the colour; one accent for sale and the buy buttons.",
    imagery: "Campaign and lookbook photos of the clothes worn; product shots on clean backgrounds, all the same crop; never stock.",
    motion: "Quick and light: the second photo on hover in a product card, gentle reveals, a marquee for the drop or the shipping promise.",
    conversion: "Add a product to the cart.",
    avoid: "Long paragraphs, feature cards with icons, a centred SaaS hero, invented reviews, product prices typed in by hand.",
  },
  {
    id: "luxury_fashion",
    label: "Luxury or fashion brand",
    match: [/\b(luxury|fashion|couture|atelier|apparel|clothing|jewel(le)?ry|boutique|designer|collection|lookbook|runway|maison)\b/i],
    audience: "Buyers who care how a thing is made and how it makes them look.",
    personality: "Restrained, editorial, confident. Very little said, said well.",
    reference: "A fashion house's site: campaign imagery full bleed, the collection in a clean grid, a lookbook, few words, lots of space, small type.",
    architecture: [
      "announcement: one quiet line (shipping, a new collection)",
      "header: centred wordmark, thin links",
      "hero_editorial: campaign image full width, collection name small",
      "collection_grid or product_grid: the pieces, large images, name and price only",
      "image_with_text: the story of the collection or the atelier",
      "gallery: lookbook, asymmetric",
      "product_spotlight: one hero piece",
      "newsletter: early access to the next collection",
      "footer",
    ],
    typography: { heading: "Playfair Display", body: "Raleway", note: "High contrast serif or a spaced sans in capitals for headings, small body type, wide letter spacing on labels." },
    palette: "Ivory, bone, black, and one muted tone from the collection. Never bright accents.",
    imagery: "Campaign photography, model and product, crisp and large.",
    motion: "Slow image reveals, gentle parallax, hover swaps to a second photo.",
    conversion: "Shop the collection.",
    avoid: "Discount banners, badges, rounded cards, emoji, exclamation marks.",
  },
  {
    id: "ecommerce",
    label: "Product brand or online shop",
    match: [/\b(shop|store|e-?commerce|products?|brand|merch|skincare|cosmetics|coffee|candles?|supplements?|gear|accessories)\b/i],
    audience: "Shoppers who want to see the product, trust it and buy it quickly.",
    personality: "Product first, clear, trustworthy, with a voice of its own.",
    reference: "A direct to consumer brand: the hero product with a buy button, best sellers, why it is different, reviews, the brand story, shipping and returns.",
    architecture: [
      "announcement: shipping or an offer that is real",
      "header: logo, shop links, cart",
      "hero_product: the hero product with price and buy",
      "product_grid: best sellers from the real catalogue",
      "features: what makes it different, three or four specific points",
      "image_with_text: how it is made",
      "testimonials: real reviews",
      "collection_grid: the ranges",
      "faq: shipping, returns, sizing",
      "newsletter",
      "footer",
    ],
    typography: { heading: "DM Sans", body: "Inter", note: "Friendly sans with a bit of character; prices clear and large." },
    palette: "Taken from the products themselves. A clean base, one brand colour, high contrast buy buttons.",
    imagery: "Product photos on clean backgrounds and in use.",
    motion: "Hover swaps on product cards, quick fades, nothing that delays buying.",
    conversion: "Add the product to the cart.",
    avoid: "Invented reviews, fake scarcity, generic lifestyle stock.",
  },
  {
    id: "creator",
    label: "Creator, influencer or personal brand",
    match: [/\b(creator|influencer|youtuber|tiktok(er)?|streamer|podcast(er)?|personal brand|newsletter|writer|author|blogger|artist)\b/i],
    audience: "Fans and followers who want more of the person, and to buy what they make.",
    personality: "Personal, direct, recognisable. The person's face and voice, not a company.",
    reference: "A creator's home: their face and name, what they make, the latest work, the products, where to follow them, the newsletter.",
    architecture: [
      "header: name as logo, socials, the main product",
      "hero_split: portrait, name, one line on what they do, the main offer",
      "proof_logos: where they have been featured, or follower counts that are real",
      "product_grid: what they sell",
      "video: the latest or best piece",
      "creator_profile: the story, short",
      "testimonials: from their audience",
      "newsletter: what you get and how often",
      "footer: socials prominent",
    ],
    typography: { heading: "Space Grotesk", body: "Inter", note: "A heading face with personality; match their channel's look if it has one." },
    palette: "Their brand colours from their channel; a bold background colour is fine here.",
    imagery: "Their own photos and video stills, not stock.",
    motion: "Playful hover states, a marquee of what they make, quick entrances.",
    conversion: "Buy their product or join their list.",
    avoid: "Corporate copy, stock photos, a faceless layout.",
  },
  {
    id: "coach",
    label: "Coach, trainer or consultant",
    match: [/\b(coach(ing)?|trainer|fitness|personal training|consult(ant|ing)|therapist|mentor(ing)?|nutrition|wellness|yoga|pilates)\b/i],
    audience: "People with a specific problem deciding whether to trust this person with it.",
    personality: "Warm, assured, specific. Shows the person and the result.",
    reference: "A coach's site: the result and the person in the first screen, the method in steps, client stories, the programmes and prices, a way to book.",
    architecture: [
      "header: name, programmes, Book",
      "hero_split: the result, a portrait in action, Book a call or Start",
      "stats or proof_logos: real numbers or features",
      "process: the method in three or four steps",
      "before_after or gallery: client results",
      "testimonials: named clients and what changed",
      "pricing: programmes side by side",
      "creator_profile: the coach's story and credentials",
      "faq",
      "cta_final",
      "footer",
    ],
    typography: { heading: "Montserrat", body: "Inter", note: "Strong sans headings; for fitness, condensed capitals (Oswald) work." },
    palette: "Confident base with one energetic accent; a dark band for the offer.",
    imagery: "The coach working with people, real clients, training spaces.",
    motion: "Counters on real numbers, steps that reveal in order, smooth accordions.",
    conversion: "Book a call or buy a programme.",
    avoid: "Generic motivational copy, invented transformations, stock gym photos.",
  },
  {
    id: "restaurant",
    label: "Restaurant, cafe or bar",
    match: [/\b(restaurant|cafe|café|bistro|bakery|kitchen|menu|dining|brunch|pizzeria|trattoria|eatery|food truck|chef|reservations?|wine bar|cocktail)\b/i],
    audience: "Locals and visitors deciding where to eat tonight; they need the food, the mood, where and when.",
    personality: "Sensory, warm, of its place. Appetite first.",
    reference: "A restaurant's site: the food and the room in big pictures, the menu, hours and address up front, a reservation button everywhere.",
    architecture: [
      "header: logo, Menu, Visit, Book a table",
      "hero_immersive: the room or a signature dish, name, hours, Book a table",
      "image_with_text: the kitchen's idea in a few lines",
      "menu: the dishes with prices, in sections",
      "gallery: food and room",
      "testimonials: real reviews, or quotes from real press",
      "venue: address, map, hours, how to get there",
      "cta_final: Book a table",
      "footer",
    ],
    typography: { heading: "Lora", body: "Source Sans 3", note: "A warm serif; menu set like a printed menu." },
    palette: "From the food and the room: warm neutrals, a deep colour (oxblood, olive, ink).",
    imagery: "Food close up in natural light, the room at service, people eating.",
    motion: "Slow image reveals, a gentle marquee of dishes. Calm.",
    conversion: "Book a table.",
    avoid: "Feature cards, SaaS hero, stock food photos.",
  },
  {
    id: "saas",
    label: "Software, app or tool",
    match: [/\b(saas|software|app|platform|tool|startup|api|dashboard|plugin|template|notion|figma|extension)\b/i],
    audience: "People with a job to do judging whether this does it better than what they use now.",
    personality: "Structured, precise, demonstrative. Shows the product working.",
    reference: "A good product site: the problem and the product in one screen, the product itself shown, how it works, specifics, proof, pricing.",
    architecture: [
      "header: logo, product links, Sign up",
      "hero_split: what it does in one line, the product screenshot",
      "proof_logos: real customers only",
      "features: three to five specific capabilities, each with a picture of it",
      "process: how it works in steps",
      "comparison: against the old way",
      "testimonials",
      "pricing",
      "faq",
      "cta_final",
      "footer",
    ],
    typography: { heading: "Inter", body: "Inter", note: "One clean sans family, tight headings, clear hierarchy." },
    palette: "Neutral base and one product colour. Avoid the purple gradient default.",
    imagery: "Real product screenshots and the output it produces.",
    motion: "Features that reveal as you scroll, a sticky product shot that changes with the text.",
    conversion: "Start a trial or buy.",
    avoid: "Purple gradients, glassmorphism, icon tile grids, fake logos.",
  },
  {
    id: "digital_products",
    label: "Digital products (templates, presets, ebooks, downloads)",
    match: [/\b(templates?|presets?|ebooks?|e-books?|downloads?|digital products?|printables?|luts?|notion templates?|brushes|fonts?|guides?)\b/i],
    audience: "Buyers who want to see exactly what they get before paying.",
    personality: "Clear, generous with previews, honest about what is inside.",
    reference: "A digital product page: what it is and the result in the hero, previews of the inside, what is included, who made it, price, questions.",
    architecture: [
      "header",
      "hero_product: the product, price, buy",
      "gallery or before_after: inside previews or the effect on real work",
      "features: what is included, as a list with counts",
      "creator_profile: who made it",
      "testimonials: buyers",
      "product_grid: the other products",
      "faq: format, licence, updates, refunds",
      "footer",
    ],
    typography: { heading: "DM Sans", body: "Inter", note: "Clean and friendly; the previews do the selling." },
    palette: "Taken from the product's own look.",
    imagery: "Real previews and results.",
    motion: "Before and after sliders, hover zoom on previews.",
    conversion: "Buy the download.",
    avoid: "Vague benefit copy, invented review counts.",
  },
  {
    id: "music",
    label: "Musician, band or label",
    match: [/\b(musician|band|singer|rapper|producer|label|album|ep|single|tour|concert|gig|spotify|soundcloud|beats)\b/i],
    audience: "Fans looking for the new release, the next show and the merch.",
    personality: "Bold, atmospheric, of the artist's sound.",
    reference: "An artist's site: the latest release artwork big, listen links, tour dates, video, merch, newsletter.",
    architecture: [
      "header: artist name, Listen, Tour, Shop",
      "hero_immersive: release artwork or video, Listen now",
      "marquee: the release name or tour cities",
      "schedule: tour dates with ticket links",
      "video: the latest video",
      "product_grid: merch",
      "gallery: live photos",
      "newsletter",
      "footer: every platform",
    ],
    typography: { heading: "Oswald", body: "Inter", note: "Type that matches the artwork; often condensed capitals." },
    palette: "From the release artwork.",
    imagery: "Artwork, live shots, video stills.",
    motion: "Marquee, scale on scroll, video backgrounds where performance allows.",
    conversion: "Listen, then buy tickets or merch.",
    avoid: "Corporate layouts, generic stock.",
  },
  {
    id: "community",
    label: "Community or membership",
    match: [/\b(community|membership|members|club house|circle|guild|society|tribe|network)\b/i],
    audience: "People looking for others like them and deciding whether this group is worth joining.",
    personality: "Welcoming, alive, specific about what happens inside.",
    reference: "A membership page: what it is and who is in it, what happens inside each week, the people, the price, how to join.",
    architecture: [
      "header",
      "hero_split: who it is for and what you get, Join",
      "stats: real member numbers if there are any",
      "features: what happens inside, concretely",
      "schedule: the regular events",
      "team: the hosts",
      "testimonials: members",
      "pricing: membership options",
      "faq",
      "cta_final",
      "footer",
    ],
    typography: { heading: "Nunito", body: "Inter", note: "Friendly rounded or humanist sans." },
    palette: "Warm and inviting with one brand colour.",
    imagery: "Members together, events, real moments.",
    motion: "Gentle entrances, an animated count of members if real.",
    conversion: "Join.",
    avoid: "Corporate tone, stock group photos.",
  },
]

/** What a site is for when nothing in the request names a category. */
export const DEFAULT_ARCHETYPE_ID = "creator"

/**
 * The archetype a request (and what the store sells) is closest to, best
 * first. The planner is shown the top one or two: a bachata club that also
 * teaches classes is nightlife first and course second.
 */
export function matchArchetypes(text: string, limit = 2): Archetype[] {
  const t = text.slice(0, 4_000)
  return ARCHETYPES.map((a, order) => ({ a, order, score: a.match.reduce((n, re) => n + (re.test(t) ? (re === a.match[0] ? 2 : 1) : 0), 0) }))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .slice(0, limit)
    .map((s) => s.a)
}

export function archetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id)
}

/** One archetype as the planner reads it. */
export function describeArchetype(a: Archetype): string {
  return [
    `${a.label.toUpperCase()} (${a.id})`,
    `Audience: ${a.audience}`,
    `Personality: ${a.personality}`,
    `What real ones look like: ${a.reference}`,
    `A strong page, top to bottom:\n${a.architecture.map((l) => `  - ${l}`).join("\n")}`,
    `Type: headings ${a.typography.heading}, body ${a.typography.body}. ${a.typography.note}`,
    `Palette: ${a.palette}`,
    `Imagery: ${a.imagery}`,
    `Motion: ${a.motion}`,
    `The page is for: ${a.conversion}`,
    `Avoid: ${a.avoid}`,
  ].join("\n")
}

/**
 * ===========================================================================
 *  THE PAGES A KIND OF SITE USUALLY HAS, BEYOND ITS HOME PAGE
 * ===========================================================================
 * "Build a full website for my clothing brand" is a site, and a site of one
 * page is not what was asked for: a real apparel store has a shop, a product
 * page, collections, a story, sizing and shipping answers and a way to get
 * in touch. Each line is "key: what the page is for and what it holds". A
 * STARTING POINT the brief overrides in both directions: a one page landing
 * for a launch stays one page, and a brief that names a page gets it.
 *
 * The store's own pages ("products", "product", "collections") draw the real
 * catalogue: a build adds sections around the product section, never a
 * product typed in by hand.
 */
export const ARCHETYPE_PAGES: Record<string, string[]> = {
  apparel: [
    "products: the shop, every product from the store with a short header naming the range",
    "product: the template every product uses, built around its product section: fit and size guide, materials and care, shipping and returns, related products",
    "collections: every collection as large images",
    "about: the brand's story, the people and how the clothes are made, with strong photos",
    "lookbook: the current collection worn, as an editorial gallery",
    "faq: sizing, shipping, returns and exchanges, payment, as real questions",
    "contact: how to reach the brand, with the contact form",
  ],
  luxury_fashion: [
    "products: the collection in a clean grid",
    "product: around its product section: materials, craft, care, delivery",
    "collections",
    "about: the house or the atelier",
    "lookbook: the campaign",
    "contact: client services",
  ],
  ecommerce: [
    "products: the shop, every product",
    "product: around its product section: what is in it, how to use it, shipping and returns, related products",
    "collections",
    "about: why the brand exists and how it is made",
    "faq: shipping, returns, the product's own questions",
    "contact",
  ],
  digital_products: [
    "products: every product with what you get",
    "product: around its product section: what is inside, who it is for, a preview, the questions",
    "about: who made them and why",
    "faq: delivery of files, licence, refunds",
    "contact",
  ],
  course: ["about: the teacher and their credentials", "faq: access, length, refunds", "contact"],
  coach: ["about: the coach's story and method", "services: what working together looks like and what it costs", "faq", "contact: a booking or enquiry form"],
  creator: ["about: the person behind it", "products: what they sell", "contact"],
  photographer: ["work: the portfolio, by series", "about", "services: what a shoot includes and costs", "contact: an enquiry form"],
  restaurant: ["menu: the full menu", "about: the kitchen and the people", "contact: address, hours, a map and reservations"],
  saas: ["pricing: the plans and what each includes", "about: the team and why", "faq", "contact"],
  music: ["music: releases", "tour: the dates", "about", "contact: bookings and press"],
  nightlife: ["events: every upcoming date", "gallery: the nights", "about: the residents and the venue", "contact: bookings and the address"],
  community: ["about: who it is for and what happens in it", "faq", "contact"],
}

/** The page set for an archetype, as the model reads it, or "" when there is none. */
export function describeArchetypePages(id: string | null | undefined): string {
  const pages = id ? ARCHETYPE_PAGES[id] : undefined
  if (!pages?.length) return ""
  return `THE PAGES THIS KIND OF SITE USUALLY HAS BESIDE HOME (a starting point; the brief wins):\n${pages.map((p) => `  - ${p}`).join("\n")}`
}
