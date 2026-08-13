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


/**
 * ===========================================================================
 *  DEPARTMENT → GROUP → ITEM, AND THE DEPARTMENT DECIDES THE REST OF THE FORM
 * ===========================================================================
 *
 * The tree used to be a wardrobe and nothing else: twenty-two groups of
 * clothing, split by who wears it, with everything that is not clothing having
 * nowhere to go. A marketplace that sells books, records, board games and
 * prams cannot file any of them, so they were listed as "Damă · Altele" or not
 * listed at all.
 *
 * Five departments, and they are not a taxonomy of the world — they are the
 * five things this marketplace is actually for. Each holds groups a person
 * would look under, and each group holds the specific thing.
 *
 * ---------------------------------------------------------------------------
 * AND IT DECIDES WHICH QUESTIONS GET ASKED
 * ---------------------------------------------------------------------------
 * This is the part the tree exists for. A paperback has no size, a vinyl record
 * has no era in the sense the form means it, and asking a seller for the "stil"
 * of a Pokémon card is asking a question with no answer — so the form used to
 * present eight attribute rows to everybody and let most sellers work out for
 * themselves which ones to ignore.
 *
 * `fieldsFor` below answers that from the group alone. Nothing is asked until a
 * category is chosen, and then only what applies.
 *
 * ---------------------------------------------------------------------------
 * NOTHING STORED CHANGES SHAPE
 * ---------------------------------------------------------------------------
 * `products.category` still holds the group id and `products.subcategory` the
 * item id. Old group ids that no longer exist in the tree still resolve to a
 * label through LEGACY_GROUP_LABELS, so a listing published under
 * "women-tops" goes on saying what it is instead of losing its category the day
 * the tree was reorganised.
 */

/** Every leaf list ends with this, because a taxonomy is never finished. */
const OTHER_ITEM: Option = { id: "other", label: "Altele" }

const item = (id: string, label: string): Option => ({ id, label })

/** Written per group and closed with Altele, so no list can forget it. */
function group(id: string, label: string, department: string, items: Option[]): CategoryGroup & { department: string } {
  return { id, label, department, items: [...items, OTHER_ITEM] }
}

