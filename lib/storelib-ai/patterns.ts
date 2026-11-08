/**
 * ===========================================================================
 *  THE PIECES A PAGE IS MADE OF, AND WHERE EACH ONE ALREADY EXISTS
 * ===========================================================================
 * A designer composing a page thinks in parts (an immersive hero, a running
 * line of dates, a lineup, a ticket table) before thinking in components.
 * The assistant was handed thirty nine section types by file name and chose
 * among them by name, so every page came out as the same five: a centred
 * hero, a feature grid, testimonials, a CTA, an FAQ.
 *
 * Each pattern here says what the part is FOR, which built-in section types
 * already draw it (with the settings that make it look right), and how to
 * build it as a section of the creator's own when no built-in one fits or
 * when the brief needs something more distinctive. They are primitives to
 * compose and restyle, never a fixed layout: two sites built from the same
 * patterns should still look like two different businesses.
 *
 * `builtIn` names types from themes/default/manifest.json's addable list. A
 * test (tests/agent-intent.test.ts) holds every name here to a real type, so
 * a renamed section cannot leave a pattern pointing at nothing.
 */

export interface DesignPattern {
  id: string
  label: string
  /** What it is for on a page, in one line. */
  purpose: string
  /** Built-in section types that draw it, best first, with how to set them. */
  builtIn: { type: string; how: string }[]
  /** How to write it as the creator's own section when nothing built in fits the brief. */
  custom: string
}

