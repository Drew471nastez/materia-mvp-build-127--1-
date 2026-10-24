/**
 * ===========================================================================
 *  A ONEPAGE PRODUCT BLOCK: WHAT A TAP DOES, HOW IT IS DRAWN, WHO MAY SEE IT
 * ===========================================================================
 * The rules behind components/onepage/product-block.tsx (the live page and the
 * preview, which is the live page in a frame) and the block's editor
 * (components/onepage/tabs/product-block-editor.tsx), kept here with no React
 * so a test can hold each one.
 *
 * WHAT A TAP DOES (`tap_action`):
 *
 *   checkout   the product's checkout. What every block did before round 10
 *              ("buy buttons must open the product's checkout directly"), so
 *              it is also what a block with no setting does. A product that
 *              ships has no one-step checkout: its page, where its options
 *              and delivery are chosen.
 *   page       the product's own page, /p/<slug>.
 *   sheet      the product, in a sheet over this page (a centred window on a
 *              computer): pictures, price, options and its buy button. The
 *              page stays where it was. #product-<slug> in the address opens
 *              it, so the link can be shared; Back closes it.
 *
 * INSTANT CHECKOUT (`instant_checkout`). A download or a course is paid for in
 * a window on this page, the community's checkout window, instead of on
 * /checkout. It pays through the checkout's own routes
 * (/api/checkout/stripe-session, /api/checkout/confirm-payment and, for a
 * free one, /api/checkout/process), so the order, the receipt, the emails and
 * the library are the same as ever. Never for a product that ships, a
 * membership or a community plan: those have checkouts of their own.
 *
 * WHO MAY SEE IT. The live page shows a product only while it is published
 * (lib/onepage/live-products, lib/products/visibility): a draft can be put on
 * the page in the editor, and appears by itself the moment it is published;
 * an archived or deleted one leaves the page. The editor says which with
 * `editorProductState`.
 */
import type { ProductBlockData, ProductBlockStyle, ProductTapAction } from "./types"

export const PRODUCT_TAP_ACTIONS: readonly ProductTapAction[] = ["page", "sheet", "checkout"]

/** Every way the block can be drawn, in the order the editor offers them. */
export const PRODUCT_LAYOUTS: readonly ProductBlockStyle[] = ["callout", "row", "preview", "side", "tile", "overlay", "minimal", "button"]

/** A stored style this version does not know (or none) is drawn as the callout, as before. */
export function productLayoutOf(data: Pick<ProductBlockData, "style"> | null | undefined): ProductBlockStyle {
  const s = data?.style
  return s && (PRODUCT_LAYOUTS as readonly string[]).includes(s) ? s : "callout"
}

/** Kinds of product that are bought once, as a download or a course: the only ones instant checkout takes. */
export function sellsInstantly(type: string | null | undefined): boolean {
  const t = (type ?? "").trim()
  return t === "" || t === "digital" || t === "course"
}

/** A product that ships: its page is its checkout's first step. */
export function shipsProduct(type: string | null | undefined): boolean {
  return (type ?? "") === "physical"
}

/** What a tap on the block does. Unset (every block made before round 10) is the checkout, as it always was. */
export function productTapAction(data: Pick<ProductBlockData, "tap_action"> | null | undefined): ProductTapAction {
  const t = data?.tap_action
  return t && (PRODUCT_TAP_ACTIONS as readonly string[]).includes(t) ? t : "checkout"
}

/** Instant checkout is on, and this kind of product can take it. */
export function instantCheckoutOn(data: Pick<ProductBlockData, "instant_checkout" | "product_type"> | null | undefined): boolean {
  return data?.instant_checkout === true && sellsInstantly(data?.product_type ?? null)
}

export function productPageUrl(slug: string | null | undefined): string {
  return slug ? `/p/${encodeURIComponent(slug)}` : "#"
}

