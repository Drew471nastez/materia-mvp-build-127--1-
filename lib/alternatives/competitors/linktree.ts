import type { Competitor } from "../types"
import { CHECKED_ON } from "../checked"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { monthOfFees } from "../examples"

const on = CHECKED_ON
/* Linktree's pricing page changed between checks: its prices, and which plan sells with 0% fees, were read again on this day. */
const rechecked = "2026-10-31" as const

export const linktree: Competitor = {
  slug: "linktree",
  name: "Linktree",
  homepage: "https://linktr.ee",
  categories: ["link-in-bio"],
  summary: "The best known link in bio page, for sharing everything you do from one link, with selling added on paid plans.",
  pricingShort: "Free to $35 a month. Pro and Premium list 0% fees on sales",
  seo: {
    title: "Linktree alternative for selling: Storelib compared on fees",
    description: `Linktree sells from a paid plan with a monthly price. Storelib's OnePage sells on Free for ${STORELIB.freeFee} a sale. Fees, features, and how to move your bio link.`,
    h1: "Storelib as a Linktree alternative",
  },
  intro: [
    "Linktree is the page behind millions of bio links: one address that lists your links, videos, socials and anything else you want followers to find. Most people use it to send traffic somewhere else.",
    "Its users range from musicians and podcasters to brands and small businesses. On paid plans it adds ways to earn, such as selling digital products and earning affiliate commission from partner brands in its Shops feature.",
    "Linktree has a free plan and three paid ones. Its pricing page lists selling with 0% fees on Pro and Premium; Stripe's processing is charged on every sale.",
  ],
  whyStorelib: [
    { text: `Sell from your bio link with no monthly fee. A OnePage on Storelib Free takes ${STORELIB.freeFee} a sale and nothing a month; Linktree's 0% fee comes with a Pro plan at $17 a month.`, code: "lib/onepage/address.ts" },
    { text: "The bio link is the front of a full store: product pages, a creator page and a website share the same products and orders.", code: "lib/sites/plan.ts" },
    { text: "Courses, paid communities and email campaigns live in the same dashboard as the link page.", code: "app/app/courses", flag: "communities", textOff: "Courses and email campaigns live in the same dashboard as the link page." },
  ],
  whenToStay: [
    { text: "Your page is mostly links out to other places, not products you sell. Linktree's free plan does that well.", sources: ["linktree-pricing"], status: "verified" },
    { text: "You sell enough each month that a flat plan with 0% fees costs less than a fee on every sale. The calculator shows where that line is for you.", sources: ["linktree-pricing"], status: "conflicting", note: "Linktree's pricing page lists 0% fees on Pro; a Linktree blog post says 9% on Pro and 0% on Premium." },
    { text: "You earn mainly through Linktree Shops affiliate commission from partner brands.", sources: ["linktree-shops", "linktree-affiliates"], status: "verified" },
  ],
  strengths: [
    { text: "A free plan with unlimited links.", sources: ["linktree-pricing"], status: "verified" },
    { text: "0% fees on sales with Premium, and with Pro according to its pricing page.", sources: ["linktree-pricing", "linktree-blog-fees"], status: "conflicting", note: "The pricing page lists 0% on Pro; a Linktree blog post says 9% on Pro." },
    { text: "Affiliate storefronts with partner brands (Shops), in the US.", sources: ["linktree-shops", "linktree-affiliates"], status: "verified" },
    { text: "Email and phone collection, with subscriber downloads on Pro.", sources: ["linktree-paid-features"], status: "verified" },
  ],
  limits: [
    { text: "Selling with 0% fees needs a paid plan, $17 a month for Pro billed monthly.", sources: ["linktree-pricing"], status: "verified" },
    { text: "On the free plan a sale pays a fee, 12% according to a Linktree blog post.", sources: ["linktree-blog-fees"], status: "unverified", note: "The pricing page does not state the free plan's fee." },
    { text: "Stripe processing on top, typically 2.9% + 30¢ in the US.", sources: ["linktree-fees"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "Selling from the free plan, with no monthly fee.", code: "lib/billing/plans.ts" },
    { text: "Product pages, a creator page and a website behind the same link.", code: "lib/sites/plan.ts" },
    { text: "Courses, discount codes and email campaigns.", code: "app/app/emails" },
  ],
  storelibLimits: [
    { text: "No affiliate storefront with partner brands like Linktree Shops.", code: "lib/attribution/touch.ts" },
    { text: `On Storelib every sale pays a fee, ${STORELIB.proFee} on Pro at the lowest. Linktree's paid plans charge a flat monthly price and list 0% per sale.`, code: "lib/payments/fees/defaults.ts" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "Free, $9, $17 or $35 billed monthly", sources: ["linktree-pricing"], status: "verified" } },
    { id: "per-sale", label: "Fee on digital sales", storelib: SL.perSaleFee, competitor: { value: "yes", text: "0% on Pro and Premium", sources: ["linktree-pricing", "linktree-blog-fees"], status: "conflicting", note: "A Linktree blog post says 9% on Starter and Pro." } },
    { id: "sell-free", label: "Sell on the free plan", storelib: { value: "yes", text: "Yes", code: "lib/billing/plans.ts" }, competitor: { value: "yes", text: "With a fee", sources: ["linktree-blog-fees"], status: "conflicting", note: "A Linktree blog post says every plan can sell; an older help article said Pro or Premium." } },
    { id: "bio", label: "Link in bio page", storelib: SL.linkInBio, competitor: { value: "yes", sources: ["linktree-pricing"], status: "verified" } },
    { id: "digital", label: "Digital products", storelib: SL.digitalProducts, competitor: { value: "yes", sources: ["linktree-digital"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "partial", text: "Through a Kajabi partnership", sources: ["linktree-earn"], status: "verified" } },
    { id: "email", label: "Email collection", storelib: SL.email, competitor: { value: "yes", text: "Collect, download on Pro", sources: ["linktree-paid-features"], status: "verified" } },
    { id: "affiliates", label: "Affiliate storefront", storelib: SL.affiliates, competitor: { value: "yes", text: "Shops, US only", sources: ["linktree-shops"], status: "verified" } },
    { id: "website", label: "Multi page website", storelib: SL.website, competitor: { value: "no", text: "One page", sources: ["linktree-pricing"], status: "verified" } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "partial", text: "Paid plans", sources: ["linktree-paid-features"], status: "verified" } },
    { id: "analytics", label: "Analytics", storelib: SL.analytics, competitor: { value: "partial", text: "Basic on Free, more on paid plans", sources: ["linktree-paid-features"], status: "conflicting", note: "Linktree's pages differ on which plan includes which analytics." } },
  ],
  plans: [
    {
      id: "pro",
      name: "Pro",
      monthlyCents: 1700,
      yearlyMonthlyCents: 1400,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, typically 2.9% + 30¢",
      sellsDigital: true,
      claim: { text: "$17 a month billed monthly, $14 billed yearly, listed with 0% fees on sales", sources: ["linktree-pricing", "linktree-fees"], status: "conflicting", note: "A Linktree blog post says Pro pays 9% of a sale. The calculator uses the pricing page." },
    },
    {
      id: "premium",
      name: "Premium",
      monthlyCents: 3500,
      yearlyMonthlyCents: 3000,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, typically 2.9% + 30¢",
      sellsDigital: true,
      claim: { text: "$35 a month billed monthly, $30 billed yearly, 0% fees on sales", sources: ["linktree-pricing", "linktree-blog-fees", "linktree-fees"], status: "verified" },
    },
    {
      id: "starter",
      name: "Starter",
      monthlyCents: 900,
      yearlyMonthlyCents: 700,
      fee: { percent: 9, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, typically 2.9% + 30¢",
      sellsDigital: false,
      claim: { text: "$9 a month billed monthly, $7 billed yearly; 0% fees are listed from Pro up", sources: ["linktree-pricing", "linktree-blog-fees"], status: "conflicting", note: "Left out of the calculator: Linktree's pages disagree on what Starter pays per sale." },
    },
  ],
  pricingNotes: [
    { text: "Fees are taken before your payout and are not refunded.", sources: ["linktree-digital", "linktree-fees"], status: "verified" },
    { text: "Paid plans cost less billed yearly: $7, $14 and $30 a month.", sources: ["linktree-pricing"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 9, sales: 60 },
  examples: [
    { who: "Creators", title: "A $9 guide from your bio", text: monthOfFees({ priceDollars: 9, sales: 20, name: "Linktree Pro", rate: { percent: 0, fixedCents: 0 }, monthlyCents: 1700 }) },
    { who: "Educators", title: "From a link to a course", text: "A teacher whose bio link points to a course can host the course itself on Storelib, with lessons and progress, and keep the OnePage as the way in." },
    { who: "Sellers", title: "A bio link that became a shop", text: "When the list of links turns into a list of products, a Storelib website gives each product its own page and the OnePage keeps working as the bio link." },
  ],
  switching: [
    { title: "Copy your links", text: "Make a list of the links on your Linktree, in order, and download your subscriber list if you collected one." },
    { title: "Create a free Storelib account", text: "Sign up and choose your name. Your OnePage is at storelib.me/yourname." },
    { title: "Build the OnePage", text: "Add your links, your socials and an email sign up, then add the products you sell. To sell, set up payments with Stripe inside Storelib." },
    { title: "Swap the bio link", text: "Put the OnePage address in your Instagram, TikTok and YouTube bios." },
    { title: "Keep the old page for a while", text: "Leave the Linktree page up with a link to your OnePage until old posts that use it stop sending visitors." },
  ],
  moving: {
    products: "Copy your links into your OnePage in the same order. A product you sold through Linktree is added on Storelib as a digital product with its file.",
    customers: "Download your subscriber list from Linktree if you collected one. Storelib has no list import, so email them your new page from the tool you use now.",
    domain: "Change the link in your bios to storelib.me/yourname. If your Linktree used your own domain, connect that domain to a Storelib website on Pro.",
  },
  faqs: [
    { q: "Is Storelib a link in bio tool like Linktree?", a: "Yes. Your OnePage at storelib.me/yourname holds your links, socials and an email sign up, and it can sell your products directly." },
    { q: "Is selling cheaper on Storelib than on Linktree?", a: `It depends on how much you sell. Linktree Pro is $17 a month billed monthly and lists 0% fees on sales. Storelib Free has no monthly fee and takes ${STORELIB.freeFee} a sale. With a few sales a month Storelib costs less; past a few hundred dollars a month, Linktree's flat price does. The calculator shows the point for your price.` },
    { q: "Can I sell on Storelib's free plan?", a: "Yes. Free can sell digital products and courses with no monthly fee. You add a card only if you upgrade to Pro." },
    { q: "Does Storelib have affiliate products like Linktree Shops?", a: "No. Storelib sells your own products. Linktree Shops is a reason to stay if partner commissions are your income." },
    { q: "Can I use my own domain for the bio link?", a: STORELIB.proCustomDomain ? "Your own domain connects on Pro." : "Not on the current plans." },
  ],
  visuals: ["onepage", "creator", "dashboard"],
  sources: [
    { id: "linktree-pricing", title: "Linktree Free, Starter, Pro and Premium pricing", url: "https://linktr.ee/s/pricing", publisher: "Linktree", checkedOn: rechecked },
    { id: "linktree-fees", title: "About transaction and processing fees (Help Center)", url: "https://linktr.ee/help/en/articles/11410206-understanding-transaction-and-processing-fees-on-linktree", publisher: "Linktree", checkedOn: rechecked },
    { id: "linktree-digital", title: "About selling digital products (Help Center)", url: "https://help.linktr.ee/en/articles/10518645-guide-to-selling-digital-products-on-linktree", publisher: "Linktree", checkedOn: rechecked },
    { id: "linktree-blog-fees", title: "How to sell digital products on Instagram (Linktree blog)", url: "https://linktr.ee/blog/sell-digital-products-instagram", publisher: "Linktree", checkedOn: rechecked },
    { id: "linktree-shops", title: "Affiliate storefront for creators (Shops)", url: "https://linktr.ee/features/shops", publisher: "Linktree", checkedOn: on },
    { id: "linktree-affiliates", title: "About promoting affiliate links (Help Center)", url: "https://help.linktr.ee/en/articles/8619620-how-to-promote-affiliate-links-with-linktree", publisher: "Linktree", checkedOn: on },
    { id: "linktree-paid-features", title: "About paid plan features (Help Center)", url: "https://linktr.ee/help/articles/5434140-an-overview-of-paid-features-available-on-linktree", publisher: "Linktree", checkedOn: rechecked },
    { id: "linktree-earn", title: "How to make money with Linktree", url: "https://linktr.ee/blog/earn-with-linktree", publisher: "Linktree", checkedOn: on },
  ],
  updated: "2026-10-31",
}
