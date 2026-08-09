/**
 * Everything the "Listează un articol" form offers, and everything a product
 * page renders back. Single source of truth: the form, the product page, the
 * listing cards and the filters all read from here, so a value can never be
 * offered by one and unrecognised by another.
 *
 * ids are stable, lowercase and ASCII — they go in the database and into URLs.
 * Labels are Romanian, the app's primary language. Never rename an id to fix a
 * label; add a label.
 */

export type Option = { id: string; label: string }

/** A category is two levels: a group you scan, and the leaf you actually pick.
 *  `short` is the group's name WITHOUT its department, for when the department
 *  is already established by where you are — see categoryShortLabel. */
export type CategoryGroup = { id: string; label: string; short?: string; items: Option[] }

const OTHER: Option = { id: "other", label: "Altele" }

export const LISTING_CATEGORIES: CategoryGroup[] = [
  {
    id: "women-tops",
    label: "Damă · Tricouri și bluze",
    items: [
      { id: "t-shirts", label: "Tricouri" },
      { id: "jerseys", label: "Jerseuri" },
      { id: "hoodies", label: "Hanorace" },
      { id: "sweatshirts", label: "Bluze de trening" },
      { id: "sweaters", label: "Pulovere" },
      { id: "cardigans", label: "Cardigane" },
      { id: "shirts", label: "Cămăși" },
      { id: "polo-shirts", label: "Tricouri polo" },
      { id: "blouses", label: "Bluze" },
      { id: "crop-tops", label: "Crop top-uri" },
      { id: "tank-tops", label: "Maiouri și camisole" },
      { id: "corsets", label: "Corsete" },
      { id: "bodysuits", label: "Body-uri" },
      OTHER,
    ],
  },
  {
    id: "women-bottoms",
    label: "Damă · Pantaloni și fuste",
    items: [
      { id: "jeans", label: "Blugi" },
      { id: "sweatpants", label: "Pantaloni de trening" },
      { id: "trousers", label: "Pantaloni" },
      { id: "shorts", label: "Pantaloni scurți" },
      { id: "leggings", label: "Colanți" },
      { id: "skirts", label: "Fuste" },
      OTHER,
    ],
  },
  {
    id: "women-outerwear",
    label: "Damă · Paltoane și jachete",
    items: [
      { id: "coats", label: "Paltoane" },
      { id: "jackets", label: "Jachete" },
      { id: "vests", label: "Veste" },
      OTHER,
    ],
  },
  {
    id: "women-dresses",
    label: "Damă · Rochii și salopete",
    items: [
      { id: "mini-dresses", label: "Rochii mini" },
      { id: "midi-dresses", label: "Rochii midi" },
      { id: "maxi-dresses", label: "Rochii maxi" },
      { id: "jumpsuits", label: "Salopete" },
      OTHER,
    ],
  },
  {
    id: "women-footwear",
    label: "Damă · Încălțăminte",
    items: [
      { id: "sneakers", label: "Sneakers" },
      { id: "boots", label: "Ghete și cizme" },
      { id: "heels", label: "Pantofi cu toc" },
      { id: "flats", label: "Balerini" },
      { id: "sandals", label: "Sandale" },
      OTHER,
    ],
  },
  {
    id: "men-tops",
    label: "Bărbați · Tricouri și bluze",
    items: [
      { id: "t-shirts", label: "Tricouri" },
      { id: "jerseys", label: "Jerseuri" },
      { id: "hoodies", label: "Hanorace" },
      { id: "sweatshirts", label: "Bluze de trening" },
      { id: "sweaters", label: "Pulovere" },
      { id: "cardigans", label: "Cardigane" },
      { id: "shirts", label: "Cămăși" },
      { id: "polo-shirts", label: "Tricouri polo" },
      { id: "tank-tops", label: "Maiouri" },
      OTHER,
    ],
  },
  {
    id: "men-bottoms",
    label: "Bărbați · Pantaloni",
    items: [
      { id: "jeans", label: "Blugi" },
      { id: "sweatpants", label: "Pantaloni de trening" },
      { id: "trousers", label: "Pantaloni" },
      { id: "shorts", label: "Pantaloni scurți" },
      OTHER,
    ],
  },
  {
    id: "men-outerwear",
    label: "Bărbați · Paltoane și jachete",
    items: [
      { id: "coats", label: "Paltoane" },
      { id: "jackets", label: "Jachete" },
      { id: "vests", label: "Veste" },
      OTHER,
    ],
  },
  {
    id: "men-suits",
    label: "Bărbați · Costume",
    items: [
      { id: "suits", label: "Costume complete" },
      { id: "blazers", label: "Sacouri" },
      { id: "suit-trousers", label: "Pantaloni de costum" },
      OTHER,
    ],
  },
  {
    id: "men-footwear",
    label: "Bărbați · Încălțăminte",
    items: [
      { id: "sneakers", label: "Sneakers" },
      { id: "boots", label: "Ghete și bocanci" },
      { id: "formal-shoes", label: "Pantofi eleganți" },
      { id: "sandals", label: "Sandale" },
      OTHER,
    ],
  },
  {
    id: "accessories",
    label: "Accesorii",
    items: [
      { id: "bags", label: "Genți și rucsacuri" },
      { id: "jewellery", label: "Bijuterii" },
      { id: "watches", label: "Ceasuri" },
      { id: "belts", label: "Curele" },
      { id: "hats", label: "Șepci și pălării" },
      { id: "scarves", label: "Eșarfe și fulare" },
      { id: "sunglasses", label: "Ochelari de soare" },
      { id: "gloves", label: "Mănuși" },
      { id: "wallets", label: "Portofele" },
      { id: "hair", label: "Accesorii de păr" },
      { id: "ties", label: "Cravate și papioane" },
      OTHER,
    ],
  },
  // ── Everything below here was missing, and every one of them is a listing
  //    somebody could not file.
  //
  //    The list stopped at accessories, so a whole second-hand wardrobe had
  //    nowhere to go: knitwear (which is not a t-shirt and not a coat),
  //    activewear, swimwear, underwear and nightwear, bags as their own
  //    category rather than an accessory, and anything for a child. A seller
  //    who cannot find their category either files it wrongly — where nobody
  //    browsing for it will look — or gives up on the listing.
  //
  //    New ids only. Nothing existing is renamed or renumbered, because a
  //    category id is stored on every listing already published under it.
  {
    id: "women-knitwear",
    label: "Damă · Tricotaje",
    items: [
      { id: "jumpers", label: "Pulovere" },
      { id: "cardigans", label: "Cardigane" },
      { id: "hoodies", label: "Hanorace" },
      { id: "sweatshirts", label: "Bluze de trening" },
      { id: "vests", label: "Veste tricotate" },
      OTHER,
    ],
  },
  {
    id: "men-knitwear",
    label: "Bărbați · Tricotaje",
    items: [
      { id: "jumpers", label: "Pulovere" },
      { id: "cardigans", label: "Cardigane" },
      { id: "hoodies", label: "Hanorace" },
      { id: "sweatshirts", label: "Bluze de trening" },
      { id: "vests", label: "Veste tricotate" },
      OTHER,
    ],
  },
  {
    id: "activewear",
    label: "Sport",
    items: [
      { id: "tops", label: "Tricouri și topuri sport" },
      { id: "leggings", label: "Colanți" },
      { id: "shorts", label: "Pantaloni scurți sport" },
      { id: "tracksuits", label: "Treninguri" },
      { id: "jackets", label: "Jachete sport" },
      { id: "trainers", label: "Adidași" },
      OTHER,
    ],
  },
  {
    id: "swimwear",
    label: "Costume de baie",
    items: [
      { id: "bikinis", label: "Bikini" },
      { id: "one-piece", label: "Întregi" },
      { id: "swim-shorts", label: "Șorturi de baie" },
      { id: "cover-ups", label: "Pareo și cover-up" },
      OTHER,
    ],
  },
  {
    id: "underwear",
    label: "Lenjerie și pijamale",
    items: [
      { id: "bras", label: "Sutiene" },
      { id: "briefs", label: "Chiloți și boxeri" },
      { id: "socks", label: "Șosete și ciorapi" },
      { id: "pyjamas", label: "Pijamale" },
      { id: "loungewear", label: "Haine de casă" },
      OTHER,
    ],
  },
  {
    id: "bags",
    label: "Genți",
    items: [
      { id: "shoulder", label: "Genți de umăr" },
      { id: "tote", label: "Genți tote" },
      { id: "crossbody", label: "Genți crossbody" },
      { id: "backpacks", label: "Rucsacuri" },
      { id: "clutch", label: "Plicuri și clutch" },
      { id: "luggage", label: "Bagaje" },
      OTHER,
    ],
  },
  {
    id: "kids",
    label: "Copii",
    short: "Îmbrăcăminte",
    items: [
      { id: "tops", label: "Tricouri și bluze" },
      { id: "bottoms", label: "Pantaloni și fuste" },
      { id: "outerwear", label: "Geci și paltoane" },
      { id: "dresses", label: "Rochii" },
      { id: "shoes", label: "Încălțăminte" },
      { id: "baby", label: "Bebeluși (0–2 ani)" },
      OTHER,
    ],
  },
]

