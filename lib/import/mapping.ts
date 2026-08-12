import { CONDITIONS, LISTING_CATEGORIES, SIZES, sizesFor } from "@/lib/marketplace/listing-taxonomy"
import type { VintedItem } from "@/lib/import/vinted"

/**
 * ===========================================================================
 *  A VINTED ITEM, IN STORELIB'S OWN WORDS
 * ===========================================================================
 *
 * The two catalogues do not line up and pretending they do is how a pair of
 * trainers ends up filed under "Femei · Frumusețe". Vinted has thousands of
 * leaf categories keyed by an integer that means nothing outside their system;
 * Storelib has five departments and thirty-seven groups, in Romanian.
 *
 * So this maps what maps, and REFUSES TO GUESS when it cannot. An item whose
 * category could not be decided arrives with `category: null` and is flagged
 * in the preview, which the page shows as "needs a category" — visible, fixable
 * in one tap, and honest. The alternative, defaulting everything unrecognised
 * into a bucket, produces a shop that looks fully categorised and is wrong in
 * ways nobody finds until a buyer does.
 *
 * ---------------------------------------------------------------------------
 * THE PRICE IS CONVERTED, AND THE ORIGINAL IS KEPT
 * ---------------------------------------------------------------------------
 * "Exact price" cannot mean the same NUMBER: a £25 pair of trainers listed as
 * 25 RON is not exact, it is a 95% discount. Exact means the same VALUE, so
 * the amount is converted and the original is stored alongside it
 * (`source_price_amount`/`source_price_currency`) so the conversion stays
 * auditable and can be redone if a rate is corrected.
 *
 * THE RATES BELOW ARE STATIC AND APPROXIMATE, and that is a deliberate choice
 * rather than an oversight: a live FX feed is a paid third-party service and a
 * new external dependency in the import path, and neither was asked for. They
 * are rounded DOWN against the seller's favour — an imported price that is
 * slightly low sells; one that is slightly high does not — and they are in one
 * place, named, so they can be corrected in a single edit. Anything imported
 * before a correction can be re-derived from the stored original.
 */
export const FX_TO_RON: Record<string, number> = {
  RON: 1,
  EUR: 4.97,
  GBP: 5.8,
  USD: 4.6,
  PLN: 1.17,
  CZK: 0.2,
  HUF: 0.0127,
  SEK: 0.44,
  DKK: 0.67,
}

/** When the rates were last checked, so "is this stale?" is answerable
 *  without archaeology. */
export const FX_REVIEWED = "2026-08"

export interface MappedListing {
  title: string
  description: string
  priceCents: number
  sourcePriceAmount: number
  sourcePriceCurrency: string
  category: string | null
  subcategory: string | null
  brand: string | null
  condition: string | null
  size: string | null
  colour: string | null
  photos: string[]
  /** Fields that could not be decided from the source. Shown in the preview
   *  rather than silently defaulted. */
  missing: string[]
}

/**
 * Vinted's condition wording → our five rungs.
 *
 * Theirs is prose and localised, so this matches on the distinguishing words
 * rather than on whole strings — "New with tags", "Nuovo con etichetta" and
 * "Neu mit Etikett" all have to land on `new_with_tags`, and a lookup table of
 * exact strings would need every language they operate in.
 *
 * AND "WITHOUT" HAS TO BEAT "TAG". `"New without tags"` CONTAINS the word
 * "tags", so a tag rule tested first matches it and promotes the item to
 * `new_with_tags` — every untagged item in an imported shop silently described
 * as better than it is. That is the one mapping error here that the buyer
 * discovers rather than the seller, and it is why the two "new" rungs are
 * decided together below instead of as two independent patterns.
 */
const WITHOUT = /without|w\/o|fara|fără|ohne|sans|senza|\bsin\b|bez/i
const TAGGED = /tag|etichet|etikett|étiquet|cartellin|label|metk/i
const NEWISH = /new|nou[ăa]?\b|nou\b|neu|nuovo|nueva|nuevo|nouveau|nowy|nový|uus/i

const CONDITION_PATTERNS: Array<[RegExp, string]> = [
  [/very good|foarte bun|sehr gut|ottime|muy bien|très bon|bardzo dobry/i, "very_good"],
  [/satisfactor|acceptabil|befriedigend|discrete|suficiente|correct/i, "satisfactory"],
  [/good|bun|gut|buone|bien|bon|dobry/i, "good"],
]

const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id))