export const LISTING_CATEGORIES: (CategoryGroup & { department: string })[] = [
  // ── FEMEI ────────────────────────────────────────────────────────────────
  group("women-clothing", "Femei · Haine", "women", [
    item("t-shirts", "Tricouri"),
    item("blouses", "Bluze și cămăși"),
    item("tank-tops", "Topuri și maiouri"),
    item("jumpers", "Pulovere și cardigane"),
    item("hoodies", "Hanorace și bluze de trening"),
    item("dresses", "Rochii"),
    item("skirts", "Fuste"),
    item("jeans", "Blugi"),
    item("trousers", "Pantaloni"),
    item("shorts", "Pantaloni scurți"),
    item("leggings", "Colanți"),
    item("jumpsuits", "Salopete"),
    item("jackets", "Jachete și geci"),
    item("coats", "Paltoane"),
    item("activewear", "Îmbrăcăminte sport"),
    item("swimwear", "Costume de baie"),
    item("underwear", "Lenjerie"),
    item("sleepwear", "Pijamale și haine de casă"),
  ]),
  group("women-shoes", "Femei · Încălțăminte", "women", [
    item("sneakers", "Sneakers"),
    item("boots", "Ghete și cizme"),
    item("heels", "Pantofi cu toc"),
    item("flats", "Balerini și mocasini"),
    item("sandals", "Sandale"),
    item("slippers", "Papuci"),
  ]),
  group("women-bags", "Femei · Genți", "women", [
    item("shoulder", "Genți de umăr"),
    item("tote", "Genți tote"),
    item("crossbody", "Genți crossbody"),
    item("backpacks", "Rucsacuri"),
    item("clutch", "Plicuri și clutch"),
    item("luggage", "Bagaje"),
  ]),
  group("women-accessories", "Femei · Accesorii", "women", [
    item("jewellery", "Bijuterii"),
    item("watches", "Ceasuri"),
    item("belts", "Curele"),
    item("scarves", "Eșarfe și fulare"),
    item("hats", "Pălării și căciuli"),
    item("sunglasses", "Ochelari de soare"),
    item("gloves", "Mănuși"),
    item("wallets", "Portofele"),
    item("hair", "Accesorii de păr"),
  ]),
  group("women-beauty", "Femei · Frumusețe", "women", [
    item("makeup", "Machiaj"),
    item("skincare", "Îngrijirea pielii"),
    item("haircare", "Îngrijirea părului"),
    item("fragrance", "Parfumuri"),
    item("nails", "Unghii"),
    item("tools", "Accesorii și aparate"),
  ]),

  // ── BĂRBAȚI ──────────────────────────────────────────────────────────────
  group("men-clothing", "Bărbați · Haine", "men", [
    item("t-shirts", "Tricouri"),
    item("shirts", "Cămăși"),
    item("polo-shirts", "Tricouri polo"),
    item("jumpers", "Pulovere și cardigane"),
    item("hoodies", "Hanorace și bluze de trening"),
    item("jeans", "Blugi"),
    item("trousers", "Pantaloni"),
    item("shorts", "Pantaloni scurți"),
    item("jackets", "Jachete și geci"),
    item("coats", "Paltoane"),
    item("suits", "Costume și sacouri"),
    item("activewear", "Îmbrăcăminte sport"),
    item("swimwear", "Costume de baie"),
    item("underwear", "Lenjerie"),
    item("sleepwear", "Pijamale și haine de casă"),
  ]),
  group("men-shoes", "Bărbați · Încălțăminte", "men", [
    item("sneakers", "Sneakers"),
    item("boots", "Ghete și bocanci"),
    item("formal", "Pantofi eleganți"),
    item("loafers", "Mocasini"),
    item("sandals", "Sandale"),
    item("slippers", "Papuci"),
  ]),
  group("men-accessories", "Bărbați · Accesorii", "men", [
    item("watches", "Ceasuri"),
    item("belts", "Curele"),
    item("wallets", "Portofele"),
    item("hats", "Șepci și căciuli"),
    item("sunglasses", "Ochelari de soare"),
    item("scarves", "Eșarfe și fulare"),
    item("ties", "Cravate și papioane"),
    item("bags", "Genți și rucsacuri"),
    item("jewellery", "Bijuterii"),
  ]),
  group("men-grooming", "Bărbați · Îngrijire", "men", [
    item("beard", "Îngrijirea bărbii"),
    item("skincare", "Îngrijirea pielii"),
    item("haircare", "Îngrijirea părului"),
    item("fragrance", "Parfumuri"),
    item("shaving", "Aparate de ras"),
  ]),

  // ── COPII ────────────────────────────────────────────────────────────────
  group("kids-girls", "Copii · Îmbrăcăminte pentru fete", "kids", [
    item("tops", "Tricouri și bluze"),
    item("dresses", "Rochii"),
    item("skirts", "Fuste"),
    item("trousers", "Pantaloni"),
    item("jeans", "Blugi"),
    item("outerwear", "Geci și paltoane"),
    item("sleepwear", "Pijamale"),
    item("shoes", "Încălțăminte"),
    item("baby", "Bebeluși (0–2 ani)"),
  ]),
  group("kids-boys", "Copii · Îmbrăcăminte pentru băieți", "kids", [
    item("tops", "Tricouri și bluze"),
    item("shirts", "Cămăși"),
    item("trousers", "Pantaloni"),
    item("jeans", "Blugi"),
    item("outerwear", "Geci și paltoane"),
    item("sleepwear", "Pijamale"),
    item("shoes", "Încălțăminte"),
    item("baby", "Bebeluși (0–2 ani)"),
  ]),
  group("kids-toys", "Copii · Jucării", "kids", [
    item("soft-toys", "Jucării de pluș"),
    item("educational", "Jocuri educative"),
    item("figures", "Figurine"),
    item("baby-toys", "Jucării pentru bebeluși"),
    item("building", "Jocuri de construcție"),
    item("outdoor", "Jucării de exterior"),
  ]),
  group("kids-transport", "Copii · Cărucioare, landouri și scaune auto", "kids", [
    item("pushchairs", "Cărucioare"),
    item("prams", "Landouri"),
    item("car-seats", "Scaune auto"),
    item("carriers", "Marsupii și port-bebe"),
    item("accessories", "Accesorii"),
  ]),
  group("kids-furniture", "Copii · Mobilier și decorațiuni", "kids", [
    item("cots", "Pătuțuri"),
    item("high-chairs", "Scaune de masă"),
    item("storage", "Dulapuri și rafturi"),
    item("decor", "Decorațiuni"),
    item("play-mats", "Covorașe de joacă"),
  ]),
  group("kids-bath", "Copii · Îmbăiere și înfășare", "kids", [
    item("baths", "Cădițe"),
    item("towels", "Prosoape"),
    item("nappies", "Scutece"),
    item("changing", "Mese de înfășat"),
    item("care", "Îngrijire"),
  ]),
  group("kids-safety", "Copii · Echipamente de protecție și siguranță", "kids", [
    item("gates", "Bariere de siguranță"),
    item("monitors", "Monitoare pentru bebeluși"),
    item("corners", "Protecții pentru colțuri"),
    item("playpens", "Țarcuri"),
  ]),
  group("kids-health", "Copii · Sănătate și sarcină", "kids", [
    item("maternity", "Îmbrăcăminte de maternitate"),
    item("pillows", "Perne de sarcină"),
    item("thermometers", "Termometre"),
    item("aspirators", "Aspiratoare nazale"),
  ]),
  group("kids-feeding", "Copii · Alăptare și hrănire", "kids", [
    item("bottles", "Biberoane"),
    item("pumps", "Pompe de sân"),
    item("sterilisers", "Sterilizatoare"),
    item("chairs", "Scaune de masă"),
    item("tableware", "Veselă pentru copii"),
  ]),
  group("kids-sleep", "Copii · Dormit și lenjerie de pat", "kids", [
    item("bedding", "Lenjerii de pat"),
    item("sleep-bags", "Saci de dormit"),
    item("blankets", "Pături"),
    item("dummies", "Suzete"),
  ]),
  group("kids-school", "Copii · Rechizite școlare", "kids", [
    item("backpacks", "Ghiozdane"),
    item("cases", "Penare"),
    item("notebooks", "Caiete și blocnotesuri"),
    item("pens", "Instrumente de scris"),
  ]),
  group("kids-other", "Copii · Alte articole pentru copii", "kids", []),

  // ── DIVERTISMENT ─────────────────────────────────────────────────────────
  group("ent-books", "Divertisment · Cărți", "entertainment", [
    item("fiction", "Ficțiune"),
    item("non-fiction", "Non-ficțiune"),
    item("children", "Cărți pentru copii"),
    item("comics", "Benzi desenate și manga"),
    item("textbooks", "Manuale și cărți școlare"),
    item("art-books", "Cărți de artă și fotografie"),
  ]),
  group("ent-magazines", "Divertisment · Reviste", "entertainment", [
    item("fashion", "Modă"),
    item("sport", "Sport"),
    item("science", "Știință și tehnologie"),
    item("lifestyle", "Lifestyle"),
    item("vintage", "Numere vintage"),
  ]),
  group("ent-music", "Divertisment · Muzică", "entertainment", [
    item("vinyl", "Viniluri"),
    item("cd", "CD-uri"),
    item("cassette", "Casete"),
    item("merch", "Merch muzical"),
  ]),
  group("ent-video", "Divertisment · Video", "entertainment", [
    item("dvd", "DVD-uri"),
    item("bluray", "Blu-ray"),
    item("vhs", "Casete VHS"),
    item("series", "Seriale"),
  ]),

  // ── HOBBYURI ȘI COLECȚII ─────────────────────────────────────────────────
  group("hobby-cards", "Hobbyuri · Carduri de tranzacționare", "hobby", [
    item("pokemon", "Pokémon"),
    item("football", "Fotbal"),
    item("magic", "Magic: The Gathering"),
    item("yugioh", "Yu-Gi-Oh!"),
    item("sealed", "Produse sigilate"),
  ]),
  group("hobby-boardgames", "Hobbyuri · Jocuri de societate", "hobby", [
    item("family", "Jocuri de familie"),
    item("strategy", "Jocuri de strategie"),
    item("party", "Jocuri de petrecere"),
    item("card-games", "Jocuri de cărți"),
  ]),
  group("hobby-puzzles", "Hobbyuri · Puzzle-uri", "hobby", [
    item("under-500", "Sub 500 de piese"),
    item("500-1000", "500–1000 de piese"),
    item("over-1000", "Peste 1000 de piese"),
    item("3d", "Puzzle 3D"),
  ]),
  group("hobby-miniatures", "Hobbyuri · Jocuri de masă și în miniatură", "hobby", [
    item("miniatures", "Miniaturi"),
    item("starter-sets", "Seturi de start"),
    item("paints", "Vopsele și unelte"),
    item("terrain", "Terenuri de joc"),
  ]),
  group("hobby-memorabilia", "Hobbyuri · Suveniruri", "hobby", [
    item("sport", "Sport"),
    item("music", "Muzică"),
    item("film", "Film și TV"),
    item("advertising", "Publicitate"),
  ]),
  group("hobby-coins", "Hobbyuri · Monede și bancnote", "hobby", [
    item("ro-coins", "Monede românești"),
    item("world-coins", "Monede străine"),
    item("banknotes", "Bancnote"),
    item("sets", "Seturi de colecție"),
  ]),
  group("hobby-stamps", "Hobbyuri · Timbre", "hobby", [
    item("ro-stamps", "Timbre românești"),
    item("world-stamps", "Timbre străine"),
    item("albums", "Seturi și albume"),
  ]),
  group("hobby-postcards", "Hobbyuri · Cărți poștale", "hobby", [
    item("vintage", "Vintage"),
    item("cities", "Orașe și călătorii"),
    item("illustrated", "Ilustrate"),
  ]),
  group("hobby-instruments", "Hobbyuri · Instrumente muzicale și echipamente", "hobby", [
    item("guitars", "Chitare"),
    item("keyboards", "Claviaturi și piane"),
    item("wind", "Instrumente de suflat"),
    item("percussion", "Percuție"),
    item("audio", "Echipamente audio"),
    item("accessories", "Accesorii"),
  ]),
  group("hobby-crafts", "Hobbyuri · Arte și meșteșuguri", "hobby", [
    item("painting", "Materiale de pictură"),
    item("sewing", "Cusut și croitorie"),
    item("knitting", "Tricotat și croșetat"),
    item("paper", "Hârtie și scrapbooking"),
    item("tools", "Unelte"),
  ]),
  group("hobby-storage", "Hobbyuri · Depozitare obiecte de colecție", "hobby", [
    item("sleeves", "Folii și sleeve-uri"),
    item("boxes", "Cutii de depozitare"),
    item("albums", "Albume"),
    item("cases", "Vitrine"),
  ]),
  group("hobby-gaming", "Hobbyuri · Accesorii pentru jocuri", "hobby", [
    item("controllers", "Controllere"),
    item("headsets", "Căști"),
    item("keyboards", "Mouse și tastaturi"),
    item("chairs", "Scaune de gaming"),
  ]),
]

