import type { PaymentMethodType } from "./types"

/**
 * What Storelib's checkout takes, in the order the row draws them: cards
 * (Visa, Mastercard, Amex) and the two wallets, through Stripe. PayPal is not
 * a way to pay at checkout (round 57 took it off the Materia themes' badges;
 * round 58 off Storelib's own creator and product pages).
 */
export const CHECKOUT_PAYMENT_METHODS: readonly PaymentMethodType[] = ["visa", "mastercard", "amex", "applepay", "googlepay"]

/**
 * The row's badges: a page's saved list, kept to what checkout takes, in that
 * list's order. A page saved before round 58 carries "paypal" in its list; it
 * is dropped here, at draw time, so no stored page has to be rewritten.
 */
export function checkoutPaymentMethods(saved?: readonly string[] | null): PaymentMethodType[] {
  const takes = new Set<string>(CHECKOUT_PAYMENT_METHODS)
  const list = saved ?? CHECKOUT_PAYMENT_METHODS
  return list.filter((m, i): m is PaymentMethodType => takes.has(m) && list.indexOf(m) === i)
}