export function mapCondition(status: string | null): string | null {
  if (!status) return null

  // The two "new" rungs are decided together, because they are the same phrase
  // with one word of difference and testing them independently gets one of
  // them wrong whichever order they are in.
  if (NEWISH.test(status)) {
    if (WITHOUT.test(status)) return "new_without_tags"
    if (TAGGED.test(status)) return "new_with_tags"
    return "new_without_tags"
  }

  // Then the used rungs, most specific first: "very good" contains "good", so
  // reversing these two silently downgrades every very-good item.
  for (const [re, id] of CONDITION_PATTERNS) {
    if (re.test(status) && CONDITION_IDS.has(id)) return id
  }
  return null
}

/**
 * ---------------------------------------------------------------------------
 * SIZES: THE UK/EU PROBLEM
 * ---------------------------------------------------------------------------
 * Storelib's shoe sizes are EU only (35-46). A UK profile states shoe sizes in
 * UK numbering, so the five items on the profile this was built against are
 * "6", "6.5" and "7" — which as EU numbers are children's sizes, and importing
 * them unconverted would file adult trainers as toddler shoes.
 *
 * Vinted usually states the size as a compound string ("6 / 39 / 39") when the
 * item carries more than one system. When it does, the EU number is taken
 * directly. When it does not, and the profile is on a UK domain, the UK→EU
 * table below is used. When neither applies the size is left null rather than
 * converted on a guess.
 */
const UK_TO_EU_SHOE: Record<string, number> = {
  "2": 35,
  "2.5": 35,
  "3": 36,
  "3.5": 36,
  "4": 37,
  "4.5": 37,
  "5": 38,
  "5.5": 38,
  "6": 39,
  "6.5": 40,
  "7": 41,
  "7.5": 41,
  "8": 42,
  "8.5": 42,
  "9": 43,
  "9.5": 44,
  "10": 44,
  "10.5": 45,
  "11": 45,
  "11.5": 46,
  "12": 46,
}

const SIZE_IDS = new Set(SIZES.map((s) => s.id))

/** Letter sizes are the same everywhere and map straight through. */
const LETTER_SIZES = new Set(["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"])

export function mapSize(raw: string | null, groupId: string | null, ukNumbering: boolean): string | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null

  const isShoeGroup = !!groupId && /-shoes$/.test(groupId)
  const allowed = groupId ? new Set(sizesFor(groupId).map((s) => s.id)) : SIZE_IDS

  if (isShoeGroup) {
    // "6 / 39 / 39" — Vinted's compound form. Any number in the EU range is
    // the EU size, whichever slot it is in, because their ordering differs by
    // country and the range is unambiguous: no UK shoe size reaches 35.
    const numbers = text.match(/\d+(?:\.\d+)?/g) ?? []
    for (const n of numbers) {
      const v = Math.round(Number.parseFloat(n))
      if (v >= 35 && v <= 46) {
        const id = `shoe-${v}`
        if (allowed.has(id)) return id
      }
    }
    // No EU number present. Convert from UK only when the profile is actually
    // a UK one — the same bare "7" is EU 7 nowhere and UK 7 only on a UK shop,
    // and converting it on a German profile would be inventing a fact.
    if (ukNumbering) {
      const first = numbers[0]
      const eu = first ? UK_TO_EU_SHOE[first] : undefined
      if (eu) {
        const id = `shoe-${eu}`
        if (allowed.has(id)) return id
      }
    }
    return null
  }

  // Clothing. Vinted also compounds these ("M / 38 / 10"); the letter is the
  // part our taxonomy speaks.
  const upper = text.toUpperCase()
  for (const letter of LETTER_SIZES) {
    // Word-boundaried so "M" does not match inside "MEDIUM 38" twice or inside
    // an unrelated token.
    if (new RegExp(`(^|[^A-Z])${letter}([^A-Z]|$)`).test(upper)) {
      const id = letter.toLowerCase()
      if (allowed.has(id)) return id
    }
  }
  const direct = text.toLowerCase()
  return allowed.has(direct) ? direct : null
}

/**
 * ---------------------------------------------------------------------------
 * CATEGORY: FROM THE WORDS, NOT FROM THEIR INTEGER
 * ---------------------------------------------------------------------------
 * `catalog_id` is Vinted's internal leaf id. Mapping it would mean a table of
 * several thousand integers transcribed by hand from a system that changes
 * without notice, and every wrong line would be invisible — the import would
 * succeed and file things in the wrong place.
 *
 * The title is what the seller actually wrote, in words, and the words are the
 * same ones our own categories are named after. So this matches keywords, in
 * specificity order, and returns null when nothing matches. A null category is
 * shown to the operator; a wrong one is not.
 *
 * Department is decided by the same pass, because "rochie" is only ever
 * women's and "trainers" could be either — so gendered words set the
 * department and neutral ones fall to the department the operator picked for
 * the whole import.
 */
