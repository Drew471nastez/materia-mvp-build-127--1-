/**
 * ===========================================================================
 *  WHAT THE BUYER ALREADY OWNS, ASKED ONE WAY EVERYWHERE
 * ===========================================================================
 * A download, a course or a community's one time access is one entitlement
 * per buyer: paying for it twice buys nothing. Every checkout leaves such a
 * line out of the payment and says so (Gumroad, Payhip and Lemon Squeezy do
 * the same), and the product pages say "You already own this" with the way
 * to the files. What may be bought again is bought again:
 *
 *   physical       always: buying a second candle is the point
 *   membership     never a line of a cart; its own checkout says "already a
 *                  member" and links to Manage (app/checkout/membership-checkout)
 *   everything     owned per OPTION: owning Basic does not stop buying Pro.
 *   else           A row with no option (a purchase from before the product
 *                  had options, or of the whole product) owns every option,
 *                  as the downloads read it (lib/library).
 *
 * WHO "THE BUYER" IS. Only somebody the server has proven:
 *
 *   userId   a signed in Storelib account (storelib.com): its entitlements
 *   email    an address the buyer PROVED they read: a website's own customer
 *            account, signed in by typing the code sent to it
 *            (lib/site-accounts). Its completed orders, the same rule the
 *            website's account page lists them by (lib/site-accounts/
 *            account-data), so "already yours" and "your downloads" agree.
 *
 * NEVER an email typed into a checkout. Saying "this address already owns
 * X" to whoever typed it would let anyone learn what somebody else bought.
 * A guest is offered "Bought this before? Email me my link" instead
 * (lib/checkout/access-link), which answers the same whatever the address.
 *
 * No setting lets a creator sell the same download twice to one buyer
 * (there is no "allow multiple purchases" column); a variant's "Max
 * purchases" is a cap on sales, not a per buyer allowance, so it is not one.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Order rows that still give access: paid, or paid and only partly refunded. */
export const ACCESS_STATUSES = ["completed", "partially_refunded"] as const

/** Types that are one entitlement per buyer. Physical goods and memberships are not. */
export function isOwnableType(type: unknown): boolean {
  return typeof type === "string" && type !== "physical" && type !== "membership"
}

export function ownedKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}::${variantId ?? ""}`
}

export interface OwnedRow {
  product_id: string
  variant_id?: string | null
}

/**
 * Whether these rows own this line. A row of the whole product (no option)
 * owns every option of it; a row of one option owns that option only.
 */
export function rowsOwn(rows: readonly OwnedRow[], productId: string, variantId: string | null | undefined): boolean {
  return rows.some((r) => r.product_id === productId && (!r.variant_id || (!!variantId && r.variant_id === variantId)))
}

export interface OwnerIdentity {
  /** A signed in Storelib account. */
  userId?: string | null
  /** An email the buyer proved by a sign in code. Never one typed into a form. */
  provenEmail?: string | null
}

/** A LIKE pattern matching only the text itself (lib/site-accounts/account-data likeExact). */
function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The rows that give this buyer access to any of these products: their
 * entitlements, and the completed orders of their proven email. Empty for
 * nobody, and empty when the database does not answer: a read that fails
 * sells rather than refuses, as a sold out count does (lib/checkout/pricing).
 */
export async function ownershipRows(db: Db, who: OwnerIdentity, productIds: string[]): Promise<OwnedRow[]> {
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, 100)
  if (ids.length === 0) return []
  const email = typeof who.provenEmail === "string" ? who.provenEmail.trim().toLowerCase() : ""
  const reads: Promise<OwnedRow[]>[] = []
  if (who.userId) {
    reads.push(
      Promise.resolve(db.from("entitlements").select("product_id, variant_id").eq("buyer_id", who.userId).in("product_id", ids)).then(
        (r: { data?: OwnedRow[] | null; error?: unknown }) => (r?.error ? [] : r?.data ?? []),
        () => [],
      ),
    )
  }
  if (email && email.includes("@") && email.length <= 254) {
    reads.push(
      Promise.resolve(
        db.from("orders").select("product_id, variant_id").in("product_id", ids).ilike("buyer_email", likeExact(email)).in("status", [...ACCESS_STATUSES]).limit(500),
      ).then(
        (r: { data?: OwnedRow[] | null; error?: unknown }) => (r?.error ? [] : r?.data ?? []),
        () => [],
      ),
    )
  }
  if (reads.length === 0) return []
  return (await Promise.all(reads)).flat().filter((r) => r && typeof r.product_id === "string")
}

export interface OwnableLine {
  productId: string
  variantId: string | null
  type: string
}

/** The keys (ownedKey) of the lines this buyer already owns. Physical lines and memberships never are. */
export async function ownedLines(db: Db, who: OwnerIdentity, lines: readonly OwnableLine[]): Promise<Set<string>> {
  const ownable = lines.filter((l) => isOwnableType(l.type))
  if (ownable.length === 0 || (!who.userId && !who.provenEmail)) return new Set()
  const rows = await ownershipRows(db, who, ownable.map((l) => l.productId))
  const out = new Set<string>()
  for (const l of ownable) if (rowsOwn(rows, l.productId, l.variantId)) out.add(ownedKey(l.productId, l.variantId))
  return out
}

/**
 * For a product page: which of these products (and which of their options)
 * this buyer owns. `whole` lists products owned outright, `options` the
 * options owned one by one.
 */
export async function ownedProducts(
  db: Db,
  who: OwnerIdentity,
  products: readonly { id: string; type: string }[],
): Promise<{ whole: string[]; options: Record<string, string[]> }> {
  const ownable = products.filter((p) => isOwnableType(p.type))
  if (ownable.length === 0 || (!who.userId && !who.provenEmail)) return { whole: [], options: {} }
  const rows = await ownershipRows(db, who, ownable.map((p) => p.id))
  const whole = new Set<string>()
  const options: Record<string, string[]> = {}
  for (const r of rows) {
    if (!ownable.some((p) => p.id === r.product_id)) continue
    if (!r.variant_id) whole.add(r.product_id)
    else (options[r.product_id] ??= []).includes(r.variant_id) || options[r.product_id].push(r.variant_id)
  }
  for (const id of whole) delete options[id]
  return { whole: [...whole], options }
}

/** Whether a product (and option) is owned, from ownedProducts' answer. */
export function ownsFrom(owned: { whole: readonly string[]; options: Record<string, readonly string[]> } | null | undefined, productId: string, variantId: string | null | undefined): boolean {
  if (!owned) return false
  if (owned.whole.includes(productId)) return true
  return !!variantId && (owned.options[productId] ?? []).includes(variantId)
}
