/**
 * ===========================================================================
 *  THE WORDS IN DOUBLE BRACES, AND WHAT EACH ONE BECOMES
 * ===========================================================================
 * A flow's subject and body may carry fields: {{first_name}}, {{store_name}},
 * {{product_url}}. This file is the one list of them, so the builder can
 * offer only what exists, the check before turning a flow on can refuse a
 * typo or a field the trigger cannot fill (a product name in a welcome
 * email), and the engine fills every one the same way before an email is
 * framed and sent.
 *
 * A field with nothing to fill it gets its fallback, never an empty space or
 * the braces themselves: "Hi there," rather than "Hi ,". A creator can give a
 * word field their own: {{first_name|friend}}. The filling itself is the one
 * resolver campaigns use too (lib/email-variables), so both read the same
 * tags, the same older spellings and the same bracket placeholders.
 *
 * FILLED BEFORE FRAMING. The engine (lib/automations/engine.ts sendStep)
 * hands the email's frame a step whose fields are already filled, and the
 * same values beside it, so whatever draws the frame never has to know this
 * list. Values are escaped for HTML in a body and left as text in a subject.
 *
 * Pure: imported by the builder in the browser and by the engine.
 */

import type { TriggerType } from "./flow-model"
import { orderNumberOf, resolveVariables, variableKey, APP_ORIGIN, type VariableKey } from "@/lib/email-variables"
import { tt } from "@/lib/i18n/text"

export type MergeKey = Exclude<VariableKey, "email" | "last_name" | "library_url">

export interface MergeField {
  key: MergeKey
  /** What the builder calls it. */
  label: string
  /** What it becomes, in the creator's words. */
  says: string
  /** A web address, for a link or a button, rather than words. */
  link: boolean
  /** The triggers that know it. Missing means every one. */
  only?: TriggerType[]
}

const ORDERS: TriggerType[] = ["purchase", "first_purchase"]
const PRODUCTS: TriggerType[] = ["purchase", "first_purchase", "abandoned_checkout"]

export const MERGE_FIELDS: MergeField[] = [
  { key: "first_name", get label() { return tt("First name") }, get says() { return tt("Their first name, or “there” after Hi") }, link: false },
  { key: "name", get label() { return tt("Full name") }, get says() { return tt("Their full name, or “there” after Hi") }, link: false },
  { key: "creator_name", get label() { return tt("Your name") }, get says() { return tt("Your name as it is on your profile when the email is sent") }, link: false },
  { key: "store_name", get label() { return tt("Store name") }, get says() { return tt("Your store’s name as it is when the email is sent") }, link: false },
  { key: "store_url", get label() { return tt("Your Storelib page") }, get says() { return tt("The address of your Storelib page") }, link: true },
  { key: "product_name", get label() { return tt("Product name") }, get says() { return tt("What they bought or left at checkout") }, link: false, only: PRODUCTS },
  { key: "product_url", get label() { return tt("Product page") }, get says() { return tt("The product’s page") }, link: true, only: PRODUCTS },
  { key: "order_number", get label() { return tt("Order number") }, get says() { return tt("Their order’s number, as on the receipt") }, link: false, only: ORDERS },
  { key: "order_url", get label() { return tt("Their order") }, get says() { return tt("Their order page, with the download") }, link: true, only: ORDERS },
  { key: "download_url", get label() { return tt("Download link") }, get says() { return tt("Where they download what they bought") }, link: true, only: ORDERS },
  { key: "review_url", get label() { return tt("Leave a review") }, get says() { return tt("Their order page, open at the review form") }, link: true, only: ORDERS },
  { key: "checkout_url", get label() { return tt("Back to checkout") }, get says() { return tt("Checkout for the product they left") }, link: true, only: ["abandoned_checkout"] },
  { key: "unsubscribe_url", get label() { return tt("Unsubscribe link") }, get says() { return tt("Their own unsubscribe page") }, link: true },
  { key: "current_year", get label() { return tt("Year") }, get says() { return tt("This year, as a number") }, link: false },
]

const BY_KEY = new Map(MERGE_FIELDS.map((f) => [f.key, f]))

/**
 * A field by any name it is written with: {{customer_name}} is {{name}},
 * {{your_name}} is {{creator_name}} (lib/email-variables ALIASES).
 */
const FIELD = /\{\{\s*([A-Za-z][\w .-]{0,40}?)\s*(?:\|\s*([^{}|]{0,60}?)\s*)?\}\}/g