/**
 * ===========================================================================
 *  THE FIRST QUESTION
 * ===========================================================================
 *
 * Five, and the order is how often they are used rather than alphabetical.
 */
export type Department = { id: string; label: string }

export const DEPARTMENTS: Department[] = [
  { id: "women", label: "Femei" },
  { id: "men", label: "Bărbați" },
  { id: "kids", label: "Copii" },
  { id: "entertainment", label: "Divertisment" },
  { id: "hobby", label: "Hobbyuri și colecții" },
]

export function groupsForDepartment(departmentId: string): CategoryGroup[] {
  return LISTING_CATEGORIES.filter((g) => g.department === departmentId)
}

/** Which department to open the picker on for a group already chosen, so
 *  re-opening it lands where the choice was made rather than at the top. */
export function departmentForGroup(groupId?: string | null): string | null {
  if (!groupId) return null
  return LISTING_CATEGORIES.find((g) => g.id === groupId)?.department ?? null
}

/**
 * The group's name with the department taken off.
 *
 * "Femei · Haine" reads as "Haine" once you are already inside Femei, and
 * repeating the department in every row of its own list is the noise the
 * drill-down exists to remove.
 */
export function categoryShortLabel(group: CategoryGroup): string {
  if (group.short) return group.short
  const at = group.label.indexOf(" · ")
  return at === -1 ? group.label : group.label.slice(at + 3)
}

