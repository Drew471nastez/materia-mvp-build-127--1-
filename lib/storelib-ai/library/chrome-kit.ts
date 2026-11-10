/**
 * ===========================================================================
 *  THE CHROME KIT: PREMIUM HEADERS, DRAWERS, SEARCH, SWITCHES AND FOOTERS
 * ===========================================================================
 * Round P (P4). Andrew: the site chrome the agent wrote was one basic pattern
 * ("very boring"). The kit is a set of complete .storelib sections under
 * ./examples/chrome, embedded by scripts/build-ai-knowledge.mjs as
 * CHROME_SOURCES and served through the same example machinery
 * (./examples.ts: search_knowledge by id hands one over in full):
 *
 *   headers      six layouts (over the hero and solid on scroll, centred logo
 *                with a split menu, mega menu with image cards and products,
 *                minimal with its own full screen menu, announcement bar,
 *                compact shop bar with category tabs)
 *   menu drawers full screen with huge staggered links, side sheet with
 *                sliding sub menus, bottom sheet on phones
 *   carts        side drawer with pictures and an upsell row, full height
 *                minimal, floating card
 *   search       full screen with a live picture grid, drop down with
 *                suggestions
 *   switches     language and currency as pills, a drop down or a sentence
 *   footers      giant wordmark, newsletter led, multi column from blocks,
 *                one line, image backed, sitemap grid
 *
 * Every one works on the page's hooks (lib/website-builder/storefront-hooks.ts:
 * data-storelib-cart-panel, -search-panel, -menu-panel, -locale-list,
 * -currency-list), moves with the site's motion feel (--t-motion-*, round O5)
 * and stands still under reduced motion, keeps 44px targets, has a phone
 * layout of its own, exposes layout, behaviour, colours, motion strength and
 * which parts show as settings, and ships filled preset blocks.
 * tests/chrome-kit-p4.test.ts holds each to the agent's checks and opens and
 * shuts the drawers in a real browser.
 *
 * The agent picks one per role that fits the direction and ADAPTS it (its own
 * ai_ name, type, colour, spacing, words, motion); never ships one verbatim.
 *
 * Pure. Browser safe.
 */

export type ChromeRole = "header" | "menu" | "cart" | "search" | "locale" | "footer"

export interface ChromeKitPiece {
  /** The section type and file name under ./examples/chrome. */
  id: string
  role: ChromeRole
  /** A few words: what it is. */
  what: string
  /** Words a direction, style or business brings that this piece suits. */
  suits: string[]
}

export const CHROME_ROLES: readonly ChromeRole[] = ["header", "menu", "cart", "search", "locale", "footer"]

