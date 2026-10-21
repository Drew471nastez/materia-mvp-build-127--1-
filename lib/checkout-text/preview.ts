/**
 * ===========================================================================
 *  THE CHECKOUT TEXT EDITOR'S PREVIEW IS THE CHECKOUT ITSELF
 * ===========================================================================
 * The editor used to draw a small picture of a checkout beside its fields:
 * its own boxes and type sizes, a "Bread baking course" at 49.00, every
 * editable sentence laid out at once, including words the real checkout
 * only shows on another screen or never shows on a website at all ("Add a
 * tip" is the storelib.com checkout's, which a store's words never reach).
 * A store changed a word in the picture and had no way to know where, or
 * whether, a buyer would read it.
 *
 * Now the preview is the website's checkout, the thank you page and the
 * order page, drawn by their own components (app/checkout/site/site-
 * checkout.tsx, thanks-view.tsx, order-status-view.tsx) inside a frame at
 * /checkout/preview (app/checkout/preview), with the store's own name and
 * logo, currency, language, settings and products, priced by the same
 * server code the checkout asks (lib/checkout-text/preview-server.ts). A
 * frame 390 wide is a phone 390 wide: the checkout's breakpoints, its pay
 * dock and its details toggle behave as on one.
 *
 * Three documents' worth of conversation, all of it here so the editor
 * (components/app/settings/checkout-text-editor.tsx) and the frame
 * (app/checkout/preview/preview-document.tsx) cannot disagree:
 *
 *   frame → editor   "ready"   loaded and listening: send the state
 *                    "drawn"   drawn once: the editor's loader can go
 *                    "pick"    the buyer's words that were pressed are this
 *                              text: the editor opens its field
 *                    "shown"   the text being edited is on screen now, or
 *                              is not on this view (the editor says so)
 *   editor → frame   "state"   what to draw: the store's data, the words as
 *                              typed, which checkout, which page, which text
 *
 * Only between documents on this origin, and only from the frame's own
 * parent: both sides check.
 *
 * Pure, apart from the types it names: the editor, the frame and the tests
 * share it.
 */
import type { CheckoutConfig } from "@/lib/store/checkout-config"
import type { LinkItem } from "@/lib/physical/cart-link"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"
import type { Summary } from "@/app/checkout/site/thanks/[token]/thanks-view"
import type { ShopBrand } from "@/app/checkout/parts/shop-bar"
import { EDITABLE_TEXTS, editableById, placeholdersOf, validateOverride } from "./registry"

export const CHECKOUT_PREVIEW_CHANNEL = "storelib-checkout-preview"

/** Where the frame lives. `embedded=1` lets the editor frame it (proxy.ts); `preview` keeps every page tracker away (lib/analytics/page-tracker skipReason). */
export const CHECKOUT_PREVIEW_PATH = "/checkout/preview?embedded=1&preview=1"

export type PreviewMode = "digital" | "shipped"
export type PreviewView = "checkout" | "thanks" | "order"

/** The order page's own props (app/checkout/physical/order/[token]/order-status-view.tsx), the part the server fills. */
export interface PreviewOrderPage {
  shop: { name: string; avatar: string | null; avatarKind?: "logo" | "photo" | null; email: string | null; phone?: string | null; websiteUrl?: string | null; legal?: { name: string; lines: string[]; taxId: string | null; taxIdLabel: string } | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: { id: string; status: string; fulfillmentStatus: string; cancelled: boolean; createdAt: string; email: string | null; name: string | null; address: Record<string, any> | null; delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null } | null; pickup: null; processing: boolean; totals: { subtotal: number; discount: number; shipping: number; tax: number; taxIncluded: boolean; taxLabel?: string; total: number; refunded: number; currency?: string }; cash: null; lines: { orderId: string; title: string; variantName: string | null; imageUrl: string | null; quantity: number; cents: number; type: string; receiptToken: string | null; returnable: number }[]; shipments: []; returns: [] }
}