export function productCheckoutUrl(productId: string, variantId?: string | null): string {
  const q = new URLSearchParams({ productId })
  if (variantId) q.set("variantId", variantId)
  return `/checkout?${q.toString()}`
}

/**
 * Where the block's link points, which is also what a crawler and a long press
 * read: the checkout for a download or a course, the product page for anything
 * that ships, and the product page for "page" and "sheet" (a sheet is opened
 * by the page's script; without it the link still lands on the product).
 */
export function productHref(data: Pick<ProductBlockData, "product_id" | "product_slug" | "product_type" | "tap_action">): string {
  const page = productPageUrl(data.product_slug)
  if (!data.product_id) return page
  const action = productTapAction(data)
  if (action === "page" || action === "sheet") return page
  return shipsProduct(data.product_type) ? page : productCheckoutUrl(data.product_id)
}

/** What happens on a tap, in order of what wins. */
export type TapPlan = "instant" | "sheet" | "navigate"
export function productTapPlan(data: Pick<ProductBlockData, "tap_action" | "instant_checkout" | "product_type">): TapPlan {
  const action = productTapAction(data)
  if (action === "sheet") return "sheet"
  if (action === "checkout" && instantCheckoutOn(data)) return "instant"
  return "navigate"
}

/** The address part that opens a block's sheet: #product-<slug>. */
export function productSheetHash(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim()
  return s ? `#product-${encodeURIComponent(s)}` : null
}

/* ── Prices ─────────────────────────────────────────────────────────────── */

export interface PriceParts {
  /** "Free", or the price as the page writes money. */
  now: string
  /** The old price, struck through, when the product is on sale. */
  was: string | null
  /** "From" a pay what you want minimum. */
  prefix: "from" | null
  free: boolean
}

/**
 * The price a block shows, from the product as the catalogue has it now:
 *
 *   free                 "Free"
 *   pay what you want    "From $5.00", or "Free" with a minimum of nothing
 *                        (price_cents is 0 on such a product, and the block
 *                        said Free whatever the minimum was)
 *   on sale              the price, and the higher compare-at price struck
 *   anything else        the price, per month or year for a membership
 */
export function productPriceParts(
  data: Pick<ProductBlockData, "product_price_cents" | "product_compare_at_cents" | "product_pwyw" | "product_pwyw_min_cents">,
  money: (cents: number) => string,
): PriceParts {
  if (data.product_pwyw) {
    const min = Math.max(0, Number(data.product_pwyw_min_cents) || 0)
    return min > 0 ? { now: money(min), was: null, prefix: "from", free: false } : { now: "Free", was: null, prefix: null, free: true }
  }
  const cents = Math.max(0, Number(data.product_price_cents) || 0)
  if (cents === 0) return { now: "Free", was: null, prefix: null, free: true }
  const compare = Number(data.product_compare_at_cents) || 0
  return { now: money(cents), was: compare > cents ? money(compare) : null, prefix: null, free: false }
}

/* ── The editor's view of a product ────────────────────────────────────── */

export type EditorProductState = "published" | "draft" | "unavailable" | "loading"

export interface EditorProductRow {
  id: string
  status?: string | null
  archived?: boolean | null
}

/**
 * What the editor says about the product a block names:
 *
 *   published     on the live page and for sale
 *   draft         allowed in the editor, never shown or sold; it appears by
 *                 itself once published
 *   unavailable   archived, or gone from the catalogue: off the live page,
 *                 and the editor offers to remove the block
 *   loading       the creator's products have not arrived yet
 */
export function editorProductState(productId: string | null | undefined, products: readonly EditorProductRow[] | null | undefined): EditorProductState {
  if (!productId) return "published"
  if (!products) return "loading"
  const row = products.find((p) => p.id === productId)
  if (!row) return "unavailable"
  if (row.archived === true || row.status === "archived") return "unavailable"
  return row.status === "published" ? "published" : "draft"
}

