/**
 * ===========================================================================
 *  WHICH WAYS TO PAY THE CHECKOUT ASKS STRIPE FOR, BY NAME
 * ===========================================================================
 * The form and the PaymentIntent used to leave the choice to Stripe
 * (`automatic_payment_methods`), which reads every method switched on in the
 * dashboard. One of those was a method the account has no capability for,
 * and Stripe answered the form's first request with a 400 ("You do not have
 * the capabilities required for payment method `transfers`"): no field ever
 * drew, and the checkout sat on its loading skeletons.
 *
 * So both sides name the methods, from the same short lists, best first. The
 * form tries the first; if Stripe refuses it, the next (app/checkout/parts/
 * stripe-pay.tsx). Whatever list the form loaded with is sent with Pay, and
 * the server makes the PaymentIntent for exactly that list, after checking
 * it is one of these. Apple Pay and Google Pay are cards, so the express
 * buttons work with every list.
 */

export type CheckoutMethod = "card" | "link"

/** Tried in this order. Card alone is what every Connect account can take. */
/*
  Measured against the live account, by mounting the Payment Element with each
  list: automatic is refused (the `transfers` capability). Link is off in
  checkout; card alone loads.
*/
export const METHOD_SETS: readonly (readonly CheckoutMethod[])[] = [
  ["card"],
]

/**
 * The methods a request may ask for: exactly one of the lists above, or card
 * alone when it names none of them (an older page, the app's card form).
 */
export function methodsFrom(input: unknown): CheckoutMethod[] {
  if (Array.isArray(input)) {
    const asked = input.filter((m): m is string => typeof m === "string")
    const match = METHOD_SETS.find((set) => set.length === asked.length && set.every((m, i) => asked[i] === m))
    if (match) return [...match]
  }
  return ["card"]
}