/**
 * ===========================================================================
 *  WHICH QUESTIONS THIS CATEGORY ACTUALLY HAS ANSWERS TO
 * ===========================================================================
 *
 * The form asked all eight of everybody. A paperback was asked for its size, a
 * vinyl record for its era, and a Pokémon card for its style — three questions
 * with no answer, sitting above three that mattered, on the screen where a
 * seller decides whether listing the thing is worth the trouble.
 *
 * Keyed on the group rather than the department, because the split is not
 * always the same one: "Femei · Haine" wants a size and "Femei · Frumusețe"
 * does not, and both are Femei.
 *
 * `condition` is on everything and is not listed — there is nothing on this
 * marketplace whose condition does not matter.
 */
export type ListingField = "brand" | "size" | "colour" | "sources" | "era" | "style"

/** Clothing and footwear: the full set. */
const WORN: ListingField[] = ["brand", "size", "colour", "sources", "era", "style"]
/** Carried and worn, but not sized. */
const CARRIED: ListingField[] = ["brand", "colour", "sources", "era", "style"]
/** Objects: a brand and a colour, and nothing about how they are styled. */
const OBJECT: ListingField[] = ["brand", "colour"]
/**
 * Printed and recorded matter, and collectibles: NONE of the six.
 *
 * Both of these used to ask for a brand, on the reasoning that a brand is a
 * publisher for a book and a maker for a boxed set. The reasoning is sound and
 * the field is not, because the field is not a free-text box — it opens the
 * BRAND DIRECTORY, which is fashion. Listing a paperback and being offered
 * Nike, Adidas and Zara is not a slightly imprecise label; it is a question
 * with no correct answer in it, on a form whose whole job is to be answerable.
 *
 * A publisher field and a maker field would each be right, and each needs a
 * directory of its own before it can exist. Until then the title carries it —
 * "Dune, Nemira, 2021" is how anybody writes a book listing anyway — and the
 * form asks nothing it cannot accept an answer to.
 *
 * Colour and size were already absent from both for the same class of reason,
 * so this is the third of the six going for the third time.
 */