/** The picker's list: published first, then drafts, archived left out (they cannot be put on a page). */
export function pickableProducts<T extends EditorProductRow>(products: readonly T[]): T[] {
  const live = products.filter((p) => editorProductState(p.id, products) === "published")
  const drafts = products.filter((p) => editorProductState(p.id, products) === "draft")
  return [...live, ...drafts]
}

/* ── Two tiles side by side ─────────────────────────────────────────────── */

type BlockLike = { id: string; type?: string; data?: unknown }

/** A product block drawn as a tile. */
export function isProductTile(block: BlockLike): boolean {
  return block.type === "product" && productLayoutOf(block.data as ProductBlockData) === "tile"
}

/**
 * The page's blocks, with each run of tiles that follow one another gathered
 * into rows of two. A tile left alone is a row of one and is drawn full width.
 * Everything else passes through as it was, in the same order.
 */
export function pairProductTiles<T extends BlockLike>(blocks: readonly T[]): (T | { tiles: T[]; key: string })[] {
  const out: (T | { tiles: T[]; key: string })[] = []
  let run: T[] = []
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) {
      const tiles = run.slice(i, i + 2)
      out.push({ tiles, key: tiles.map((t) => t.id).join("+") })
    }
    run = []
  }
  for (const b of blocks) {
    if (isProductTile(b)) {
      run.push(b)
      continue
    }
    flush()
    out.push(b)
  }
  flush()
  return out
}

/* ── Instant checkout's order ──────────────────────────────────────────── */

export interface InstantOrder {
  productId: string
  variantId?: string | null
  couponCode?: string | null
  email: string
  name: string
  emailOptIn?: boolean
  taxCountry?: string | null
  origin?: unknown
}

/**
 * The body the checkout's own routes take (/api/checkout/stripe-session for a
 * payment, /api/checkout/process for a free order), in exactly the shape the
 * checkout page sends (app/checkout/checkout-client.tsx orderBody). The terms
 * are on screen under the button, and pressing it is the agreement, as in the
 * community's checkout window.
 */
export function instantOrderBody(o: InstantOrder, free: boolean): Record<string, unknown> {
  const parts = o.name.trim().split(/\s+/).filter(Boolean)
  const email = o.email.trim()
  const body: Record<string, unknown> = {
    productId: o.productId,
    variantId: o.variantId ?? null,
    customPriceCents: null,
    couponCode: o.couponCode ?? "",
    firstName: parts[0] || email.split("@")[0] || "",
    lastName: parts.slice(1).join(" "),
    email,
    emailOptIn: o.emailOptIn === true,
    taxCountry: o.taxCountry ?? null,
    agreedToTerms: true,
    origin: o.origin ?? null,
    pricing: null,
  }
  if (!free) {
    body.tipCents = 0
    body.business = null
    body.paymentMethods = ["card"]
  }
  return body
}

/* ── Remove, wherever the block is ──────────────────────────────────────── */

/**
 * How to take a block off the page from its own editor: a block on the page is
 * removed by the page (the context's removeBlock); a block inside a group is
 * taken out of that group's children, which the page's removeBlock never
 * looked at (it searched the top level only, so Remove on an Unavailable
 * product inside a group did nothing).
 */
export type RemovePlan = { kind: "top" } | { kind: "child"; groupId: string; children: unknown[] } | { kind: "none" }
export function removePlanFor(blocks: readonly { id: string; type?: string; data?: unknown }[] | null | undefined, blockId: string): RemovePlan {
  if (!blocks) return { kind: "none" }
  if (blocks.some((b) => b.id === blockId)) return { kind: "top" }
  for (const b of blocks) {
    if (b.type !== "group") continue
    const children = ((b.data as { children?: { id: string }[] } | undefined)?.children ?? []) as { id: string }[]
    if (children.some((c) => c.id === blockId)) return { kind: "child", groupId: b.id, children: children.filter((c) => c.id !== blockId) }
  }
  return { kind: "none" }
}
