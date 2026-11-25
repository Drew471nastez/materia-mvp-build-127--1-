/**
 * ===========================================================================
 *  BUILD LIKE THE TEMPLATES: THE RULES EVERY AI PATH IS GIVEN
 * ===========================================================================
 * The owner: Storelib's AI builds the way the templates are built, on the
 * Materia theme's sections and blocks with a slight edge of custom work, and
 * uses the templates as the reference for design, structure, page sets and
 * section choices instead of inventing sections. With it, the design rules
 * of CLAUDE.md (no AI default look, honest copy, no em dashes) and what the
 * template briefs keep saying (the comments on CODE_TEMPLATES in
 * lib/themes/marketplace-shared.ts and the shared brief every template agent
 * works to: "built from the theme's own sections", real photographs that
 * look like one catalogue, every page designed, every link real, header
 * icons that fit the business, product pages that sell, no fake numbers).
 *
 * Three texts, one source, so every path says the same thing:
 *   MATERIA_RULES       the whole rule set: Start with AI, a redesign, the
 *                       planner, MCP's rules.
 *   MATERIA_EDIT_RULES  the short form for an edit, beside the page.
 * Pure.
 */
import { SLOP_DISPLAY_FONTS } from "@/lib/storelib-ai/library/type-systems"

/** CLAUDE.md's words, and its shape: words that say nothing. */
export const MATERIA_BANNED_WORDS = ["unlock", "elevate", "seamless", "powerful", "effortlessly", "supercharge", "transform"] as const

/** The faces that read as "nobody chose this" as display type (lib/storelib-ai/library/type-systems.ts), as people write them. */
const fonts = [...SLOP_DISPLAY_FONTS.filter((f) => /^[a-z ]+$/.test(f) && !["sans serif", "blinkmacsystemfont", "segoe ui"].includes(f)).map((f) => f.replace(/\b\w/g, (c) => c.toUpperCase())), "system-ui"].join(", ")

export const MATERIA_RULES = `BUILD LIKE STORELIB'S TEMPLATES (the Materia theme)
- Storelib's templates are made from the Materia theme's own sections and blocks, and so is every site made here. Choose each section from the Materia catalogue by the job it does, in the running order of the reference template, then make it this business's through its settings and blocks. Original sections first: a Materia section that does the job beats a new one.
- The edge is small and deliberate: at most two or three sections of your own on a site, for what no Materia section does (one signature moment), never a copy of one that exists.
- Never invent a section type, a setting id or a block type. Use them exactly as the catalogue or the site's own files name them; anything else is refused.
- The reference template is a pattern, not content: take its page set, running order, rhythm of colour schemes and the kind of section in each slot; never its words, names, products, prices or pictures.
- Type: a display face with character from the Typography list, chosen for this business. ${fonts} are never the display face, even where a template used one; they may set body text.
- Pictures are real photographs of this business: the creator's own, its product photos, licensed photos, or generated ones only when they read as real photographs. Product pictures look like one catalogue (the same light and ground). Never a grey box, a stock cliche, clip-art where a photo belongs, or an illustration standing in for a person. Alt text says what the picture shows.
- As in the template briefs: every page in the site's own voice (home, product, collection, about, contact, FAQ and every page the menu links to), and every link opens a page that exists. Header icons fit the business: a store with a catalogue shows search, account and cart; a one offer landing page, a course or a personal site leaves them out. A product page sells: gallery, title, price with compare-at, options, quantity, add to cart and buy now, short trust points, details that open (description, shipping, returns) and related products.
- No fake metrics or proof: no invented counts, ratings, reviews, testimonials, client logos, awards, press, years in business or results. A number on the page is the store's or the creator's.
- Honest, specific copy: name the thing that happens ("Book a first call", "Shop the broth book"), compact and plain. Never ${MATERIA_BANNED_WORDS.join(", ")}. No em dashes.
- Avoid the AI default look: purple gradients, glass, bento grids, rows of identical cards, a giant centred hero over three cards, heavy rounding, random pills, an icon beside every label, a card inside a card. If it could belong to any business, change it.`

export const MATERIA_EDIT_RULES = `THIS SITE IS BUILT ON MATERIA (the theme Storelib's templates are made from)
- To add something, use the Materia section that does that job (the list below) before writing a new one; match the settings style of the sections already on the page (their colour schemes, widths, alignment). Write your own section only for what no Materia section does.
- Use section types, setting ids and block types exactly as named; a type that does not exist is refused.
- Real photographs, real numbers, real proof only; plain specific words, never ${MATERIA_BANNED_WORDS.join(", ")}, no em dashes.`
