/**
 * ===========================================================================
 *  CHECKOUT TEXT: THE CART'S AND CHECKOUT'S WORDS A STORE MAY REWORD
 * ===========================================================================
 * Settings › Checkout › Checkout text. A store writes its own wording for
 * these, per language, and it shows on its cart and checkout in place of
 * Storelib's. Saved as the store's own translation of the English
 * (site_translations, source "manual", approved: ./server.ts
 * saveTranslations), so no automatic run, hand written catalog
 * (./curated-words.ts) or machine translation ever replaces it. In an
 * English website the same rows are saved in "en", read only for the
 * store's own wording (./checkout-language.ts).
 *
 * WHAT IS NOT HERE, ON PURPOSE, as on Shopify: amounts and prices, taxes,
 * the terms and refund agreement, the marketing consent box, payment and
 * security notes ("Secure checkout", "Nothing was charged"), stock and sold
 * out notes, and every error. Reworded, those could tell a buyer something
 * that is not true.
 *
 * Pure and small: the settings page, the route and the tests read it.
 */
import { sourceHash } from "./translate"

export type CheckoutTextGroup = "buttons" | "headings" | "helper" | "messages"

export interface CheckoutTextWord {
  /** The translation key: `checkout:<hash>` for a checkout sentence, `ui:<name>` for a cart word. */
  key: string
  /** The English the code says. */
  source: string
  group: CheckoutTextGroup
}

/** The longest wording a store may write for one of these: a button, a heading, a line. */
export const CHECKOUT_TEXT_MAX = 120

const checkout = (source: string, group: CheckoutTextGroup): CheckoutTextWord => ({ key: `checkout:${sourceHash(source)}`, source, group })
const cart = (name: string, source: string, group: CheckoutTextGroup): CheckoutTextWord => ({ key: `ui:${name}`, source, group })

/** Every word Checkout text lists, in the order it lists them. */
export const CHECKOUT_TEXT_WORDS: readonly CheckoutTextWord[] = [
  checkout("Pay {amount}", "buttons"),
  checkout("Place order", "buttons"),
  checkout("Get it free", "buttons"),
  checkout("Add promotion code", "buttons"),
  checkout("Apply", "buttons"),
  checkout("Continue shopping", "buttons"),
  checkout("View your order", "buttons"),
  cart("add_to_cart", "Add to cart", "buttons"),
  cart("buy_now", "Buy now", "buttons"),
  cart("check_out", "Check out", "buttons"),
  cart("view_cart", "View cart", "buttons"),

  checkout("Pay {shop}", "headings"),
  checkout("Contact information", "headings"),
  checkout("Delivery", "headings"),
  checkout("Shipping method", "headings"),
  checkout("Payment method", "headings"),
  checkout("Order summary", "headings"),
  checkout("Thank you, {name}", "headings"),
  checkout("Thank you for your order", "headings"),
  cart("cart_title", "Your cart", "headings"),

  checkout("Add a note for the shop", "helper"),
  checkout("Gift wrap, delivery instructions...", "helper"),
  checkout("{name} sees it with your order.", "helper"),
  checkout("Enter discount code", "helper"),
  cart("note_for_shop", "Note for the shop", "helper"),

  checkout("Your order is confirmed", "messages"),
  checkout("We'll email you when it ships.", "messages"),
  checkout("Your receipt is on its way to {email}.", "messages"),
  cart("cart_empty", "Your cart is empty", "messages"),
  cart("cart_nothing", "Nothing in your cart yet.", "messages"),
  cart("added_to_cart", "Added to cart", "messages"),
]

export const CHECKOUT_TEXT_GROUPS: readonly CheckoutTextGroup[] = ["buttons", "headings", "helper", "messages"]

const byKey = new Map(CHECKOUT_TEXT_WORDS.map((w) => [w.key, w]))

/** The word a key names, when Checkout text lists it; undefined for everything a store may not reword here. */
export function checkoutTextWord(key: unknown): CheckoutTextWord | undefined {
  return typeof key === "string" ? byKey.get(key) : undefined
}

/** The {placeholders} a wording must keep, in order of first use: "Pay {amount}" keeps {amount}. */
export function placeholdersOf(text: string): string[] {
  return [...new Set(text.match(/\{[A-Za-z_][\w.]*\}/g) ?? [])]
}

/** Why a wording was refused: too long, a < > or a { } that is not the English's, or a {placeholder} left out. */
export type WordingProblem = "long" | "symbols" | "placeholders"

/**
 * A store's wording, checked: spaces tidied, plain text, no longer than
 * CHECKOUT_TEXT_MAX, and with exactly the English's {placeholders}, so the
 * amount or the name still shows. An empty one means "back to Storelib's".
 */
export function checkWording(word: CheckoutTextWord, value: unknown): { ok: true; value: string } | { ok: false; problem: WordingProblem; need: string[] } {
  const v = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  const need = placeholdersOf(word.source)
  if (!v) return { ok: true, value: "" }
  if (v.length > CHECKOUT_TEXT_MAX) return { ok: false, problem: "long", need }
  const stray = (v.match(/\{[^}]*\}?|\}/g) ?? []).filter((m) => !need.includes(m))
  if (/[<>]/.test(v) || stray.length) return { ok: false, problem: "symbols", need }
  const have = placeholdersOf(v)
  if (need.some((p) => !have.includes(p))) return { ok: false, problem: "placeholders", need }
  return { ok: true, value: v }
}

/** The refusal in English, for the route's answer. */
export function wordingError(word: CheckoutTextWord, problem: WordingProblem): string {
  if (problem === "long") return `Keep "${word.source}" under ${CHECKOUT_TEXT_MAX} characters.`
  if (problem === "symbols") return `"${word.source}" takes plain words only, without < > or { }.`
  return `Keep ${placeholdersOf(word.source).join(" and ")} in "${word.source}". It shows the real value.`
}