export const DESIGN_PATTERNS: DesignPattern[] = [
  {
    id: "header",
    label: "Header",
    purpose: "Logo, the main menu and one action. The built-in header on every page.",
    builtIn: [],
    custom: "Never written. Configure the built-in header: layout, sticky, transparent over the hero, colour scheme, logo, the Main menu, one button.",
  },
  {
    id: "announcement",
    label: "Announcement bar",
    purpose: "One short, true line above the header: shipping, the next date, a new release.",
    builtIn: [{ type: "promo_announcement", how: "one line, a link, a scheme that contrasts with the header" }],
    custom: "A thin band in the header group with enabled_on groups header; optional marquee of two or three lines.",
  },
  {
    id: "hero_immersive",
    label: "Immersive hero",
    purpose: "The first screen is the experience: a full bleed photo or video with the name and one action laid over it.",
    builtIn: [
      { type: "hero_centered", how: "background image, wide, dark scheme or overlay, a short heading, one button" },
      { type: "cta_banner", how: "background image, full width, as a shorter opening band" },
    ],
    custom: "A section with an image_picker and a video url setting, min-height from a select (80, 100 svh using var(--sl-vh)), an overlay strength range, text placement select (bottom left, centre), huge display heading that can break into two lines, details line (date, place), one or two buttons. Scale the media slowly on load; stop under reduced motion.",
  },
  {
    id: "hero_editorial",
    label: "Editorial hero",
    purpose: "Type and one photograph composed like a magazine spread. For brands where restraint is the message.",
    builtIn: [{ type: "hero_split", how: "large image, small refined heading, no second button" }],
    custom: "Asymmetric grid: a tall photograph across seven columns, a small heading and one line set low in the remaining columns, generous whitespace, optional caption.",
  },
  {
    id: "hero_split",
    label: "Split hero",
    purpose: "The promise on one side, the proof or product picture on the other.",
    builtIn: [{ type: "hero_split", how: "image side, image shape, heading that states the outcome, one primary button" }],
    custom: "Two columns from 760px container width, picture can overlap the edge, a details row (price, date, rating that is real).",
  },
  {
    id: "hero_product",
    label: "Product hero",
    purpose: "One product at the top with price and buy.",
    builtIn: [{ type: "hero_product", how: "pick the product from the store; never type a price" }],
    custom: "Rarely needed; the built-in one reads the real product.",
  },
  {
    id: "marquee",
    label: "Marquee",
    purpose: "A running line of words, dates, cities or logos that gives a page pace.",
    builtIn: [],
    custom: "Blocks of type item (text), a direction select, a speed range, a gap range, large display type, items duplicated in markup with aria-hidden on the copy, @keyframes translateX(-50%), paused on hover and under reduced motion.",
  },
  {
    id: "event_spotlight",
    label: "Event spotlight",
    purpose: "The next event: name, date, doors, place, price and the ticket button, with a countdown.",
    builtIn: [{ type: "promo_countdown", how: "the end date is the event start, heading the event name, button to tickets" }],
    custom: "A poster like layout: a big date block (day number huge, month small), event name, details list, a countdown drawn from a date setting in the script (no fetch), ticket button, photo on the side.",
  },
  {
    id: "schedule",
    label: "Schedule or event list",
    purpose: "Several dates to scan: what, when, where, and a link for each.",
    builtIn: [
      { type: "about_timeline", how: "one moment per date, title and short line" },
      { type: "multirow", how: "one row per event with its picture" },
    ],
    custom: "Blocks of type event (date, title, place, price, url), drawn as rows with a large date column, hover that lifts the row, a sold out toggle per event.",
  },
  {
    id: "gallery",
    label: "Gallery",
    purpose: "Many pictures that together say what it is like.",
    builtIn: [
      { type: "media_collage", how: "one large and smaller pictures around it" },
      { type: "media_gallery", how: "grid at one shape" },
    ],
    custom: "Masonry or asymmetric grid with spans set per block, hover scale inside an overflow hidden frame, or a horizontal scroll strip with scroll-snap.",
  },
  {
    id: "experience",
    label: "Experience or story beats",
    purpose: "What it is like, told in three or four short beats with pictures.",
    builtIn: [
      { type: "multirow", how: "alternating rows, each a beat with a strong picture" },
      { type: "features_image", how: "a picture with the beats beside it" },
    ],
    custom: "Sticky storytelling: the picture column sticks while short text beats scroll past it.",
  },
  {
    id: "features",
    label: "Features or benefits",
    purpose: "The specific reasons, each one concrete.",
    builtIn: [
      { type: "features_image", how: "with a picture, numbered markers off unless the order matters" },
      { type: "features_grid", how: "short points, as many as the content has" },
      { type: "features_cards", how: "only when each point needs a box of its own" },
    ],
    custom: "A list with large numerals or small photos, or a two column split with a sticky heading.",
  },
  {
    id: "outcomes",
    label: "Outcomes",
    purpose: "What someone will be able to do after buying.",
    builtIn: [{ type: "features_grid", how: "each point starts with a verb" }, { type: "text_columns", how: "two columns of results" }],
    custom: "A checklist with large type and a picture of the result.",
  },
  {
    id: "process",
    label: "Process or steps",
    purpose: "How it works, in order.",
    builtIn: [{ type: "features_grid", how: "marker number, three or four steps" }, { type: "about_timeline", how: "steps as moments" }],
    custom: "Steps connected by a line that draws itself as you scroll.",
  },
  {
    id: "classes",
    label: "Classes or levels",
    purpose: "The levels or classes on offer and who each is for.",
    builtIn: [{ type: "pricing_table", how: "one plan per level with what you learn" }, { type: "features_cards", how: "one card per level" }],
    custom: "Cards with a level badge only if the level is information, the day and time, and a book link.",
  },
  {
    id: "curriculum",
    label: "Curriculum",
    purpose: "The modules of a course and the lessons in each.",
    builtIn: [{ type: "course_curriculum", how: "every module with its real lessons" }],
    custom: "Rarely needed.",
  },
  {
    id: "team",
    label: "Team, hosts or lineup",
    purpose: "The people: DJs, teachers, hosts, founders.",
    builtIn: [{ type: "about_founder", how: "one person" }, { type: "features_cards", how: "a card per person with photo marker" }],
    custom: "Portrait cards in a grid with name, role and a hover that reveals a line or social link; for a lineup, names in huge type with photos on hover.",
  },
  {
    id: "creator_profile",
    label: "Creator or teacher profile",
    purpose: "Who is behind it and why them.",
    builtIn: [{ type: "about_founder", how: "portrait, story, signature line" }, { type: "about_image", how: "with facts as blocks" }],
    custom: "Large portrait, a pull quote, two or three credentials.",
  },
  {
    id: "testimonials",
    label: "Testimonials",
    purpose: "What real customers said. Only real ones, or empty slots for the creator to fill.",
    builtIn: [{ type: "proof_testimonials", how: "the store's real reviews, names as given; none: hidden with placeholders" }, { type: "proof_featured", how: "one quote given space" }],
    custom: "A horizontal scroll of quotes with scroll-snap, or one large quote that cycles.",
  },
  {
    id: "proof_logos",
    label: "Logo cloud or press",
    purpose: "Where they have been featured, quiet and in one row.",
    builtIn: [{ type: "proof_logos", how: "real names only" }],
    custom: "A marquee of logos.",
  },
  {
    id: "stats",
    label: "Stats",
    purpose: "Real numbers that matter: members, years, events.",
    builtIn: [{ type: "features_grid", how: "marker none, the number as the title" }],
    custom: "Big numerals that count up once when they enter the view, from number settings; never invented numbers.",
  },
  {
    id: "comparison",
    label: "Comparison",
    purpose: "This against the alternative.",
    builtIn: [{ type: "text_columns", how: "two columns, the old way and this" }, { type: "pricing_table", how: "options side by side" }],
    custom: "A table with rows as blocks and a highlighted column.",
  },
  {
    id: "pricing",
    label: "Pricing",
    purpose: "The ways to buy, side by side.",
    builtIn: [{ type: "pricing_table", how: "named plans, real prices, what each includes" }],
    custom: "Rarely needed.",
  },
  {
    id: "tickets",
    label: "Tickets or entry",
    purpose: "Entry options with price and a buy link each.",
    builtIn: [{ type: "pricing_table", how: "one plan per ticket type" }, { type: "product_grid", how: "if tickets are products in the store" }],
    custom: "Ticket stubs: perforated edge drawn in CSS, price large, sold out state.",
  },
  {
    id: "faq",
    label: "FAQ",
    purpose: "The real questions people ask before buying.",
    builtIn: [{ type: "faq_accordion", how: "six or more real questions" }, { type: "faq_columns", how: "heading beside the questions" }, { type: "faq_cta", how: "with a way to ask" }],
    custom: "Rarely needed.",
  },
  {
    id: "image_with_text",
    label: "Image with text",
    purpose: "A picture and a paragraph that belong together.",
    builtIn: [{ type: "text_image", how: "image side alternating with the section above" }, { type: "about_image", how: "with facts" }],
    custom: "Overlapping image and text card, image mask shapes.",
  },
  {
    id: "before_after",
    label: "Before and after",
    purpose: "The effect, shown on a real example.",
    builtIn: [{ type: "media_gallery", how: "pairs of pictures" }],
    custom: "A comparison slider: two image_pickers, a range input over them that moves a clip-path, keyboard accessible.",
  },
  {
    id: "video",
    label: "Video",
    purpose: "One video that shows it better than words.",
    builtIn: [{ type: "media_video", how: "with a line about it" }],
    custom: "A full width video band with a play button over a poster image.",
  },
  {
    id: "product_grid",
    label: "Product grid",
    purpose: "The real products from the store.",
    builtIn: [{ type: "product_grid", how: "source shop or picked; never typed products" }, { type: "product_featured", how: "fewer, larger" }],
    custom: "Never: products come from the store.",
  },
  {
    id: "product_spotlight",
    label: "Product spotlight",
    purpose: "One product given the whole row.",
    builtIn: [{ type: "product_spotlight", how: "with its points as blocks" }],
    custom: "Rarely needed.",
  },
  {
    id: "collection_grid",
    label: "Collection grid",
    purpose: "The ranges or categories.",
    builtIn: [{ type: "collections_grid", how: "all or chosen" }, { type: "collection_featured", how: "one collection" }],
    custom: "Never: collections come from the store.",
  },
  {
    id: "menu",
    label: "Food or drinks menu",
    purpose: "Dishes with prices, in sections.",
    builtIn: [{ type: "text_columns", how: "a column per course" }],
    custom: "Blocks of type dish (name, description, price) grouped by a category text, dotted leaders between name and price.",
  },
  {
    id: "venue",
    label: "Venue and hours",
    purpose: "Where, when and how to get there.",
    builtIn: [{ type: "contact", how: "with the address and hours in the text" }, { type: "text_image", how: "a picture of the place with the details" }],
    custom: "Address, hours as a list, a map embed through the embed filter, directions link.",
  },
  {
    id: "newsletter",
    label: "Newsletter",
    purpose: "What you get by signing up and how often.",
    builtIn: [{ type: "promo_newsletter", how: "a specific promise, not 'stay updated'" }],
    custom: "Rarely needed.",
  },
  {
    id: "cta_final",
    label: "Final call to action",
    purpose: "The page's one action again, at the end.",
    builtIn: [{ type: "cta_banner", how: "background image or the darkest scheme" }, { type: "cta_image", how: "with a picture" }, { type: "cta_simple", how: "short" }],
    custom: "A full width band with a huge heading and the button.",
  },
  {
    id: "footer",
    label: "Footer",
    purpose: "Menus, socials, address. The built-in footer on every page.",
    builtIn: [],
    custom: "Never written. Configure the built-in footer.",
  },
]

