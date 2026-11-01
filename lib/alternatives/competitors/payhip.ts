import type { Competitor } from "../types"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { monthOfFees } from "../examples"

/* Payhip's pages were read on this day. payhip.com answers a script with a block page, so they were read in a browser. */
const on = "2026-10-31" as const

export const payhip: Competitor = {
  slug: "payhip",
  name: "Payhip",
  homepage: "https://payhip.com",
  categories: ["digital-products"],
  summary: "A store for downloads, courses, coaching and memberships that collects and pays EU and UK VAT and US sales tax for you.",
  pricingShort: "Free with a 5% fee, $29 a month for 2%, or $99 a month for 0%",
  seo: {
    title: "Payhip alternative: Storelib compared on fees, tax and tools",
    description: "Payhip takes 5%, 2% or 0% a sale and handles EU VAT and US sales tax. Where it costs less than Storelib, where Storelib fits better, and how to move.",
    h1: "Storelib as a Payhip alternative",
  },
  intro: [
    "Payhip is a store builder for people who sell files, online courses, coaching, memberships and physical goods. You sell from your own Payhip store or from a checkout link you share anywhere.",
    "Its biggest difference from most platforms is tax. For digital sales to the EU and the UK, Payhip acts as your reseller and files the VAT itself, and in the US and Canada it collects and pays sales tax as a marketplace facilitator. Storelib does neither: you are the seller.",
    "Payhip has three plans with the same features. They differ only in the cut Payhip takes: 5% on Free, 2% on Plus and nothing on Pro. Stripe or PayPal charge their own fee on top.",
  ],
  whyStorelib: [
    {
      text: "Run a paid community beside your shop: posts, chat, events and monthly plans, in the same dashboard as your products and orders.",
      code: "app/app/community",
      flag: "communities",
      textOff: "Sell from a link in bio page, a creator page and multi page websites at once, all drawing on the same products and orders.",
    },
    { text: "A link in bio page that sells. Your OnePage at storelib.me/yourname holds your links, socials, an email sign up and your products.", code: "lib/onepage/address.ts" },
    { text: "A website in more than one language. Add a language and its pages and products are translated, and you can read and edit every translation.", code: "lib/markets/auto-translate.ts" },
  ],
  whenToStay: [
    { text: "You sell to buyers in the EU, the UK, the US or Canada and want the platform to deal with the tax. Payhip collects and pays it for you; on Storelib you set and file your own.", sources: ["payhip-tax", "payhip-eu-vat"], status: "verified" },
    { text: `You want the smallest cut. Payhip Free takes 5% with no fixed part, where Storelib Free takes ${STORELIB.freeFee}. Payhip Plus at $29 takes 2%; Storelib Pro at ${STORELIB.proPrice} takes ${STORELIB.proFee}.`, sources: ["payhip-pricing"], status: "verified" },
    { text: "You sell coaching sessions or software with license keys. Payhip does both; Storelib does neither.", sources: ["payhip-features"], status: "verified" },
  ],
  strengths: [
    { text: "Collects, reports and pays digital EU and UK VAT, and US and Canadian sales tax, on your behalf.", sources: ["payhip-pricing", "payhip-tax"], status: "verified" },
    { text: "A free plan with a 5% fee, and every feature on every plan.", sources: ["payhip-pricing"], status: "verified" },
    { text: "Courses with quizzes, certificates, drip content and progress tracking.", sources: ["payhip-features"], status: "verified" },
    { text: "Coaching with scheduling through Zoom and Calendly, and license keys for software.", sources: ["payhip-features"], status: "verified" },
    { text: "Stripe, PayPal, Mollie and Square as payment gateways.", sources: ["payhip-features"], status: "verified" },
  ],
  limits: [
    { text: "The lower cuts come with a monthly plan: $29 a month for 2%, $99 a month for 0%.", sources: ["payhip-pricing"], status: "verified" },
    { text: "Stripe and PayPal charge their standard rates on every sale, on top of Payhip's cut.", sources: ["payhip-pricing"], status: "verified" },
    { text: "Its features page lists no community or forum to sell access to.", sources: ["payhip-features"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "Paid communities with posts, chat and events.", code: "app/app/community", flag: "communities", textOff: "A creator page and websites that share the same products." },
    { text: "A OnePage for your bio link, on the free plan.", code: "lib/onepage/address.ts" },
    { text: "Email to your list with automations, from the dashboard your orders are in.", code: "app/app/emails" },
  ],
  storelibLimits: [
    { text: "Storelib is not a merchant of record. You set the tax your store charges and you file it; Storelib does not collect or pay VAT or sales tax for you.", code: "lib/tax/rules.ts" },
    { text: `Storelib's cut is higher at each level: ${STORELIB.freeFee} on Free and ${STORELIB.proFee} on Pro, against Payhip's 5% and 2%.`, code: "lib/payments/fees/defaults.ts" },
    { text: "No license keys and no booking calendar for coaching calls.", code: "lib/products" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "Free, $29 Plus or $99 Pro", sources: ["payhip-pricing"], status: "verified" } },
    { id: "per-sale", label: "Platform fee per sale", storelib: SL.perSaleFee, competitor: { value: "yes", text: "5% Free, 2% Plus, 0% Pro", sources: ["payhip-pricing"], status: "verified" } },
    { id: "tax", label: "Sales tax and VAT", storelib: SL.tax, competitor: { value: "yes", text: "Payhip collects and pays EU and UK VAT, US and Canadian sales tax", sources: ["payhip-tax", "payhip-eu-vat"], status: "verified" } },
    { id: "digital", label: "Digital products", storelib: SL.digitalProducts, competitor: { value: "yes", text: "Unlimited, any file type", sources: ["payhip-features", "payhip-pricing"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "yes", text: "Quizzes, certificates, drip content", sources: ["payhip-features"], status: "verified" } },
    { id: "memberships", label: "Memberships", storelib: SL.memberships, competitor: { value: "yes", text: "Tiers, trials, monthly or yearly", sources: ["payhip-features"], status: "verified" } },
    { id: "coaching", label: "Coaching sessions", storelib: { value: "no", text: "Not offered", code: "lib/onepage/types.ts" }, competitor: { value: "yes", text: "Zoom and Calendly scheduling", sources: ["payhip-features"], status: "verified" } },
    { id: "license", label: "License keys", storelib: SL.licenseKeys, competitor: { value: "yes", sources: ["payhip-features"], status: "verified" } },
    { id: "physical", label: "Physical products", storelib: SL.physical, competitor: { value: "yes", text: "Stock, orders and shipping", sources: ["payhip-features"], status: "verified" } },
    { id: "website", label: "Website builder", storelib: SL.website, competitor: { value: "yes", text: "Drag and drop store with themes", sources: ["payhip-features"], status: "verified" } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "yes", text: "Every plan", sources: ["payhip-features", "payhip-pricing"], status: "verified" } },
    { id: "email", label: "Email to buyers", storelib: SL.email, competitor: { value: "yes", text: "Updates to customers, buyers added to your list", sources: ["payhip-email"], status: "verified" } },
  ],
  plans: [
    {
      id: "free",
      name: "Free Forever",
      monthlyCents: 0,
      fee: { percent: 5, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe or PayPal at their standard rates, 2.9% + 30¢ for a US card on Stripe",
      sellsDigital: true,
      claim: { text: "No monthly fee, a 5% transaction fee, Stripe or PayPal fees on top", sources: ["payhip-pricing"], status: "verified" },
    },
    {
      id: "plus",
      name: "Plus",
      monthlyCents: 2900,
      fee: { percent: 2, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe or PayPal at their standard rates, 2.9% + 30¢ for a US card on Stripe",
      sellsDigital: true,
      claim: { text: "$29 a month and a 2% transaction fee", sources: ["payhip-pricing"], status: "verified" },
    },
    {
      id: "pro",
      name: "Pro",
      monthlyCents: 9900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe or PayPal at their standard rates, 2.9% + 30¢ for a US card on Stripe",
      sellsDigital: true,
      claim: { text: "$99 a month and no transaction fee", sources: ["payhip-pricing"], status: "verified" },
    },
  ],
  pricingNotes: [
    { text: "Every plan has every feature and no limit on products or revenue; only the cut changes.", sources: ["payhip-pricing"], status: "verified" },
    { text: "Payhip says it deposits your sales to you as soon as each transaction completes.", sources: ["payhip-pricing"], status: "verified" },
    { text: "For EU and UK buyers of digital products Payhip acts as your reseller and reports the VAT each quarter.", sources: ["payhip-eu-vat"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 15, sales: 40 },
  examples: [
    { who: "Creators", title: "A $12 template, thirty times a month", text: `${monthOfFees({ priceDollars: 12, sales: 30, name: "Payhip Free", rate: { percent: 5, fixedCents: 0 } })} On fees alone Payhip is the cheaper of the two here.` },
    { who: "Educators", title: "A course and a community around it", text: "A teacher who wants students to talk to each other between lessons can run the course and a paid community side by side on Storelib, where Payhip lists no community." },
    { who: "Sellers", title: "Selling into Europe", text: "A seller with many EU buyers who does not want to register for VAT is better served by Payhip, which files that VAT itself. On Storelib you would register and file." },
  ],
  switching: [
    { title: "Gather what you have", text: "Collect your product files and course videos from your own copies, and the list of buyers and subscribers you want to tell about the move." },
    { title: "Create a free Storelib account", text: "Sign up and pick your name. Your store is at storelib.com/yourname and your OnePage at storelib.me/yourname." },
    { title: "Connect Stripe", text: "Set up payouts with Stripe inside Storelib so sales reach your bank." },
    { title: "Add your products", text: "Create each product with its price and files, or rebuild a course with its modules and lessons." },
    { title: "Set your tax", text: "Payhip handled VAT and sales tax for you. On Storelib you set the rates your store charges, so check what you owe where your buyers are first." },
    { title: "Point your links at Storelib", text: "Change the links in your bio, emails and posts, and keep your Payhip store open until old links stop sending buyers." },
  ],
  moving: {
    products: "Each Payhip product becomes a Storelib product with its price and files. Courses are rebuilt as modules and lessons. Coaching and license keys have no Storelib version.",
    customers: "Storelib has no customer or list import. Tell past buyers and subscribers about your new store from the email tool you use now.",
    domain: "If your Payhip store used your own domain, connect the same domain to a Storelib website on Pro and update its DNS when you are ready to switch.",
  },
  movingHelp: { products: ["/help/orders-and-payouts/fees"] },
  faqs: [
    { q: "Does Storelib handle VAT for me like Payhip does?", a: "No. Payhip collects and pays digital EU and UK VAT and US and Canadian sales tax for you. On Storelib you are the seller: you set the tax rates your store charges and you file them." },
    { q: "Is Payhip cheaper than Storelib?", a: `On fees per sale, yes, at each level. Payhip Free takes 5% and Storelib Free ${STORELIB.freeFee}; Payhip Plus at $29 takes 2% and Storelib Pro at ${STORELIB.proPrice} takes ${STORELIB.proFee}. Card processing is on top on both.` },
    {
      q: "Can I sell a community on Storelib?",
      a: "Yes. A Storelib community has posts, chat, events and paid plans, monthly or yearly, beside your other products.",
      flag: "communities",
      aOff: "Not today. Storelib sells digital products and courses from a website, a creator page and a link in bio page.",
    },
    { q: "Can I keep my Payhip store while I try Storelib?", a: "Yes. Storelib Free has no monthly fee, so you can set up products on both and move your links over when you are ready." },
  ],
  visuals: ["creator", "onepage", "dashboard"],
  sources: [
    { id: "payhip-pricing", title: "Payhip pricing: Free Forever, Plus and Pro", url: "https://payhip.com/pricing", publisher: "Payhip", checkedOn: on },
    { id: "payhip-features", title: "Payhip features", url: "https://payhip.com/features", publisher: "Payhip", checkedOn: on },
    { id: "payhip-tax", title: "We handle digital EU/UK VAT (VAT and taxes)", url: "https://payhip.com/features/vat-taxes", publisher: "Payhip", checkedOn: on },
    { id: "payhip-eu-vat", title: "We report and pay digital EU and UK VAT", url: "https://payhip.com/eu-vat", publisher: "Payhip", checkedOn: on },
    { id: "payhip-email", title: "Payhip email marketing", url: "https://payhip.com/features/email-marketing", publisher: "Payhip", checkedOn: on },
  ],
  updated: "2026-10-31",
}