const MEDIA: ListingField[] = []
const COLLECTIBLE: ListingField[] = []

const FIELDS_BY_GROUP: Record<string, ListingField[]> = {
  "women-clothing": WORN,
  "women-shoes": WORN,
  "women-bags": CARRIED,
  "women-accessories": CARRIED,
  "women-beauty": OBJECT,
  "men-clothing": WORN,
  "men-shoes": WORN,
  "men-accessories": CARRIED,
  "men-grooming": OBJECT,
  "kids-girls": WORN,
  "kids-boys": WORN,
  "kids-toys": OBJECT,
  "kids-transport": OBJECT,
  "kids-furniture": OBJECT,
  "kids-bath": OBJECT,
  "kids-safety": OBJECT,
  "kids-health": OBJECT,
  "kids-feeding": OBJECT,
  "kids-sleep": OBJECT,
  "kids-school": OBJECT,
  "kids-other": OBJECT,
  "ent-books": MEDIA,
  "ent-magazines": MEDIA,
  "ent-music": MEDIA,
  "ent-video": MEDIA,
  "hobby-cards": COLLECTIBLE,
  "hobby-boardgames": COLLECTIBLE,
  "hobby-puzzles": COLLECTIBLE,
  "hobby-miniatures": COLLECTIBLE,
  "hobby-memorabilia": COLLECTIBLE,
  "hobby-coins": COLLECTIBLE,
  "hobby-stamps": COLLECTIBLE,
  "hobby-postcards": COLLECTIBLE,
  "hobby-instruments": OBJECT,
  "hobby-crafts": OBJECT,
  "hobby-storage": OBJECT,
  "hobby-gaming": OBJECT,
}

/**
 * What to ask about a listing in this group.
 *
 * An unknown group — a listing published under a group id that has since been
 * reorganised away — gets the full set rather than none: showing a seller a
 * field they do not need costs them one row, and hiding one they had already
 * filled in would silently drop a value they can no longer see or correct.
 */