/**
 * ===========================================================================
 *  THE THIRD LEVEL: WHO IT IS FOR
 * ===========================================================================
 *
 * There are twenty-two groups and about a hundred and sixty leaves, and the
 * picker used to show all of them at once: one flat scroll from "Damă ·
 * Tricouri" to "Copii · Bebeluși", with the department repeated in every
 * single group heading because that was the only thing distinguishing
 * "Bărbați · Încălțăminte" from "Damă · Încălțăminte". Finding your category
 * meant reading past every category you were not looking for.
 *
 * The department was always there — it was just written into the labels
 * instead of being a level you could stand on. Stated here, it becomes the
 * first question, which is the one nobody has to think about, and it removes
 * three quarters of the list before the second question is asked.
 *
 * This adds NOTHING to the database. `products.category` still stores the group
 * id and `products.subcategory` still stores the leaf id — the department is a
 * route through the picker, not a value.
 */
export type Department = { id: string; label: string }

export const DEPARTMENTS: Department[] = [
  { id: "women", label: "Damă" },
  { id: "men", label: "Bărbați" },
  { id: "kids", label: "Copii" },
]

/**
 * Groups that belong to every department rather than to one.
 *
 * Accessories, bags, sportswear, swimwear and underwear are sold for women,
 * men and children alike, and their leaves say which — so they appear under
 * all three rather than being exiled to a fourth department nobody would think
 * to open.
 */