export function mergeField(key: string): MergeField | null {
  const k = variableKey(key)
  return k ? (BY_KEY.get(k as MergeKey) ?? null) : null
}

/** The fields this trigger can fill, in the order the builder lists them. */
export function fieldsFor(trigger: TriggerType): MergeField[] {
  return MERGE_FIELDS.filter((f) => !f.only || f.only.includes(trigger))
}

/** Every field written in `text`, as written. */
export function fieldsIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(FIELD)) out.push(m[1].trim().toLowerCase())
  return out
}

/**
 * What is wrong with the fields in `text` for this trigger, in words: a
 * field that does not exist, or one this trigger has nothing to fill with.
 */
export function fieldProblems(text: string, trigger: TriggerType): string[] {
  const out = new Set<string>()
  for (const key of fieldsIn(text)) {
    const f = mergeField(key)
    if (!f) out.add(`{{${key}}} is not a field. Check the spelling, or remove it.`)
    else if (f.only && !f.only.includes(trigger)) out.add(`{{${f.key}}} is only known ${f.only.includes("abandoned_checkout") && f.only.length === 1 ? "for a checkout left behind" : f.only.includes("abandoned_checkout") ? "when someone buys or starts checkout" : "when someone buys"}.`)
  }
  return [...out]
}

/** The values one email is filled with. Every field has one, or its fallback. */
export type MergeValues = Record<MergeKey, string>

export interface MergeInput {
  name?: string | null
  storeName: string
  storeUrl: string
  /** The creator's own name for signing off: their profile's display name, read when the email is sent. */
  creatorName?: string | null
  productName?: string | null
  productUrl?: string | null
  orderId?: string | null
  orderUrl?: string | null
  checkoutUrl?: string | null
  unsubscribeUrl?: string | null
  now?: Date
}

export function mergeValues(input: MergeInput): MergeValues {
  const name = (input.name ?? "").replace(/\s+/g, " ").trim()
  const first = name.split(" ")[0] ?? ""
  const orderUrl = input.orderUrl || ""
  const productUrl = input.productUrl || input.storeUrl
  const creator = (input.creatorName ?? "").trim()
  return {
    first_name: first,
    name,
    creator_name: creator || input.storeName,
    store_name: input.storeName || creator,
    store_url: input.storeUrl,
    product_name: (input.productName ?? "").trim(),
    product_url: productUrl,
    order_number: orderNumberOf(input.orderId),
    order_url: orderUrl || productUrl,
    download_url: orderUrl || `${APP_ORIGIN}/account/library`,
    review_url: orderUrl ? `${orderUrl}#review` : productUrl,
    checkout_url: input.checkoutUrl || productUrl,
    unsubscribe_url: input.unsubscribeUrl || "",
    current_year: String((input.now ?? new Date()).getFullYear()),
  }
}

/**
 * Every field in `content` replaced, through the one resolver every email a
 * creator sends is filled by (lib/email-variables resolveVariables): the
 * tags, their older spellings, and the bracket placeholders an older preset
 * left in a saved flow ("[Your name]"). `html` escapes each value for markup
 * (a body); `text` leaves it as it is (a subject, a preview line). A field
 * nobody knows is removed and the sentence tidied: turning on refuses those
 * (flow-model problemsOf), but a flow saved before the check still sends.
 */
export function fillFields(content: string, values: MergeValues, mode: "html" | "text"): string {
  return resolveVariables(content, values, mode)
}

/**
 * The editor's buttons are drawn in the /app ink (body-editor.tsx inserts
 * `background-color:#1a1a2e;color:#ffffff`). In a sent email they wear the
 * creator's own colour, with white or ink text, whichever reads on it. A
 * button coloured any other way is left alone.
 */
export function brandButtons(html: string, accent: string, onAccent: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent) || !/^#[0-9a-f]{6}$/i.test(onAccent)) return html
  return html.replace(/<a\b[^>]*>/gi, (tag) =>
    /background-color:\s*#1a1a2e/i.test(tag)
      ? tag.replace(/background-color:\s*#1a1a2e/i, `background-color:${accent}`).replace(/(;|")\s*color:\s*#ffffff/i, `$1color:${onAccent}`)
      : tag,
  )
}

/** White or ink, whichever has the better contrast on `hex`. */
export function textOn(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return "#ffffff"
  const lin = (v: string) => {
    const c = parseInt(v, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3])
  const white = 1.05 / (L + 0.05)
  const ink = (L + 0.05) / (0.0104 + 0.05)
  return white >= ink ? "#ffffff" : "#1a1a2e"
}