/**
 * Does the BRAND DIRECTORY have anything to say about this group?
 *
 * The seeded directory is fashion, end to end — Nike, Adidas, Zara, H&M, Levi's,
 * Supreme, Shein. Nothing in it is a toy, a cosmetic, an instrument or a games
 * label, and nothing ever will be by accident.
 *
 * The brand FIELD is still right on most of those groups, because a picker with
 * a free-text escape can take "Lego" or "Dior" or "Yamaha" perfectly well — the
 * directory is a shortcut, not the answer. What is wrong is offering that
 * shortcut where every single suggestion in it is from another department:
 * opening Brand on a lipstick and being shown a list of streetwear labels reads
 * as the form not knowing what is being sold.
 *
 * So the suggestions are scoped to where they apply and the free-text path is
 * left everywhere. A group is served by the directory exactly when its fields
 * come from the two fashion sets — which is the same fact the table above
 * already encodes, read rather than restated.
 */
export function brandDirectoryApplies(groupId?: string | null): boolean {
  if (!groupId) return false
  const fields = FIELDS_BY_GROUP[groupId]
  return fields === WORN || fields === CARRIED
}

export function fieldsFor(groupId?: string | null): ListingField[] {
  if (!groupId) return []
  return FIELDS_BY_GROUP[groupId] ?? WORN
}

/** Convenience, because every call site asks about one field at a time. */
export function asksFor(groupId: string | null | undefined, field: ListingField): boolean {
  return fieldsFor(groupId).includes(field)
}

/**
 * ===========================================================================
 *  WHAT THE OLD TREE CALLED THINGS
 * ===========================================================================
 *
 * Every listing already published stores a group id, and reorganising the tree
 * does not reach into the database to update them. Without this, the day this
 * shipped, every one of those listings would have rendered with no category at
 * all — `categoryLabelFor` returns null for a group it cannot find, and null is
 * indistinguishable from "the seller never chose one".
 *
 * A label, not a redirect: these ids are gone from the picker, so a seller
 * editing such a listing is asked to pick again from the tree that exists. What
 * this preserves is the listing READING correctly in the meantime, which is the
 * part a buyer sees.
 */
const LEGACY_GROUP_LABELS: Record<string, string> = {
  "women-tops": "Femei · Haine",
  "women-bottoms": "Femei · Haine",
  "women-outerwear": "Femei · Haine",
  "women-dresses": "Femei · Haine",
  "women-knitwear": "Femei · Haine",
  "women-footwear": "Femei · Încălțăminte",
  "men-tops": "Bărbați · Haine",
  "men-bottoms": "Bărbați · Haine",
  "men-outerwear": "Bărbați · Haine",
  "men-knitwear": "Bărbați · Haine",
  "men-suits": "Bărbați · Haine",
  "men-footwear": "Bărbați · Încălțăminte",
  accessories: "Accesorii",
  bags: "Genți",
  activewear: "Îmbrăcăminte sport",
  swimwear: "Costume de baie",
  underwear: "Lenjerie",
  kids: "Copii",
}

/** Flattened, for search and for turning a stored pair back into labels. */
export const CATEGORY_INDEX: { groupId: string; groupLabel: string; item: Option }[] =
  LISTING_CATEGORIES.flatMap((g) => g.items.map((i) => ({ groupId: g.id, groupLabel: g.label, item: i })))

export function categoryLabelFor(groupId?: string | null, itemId?: string | null): string | null {
  if (!groupId) return null
  const found = LISTING_CATEGORIES.find((g) => g.id === groupId)
  if (!found) return LEGACY_GROUP_LABELS[groupId] ?? null
  const leaf = found.items.find((i) => i.id === itemId)
  return leaf ? `${found.label} · ${leaf.label}` : found.label
}