const SHARED_GROUPS = new Set(["accessories", "bags", "activewear", "swimwear", "underwear"])

/** Which department a group lives in, from the id prefix it already had. */
function departmentIdOf(groupId: string): string | null {
  if (SHARED_GROUPS.has(groupId)) return null // every department
  if (groupId.startsWith("women-")) return "women"
  if (groupId.startsWith("men-")) return "men"
  if (groupId === "kids") return "kids"
  return null
}

export function groupsForDepartment(departmentId: string): CategoryGroup[] {
  return LISTING_CATEGORIES.filter((g) => {
    const own = departmentIdOf(g.id)
    return own === null ? SHARED_GROUPS.has(g.id) : own === departmentId
  })
}

/** Which department to open the picker on for a group already chosen, so
 *  re-opening it lands where the choice was made rather than at the top. */
export function departmentForGroup(groupId?: string | null): string | null {
  if (!groupId) return null
  return departmentIdOf(groupId) ?? "women"
}

/**
 * The group's name with the department taken off.
 *
 * "Damă · Tricouri și bluze" reads as "Tricouri și bluze" once you are already
 * inside Damă, and repeating the department in every row of a department's own
 * list is the noise the drill-down exists to remove.
 */
export function categoryShortLabel(group: CategoryGroup): string {
  if (group.short) return group.short
  const at = group.label.indexOf(" · ")
  return at === -1 ? group.label : group.label.slice(at + 3)
}

/** Flattened, for search and for turning a stored pair back into labels. */
export const CATEGORY_INDEX: { groupId: string; groupLabel: string; item: Option }[] =
  LISTING_CATEGORIES.flatMap((g) => g.items.map((item) => ({ groupId: g.id, groupLabel: g.label, item })))

export function categoryLabelFor(groupId?: string | null, itemId?: string | null): string | null {
  if (!groupId) return null
  const group = LISTING_CATEGORIES.find((g) => g.id === groupId)
  if (!group) return null
  const item = group.items.find((i) => i.id === itemId)
  return item ? `${group.label} · ${item.label}` : group.label
}

