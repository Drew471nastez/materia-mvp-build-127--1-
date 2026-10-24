/**
 * ===========================================================================
 *  A CUSTOMER'S ACCOUNT, IN THE PAGE'S LANGUAGE
 * ===========================================================================
 * The sign in steps, the account page and what each says when a step stops
 * were English on every language of a website (/fr/account/login read
 * "Check your email"). Each sentence is one of the shop's own words now
 * (lib/markets/ui-words.ts, `acct_*`, Translate › Shop words), drawn in the
 * page's language once its translation is approved, and in English until
 * then: the same words the cart and the buy buttons use.
 *
 * Three things here, all pure:
 *
 *   accountWords    one word in the page's language, its {blanks} filled
 *   notices         the fixed reason codes the routes send back
 *                   (?error=, ?profile=, ?address=) as their words
 *   wordedCustomer  the customer's orders (statuses, buttons, dates) in the
 *                   page's language, as lib/site-accounts/account-data.ts
 *                   wrote them in English
 */
import { uiWord, type UiWord } from "@/lib/markets/ui-words"

export type Words = Partial<Record<string, string>> | undefined

/** A word in the page's language, with its {name} blanks filled. Never markup: the caller escapes it. */
export function accountWord(words: Words, key: UiWord, vars?: Record<string, string | number>): string {
  const text = uiWord(words, key)
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m))
}

/** A function of one word, for a page that says many. */
export function wordsOf(words: Words): (key: UiWord, vars?: Record<string, string | number>) => string {
  return (key, vars) => accountWord(words, key, vars)
}

/* ─── The reasons a step stopped ────────────────────────────────────────── */

const SIGN_IN: Record<string, UiWord> = {
  email: "acct_notice_email",
  code: "acct_notice_code",
  expired: "acct_notice_expired",
  tries: "acct_notice_tries",
  restart: "acct_notice_restart",
  limit: "acct_notice_limit",
  send: "acct_notice_send",
  site: "acct_notice_unavailable",
  unavailable: "acct_notice_unavailable",
  failed: "acct_notice_failed",
}

/** Why a sign in step stopped (lib/site-accounts/sign-in SignInRefusal), in the page's words. Null for anything else. */
export function signInNoticeIn(words: Words, why: unknown): string | null {
  return typeof why === "string" && Object.prototype.hasOwnProperty.call(SIGN_IN, why) ? accountWord(words, SIGN_IN[why]) : null
}

const ADDRESS: Record<string, UiWord> = {
  saved: "acct_address_saved",
  deleted: "acct_address_deleted",
  default: "acct_default_changed",
  name: "acct_err_name",
  line1: "acct_err_street",
  city: "acct_err_city",
  country: "acct_err_country",
  postal: "acct_err_postal",
  region: "acct_err_region",
  phone: "acct_err_phone",
  full: "acct_err_full",
  missing: "acct_err_missing",
  unavailable: "acct_err_unavailable",
  failed: "acct_err_failed",
}

/** The address book's codes (app/api/site-account/addresses), as their words. */
export function addressNoticeIn(words: Words, code: unknown): string | null {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(ADDRESS, code) ? accountWord(words, ADDRESS[code]) : null
}

/** Whether an address code is good news (said as a status) or a refusal (said as an alert). */
export function addressNoticeIsError(code: unknown): boolean {
  return typeof code === "string" && !["saved", "deleted", "default"].includes(code)
}

/** Every refusal an address form can get, as `data-sl-msg-<code>` for the form's script to say without a reload. */
export const ADDRESS_ERRORS = ["name", "line1", "city", "country", "postal", "region", "phone", "full", "missing", "unavailable", "failed"] as const

/**
 * The account page's notice from its address (?profile=, ?address=,
 * ?deleted=), as the page's words, and whether it is an error. The same on
 * a Storelib theme's account page and an imported theme's.
 */
export function accountNoticeIn(words: Words, q: { get(k: string): string | null }): { text: string; error: boolean } | null {
  const profile = q.get("profile")
  if (profile === "saved") return { text: accountWord(words, "acct_saved"), error: false }
  if (profile === "error") return { text: accountWord(words, "acct_name_error"), error: true }
  if (profile === "phone") return { text: accountWord(words, "acct_phone_error"), error: true }
  if (profile === "unavailable") return { text: accountWord(words, "acct_profile_unavailable"), error: true }
  if (q.get("deleted") === "no") return { text: accountWord(words, "acct_delete_error"), error: true }
  const address = q.get("address")
  const said = addressNoticeIn(words, address)
  return said ? { text: said, error: addressNoticeIsError(address) } : null
}

/* ─── The orders, in the page's language ────────────────────────────────── */

/** The English account-data.ts writes, and the word each is. */
const SAID: Record<string, UiWord> = {
  Processing: "acct_status_processing",
  Refunded: "acct_status_refunded",
  "On hold": "acct_status_on_hold",
  "Partly refunded": "acct_status_partly_refunded",
  Complete: "acct_status_complete",
  Confirmed: "acct_status_confirmed",
  Shipped: "acct_status_shipped",
  Delivered: "acct_status_delivered",
  Cancelled: "acct_status_cancelled",
  "Partly shipped": "acct_status_partly_shipped",
  "Partly ready": "acct_status_partly_ready",
  "Ready for pickup": "acct_status_ready_pickup",
  "Picked up": "acct_status_picked_up",
  "In transit": "acct_status_in_transit",
  "Out for delivery": "acct_status_out_for_delivery",
  "Delivery problem": "acct_status_delivery_problem",
  "Sent to be shipped": "acct_status_sent_to_ship",
  "Being prepared": "acct_status_being_prepared",
  Download: "acct_download",
  Access: "acct_access",
  "View order": "acct_view_order",
  "Track order": "acct_track_order",
  "No longer available": "acct_no_longer_available",
}

function said(words: Words, text: unknown): string {
  return typeof text === "string" && Object.prototype.hasOwnProperty.call(SAID, text) ? uiWord(words, SAID[text]) : String(text ?? "")
}

function dateIn(iso: unknown, locale: string | null | undefined, fallback: string): string {
  if (!locale || typeof iso !== "string") return fallback
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return fallback
  try {
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  } catch {
    return fallback
  }
}

interface WordedOrder {
  date: string
  created_at?: string
  status: string
  action_label: string
  items: { title: string }[]
  tracking?: { status: string }[]
  title?: string
}

/**
 * The customer's orders with their statuses, buttons and dates in the
 * page's language. What is compared (action_label === "Download", the
 * status a theme styles by) is the English as account-data wrote it, so
 * this is the last step before drawing, never before a decision.
 */
export function wordedCustomer<C extends { orders: WordedOrder[] }>(customer: C, words: Words, locale?: string | null): C {
  const hasWords = !!words && Object.keys(words).length > 0
  if (!hasWords && !locale) return customer
  return {
    ...customer,
    orders: customer.orders.map((o) => {
      const items = o.items.map((it) => ({ ...it, title: said(words, it.title) }))
      return {
        ...o,
        date: dateIn(o.created_at, locale, o.date),
        status: said(words, o.status),
        action_label: said(words, o.action_label),
        items,
        ...(o.tracking ? { tracking: o.tracking.map((t) => ({ ...t, status: said(words, t.status) })) } : {}),
        ...(typeof o.title === "string" && items.length > 1 ? { title: accountWord(words, "acct_and_more", { title: items[0].title, count: items.length - 1 }) } : {}),
      }
    }),
  }
}
