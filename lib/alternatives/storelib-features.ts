/**
 * The Storelib side of the feature tables, each cell tied to the code that
 * provides it (tests/alternatives.test.ts checks every path exists). A
 * competitor's table picks the rows that matter for that comparison; the
 * Storelib cell of a row is the same on every page, so two pages can never
 * describe Storelib differently.
 */
import type { StorelibCell } from "./types"
import { STORELIB } from "./storelib"

export const SL = {
  digitalProducts: { value: "yes", text: "Unlimited, on every plan", code: "lib/billing/plans.ts" },
  courses: { value: "yes", text: "Lessons, video and progress", code: "app/app/courses" },
  memberships: { value: "yes", text: "Recurring plans", code: "app/app/memberships" },
  communities: { value: "yes", text: "Posts, chat, events and paid plans", code: "app/app/community", flag: "communities" },
  linkInBio: { value: "yes", text: "OnePage at storelib.me/yourname", code: "lib/onepage/address.ts" },
  creatorPage: { value: "yes", text: "storelib.com/yourname", code: "app/(marketing)/[sellername]/page.tsx" },
  website: {
    value: "yes",
    text: `Website builder: ${STORELIB.freeSites} sites on Free, ${STORELIB.proSites} on Pro`,
    code: "lib/sites/plan.ts",
  },
  customDomain: { value: "partial", text: "On Pro", code: "lib/sites/plan.ts" },
  removeBranding: { value: "partial", text: "On Pro", code: "lib/sites/plan.ts" },
  email: { value: "yes", text: "Campaigns, subscribers and automations", code: "app/app/emails" },
  coupons: { value: "yes", text: "Discount codes", code: "app/app/coupons" },
  offers: { value: "yes", text: "Bundles, upsells and quantity breaks", code: "app/app/offers" },
  reviews: { value: "yes", text: "Buyer reviews on products", code: "app/app/reviews" },
  analytics: { value: "yes", text: "Visitors, sources and sales", code: "app/app/analytics" },
  marketplace: { value: "yes", text: "Explore, same fee as a direct sale", code: "lib/platform/explore-marketplace.ts", flag: "explore" },
  payWhatYouWant: { value: "yes", text: "Pay what you want with a minimum", code: "lib/checkout/pricing.ts" },
  tax: {
    value: "partial",
    text: "You set your own tax rates. Storelib is not the merchant of record",
    code: "lib/tax/rules.ts",
  },
  payouts: { value: "yes", wordless: true, text: "Stripe, to your bank: US, UK, EEA, Canada, Switzerland", code: "lib/payments/stripe/payout-regions.ts" },
  monthlyFee: { value: "yes", wordless: true, text: `None on Free. Pro is ${STORELIB.proPrice} a month`, code: "lib/billing/plans.ts" },
  perSaleFee: { value: "yes", wordless: true, text: `${STORELIB.freeFee} on Free, ${STORELIB.proFee} on Pro`, code: "lib/payments/fees/defaults.ts" },
  affiliates: { value: "no", text: "Not offered", code: "lib/attribution/touch.ts" },
  licenseKeys: { value: "no", text: "Not offered", code: "lib/products" },
  physical: { value: "yes", text: "Physical products, shipping and stock", code: "lib/platform/physical-commerce.ts", flag: "physical" },
  discordAccess: { value: "no", text: "Not offered", code: "lib/communities" },
  linkCount: { value: "yes", text: "Links, products and email sign up on one page", code: "lib/onepage/types.ts" },
} as const satisfies Record<string, StorelibCell>
