/**
 * ===========================================================================
 *  WHICH CHECKOUT DOES THIS PRODUCT NEED?
 * ===========================================================================
 *
 * Storelib sells two unrelated things through one table. A second-hand jacket
 * needs an address, a locker and postage. A downloadable preset needs tips,
 * gifting, pay-what-you-want, VAT and a licence. They get different checkouts.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TEST IS NEGATIVE
 * ---------------------------------------------------------------------------
 * The obvious version — `type === "physical"` — sends anything else to the
 * digital checkout, and "anything else" includes every row whose type is null,
 * empty, or written by a code path that predates the marketplace. Those are
 * marketplace listings, and they were landing on a screen built for downloads:
 * no address, no locker, no postage, and a "Livrare instant" promise about a
 * jacket.
 *
 * So the question asked here is the one with a closed answer. There are exactly
 * three kinds of product this application delivers over the wire, they are
 * created in three places that all name themselves, and everything else on a
 * marketplace is a parcel. An unrecognised type is a parcel too — being wrong
 * about a download and asking for an address is recoverable in a sentence;
 * being wrong about a parcel means selling something with nowhere to send it.
 */

/**
 * The types that are delivered as access rather than as a parcel.
 *
 *   digital    a file to download            app/app/products/new
 *   course     lessons to work through       app/app/courses/new
 *   community  a space to be let into        checkout/complete-free
 *
 * Add to this list when a new non-physical kind is introduced — not to a
 * condition somewhere, which is how the two got out of step in the first place.
 */
export const DIGITAL_DELIVERY_TYPES: readonly string[] = ["digital", "course", "community"]

/** True when the buyer receives access, not a parcel. */
export function isDigitalDelivery(type: string | null | undefined): boolean {
  return DIGITAL_DELIVERY_TYPES.includes(String(type ?? "").trim().toLowerCase())
}

/** True when something has to be put in a box and sent. */
export function isShippable(type: string | null | undefined): boolean {
  return !isDigitalDelivery(type)
}
