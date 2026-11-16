/**
 * ===========================================================================
 *  WHAT STORELIB IS, DOES AND COSTS, IN ONE PLACE, READ FROM THE CODE
 * ===========================================================================
 * The marketing pages that explain Storelib to a person, a search engine or
 * an AI assistant (/features, /sell/<use case>, /alternatives) read their
 * facts from here, and every fact here is read from the code that makes it
 * true. Nothing is typed twice:
 *
 *   prices        lib/billing/plans.ts          (PRO_PRICE_CENTS, the plan names)
 *   fees          lib/payments/fees/*           (the rates and the $0.25 checkout charges)
 *   site limits   lib/sites/plan.ts             (websites, pages, own domain)
 *   storage       lib/storage/plans.ts          (storage, files per product)
 *   communities   lib/communities/plan-limit.ts (how many on Free)
 *
 * Each feature names the file that provides it (`source`), and
 * tests/content-r45.test.ts fails when a path stops existing, or when a price
 * or a fee here stops matching checkout. A feature that waits behind a
 * platform switch names it (`flag`), and a page draws it as not offered while
 * the switch is off (lib/alternatives/flags.ts reads the switches).
 *
 * WHAT IS LEFT OUT IS LEFT OUT ON PURPOSE. A thing Storelib does not do is
 * said in `LIMITATIONS`, plainly. A thing that could not be confirmed from
 * the code is not here at all.
 *
 * Pure and client safe: tables only, no database.
 */
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { CODE_FEE_RULE_VERSION } from "@/lib/payments/fees/defaults"
import { FREE_MICRO_RATE, FREE_STANDARD_RATE, PAID_MICRO_RATE, PAID_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, PRO_YEARLY_MONTHLY_CENTS, YEARLY_BILLING_LIVE, formatPlanPrice, planDisplayName } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"
import { FREE_COMMUNITY_LIMIT } from "@/lib/communities/plan-limit"
import { MAX_UPLOAD_BYTES, formatLimit } from "@/lib/security/uploads/policy"
import { CROSS_BORDER_REGION } from "@/lib/payments/stripe/payout-regions"

/** The day these facts were last read against the code. Pages print it as "Updated <Month YYYY>". */
export const FACTS_UPDATED = "2026-10-31"

/** "October 2026", the way the pages date themselves. */
export function monthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  return `${months[(m ?? 1) - 1]} ${y}`
}

/* ── Plans and prices ─────────────────────────────────────────────────── */

export type FactPlanId = "free" | "pro"

/** The plan id checkout and the fee rules use for each plan a person can pick. */
export const PLAN_CODE_ID: Record<FactPlanId, "free" | typeof PRO_CHECKOUT_PLAN_ID> = { free: "free", pro: PRO_CHECKOUT_PLAN_ID }

const usd = CURRENCY_FEE_RULES.USD
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

export interface PlanFact {
  id: FactPlanId
  /** The name a person reads (lib/billing/plans planDisplayName). */
  name: string
  /** What a month costs, in US cents (lib/billing/plans PRO_PRICE_CENTS). */
  monthlyCents: number
  /** "$29", "$0". */
  price: string
  /** Storelib's rate on an order at or above the small order line (lib/payments/fees/config). */
  rate: number
  /** The rate under the small order line, which has no fixed part. */
  smallOrderRate: number
  /** "5% + $0.25". */
  feeLabel: string
  websites: number
  pagesPerWebsite: number
  ownDomain: boolean
  removeBranding: boolean
  /** "1 GB" (lib/storage/plans storageQuotaBytes). */
  storage: string
  filesPerProduct: number
  /** null is no limit (lib/communities/plan-limit). */
  communities: number | null
}

function planFact(id: FactPlanId): PlanFact {
  const code = PLAN_CODE_ID[id]
  const sites = siteLimits(code)
  const storage = PLAN_LIMITS[code]
  const rate = id === "free" ? FREE_STANDARD_RATE : PAID_STANDARD_RATE
  return {
    id,
    name: planDisplayName(code),
    monthlyCents: id === "free" ? 0 : PRO_PRICE_CENTS,
    price: formatPlanPrice(id === "free" ? 0 : PRO_PRICE_CENTS),
    rate,
    smallOrderRate: id === "free" ? FREE_MICRO_RATE : PAID_MICRO_RATE,
    feeLabel: `${ratePercentLabel(rate)} + ${dollars(usd.fixedFeeMinor)}`,
    websites: sites.maxSites,
    pagesPerWebsite: sites.maxPages,
    ownDomain: sites.customDomain,
    removeBranding: sites.removeBranding,
    storage: formatBytes(storage.storageQuotaBytes),
    filesPerProduct: storage.maxFilesPerProduct,
    communities: id === "free" ? FREE_COMMUNITY_LIMIT : null,
  }
}