// These ids are NOT free to choose — products.condition carries a CHECK
// constraint from 20260730_marketplace_physical_attributes.sql that allows
// exactly this ladder. I invented a different set (brand_new, like_new, …) and
// every publish was rejected by the database. Matching the constraint is the fix;
// widening it would fork the vocabulary for every listing that already exists.
export const CONDITIONS: Option[] = [
  { id: "new_with_tags", label: "Nou, cu etichetă" },
  { id: "new_without_tags", label: "Nou, fără etichetă" },
  { id: "very_good", label: "Foarte bună" },
  { id: "good", label: "Bună" },
  { id: "satisfactory", label: "Acceptabilă" },
]

export const COLOURS: (Option & { hex: string })[] = [
  { id: "black", label: "Negru", hex: "#111111" },
  { id: "white", label: "Alb", hex: "#ffffff" },
  { id: "grey", label: "Gri", hex: "#9ca3af" },
  { id: "charcoal", label: "Antracit", hex: "#3f3f46" },
  { id: "silver", label: "Argintiu", hex: "#c9ccd1" },
  { id: "gold", label: "Auriu", hex: "#d4af37" },
  { id: "rose-gold", label: "Roz auriu", hex: "#e0a899" },
  { id: "brown", label: "Maro", hex: "#7b4b2a" },
  { id: "chocolate", label: "Ciocolatiu", hex: "#4a2c17" },
  { id: "tan", label: "Bej", hex: "#d2b48c" },
  { id: "cream", label: "Crem", hex: "#f3e9d2" },
  { id: "red", label: "Roșu", hex: "#dc2626" },
  { id: "burgundy", label: "Bordo", hex: "#7f1d3a" },
  { id: "coral", label: "Coral", hex: "#f9736b" },
  { id: "pink", label: "Roz", hex: "#ec4899" },
  { id: "fuchsia", label: "Fucsia", hex: "#c026d3" },
  { id: "peach", label: "Piersică", hex: "#ffb59a" },
  { id: "orange", label: "Portocaliu", hex: "#f97316" },
  { id: "rust", label: "Ruginiu", hex: "#b45309" },
  { id: "yellow", label: "Galben", hex: "#eab308" },
  { id: "mustard", label: "Muștar", hex: "#c99700" },
  { id: "lime", label: "Verde lime", hex: "#a3e635" },
  { id: "green", label: "Verde", hex: "#16a34a" },
  { id: "mint", label: "Verde mint", hex: "#7fe0c0" },
  { id: "emerald", label: "Smarald", hex: "#047857" },
  { id: "olive", label: "Oliv", hex: "#5c6b32" },
  { id: "khaki", label: "Kaki", hex: "#78716c" },
  { id: "teal", label: "Turcoaz", hex: "#0d9488" },
  { id: "sky", label: "Bleu", hex: "#7dd3fc" },
  { id: "blue", label: "Albastru", hex: "#2563eb" },
  { id: "denim", label: "Denim", hex: "#4a6fa5" },
  { id: "navy", label: "Bleumarin", hex: "#1e293b" },
  { id: "lavender", label: "Lavandă", hex: "#c4b5fd" },
  { id: "lilac", label: "Lila", hex: "#b58ad6" },
  { id: "purple", label: "Mov", hex: "#7c3aed" },
  { id: "multi", label: "Multicolor", hex: "linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6)" },
  { id: "print", label: "Imprimeu", hex: "linear-gradient(135deg,#111111 25%,#ffffff 25% 50%,#111111 50% 75%,#ffffff 75%)" },
  { id: "transparent", label: "Transparent", hex: "linear-gradient(135deg,#f5f5f5,#e5e5e5)" },
]

/** Up to two. */
export const SOURCES: Option[] = [
  { id: "vintage", label: "Vintage" },
  { id: "preloved", label: "Purtat" },
  { id: "new", label: "Nou" },
  { id: "reworked", label: "Remodelat" },
  { id: "upcycled", label: "Upcycled" },
  { id: "custom", label: "Personalizat" },
  { id: "handmade", label: "Handmade" },
  { id: "deadstock", label: "Deadstock" },
  { id: "designer", label: "Designer" },
  { id: "limited", label: "Ediție limitată" },
  { id: "collab", label: "Colaborare" },
  { id: "sample", label: "Sample" },
  { id: "repaired", label: "Reparat" },
]