export const CHROME_KIT: readonly ChromeKitPiece[] = [
  { id: "ai_chrome_header_overlay", role: "header", what: "transparent over a full bleed hero, solid after the first scroll (scroll timeline), drop down sub menus", suits: ["cinematic", "imagery", "photo", "luxury", "hotel", "real estate", "travel", "restaurant", "fitness", "sport", "performance", "outdoor", "immersive", "bold"] },
  { id: "ai_chrome_header_split", role: "header", what: "centred logo, a menu either side, thin utility line, rolling link hover", suits: ["boutique", "fashion", "jewellery", "beauty", "spa", "wellness", "luxury", "classic", "elegant", "minimal", "wedding", "florist", "bakery"] },
  { id: "ai_chrome_header_mega", role: "header", what: "mega menu panels with link columns, image cards and chosen products", suits: ["shop", "store", "catalog", "fashion", "apparel", "homeware", "furniture", "many products", "collections", "brand", "outdoor"] },
  { id: "ai_chrome_header_minimal", role: "header", what: "name, bag and one Menu button opening its own full screen menu with a picture", suits: ["studio", "agency", "portfolio", "architect", "photographer", "artist", "design", "editorial", "swiss", "brutalist", "minimal", "creative", "coach", "personal"] },
  { id: "ai_chrome_header_announce", role: "header", what: "announcement bar (rotating, moving or side by side messages) over an inline menu with switches", suits: ["shop", "store", "drop", "launch", "promo", "food", "drink", "coffee", "soda", "playful", "retail", "markets", "international"] },
  { id: "ai_chrome_header_shop", role: "header", what: "compact pinned bar with a wide search field and sideways category tabs, top row slides away on scroll", suits: ["marketplace", "grocery", "pharmacy", "electronics", "large catalog", "many products", "retail", "supplies", "parts", "books"] },
  { id: "ai_chrome_menu_fullscreen", role: "menu", what: "full screen menu, huge staggered links, wipe, fade or drop, sub links folding open", suits: ["studio", "agency", "portfolio", "bold", "expressive", "editorial", "creative", "fashion", "music", "event", "cinematic"] },
  { id: "ai_chrome_menu_sheet", role: "menu", what: "side sheet over a dimmed page, sub menus slide over, featured cards", suits: ["shop", "store", "fashion", "homeware", "collections", "many products", "classic", "boutique"] },
  { id: "ai_chrome_menu_bottom", role: "menu", what: "bottom sheet on phones (thumb zone), a panel on wide screens, quick action tiles", suits: ["app", "booking", "service", "restaurant", "clinic", "salon", "fitness", "local", "practical", "friendly", "grocery"] },
  { id: "ai_chrome_cart_side", role: "cart", what: "side drawer with pictures, quantity steppers and an upsell row of chosen products", suits: ["shop", "store", "fashion", "beauty", "food", "drink", "homeware", "many products", "upsell", "add ons"] },
  { id: "ai_chrome_cart_minimal", role: "cart", what: "full height cart set in type, numbered lines, the total set large", suits: ["luxury", "editorial", "minimal", "swiss", "studio", "art", "prints", "few products", "jewellery", "architect"] },
  { id: "ai_chrome_cart_card", role: "cart", what: "floating card under the bag (above the bottom edge on phones), keep shopping and checkout", suits: ["playful", "friendly", "coffee", "soda", "snacks", "quick", "single product", "digital", "courses", "tickets", "app"] },
  { id: "ai_chrome_search_full", role: "search", what: "full screen search, huge input, popular searches and chosen products, live results as a picture grid", suits: ["fashion", "visual", "imagery", "shop", "catalog", "art", "prints", "homeware", "luxury", "editorial"] },
  { id: "ai_chrome_search_drop", role: "search", what: "drop down search under the header, suggestions and quick links, compact live list", suits: ["marketplace", "grocery", "large catalog", "blog", "content", "docs", "practical", "service", "many pages"] },
  { id: "ai_chrome_locale", role: "locale", what: "language and currency as pills, a drop down or a sentence; flags off by default", suits: ["international", "markets", "languages", "currencies", "travel", "export", "europe"] },
  { id: "ai_chrome_footer_wordmark", role: "footer", what: "the name set across the whole width, rising into view, a quiet row of links", suits: ["brand", "bold", "studio", "agency", "fashion", "streetwear", "expressive", "brutalist", "cinematic", "sport"] },
  { id: "ai_chrome_footer_newsletter", role: "footer", what: "leads with a big sign up and reasons to join, then menus", suits: ["community", "newsletter", "drops", "launch", "creator", "course", "food", "coffee", "beauty", "wellness"] },
  { id: "ai_chrome_footer_columns", role: "footer", what: "columns as blocks (menus, text with address and hours, socials), brand line", suits: ["shop", "store", "classic", "service", "many pages", "local", "practical", "retail", "clinic"] },
  { id: "ai_chrome_footer_line", role: "footer", what: "one quiet line: name, note, links, socials, language and currency", suits: ["minimal", "portfolio", "personal", "swiss", "editorial", "quiet", "landing page", "single product"] },
  { id: "ai_chrome_footer_image", role: "footer", what: "full bleed photograph with a last statement and one action, drifting on scroll", suits: ["hotel", "restaurant", "travel", "real estate", "venue", "wedding", "outdoor", "cinematic", "imagery", "spa"] },
  { id: "ai_chrome_footer_sitemap", role: "footer", what: "the whole menu as a directory grid with numbered headings and a contact cell", suits: ["large catalog", "marketplace", "many pages", "school", "organisation", "docs", "grocery", "technical"] },
]