// These ids are NOT free to choose — products.condition carries a CHECK
// constraint from 20260730_marketplace_physical_attributes.sql that allows
// exactly this ladder. I invented a different set (brand_new, like_new, …) and
// every publish was rejected by the database. Matching the constraint is the fix;
// widening it would fork the vocabulary for every listing that already exists.
/**
 * ===========================================================================
 *  CONDITION, IN THE WORDS THE THING IS ACTUALLY SOLD IN
 * ===========================================================================
 *
 * The five rungs are right for everything on this marketplace. The WORDS were
 * right for clothing only: "Nou, cu etichetă" and hints reading "Nepurtat" and
 * "Purtat de câteva ori" — asked of a paperback, a board game or a lipstick,
 * none of which is ever worn and none of which has a tag on it.
 *
 * Same ladder, same five ids, different language. The ids matter more than they
 * look: every listing ever filed carries one, the feed filters on them, and a
 * second set would mean a listing's condition changing meaning the day its
 * category was edited. So this is a relabelling, not a second taxonomy.
 *
 * Two vocabularies, because there are two ways a thing arrives new: with the
 * tag still on it, or still sealed in the box. Everything below the top two
 * rungs is about use, and "folosit" covers a book, a toy and a guitar equally
 * well where "purtat" covers none of them.
 */
const CONDITION_IDS = [
  "new_with_tags",
  "new_without_tags",
  "very_good",
  "good",
  "satisfactory",
] as const

export type ConditionId = (typeof CONDITION_IDS)[number]

const WORN_WORDS: Record<ConditionId, { label: string; hint: string }> = {
  new_with_tags: { label: "Nou, cu etichetă", hint: "Nepurtat, cu eticheta originală" },
  new_without_tags: { label: "Nou, fără etichetă", hint: "Nepurtat, dar fără etichetă" },
  very_good: { label: "Foarte bună", hint: "Purtat de câteva ori, fără urme vizibile" },
  good: { label: "Bună", hint: "Purtat, cu urme mici de folosire" },
  satisfactory: { label: "Acceptabilă", hint: "Urme vizibile sau un defect descris în anunț" },
}

const USED_WORDS: Record<ConditionId, { label: string; hint: string }> = {
  new_with_tags: { label: "Nou, sigilat", hint: "Nedesfăcut, în ambalajul original" },
  new_without_tags: { label: "Nou, desigilat", hint: "Nefolosit, dar fără ambalaj" },
  very_good: { label: "Foarte bună", hint: "Folosit de câteva ori, fără urme vizibile" },
  good: { label: "Bună", hint: "Folosit, cu urme mici de uzură" },
  satisfactory: { label: "Acceptabilă", hint: "Urme vizibile sau un defect descris în anunț" },
}

/**
 * The ladder, worded for what is being listed.
 *
 * Clothing, shoes, bags and accessories get the tag language; everything else
 * gets the box language. An unknown group gets the clothing wording, because
 * that is what every listing filed before this existed was written against and
 * changing it retroactively would be a worse answer than an imprecise one.
 */
export function conditionsFor(groupId?: string | null): (Option & { hint: string })[] {
  const fields = groupId ? FIELDS_BY_GROUP[groupId] : undefined
  const words = fields === WORN || fields === CARRIED || fields === undefined ? WORN_WORDS : USED_WORDS
  return CONDITION_IDS.map((id) => ({ id, label: words[id].label, hint: words[id].hint }))
}

/** The clothing wording, which is what a stored value resolves against. */
export const CONDITIONS: Option[] = CONDITION_IDS.map((id) => ({
  id,
  label: WORN_WORDS[id].label,
}))

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
 * ===========================================================================
 *  SIZES, AND WHY THERE IS MORE THAN ONE LIST
 * ===========================================================================
 *
 * There was one flat list for everything the marketplace sells, and it produced
 * the same fault the brand directory did, three times over:
 *
 *   A T-SHIRT was offered 35 · încălțăminte through 45 · încălțăminte, and
 *   waist 32 through 50. Two thirds of the list could not be the answer.
 *
 *   A PAIR OF SHOES was offered XXS through XXXL for the same reason.
 *
 *   AND A CHILD'S JUMPER HAD NO CORRECT ANSWER IN THE LIST AT ALL. Kids
 *   clothing asks for a size, the list held adult letters, adult waists and
 *   adult shoe sizes, and a listing for a three-year-old could only be filed
 *   under one of them or left blank. That is worse than a list with wrong
 *   entries in it: it is a required question the form cannot accept an answer
 *   to.
 *
 * So there are four lists and a function that picks one. `SIZES` stays as the
 * union of all of them, and is still what a stored value is resolved against —
 * a listing keeps its size when its category is edited, and a label lookup that
 * only knew the current group would render a blank for it.
 */