export function patternById(id: string): DesignPattern | undefined {
  return DESIGN_PATTERNS.find((p) => p.id === id)
}

/** One pattern as a model reads it. */
export function describePattern(p: DesignPattern): string {
  const built = p.builtIn.length ? p.builtIn.map((b) => `${b.type} (${b.how})`).join("; ") : "none: see below"
  return `${p.id}: ${p.label}. ${p.purpose}\n  Built in: ${built}\n  Your own: ${p.custom}`
}

/** The whole library, or the named patterns, as text. */
export function describePatterns(ids?: string[]): string {
  const chosen = ids?.length ? DESIGN_PATTERNS.filter((p) => ids.includes(p.id)) : DESIGN_PATTERNS
  return chosen.map(describePattern).join("\n")
}

/**
 * THE DEFAULTS A STUDIO WOULD WORK TO, for anything nobody specified. Shared
 * by the builder's planner and the redesign skill outside agents read.
 */
export const DESIGN_DEFAULTS = `DEFAULTS FOR ANYTHING THE BRIEF DOES NOT SAY:
- Rhythm: vary the layouts down the page. No two sections in a row with the same shape (centred heading, paragraph, button). Alternate full bleed media with contained text, dense with open, light with dark.
- Width: text lines at 55 to 75 characters; content at the theme's page width; media may go edge to edge.
- Type: one display face and one text face from the theme's fonts. Display sizes for the hero only; section headings smaller and consistent. Labels in small capitals with letter spacing, used sparingly.
- Spacing: section padding on one scale (48, 64, 80, 96, 120), larger on desktop than on a phone, the same value for sections of the same weight.
- Buttons: one primary action per section, named for what happens. Radius from the theme.
- Images: real slots the creator fills (image_picker with an in editor placeholder of the right shape) or the store's own product pictures. Never stock addresses, never invented people.
- Colour: two or three schemes doing all the work, the accent saved for actions and key facts. Text at 4.5:1 or better.
- Motion: entrances once, 200 to 600ms, opacity and translate; a marquee or a counter only where it adds pace or meaning; everything stops under reduced motion.
- Phone: designed, not shrunk. Stack in reading order, keep the hero's action in the first screen, 44px tap targets, no sideways scroll.
- Selling (what the best converting online stores do): products and prices in the first two screens, the buy button always visible on a product, trust points (shipping, returns, secure checkout) near the price, real reviews close to the products, one clear path from campaign image to collection to product to cart, and nothing between a shopper and checkout.
- Empty states: a section that needs a picture or a product the creator has not added yet shows a quiet placeholder in the editor and nothing broken on the live site.`