export function chromePiece(id: string): ChromeKitPiece | undefined {
  return CHROME_KIT.find((p) => p.id === id)
}

/** The kit's pieces for one role, in kit order. */
export function chromeKitByRole(role: ChromeRole): ChromeKitPiece[] {
  return CHROME_KIT.filter((p) => p.role === role)
}

export interface ChromeBrief {
  /** The creator's words, a category, a direction's styles, mood and signature: anything that says what the site is. */
  text?: string
  styles?: readonly string[]
  /** Whether the site sells in more than one language or currency (Settings, Markets). */
  international?: boolean
}

function score(piece: ChromeKitPiece, words: string): number {
  return piece.suits.reduce((n, s) => (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(words) ? n + (s.includes(" ") ? 2 : 1) : n), 0)
}

/** One piece per role that fits the brief best (ties: kit order). Deterministic. */
export function chooseChrome(brief: ChromeBrief): Record<ChromeRole, ChromeKitPiece | null> {
  const words = [brief.text ?? "", ...(brief.styles ?? [])].join(" ").toLowerCase()
  const out = {} as Record<ChromeRole, ChromeKitPiece | null>
  for (const role of CHROME_ROLES) {
    const pieces = chromeKitByRole(role)
    if (role === "locale" && !brief.international && !/\b(international|languages?|currenc(?:y|ies)|markets?|worldwide|export)\b/.test(words)) {
      out[role] = null
      continue
    }
    let best = pieces[0]
    let bestScore = score(best, words)
    for (const p of pieces.slice(1)) {
      const s = score(p, words)
      if (s > bestScore) { best = p; bestScore = s }
    }
    out[role] = best
  }
  return out
}

const ROLE_NAME: Record<ChromeRole, string> = { header: "Headers", menu: "Menu drawers", cart: "Carts", search: "Search", locale: "Language and currency", footer: "Footers" }

/**
 * The block the agent's brief carries (lib/ai-builder/agent/prompts.ts): the
 * kit by role, one line per piece, and the pieces that fit this brief.
 * About 2,600 characters.
 */
export function chromeKitForPrompt(brief: ChromeBrief = {}): string {
  const pick = chooseChrome(brief)
  const fits = CHROME_ROLES.map((r) => (pick[r] ? `${r} ${pick[r]!.id}` : "")).filter(Boolean).join(", ")
  return [
    "CHROME KIT (premium header, menu drawer, cart, search, language and currency, footer; working code on the page's hooks, motion on --t-motion-*, reduced motion, 44px targets, phone layouts, rich settings and filled blocks). search_knowledge an id to get the whole file, then ADAPT it to the direction: your own ai_ name, type, colours, spacing, words, motion and details. Never ship one verbatim and never fall back to a plain bar of text links.",
    ...CHROME_ROLES.map((r) => `- ${ROLE_NAME[r]}: ${chromeKitByRole(r).map((p) => `${p.id} (${p.what})`).join("; ")}`),
    "Compose: one header in the header group; right after it, in the same group, one menu drawer, one cart and one search window (every Menu, bag, add to cart and search button on the page opens them); language and currency inside the drawer or footer when the site has more than one; one footer in the footer group. Bind menus with link_list settings, the logo from theme.logo, products with product_list (mega menu, search, cart upsell).",
    fits ? `Fits this brief best (a starting point; go elsewhere if the direction says so): ${fits}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