export const ERAS: Option[] = [
  { id: "modern", label: "Modern" },
  { id: "2000s", label: "Anii 2000" },
  { id: "1990s", label: "Anii '90" },
  { id: "1980s", label: "Anii '80" },
  { id: "1970s", label: "Anii '70" },
  { id: "1960s", label: "Anii '60" },
  { id: "1950s", label: "Anii '50" },
  { id: "1940s", label: "Anii '40" },
  { id: "antique", label: "Antic" },
]

/** Up to three. */
export const STYLES: Option[] = [
  { id: "streetwear", label: "Streetwear" },
  { id: "sportswear", label: "Sportswear" },
  { id: "loungewear", label: "Loungewear" },
  { id: "y2k", label: "Y2K" },
  { id: "goth", label: "Goth" },
  { id: "whimsigoth", label: "Whimsigoth" },
  { id: "retro", label: "Retro" },
  { id: "boho", label: "Boho" },
  { id: "western", label: "Western" },
  { id: "indie", label: "Indie" },
  { id: "skater", label: "Skater" },
  { id: "rave", label: "Rave" },
  { id: "costume", label: "Costum și cosplay" },
  { id: "grunge", label: "Grunge" },
  { id: "emo", label: "Emo" },
  { id: "minimalist", label: "Minimalist" },
  { id: "preppy", label: "Preppy" },
  { id: "avant-garde", label: "Avangardă" },
  { id: "punk", label: "Punk" },
  { id: "glam", label: "Glam" },
  { id: "regency", label: "Regency" },
  { id: "casual", label: "Casual" },
  { id: "utility", label: "Utility" },
  { id: "futuristic", label: "Futurist" },
  { id: "cottagecore", label: "Cottagecore" },
  { id: "fairycore", label: "Fairycore" },
  { id: "kidcore", label: "Kidcore" },
  { id: "biker", label: "Biker" },
  { id: "gorpcore", label: "Gorpcore" },
  { id: "twee", label: "Twee" },
  { id: "coquette", label: "Coquette" },
]

/**
 * One field for everything the marketplace sells, which is why shoe sizes say
 * so on the label. Nine letter sizes was thin to the point of being wrong:
 * "Blugi, M" is not what a pair of jeans is sold as anywhere, and there was no
 * way at all to list a shoe.
 */
export const SIZES: Option[] = [
  { id: "one-size", label: "Mărime universală" },
  { id: "xxs", label: "XXS" },
  { id: "xs", label: "XS" },
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
  { id: "xxl", label: "XXL" },
  { id: "xxxl", label: "XXXL" },
  { id: "eu-32", label: "32" },
  { id: "eu-34", label: "34" },
  { id: "eu-36", label: "36" },
  { id: "eu-38", label: "38" },
  { id: "eu-40", label: "40" },
  { id: "eu-42", label: "42" },
  { id: "eu-44", label: "44" },
  { id: "eu-46", label: "46" },
  { id: "eu-48", label: "48" },
  { id: "eu-50", label: "50" },
  { id: "shoe-35", label: "35 · încălțăminte" },
  { id: "shoe-36", label: "36 · încălțăminte" },
  { id: "shoe-37", label: "37 · încălțăminte" },
  { id: "shoe-38", label: "38 · încălțăminte" },
  { id: "shoe-39", label: "39 · încălțăminte" },
  { id: "shoe-40", label: "40 · încălțăminte" },
  { id: "shoe-41", label: "41 · încălțăminte" },
  { id: "shoe-42", label: "42 · încălțăminte" },
  { id: "shoe-43", label: "43 · încălțăminte" },
  { id: "shoe-44", label: "44 · încălțăminte" },
  { id: "shoe-45", label: "45 · încălțăminte" },
  { id: "shoe-46", label: "46 · încălțăminte" },
]

/** Photos: at least two, at most eight. */
export const MIN_PHOTOS = 2
export const MAX_PHOTOS = 8
