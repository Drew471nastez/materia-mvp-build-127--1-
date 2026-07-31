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

/** A category is two levels: a group you scan, and the leaf you actually pick. */
export type CategoryGroup = { id: string; label: string; items: Option[] }

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
      OTHER,
    ],
  },
]

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

export const CONDITIONS: Option[] = [
  { id: "brand_new", label: "Nou cu etichetă" },
  { id: "like_new", label: "Ca nou" },
  { id: "used_excellent", label: "Folosit · excelent" },
  { id: "used_good", label: "Folosit · bun" },
  { id: "used_fair", label: "Folosit · acceptabil" },
]

export const COLOURS: (Option & { hex: string })[] = [
  { id: "black", label: "Negru", hex: "#111111" },
  { id: "white", label: "Alb", hex: "#ffffff" },
  { id: "grey", label: "Gri", hex: "#9ca3af" },
  { id: "silver", label: "Argintiu", hex: "#c9ccd1" },
  { id: "gold", label: "Auriu", hex: "#d4af37" },
  { id: "brown", label: "Maro", hex: "#7b4b2a" },
  { id: "tan", label: "Bej", hex: "#d2b48c" },
  { id: "cream", label: "Crem", hex: "#f3e9d2" },
  { id: "red", label: "Roșu", hex: "#dc2626" },
  { id: "burgundy", label: "Bordo", hex: "#7f1d3a" },
  { id: "pink", label: "Roz", hex: "#ec4899" },
  { id: "orange", label: "Portocaliu", hex: "#f97316" },
  { id: "yellow", label: "Galben", hex: "#eab308" },
  { id: "green", label: "Verde", hex: "#16a34a" },
  { id: "khaki", label: "Kaki", hex: "#78716c" },
  { id: "blue", label: "Albastru", hex: "#2563eb" },
  { id: "navy", label: "Bleumarin", hex: "#1e293b" },
  { id: "purple", label: "Mov", hex: "#7c3aed" },
  { id: "multi", label: "Multicolor", hex: "linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6)" },
]

/** Up to two. */
export const SOURCES: Option[] = [
  { id: "vintage", label: "Vintage" },
  { id: "preloved", label: "Purtat" },
  { id: "reworked", label: "Remodelat" },
  { id: "upcycled", label: "Upcycled" },
  { id: "custom", label: "Personalizat" },
  { id: "handmade", label: "Handmade" },
  { id: "deadstock", label: "Deadstock" },
  { id: "designer", label: "Designer" },
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
]

/** Photos: at least two, at most eight. */
export const MIN_PHOTOS = 2
export const MAX_PHOTOS = 8

export const DESCRIPTION_PLACEHOLDER =
  "Ex: Hanorac Nike vintage din anii '90, bumbac gros, culoare verde kaki. Purtat de câteva ori, fără pete sau găuri. Se potrivește lejer — port de obicei M și îmi vine oversize."