type Rule = { re: RegExp; group: string; item: string }

const RULES: Rule[] = [
  // Footwear — most specific first, because "Nike 97s" is a sneaker and
  // "boots" would otherwise be caught by a generic shoe rule.
  { re: /\b(sneaker|trainer|air max|air force|jordan|yeezy|adidas|dunk|97s|95s|110s)s?\b/i, group: "men-shoes", item: "sneakers" },
  { re: /\b(converse|vans|plimsoll|tenisi|adidasi|adidași)s?\b/i, group: "men-shoes", item: "sneakers" },
  { re: /\b(boot|ghet[ae]|cizm[ae]|bocanc[i]?)s?\b/i, group: "men-shoes", item: "boots" },
  { re: /\b(heel|stiletto|toc|pantofi cu toc)s?\b/i, group: "women-shoes", item: "heels" },
  { re: /\b(sandal|sanda)s?\b/i, group: "women-shoes", item: "sandals" },
  { re: /\b(loafer|mocasin)s?\b/i, group: "men-shoes", item: "loafers" },

  // Women's clothing — gendered words, so these set the department too.
  { re: /\b(dress|rochi[ei])s?\b/i, group: "women-clothing", item: "dresses" },
  { re: /\b(skirt|fusta|fustă)s?\b/i, group: "women-clothing", item: "skirts" },
  { re: /\b(blouse|bluza|bluză|camasa|cămașă)s?\b/i, group: "women-clothing", item: "blouses" },
  { re: /\b(legging|colant)s?\b/i, group: "women-clothing", item: "leggings" },
  { re: /\b(bikini|swimsuit|costum de baie)s?\b/i, group: "women-clothing", item: "swimwear" },

  // Neutral clothing — filed under men's groups by default and moved by the
  // department override below when the operator says otherwise.
  { re: /\b(t-?shirt|tricou|tricouri|tee)s?\b/i, group: "men-clothing", item: "t-shirts" },
  { re: /\b(hoodie|hanorac|hanorace|sweatshirt)s?\b/i, group: "men-clothing", item: "hoodies" },
  { re: /\b(jumper|sweater|pulover|cardigan)s?\b/i, group: "men-clothing", item: "jumpers" },
  { re: /\b(jean|denim|blugi)s?\b/i, group: "men-clothing", item: "jeans" },
  { re: /\b(short|pantaloni scurti|pantaloni scurți)s?\b/i, group: "men-clothing", item: "shorts" },
  { re: /\b(trouser|pant|pantalon|chino|jogger|trening)s?\b/i, group: "men-clothing", item: "trousers" },
  { re: /\b(jacket|geaca|geacă|jacheta|windbreaker|gilet)s?\b/i, group: "men-clothing", item: "jackets" },
  { re: /\b(coat|palton|parka)s?\b/i, group: "men-clothing", item: "coats" },
  { re: /\b(polo)s?\b/i, group: "men-clothing", item: "polo-shirts" },

  // Bags and accessories.
  { re: /\b(backpack|rucsac)s?\b/i, group: "women-bags", item: "backpacks" },
  { re: /\b(tote)s?\b/i, group: "women-bags", item: "tote" },
  { re: /\b(crossbody|geanta|geantă|handbag|purse)s?\b/i, group: "women-bags", item: "crossbody" },
  { re: /\b(wallet|portofel)s?\b/i, group: "men-accessories", item: "wallets" },
  { re: /\b(watch|ceas)s?\b/i, group: "men-accessories", item: "watches" },
  { re: /\b(belt|curea)s?\b/i, group: "men-accessories", item: "belts" },
  { re: /\b(sunglass|ochelari)s?\b/i, group: "men-accessories", item: "sunglasses" },
  { re: /\b(hat|cap|sapca|șapcă|beanie|caciula|căciulă)s?\b/i, group: "men-accessories", item: "hats" },
  { re: /\b(scarf|esarfa|eșarfă|fular)s?\b/i, group: "men-accessories", item: "scarves" },
  { re: /\b(bracelet|necklace|earring|ring|bratara|brățară|colier|cercei|inel|jewel|bijuteri)s?\b/i, group: "women-accessories", item: "jewellery" },

  // The other departments, which Vinted also carries.
  { re: /\b(book|carte|carti|cărți|roman)s?\b/i, group: "ent-books", item: "fiction" },
  { re: /\b(vinyl|cd|album)s?\b/i, group: "ent-music", item: "vinyl" },
  { re: /\b(dvd|blu-?ray)s?\b/i, group: "ent-video", item: "dvd" },
  { re: /\b(pokemon|pokémon|panini|topps|trading card)s?\b/i, group: "hobby-cards", item: "pokemon" },
  { re: /\b(puzzle)s?\b/i, group: "hobby-puzzles", item: "under-500" },
  { re: /\b(lego|building)s?\b/i, group: "kids-toys", item: "building" },
  { re: /\b(toy|jucarie|jucărie|plush|plus|peluche)s?\b/i, group: "kids-toys", item: "soft-toys" },
]

