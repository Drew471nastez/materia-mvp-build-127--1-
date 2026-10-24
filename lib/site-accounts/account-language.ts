/**
 * ===========================================================================
 *  A CUSTOMER'S ORDERS IN THE WEBSITE'S LANGUAGE
 * ===========================================================================
 * The account page lists a customer's orders with words the server writes
 * (./account-data.ts): the date, each order's state ("Delivered"), its button
 * ("Track order"), a free total, a product that is gone. They were English on
 * every language of the website. Here the page's copy of the customer is put
 * in its language: the date the way that language writes it, and each word
 * through the shop's own words (lib/markets/ui-words.ts, Translate › Shop
 * words), English where a word has no approved translation yet.
 *
 * In English nothing changes. The customer it is given is never changed.
 * Pure, so the page and the tests read it the same way.
 */
import { uiWord, type UiWord } from "@/lib/markets/ui-words"

/** Each English word the account writes, and the shop word it is. */
export const ACCOUNT_WORDS: Record<string, UiWord> = {
  Processing: "order_processing",
  Refunded: "order_refunded",
  "On hold": "order_on_hold",
  "Partly refunded": "order_partly_refunded",
  Complete: "order_complete",
  Delivered: "order_delivered",
  Shipped: "order_shipped",
  Confirmed: "order_confirmed",
  Cancelled: "order_cancelled",
  "Partly ready": "order_partly_ready",
  "Partly shipped": "order_partly_shipped",
  "Ready for pickup": "order_ready_for_pickup",
  "Picked up": "order_picked_up",
  "In transit": "order_in_transit",
  "Out for delivery": "order_out_for_delivery",
  "Delivery problem": "order_delivery_problem",
  "Sent to be shipped": "order_sent_to_ship",
  "Being prepared": "order_being_prepared",
  "Track order": "order_track",
  "View order": "order_view",
  Download: "order_download",
  Access: "order_access",
  Free: "order_free",
  "No longer available": "order_unavailable",
}

type O = Record<string, unknown>

/** "3 oct. 2026" in French, as the account writes "Oct 3, 2026" in English. */
function dateIn(iso: unknown, locale: string): string | null {
  if (typeof iso !== "string" || !iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  } catch {
    return null
  }
}

export function customerInLanguage<C>(customer: C, locale: string | null | undefined, words: Partial<Record<string, string>> | undefined): C {
  const lang = (locale ?? "").trim()
  if (!lang || /^en(?:-|$)/i.test(lang) || !customer || typeof customer !== "object") return customer
  const c = customer as unknown as O
  if (!Array.isArray(c.orders)) return customer
  const word = (v: unknown) => (typeof v === "string" && ACCOUNT_WORDS[v] ? uiWord(words, ACCOUNT_WORDS[v]) : v)
  const orders = (c.orders as O[]).map((o) => {
    if (!o || typeof o !== "object") return o
    const out: O = { ...o }
    const date = dateIn(o.created_at, lang)
    if (date) out.date = date
    for (const k of ["status", "action_label", "total", "price"]) if (k in o) out[k] = word(o[k])
    /* A product's own name is never a word to translate: only the line that says it is gone. */
    if (o.title === "No longer available") out.title = word(o.title)
    if (Array.isArray(o.items)) out.items = (o.items as O[]).map((i) => (i && typeof i === "object" && i.title === "No longer available" ? { ...i, title: word(i.title) } : i))
    if (Array.isArray(o.tracking)) out.tracking = (o.tracking as O[]).map((t) => (t && typeof t === "object" ? { ...t, status: word(t.status) } : t))
    return out
  })
  return { ...c, orders } as unknown as C
}
