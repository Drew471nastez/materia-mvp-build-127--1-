import type { Competitor } from "../types"
import { CHECKED_ON } from "../checked"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { monthOfFees } from "../examples"

const on = CHECKED_ON

export const linktree: Competitor = {
  slug: "linktree",
  name: "Linktree",
  homepage: "https://linktr.ee",
  categories: ["link-in-bio"],
  summary: "The best known link in bio page, for sharing everything you do from one link, with selling added on paid plans.",
  pricingShort: "Free to $35 a month, 9% to 0% on digital sales",
  seo: {
    title: "Linktree alternative for selling: Storelib compared on fees",
    description: `Linktree takes 9% of digital product sales on Pro and 0% on Premium at $35 a month. Storelib's OnePage sells with ${STORELIB.freeFee} on Free. Fees, features and switching.`,
    h1: "Storelib as a Linktree alternative",
  },
  intro: [
    "Linktree is the page behind millions of bio links: one address that lists your links, videos, socials and anything else you want followers to find. Most people use it to send traffic somewhere else.",
    "Its users range from musicians and podcasters to brands and small businesses. On paid plans it adds ways to earn, such as selling digital products and earning affiliate commission from partner brands in its Shops feature.",
    "Linktree has a free plan and three paid ones. Selling a digital product costs a share of the sale that depends on the plan, plus Stripe's processing.",
  ],
  whyStorelib: [
    { text: `Sell from your bio link on the free plan. A OnePage on Storelib Free takes ${STORELIB.freeFee} a sale; Linktree's help center says selling digital products needs its Pro or Premium plan.`, code: "lib/onepage/address.ts" },
    { text: "The bio link is the front of a full store: product pages, a creator page and a website share the same products and orders.", code: "lib/sites/plan.ts" },
    { text: "Courses, memberships and email campaigns live in the same dashboard as the link page.", code: "app/app/courses" },
  ],
  whenToStay: [
    { text: "Your page is mostly links out to other places, not products you sell. Linktree's free plan does that well.", sources: ["linktree-pricing"], status: "verified" },
    { text: "You earn mainly through Linktree Shops affiliate commission from partner brands.", sources: ["linktree-shops", "linktree-affiliates"], status: "verified" },
  ],
  strengths: [
    { text: "A free plan with unlimited links.", sources: ["linktree-pricing"], status: "verified" },
    { text: "0% seller fee on digital products with Premium.", sources: ["linktree-pricing", "linktree-blog-fees"], status: "verified" },
    { text: "Affiliate storefronts with partner brands (Shops), in the US.", sources: ["linktree-shops", "linktree-affiliates"], status: "verified" },
    { text: "Email and phone collection, with subscriber downloads on Pro.", sources: ["linktree-paid-features"], status: "verified" },
  ],
  limits: [
    { text: "Selling digital products needs Pro or Premium, and only in some countries.", sources: ["linktree-digital"], status: "conflicting", note: "A Linktree blog post says every plan can sell; the help center, which is newer, says Pro or Premium." },
    { text: "9% of each digital sale on Starter and Pro.", sources: ["linktree-pricing", "linktree-blog-fees"], status: "verified" },
    { text: "Stripe processing on top, typically 2.9% + 30¢ in the US.", sources: ["linktree-fees"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "Selling from the free plan, with no monthly fee.", code: "lib/billing/plans.ts" },
    { text: "Product pages, a creator page and a website behind the same link.", code: "lib/sites/plan.ts" },
    { text: "Courses, memberships, discount codes and email campaigns.", code: "app/app/emails" },
  ],
  storelibLimits: [
    { text: "No affiliate storefront with partner brands like Linktree Shops.", code: "lib/attribution/touch.ts" },
    { text: `On Storelib every sale pays a fee, ${STORELIB.proFee} on Pro at the lowest. Linktree Premium charges a flat $35 with 0% per sale.`, code: "lib/payments/fees/defaults.ts" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "Free, $8, $15 or $35 billed monthly", sources: ["linktree-pricing"], status: "conflicting", note: "An older copy of the pricing page lists other prices." } },
    { id: "per-sale", label: "Fee on digital sales", storelib: SL.perSaleFee, competitor: { value: "yes", text: "9% on Starter and Pro, 0% on Premium", sources: ["linktree-pricing", "linktree-blog-fees"], status: "verified" } },
    { id: "sell-free", label: "Sell on the free plan", storelib: { value: "yes", text: "Yes", code: "lib/billing/plans.ts" }, competitor: { value: "no", text: "Pro or Premium", sources: ["linktree-digital"], status: "conflicting", note: "Linktree's blog and help center disagree." } },
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
      monthlyCents: 1500,
      yearlyMonthlyCents: 1200,
      fee: { percent: 9, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, typically 2.9% + 30¢",
      sellsDigital: true,
      claim: { text: "$15 a month billed monthly, $12 billed yearly, 9% seller fee on digital products", sources: ["linktree-pricing", "linktree-blog-fees", "linktree-fees"], status: "verified" },
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
      claim: { text: "$35 a month billed monthly, $30 billed yearly, 0% seller fee on digital products", sources: ["linktree-pricing", "linktree-blog-fees", "linktree-fees"], status: "verified" },
    },
    {
      id: "starter",
      name: "Starter",
      monthlyCents: 800,
      yearlyMonthlyCents: 600,
      fee: { percent: 9, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, typically 2.9% + 30¢",
      sellsDigital: false,
      claim: { text: "$8 a month billed monthly; selling digital products is listed for Pro and Premium only", sources: ["linktree-pricing", "linktree-digital"], status: "conflicting", note: "Left out of the calculator: Linktree's help center says Starter cannot sell digital products." },
    },
  ],
  pricingNotes: [
    { text: "Fees are taken before your payout and are not refunded.", sources: ["linktree-digital", "linktree-fees"], status: "verified" },
    { text: "Paid plans cost less billed yearly: $6, $12 and $30 a month.", sources: ["linktree-pricing"], status: "conflicting", note: "An older copy of the pricing page shows different yearly prices." },
  ],
  calculatorDefaults: { priceDollars: 9, sales: 60 },
  examples: [
    { who: "Creators", title: "A $9 guide from your bio", text: monthOfFees({ priceDollars: 9, sales: 60, name: "Linktree Pro", rate: { percent: 9, fixedCents: 0 }, monthlyCents: 1500 }) },
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
  faqs: [
    { q: "Is Storelib a link in bio tool like Linktree?", a: "Yes. Your OnePage at storelib.me/yourname holds your links, socials and an email sign up, and it can sell your products directly." },
    { q: "Is selling cheaper on Storelib than on Linktree?", a: `For most sellers. Linktree Pro is $15 a month and takes 9% of each digital sale. Storelib Free has no monthly fee and takes ${STORELIB.freeFee}. Linktree Premium at $35 takes 0%, so a seller with high monthly sales can pay less there. The calculator shows the point.` },
    { q: "Can I sell on Storelib's free plan?", a: "Yes. Free can sell digital products, courses and memberships. You add a card only if you upgrade to Pro." },
    { q: "Does Storelib have affiliate products like Linktree Shops?", a: "No. Storelib sells your own products. Linktree Shops is a reason to stay if partner commissions are your income." },
    { q: "Can I use my own domain for the bio link?", a: STORELIB.proCustomDomain ? "Your own domain connects on Pro." : "Not on the current plans." },
  ],
  visuals: ["onepage", "creator", "dashboard"],
  sources: [
    { id: "linktree-pricing", title: "Linktree Free, Starter, Pro and Premium pricing", url: "https://linktr.ee/s/pricing", publisher: "Linktree", checkedOn: on },
    { id: "linktree-fees", title: "About transaction and processing fees (Help Center)", url: "https://linktr.ee/help/en/articles/11410206-understanding-transaction-and-processing-fees-on-linktree", publisher: "Linktree", checkedOn: on },
    { id: "linktree-digital", title: "About selling digital products (Help Center)", url: "https://help.linktr.ee/en/articles/10518645-guide-to-selling-digital-products-on-linktree", publisher: "Linktree", checkedOn: on },
    { id: "linktree-blog-fees", title: "How to sell digital products on Instagram (Linktree blog)", url: "https://linktr.ee/blog/sell-digital-products-instagram", publisher: "Linktree", checkedOn: on },
    { id: "linktree-shops", title: "Affiliate storefront for creators (Shops)", url: "https://linktr.ee/features/shops", publisher: "Linktree", checkedOn: on },
    { id: "linktree-affiliates", title: "About promoting affiliate links (Help Center)", url: "https://help.linktr.ee/en/articles/8619620-how-to-promote-affiliate-links-with-linktree", publisher: "Linktree", checkedOn: on },
    { id: "linktree-paid-features", title: "About paid plan features (Help Center)", url: "https://linktr.ee/help/articles/5434140-an-overview-of-paid-features-available-on-linktree", publisher: "Linktree", checkedOn: on },
    { id: "linktree-earn", title: "How to make money with Linktree", url: "https://linktr.ee/blog/earn-with-linktree", publisher: "Linktree", checkedOn: on },
  ],
  updated: on,
}
