import "server-only"

/**
 * The real Stripe, payment checks, tax, sales limit and order for the
 * Library's checkout (./library-checkout.ts), in a file of their own so the
 * checkout's rules stay testable against stubs and the payments code stays
 * out of everything else that reads the Library.
 */
import { nanoid } from "nanoid"
import type { Db } from "./db"
import type { Fulfil, LibraryCheckoutDeps } from "./library-checkout"

export async function libraryCheckoutDeps(db: Db): Promise<LibraryCheckoutDeps> {
  const [{ stripe }, { checkoutReadyForCreator }, { calculatePlatformFeeForCheckout }, { generateReceiptToken }, tax, rules, limits, store] = await Promise.all([
    import("@/lib/stripe"),
    import("@/lib/payments/service"),
    import("@/lib/billing/platform-fee-server"),
    import("@/lib/security"),
    import("@/lib/tax/server"),
    import("@/lib/tax/rules"),
    import("@/lib/checkout/sales-limit"),
    import("@/lib/store/selling-currency-read"),
  ])
  return {
    stripe,
    ready: (creatorId) => checkoutReadyForCreator(creatorId),
    fee: (cents, creatorId, currency) => calculatePlatformFeeForCheckout(cents, creatorId, db, currency),
    /* Settings › Taxes, for a store that taxes downloads, the way the product checkout works it out (app/api/checkout/stripe-session). */
    tax: async (creatorId, productId, amountCents, country) => {
      const view = rules.checkoutTaxFor(await tax.loadTaxForCheckout(db, creatorId), productId, country)
      if (!view) return null
      return rules.digitalTax({ enabled: true, digital: true, included: view.included, regions: view.regions.map((r) => ({ ...r, region: null })), overrides: view.overrides }, { taxableCents: amountCents, tipCents: 0, productId, country })
    },
    holdSale: async (productId, holder) => ((await limits.readLimit(db, productId)) === null ? true : limits.holdSale(db, productId, holder)),
    releaseSale: (productId, holder) => limits.releaseSale(db, productId, holder),
    storeCurrency: async (creatorId) => (await store.readStoreCurrency(db, creatorId)).currency,
    receiptToken: () => generateReceiptToken(),
    nonce: () => nanoid(32),
  }
}

/** The product checkout's own fulfilment: the order, the library entry, the ledger, the receipt (lib/checkout/fulfil-payment.ts). */
export async function libraryFulfil(db: Db, opts: { request?: Request } = {}): Promise<Fulfil> {
  const { fulfilPaymentIntent } = await import("@/lib/checkout/fulfil-payment")
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
  return async (pi) => {
    const done = await fulfilPaymentIntent(db, pi, { baseUrl, request: opts.request })
    return done.ok ? { ok: true, orderId: done.orderId, created: done.created, amountCents: done.amountCents } : done
  }
}