/** "10 GB": the most one product file may be, on every plan, as the upload routes enforce it (lib/security/uploads/policy). */
export const PRODUCT_FILE_LIMIT = formatLimit(MAX_UPLOAD_BYTES.product_file)

export const PLANS: Record<FactPlanId, PlanFact> = { free: planFact("free"), pro: planFact("pro") }

/**
 * Paying yearly is not on sale yet (lib/billing/plans YEARLY_BILLING_LIVE), so
 * no page offers it. When it opens this carries the monthly equivalent.
 */
export const PRO_YEARLY_MONTHLY_PRICE: string | null = YEARLY_BILLING_LIVE ? formatPlanPrice(PRO_YEARLY_MONTHLY_CENTS) : null

/* ── Fees ─────────────────────────────────────────────────────────────── */

export const FEES = {
  /** The rules checkout falls back to, and that run-now part 80 activates in the database (lib/payments/fees/defaults). */
  ruleVersion: CODE_FEE_RULE_VERSION,
  /** "$0.25": added to every order at or above `smallOrderBelow`. */
  fixed: dollars(usd.fixedFeeMinor),
  fixedCents: usd.fixedFeeMinor,
  /** "$4.00": under it, the small order rate applies and the $0.25 does not. */
  smallOrderBelow: dollars(usd.microThresholdMinor),
  smallOrderBelowCents: usd.microThresholdMinor,
  /** Stripe's own processing fee is separate and applies on every plan (lib/billing/plans PLAN_FOOTNOTE). Storelib does not set it. */
  stripeProcessingExtra: true,
  /** The fee depends on the price and the plan only, so a sale through Explore pays the same as a direct one (lib/payments/fees/engine). */
  sameFeeOnExplore: true,
} as const

/** Grow's lower rate covers its price from about this much in monthly sales, rounded up to $10 (the same sum as lib/billing/plans planQuestions). */
export function proBreakEvenDollars(): number {
  const saved = FREE_STANDARD_RATE - PAID_STANDARD_RATE
  return saved > 0 ? Math.ceil(PRO_PRICE_CENTS / 100 / saved / 10) * 10 : 0
}

export interface SaleBreakdown {
  priceCents: number
  currency: string
  plan: FactPlanId
  storelibFeeCents: number
  /** What is left after Storelib's fee, before Stripe's processing fee. */
  afterStorelibCents: number
  tier: "standard" | "micro"
}

/**
 * ONE SALE, WORKED OUT THE WAY CHECKOUT WORKS IT OUT. The same function
 * checkout calls (lib/payments/fees/calculate calculateStorelibFee, through
 * lib/billing/fee-calculator calculatePlatformFee), with the code's fee rules.
 * Stripe's fee is not in it: it is Stripe's, it depends on the card and the
 * country, and a page says so beside the figure.
 */
export function saleBreakdown(priceCents: number, plan: FactPlanId, currency = "USD"): SaleBreakdown {
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency, sellerPlan: plan === "free" ? "free" : "paid" })
  return { priceCents, currency, plan, storelibFeeCents: fee.totalStorelibFeeMinor, afterStorelibCents: fee.creatorProceedsMinor, tier: fee.pricingTier }
}