export const SIZES_TOPS: Option[] = [
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

/** Trousers, skirts, denim — the numbers a waistband is sold by. */
export const SIZES_WAIST: Option[] = [
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
]

export const SIZES_SHOES: Option[] = [
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

/**
 * Children, by age and then by foot.
 *
 * Months up to two years because that is how baby clothes are sold and the
 * difference between 3-6 and 12-18 months is most of a wardrobe; years after
 * that. Added rather than adapted: none of these existed, which is why a
 * children's listing had nothing it could honestly say.
 */
export const SIZES_KIDS: Option[] = [
  { id: "k-0-3m", label: "0-3 luni" },
  { id: "k-3-6m", label: "3-6 luni" },
  { id: "k-6-9m", label: "6-9 luni" },
  { id: "k-9-12m", label: "9-12 luni" },
  { id: "k-12-18m", label: "12-18 luni" },
  { id: "k-18-24m", label: "18-24 luni" },
  { id: "k-2y", label: "2 ani" },
  { id: "k-3y", label: "3 ani" },
  { id: "k-4y", label: "4 ani" },
  { id: "k-5y", label: "5 ani" },
  { id: "k-6y", label: "6 ani" },
  { id: "k-7y", label: "7 ani" },
  { id: "k-8y", label: "8 ani" },
  { id: "k-9y", label: "9 ani" },
  { id: "k-10y", label: "10 ani" },
  { id: "k-11y", label: "11 ani" },
  { id: "k-12y", label: "12 ani" },
  { id: "k-13y", label: "13 ani" },
  { id: "k-14y", label: "14 ani" },
  { id: "k-shoe-18", label: "18 · încălțăminte copii" },
  { id: "k-shoe-19", label: "19 · încălțăminte copii" },
  { id: "k-shoe-20", label: "20 · încălțăminte copii" },
  { id: "k-shoe-21", label: "21 · încălțăminte copii" },
  { id: "k-shoe-22", label: "22 · încălțăminte copii" },
  { id: "k-shoe-23", label: "23 · încălțăminte copii" },
  { id: "k-shoe-24", label: "24 · încălțăminte copii" },
  { id: "k-shoe-25", label: "25 · încălțăminte copii" },
  { id: "k-shoe-26", label: "26 · încălțăminte copii" },
  { id: "k-shoe-27", label: "27 · încălțăminte copii" },
  { id: "k-shoe-28", label: "28 · încălțăminte copii" },
  { id: "k-shoe-29", label: "29 · încălțăminte copii" },
  { id: "k-shoe-30", label: "30 · încălțăminte copii" },
  { id: "k-shoe-31", label: "31 · încălțăminte copii" },
  { id: "k-shoe-32", label: "32 · încălțăminte copii" },
  { id: "k-shoe-33", label: "33 · încălțăminte copii" },
  { id: "k-shoe-34", label: "34 · încălțăminte copii" },
  { id: "k-shoe-35", label: "35 · încălțăminte copii" },
]

/** Every size the marketplace knows, for resolving a stored value to a label. */
export const SIZES: Option[] = [...SIZES_TOPS, ...SIZES_WAIST, ...SIZES_SHOES, ...SIZES_KIDS]

/**
 * The sizes worth offering for what is being listed.
 *
 * Falls back to the union rather than to nothing: an unknown group is a group
 * this table has not been taught about, and showing every size is wrong in a way
 * somebody can work around, where showing none is a dead end.
 */
export function sizesFor(groupId?: string | null): Option[] {
  if (!groupId) return SIZES
  if (groupId === "kids-girls" || groupId === "kids-boys") return SIZES_KIDS
  if (groupId === "women-shoes" || groupId === "men-shoes") return SIZES_SHOES
  if (groupId === "women-clothing" || groupId === "men-clothing") {
    return [...SIZES_TOPS, ...SIZES_WAIST]
  }
  return SIZES
}

/** Photos: at least two, at most eight. */
export const MIN_PHOTOS = 2
export const MAX_PHOTOS = 8