/** One of the two checkouts a store has: a cart of downloads, or one that ships. */
export interface PreviewCase {
  /** The cart, as the website's link would carry it. */
  items: LinkItem[]
  /** Priced by the checkout's own quote (lib/checkout/site-quote-server siteQuote), in the store's currency and this language. */
  quote: SiteQuote
  /** The thank you page after it is paid (thanks-view.tsx), for the same order. */
  thanks: Summary
  /** The order page a shipped order's buyer opens (order-status-view.tsx). */
  orderPage: PreviewOrderPage | null
  /** No product of this kind is on sale: one stands in, said so in the editor. */
  standIn: boolean
}

export interface CheckoutPreviewData {
  lang: string
  currency: string
  brand: ShopBrand
  /** The store's website, as the checkout's bar links it. */
  shopUrl: string
  backTo: string
  config: CheckoutConfig
  /** The delivery country the shipped checkout opens on: the store's own. */
  country: string | null
  /** The checkout's words in this language, everything but the store's own (those are laid over as they are typed). */
  words: Record<string, string>
  digital: PreviewCase
  shipped: PreviewCase | null
}

export interface PreviewState {
  data: CheckoutPreviewData
  /** data.words with the store's words over them (wordsWithDraft). */
  words: Record<string, string>
  mode: PreviewMode
  view: PreviewView
  /** The text being edited, by registry id. */
  focus: string | null
  /** The share of the frame's height a sheet of the editor covers from the bottom (a phone's): the text being edited is brought into view above it. */
  cover: number
}

export type ToFrame = { channel: typeof CHECKOUT_PREVIEW_CHANNEL; kind: "state"; state: PreviewState }
export type ToEditor =
  | { channel: typeof CHECKOUT_PREVIEW_CHANNEL; kind: "ready" }
  | { channel: typeof CHECKOUT_PREVIEW_CHANNEL; kind: "drawn" }
  | { channel: typeof CHECKOUT_PREVIEW_CHANNEL; kind: "pick"; id: string }
  | { channel: typeof CHECKOUT_PREVIEW_CHANNEL; kind: "shown"; id: string; shown: boolean }

/**
 * The words the preview draws: the language's own, with each of the store's
 * typed words over the sentence it replaces, once it passes the check the
 * server keeps (validateOverride). A field being typed into that would be
 * refused shows the default, as the checkout would after Save refused it.
 */
export function wordsWithDraft(base: Readonly<Record<string, string>>, draft: Readonly<Record<string, string>>): Record<string, string> {
  const words: Record<string, string> = { ...base }
  for (const [id, typed] of Object.entries(draft)) {
    const entry = editableById(id)
    if (!entry || !typed || !typed.trim()) continue
    const checked = validateOverride(entry, typed)
    if (checked.ok && checked.text) words[entry.source] = checked.text
  }
  return words
}

/** What the buyer must have done for a message to be on screen: pressed Pay with this field left wrong. */
export type PreviewAction = "email" | "name" | "street" | "city" | "phone" | "paid-cash"

export interface PreviewPlace {
  view: PreviewView
  /** Only on this checkout (an address, a delivery choice). */
  mode?: PreviewMode
  /** The order page right after paying ("Thank you, {name}!") or opened later ("Your order is confirmed"). */
  justPaid?: boolean
  /** The buyer's first name is not known: the heading without it. */
  noName?: boolean
  action?: PreviewAction
}

/**
 * WHERE EACH TEXT IS READ, so the preview shows the page it is on when its
 * field is chosen: a delivery word on the shipped checkout, a heading after
 * paying on the thank you or order page, a message under the field it is
 * about once Pay was pressed with that field wrong.
 */