/** "$29", "$1.45": whole dollars without cents. */
export function usdText(cents: number): string {
  const d = cents / 100
  return Number.isInteger(d) ? `$${d.toLocaleString("en-US")}` : `$${d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/* ── Payouts ──────────────────────────────────────────────────────────── */

export const PAYOUTS = {
  /** Every payment is a Stripe destination charge to the creator's Connect account (lib/memberships/billing.ts says the same of subscriptions). */
  method: "Stripe Connect",
  /** Countries Stripe can pay a creator in from Storelib (lib/payments/stripe/payout-regions). */
  regions: "the US, the UK, the EEA, Canada and Switzerland",
  regionCount: CROSS_BORDER_REGION.size,
  source: "lib/payments/stripe/payout-regions.ts",
} as const

/* ── Features ─────────────────────────────────────────────────────────── */

/** A platform switch a feature waits behind (lib/alternatives/flags.ts). */
export type FactFlag = "communities" | "explore" | "physical"

export type FactStatus = "yes" | "partial" | "no"

export interface Fact {
  id: string
  label: string
  status: FactStatus
  /** One or two plain sentences. */
  text: string
  /** The file or folder in this repository that provides it. */
  source: string
  /** A Help Center article about it, as /help/<category>/<slug> (lib/help/articles). */
  help?: string
  flag?: FactFlag
}

const P = PLANS

/** What a seller can sell. */
export const PRODUCT_TYPES: readonly Fact[] = [
  {
    id: "digital",
    label: "Digital downloads",
    status: "yes",
    text: `Files people download: ebooks, templates, presets, sample packs, fonts. Unlimited products on every plan, up to ${P.free.filesPerProduct} files each on Free and ${P.pro.filesPerProduct} on Grow, each file up to ${PRODUCT_FILE_LIMIT}.`,
    source: "lib/storage/plans.ts",
    help: "/help/products/files-and-delivery",
  },
  {
    id: "courses",
    label: "Video courses",
    status: "yes",
    text: "Modules and lessons with uploaded video or a YouTube or Vimeo link, captions, files on each lesson, free preview lessons and each student's progress.",
    source: "lib/courses/types.ts",
  },
  {
    id: "communities",
    label: "Communities",
    status: "yes",
    text: `Free or paid, public or private, with a feed, chat, announcements, resources and events. ${P.free.communities} communities on Free, as many as you like on Grow.`,
    source: "lib/communities/plan-limit.ts",
    flag: "communities",
  },
  {
    id: "memberships",
    label: "Memberships and subscriptions",
    status: "partial",
    text: "Recurring payments are sold as paid community plans, monthly or yearly, billed through Stripe. A subscription to a single file or product is not offered as a new product type.",
    source: "app/(storelib)/app/products/new/product-kinds.ts",
    flag: "communities",
  },
  {
    id: "physical",
    label: "Physical products",
    status: "yes",
    text: "Things you ship, with variants, stock, shipping zones and rates, and tax rates you set.",
    source: "lib/platform/physical-commerce.ts",
    flag: "physical",
  },
  {
    id: "coaching",
    label: "Coaching calls and bookings",
    status: "no",
    text: "There is no booking calendar or call scheduling. A OnePage can embed a Calendly page.",
    source: "lib/onepage/types.ts",
  },
]

/** Where a seller's products are shown and sold. */
export const STOREFRONTS: readonly Fact[] = [
  {
    id: "website",
    label: "Website builder",
    status: "yes",
    text: `Multi page websites with themes, sections and a store. ${P.free.websites} websites of ${P.free.pagesPerWebsite} pages on Free, ${P.pro.websites} of ${P.pro.pagesPerWebsite} pages on Grow.`,
    source: "lib/sites/plan.ts",
    help: "/help/website-builder/build-your-website",
  },
  {
    id: "domain",
    label: "Your own domain",
    status: P.free.ownDomain ? "yes" : "partial",
    text: P.free.ownDomain ? "Connect a domain you own on every plan." : "Connect a domain you own on Grow. On Free your website is at yourname.storelib.com.",
    source: "lib/sites/plan.ts",
    help: "/help/website-builder/custom-domain",
  },
  {
    id: "onepage",
    label: "OnePage (link in bio)",
    status: "yes",
    text: "A link in bio page at storelib.me/yourname with links, socials, an email sign up and your products, sold right there.",
    source: "lib/onepage/address.ts",
    help: "/help/website-builder/onepage",
  },
  {
    id: "creator-page",
    label: "Creator page",
    status: "yes",
    text: "A store page at storelib.com/yourname with every product you publish.",
    source: "app/(storelib)/(marketing)/[sellername]/page.tsx",
    help: "/help/website-builder/creator-page-website-onepage",
  },
  {
    id: "explore",
    label: "Explore marketplace",
    status: "yes",
    text: "Products can be listed in Explore, Storelib's marketplace. A sale there pays the same fee as a direct sale.",
    source: "lib/platform/explore-marketplace.ts",
    flag: "explore",
  },
  {
    id: "shopify-themes",
    label: "Shopify theme import",
    status: "partial",
    text: "Upload a Shopify theme's zip and it becomes a Storelib website theme. Most of a theme comes across; the Developer Hub lists what does not.",
    source: "lib/storelib-theme/shopify/convert.ts",
  },
  {
    id: "translations",
    label: "Translations",
    status: "yes",
    text: "Add a language to your website and its pages and products are translated. You can read and edit every translation.",
    source: "lib/markets/auto-translate.ts",
    help: "/help/website-builder/translate-your-website",
  },
  {
    id: "currencies",
    label: "More currencies",
    status: "partial",
    text: "Your website can show prices in a visitor's own currency and charge in it. Explore, the creator page and community plans sell in US dollars.",
    source: "lib/markets/pricing.ts",
    help: "/help/website-builder/sell-in-more-currencies",
  },
]

/** Selling and marketing tools. */
export const SELLING_TOOLS: readonly Fact[] = [
  {
    id: "email",
    label: "Email marketing",
    status: "yes",
    text: "Subscribers, emails to your list and automations, from the same dashboard as your orders.",
    source: "app/(storelib)/app/emails",
    help: "/help/email/send-an-email",
  },
  {
    id: "reviews",
    label: "Storelib Reviews",
    status: "yes",
    text: "A review request email can go to buyers a few days after they buy, and their reviews show on your product pages.",
    source: "lib/reviews/app-settings.ts",
  },
  {
    id: "coupons",
    label: "Discount codes",
    status: "yes",
    text: "Codes for a percent or an amount off.",
    source: "app/(storelib)/app/coupons",
    help: "/help/products/coupons",
  },
  {
    id: "offers",
    label: "Bundles, upsells and quantity breaks",
    status: "yes",
    text: "Sets of products at a discount, a product suggested in the cart and at checkout, and tiers like Buy 2 get 1 free.",
    source: "app/(storelib)/app/offers",
    help: "/help/products/offers",
  },
  {
    id: "pwyw",
    label: "Pay what you want",
    status: "yes",
    text: "Let buyers choose the price above a minimum you set.",
    source: "lib/checkout/pricing.ts",
    help: "/help/products/pricing",
  },
  {
    id: "variants",
    label: "Variants",
    status: "yes",
    text: "Versions of one product, such as a personal and a commercial license, each with its own price and files.",
    source: "app/(storelib)/app/products/new/variant-save.ts",
    help: "/help/products/variants",
  },
  {
    id: "analytics",
    label: "Analytics",
    status: "yes",
    text: "Visitors, where they came from, and sales.",
    source: "app/(storelib)/app/analytics",
  },
  {
    id: "gumroad-import",
    label: "Gumroad import",
    status: "partial",
    text: "Bring digital products over from Gumroad with an access token. They arrive as drafts; you upload the files again.",
    source: "app/(storelib)/app/products/import/gumroad",
  },
  {
    id: "ios-app",
    label: "iPhone app",
    status: "yes",
    text: "Storelib is on the App Store for iPhone and iPad.",
    source: "capacitor.config.ts",
  },
]

/** What Storelib does not do. Said plainly, because a buyer of Storelib should know before they sign up. */
export const LIMITATIONS: readonly Fact[] = [
  {
    id: "mor",
    label: "Not a merchant of record",
    status: "no",
    text: "You are the seller. You set the tax rates your store charges; Storelib does not collect or file sales tax or VAT for you.",
    source: "lib/tax/rules.ts",
  },
  {
    id: "license-keys",
    label: "No license keys",
    status: "no",
    text: "There are no software license keys or a key check API.",
    source: "lib/products",
  },
  {
    id: "affiliates",
    label: "No affiliate program for sellers",
    status: "no",
    text: "You cannot give other people a commission for selling your products.",
    source: "lib/attribution/touch.ts",
  },
  {
    id: "bookings",
    label: "No bookings",
    status: "no",
    text: "No booking calendar or paid call scheduling.",
    source: "lib/onepage/types.ts",
  },
  {
    id: "payout-regions",
    label: "Payouts in some countries only",
    status: "partial",
    text: `Payouts go through Stripe to banks in ${PAYOUTS.regions}.`,
    source: PAYOUTS.source,
  },
  {
    id: "stripe-fee",
    label: "Stripe's fee is extra",
    status: "partial",
    text: "Stripe's card processing fee is charged on every plan, on top of Storelib's fee.",
    source: "lib/billing/plans.ts",
  },
  {
    id: "android",
    label: "No Android app yet",
    status: "no",
    text: "The Android app is not in the Play Store yet. On Android, Storelib works in the browser.",
    source: "lib/platform/open-in-app.ts",
  },
]

export const ALL_FACTS: readonly Fact[] = [...PRODUCT_TYPES, ...STOREFRONTS, ...SELLING_TOOLS, ...LIMITATIONS]

export function fact(id: string): Fact {
  const f = ALL_FACTS.find((x) => x.id === id)
  if (!f) throw new Error(`No Storelib fact called ${id}`)
  return f
}

/** Who Storelib is for, in one sentence, for the pages that introduce it. */
export const WHO_FOR =
  "Storelib is for people who sell what they make to an audience they already have: files, courses, a paid community or physical goods, from a website, a store page or a link in bio."

/** The one paragraph a page, a search result or an assistant can quote. A thing behind a switch that is off is left out of it. */
export function storelibSummary(flags?: Partial<Record<FactFlag, boolean>>): string {
  const sells = ["digital products", "courses", ...(flags?.communities === false ? [] : ["communities"]), ...(flags?.physical === false ? [] : ["physical goods"])]
  const list = `${sells.slice(0, -1).join(", ")} and ${sells.at(-1)}`
  return `Storelib is a platform for selling ${list} from your own website, a creator page and a link in bio page. Free has no monthly fee and takes ${P.free.feeLabel} a sale. Grow costs ${P.pro.price} a month and takes ${P.pro.feeLabel}. Stripe's card processing is extra on both, and payouts go to your bank through Stripe.`
}