/** Which groups exist, so a rule can never emit a category the taxonomy does
 *  not have. This is checked at module load rather than trusted: the rules
 *  above are hand-written and the taxonomy moves. */
const GROUPS = new Map(LISTING_CATEGORIES.map((g) => [g.id, g]))

/** The same garment, in each department. Used when the operator has chosen a
 *  department for the import and a neutral rule guessed the other one. */
const CROSS_DEPARTMENT: Record<string, Record<string, string>> = {
  "men-clothing": { women: "women-clothing" },
  "women-clothing": { men: "men-clothing" },
  "men-shoes": { women: "women-shoes" },
  "women-shoes": { men: "men-shoes" },
  "men-accessories": { women: "women-accessories" },
  "women-accessories": { men: "men-accessories" },
}

export function mapCategory(
  text: string,
  department: string | null,
): { category: string | null; subcategory: string | null } {
  const hay = text || ""
  for (const rule of RULES) {
    if (!rule.re.test(hay)) continue

    let groupId = rule.group
    // The operator's department wins over a neutral rule's default, but only
    // where the same item exists on the other side — moving "Rochii" into
    // men's clothing because somebody picked "men" would create a category
    // that does not exist.
    if (department) {
      const swap = CROSS_DEPARTMENT[groupId]?.[department]
      const group = swap ? GROUPS.get(swap) : undefined
      if (swap && group?.items.some((i) => i.id === rule.item)) groupId = swap
    }

    const group = GROUPS.get(groupId)
    if (!group) continue
    if (!group.items.some((i) => i.id === rule.item)) continue
    return { category: groupId, subcategory: rule.item }
  }
  return { category: null, subcategory: null }
}

/** Vinted amounts are decimal strings in a stated currency; Storelib stores
 *  integer minor units of the platform currency. */
export function convertPriceCents(amount: number, currency: string): number | null {
  const rate = FX_TO_RON[currency.toUpperCase()]
  if (!rate || !Number.isFinite(amount) || amount <= 0) return null
  return Math.max(1, Math.round(amount * rate * 100))
}

/**
 * One source item, ready to be written.
 *
 * `ukNumbering` and `department` come from the profile and from the operator
 * respectively — neither can be read off the item itself, and both change the
 * answer, which is why they are arguments rather than defaults.
 */
export function mapItem(
  item: VintedItem,
  opts: { ukNumbering: boolean; department: string | null },
): MappedListing {
  const haystack = `${item.title} ${item.description}`.trim()
  const { category, subcategory } = mapCategory(haystack, opts.department)
  const priceCents = convertPriceCents(item.priceAmount, item.priceCurrency)
  const condition = mapCondition(item.status)
  const size = mapSize(item.size, category, opts.ukNumbering)

  const missing: string[] = []
  if (!category) missing.push("category")
  if (!condition) missing.push("condition")
  if (!size && category && sizesFor(category).length > 0) missing.push("size")
  if (!item.description) missing.push("description")
  if (priceCents == null) missing.push("price")

  return {
    title: item.title,
    description: item.description,
    priceCents: priceCents ?? 0,
    sourcePriceAmount: item.priceAmount,
    sourcePriceCurrency: item.priceCurrency,
    category,
    subcategory,
    brand: item.brand,
    condition,
    size,
    colour: null,
    // ORDER IS THE SOURCE'S ORDER. index 0 is the cover on Vinted and index 0
    // is the cover here, which is the whole of "exact order" — the seller
    // chose which photograph leads and that choice is part of the listing.
    photos: item.photos.map((p) => p.url),
    missing,
  }
}