const PLACES: Record<string, PreviewPlace> = {
  "contact.phone": { view: "checkout", mode: "shipped" },
  "contact.phone_optional": { view: "checkout", mode: "shipped" },
  "delivery.heading": { view: "checkout", mode: "shipped" },
  "delivery.or_pickup": { view: "checkout", mode: "shipped" },
  "delivery.ship": { view: "checkout", mode: "shipped" },
  "delivery.pick_up": { view: "checkout", mode: "shipped" },
  "delivery.method": { view: "checkout", mode: "shipped" },
  "delivery.note": { view: "checkout", mode: "shipped" },
  "delivery.note_hint": { view: "checkout", mode: "shipped" },
  "payment.how": { view: "checkout", mode: "shipped" },
  "payment.cod": { view: "checkout", mode: "shipped" },
  "buttons.place_order": { view: "checkout", mode: "shipped" },
  "summary.shipping": { view: "checkout", mode: "shipped" },
  "summary.free": { view: "checkout", mode: "shipped" },
  "messages.thanks_order_name": { view: "thanks" },
  "messages.thanks_order": { view: "thanks", noName: true },
  "messages.thanks_name": { view: "order", mode: "shipped", justPaid: true },
  "messages.thanks": { view: "order", mode: "shipped", justPaid: true, noName: true },
  "messages.confirmed": { view: "order", mode: "shipped", justPaid: false },
  "messages.placed": { view: "checkout", mode: "shipped", action: "paid-cash" },
  "messages.email_invalid": { view: "checkout", action: "email" },
  "messages.name_missing": { view: "checkout", action: "name" },
  "messages.street_missing": { view: "checkout", mode: "shipped", action: "street" },
  "messages.city_missing": { view: "checkout", mode: "shipped", action: "city" },
  "messages.phone_check": { view: "checkout", mode: "shipped", action: "phone" },
}

export function placeOf(id: string): PreviewPlace {
  return PLACES[id] ?? { view: "checkout" }
}

/** The page and checkout to show for a text: its own place, keeping the current checkout where the text is on both. */
export function viewFor(id: string, current: { mode: PreviewMode; view: PreviewView }, hasShipped: boolean): { mode: PreviewMode; view: PreviewView } {
  const place = placeOf(id)
  const mode = place.mode && (place.mode === "digital" || hasShipped) ? place.mode : current.mode === "shipped" && !hasShipped ? "digital" : current.mode
  const view = place.view === "order" && mode !== "shipped" ? "thanks" : place.view
  return { mode, view }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** One run of white space, and the quotes and apostrophes the page may set differently. */
const loose = (s: string) => escape(s).replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]")

/**
 * A sentence as the page draws it: each {placeholder} filled in by the
 * checkout (an amount, the shop's name), so it matches any text there, and
 * the words around it exactly. "Pay {amount}" matches "Pay 52,60 lei".
 */
export function templatePattern(template: string): RegExp {
  const parts = String(template ?? "").split(/\{[A-Za-z_][\w]*\}/)
  const body = parts.map(loose).join(".+?")
  return new RegExp(`^\\s*${body}\\s*$`, "u")
}

/** The registry's texts as the page reads them now: the words for each sentence, with its id, the longest first so "Phone (optional)" is found before "Phone". */
export function textsOnPage(words: Readonly<Record<string, string>>): { id: string; template: string; pattern: RegExp }[] {
  return EDITABLE_TEXTS.map((e) => {
    const template = words[e.source] || e.source
    return { id: e.id, template, pattern: templatePattern(template) }
  }).sort((a, b) => b.template.length - a.template.length || placeholdersOf(a.template).length - placeholdersOf(b.template).length)
}

/** The registry text a piece of the page reads as, if any: its text, else its label for a screen reader, else its placeholder. */
export function textAt(candidates: readonly string[], texts: ReturnType<typeof textsOnPage>): string | null {
  for (const c of candidates) {
    const s = (c ?? "").replace(/\s+/g, " ").trim()
    if (!s || s.length > 140) continue
    const hit = texts.find((t) => t.pattern.test(s))
    if (hit) return hit.id
  }
  return null
}
