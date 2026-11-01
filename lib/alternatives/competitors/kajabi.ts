import type { Competitor } from "../types"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { monthOfFees } from "../examples"
import { MONTHLY_EMAILS } from "@/lib/email-campaigns/limits"

const on = "2026-10-31" as const
const kajabiPayments = "Kajabi Payments, 2.9% + 30¢ for a US business"

export const kajabi: Competitor = {
  slug: "kajabi",
  name: "Kajabi",
  homepage: "https://www.kajabi.com",
  categories: ["digital-products", "communities"],
  summary: "An all in one platform for course and coaching businesses, with email, funnels and a community, from $179 a month.",
  pricingShort: "$179 to $499 a month billed monthly, no cut of sales",
  seo: {
    title: "Kajabi alternative with no monthly fee: Storelib compared",
    description: `Kajabi starts at $179 a month and takes no cut. Storelib starts free at ${STORELIB.freeFee} a sale. Where each costs less, what Kajabi does better, and moving.`,
    h1: "Storelib as a Kajabi alternative",
  },
  intro: [
    "Kajabi is built for experts who sell what they know: courses, coaching, memberships, communities, newsletters and podcasts, with the email, funnels and website to sell them from. Its own FAQ describes it as the email tool, the website, the community and the checkout in one.",
    "Its plans start at $179 a month billed monthly, or $143 billed yearly. Kajabi takes no share of your revenue on any plan; you pay the plan and a card processing fee through Kajabi Payments.",
    "The difference from Storelib is mostly the shape of the bill. Kajabi is a high flat price with everything included. Storelib has no monthly fee on Free and takes a cut of each sale instead, so it costs less until your sales are large.",
  ],
  whyStorelib: [
    { text: `Start with no monthly fee. Storelib Free charges ${STORELIB.freeFee} a sale and nothing a month; Kajabi's cheapest plan is $179 a month before your first sale.`, code: "lib/billing/plans.ts" },
    { text: "No cap on products. Every Storelib plan sells as many products as you like; Kajabi Basic allows 5.", code: "lib/billing/plans.ts" },
    { text: "A link in bio page and a creator page on top of your website, all selling the same products.", code: "lib/onepage/address.ts" },
  ],
  whenToStay: [
    { text: "Your business runs on courses, coaching and email sequences together. Kajabi has cohort courses, video transcriptions and translations, coaching, unlimited marketing emails and funnels in one place.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "You sell enough that no cut of sales beats a fee on each one. Kajabi takes no revenue share; the calculator shows where that line falls for your price.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "You want your own branded app in the App Store. Kajabi includes one on Pro.", sources: ["kajabi-pricing"], status: "verified" },
  ],
  strengths: [
    { text: "No revenue share on any plan. You pay the plan and card processing.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Unlimited marketing emails, landing pages and funnels on every plan.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Cohort courses, video transcriptions and translations, and coaching, alongside courses and memberships.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Affiliate programs for your own products on Growth and Pro.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Your own domain on every plan, and a 30 day money back guarantee.", sources: ["kajabi-pricing"], status: "verified" },
  ],
  limits: [
    { text: "The cheapest plan is $179 a month billed monthly, $143 a month billed yearly.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Basic is capped at 5 products, 2,500 contacts, 1 website and 1 community.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Removing Kajabi branding needs Growth, at $249 a month billed monthly.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Using another card processor where Kajabi Payments is offered adds 2% on Basic, 1% on Growth or 0.5% on Pro, on top of that processor's fee.", sources: ["kajabi-pricing", "kajabi-fees"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "A free plan that sells, with no monthly fee and no card needed to start.", code: "lib/billing/plans.ts" },
    { text: `${STORELIB.freeSites} websites on Free and ${STORELIB.proSites} on Pro, each with a store.`, code: "lib/sites/plan.ts" },
    { text: "Physical products with stock and shipping, next to your courses.", code: "lib/platform/physical-commerce.ts", flag: "physical", textOff: "A OnePage at storelib.me/yourname for your bio link." },
  ],
  storelibLimits: [
    { text: "Storelib's courses have lessons, video, captions and progress, but no cohorts, quizzes or certificates.", code: "lib/courses/types.ts" },
    { text: "No affiliate program for your products, and no booking calendar for coaching calls.", code: "lib/attribution/touch.ts" },
    { text: `Campaign emails are capped at ${MONTHLY_EMAILS.free.toLocaleString("en-US")} a month on Free and ${MONTHLY_EMAILS.growth.toLocaleString("en-US")} on Pro. Kajabi's marketing emails are unlimited.`, code: "lib/email-campaigns/limits.ts" },
    { text: `Every sale pays a fee, ${STORELIB.proFee} on Pro at the lowest. At high sales Kajabi's flat price costs less.`, code: "lib/payments/fees/defaults.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "$179, $249 or $499 billed monthly", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "per-sale", label: "Platform fee per sale", storelib: SL.perSaleFee, competitor: { value: "yes", text: "None, card processing only", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "digital", label: "Products", storelib: SL.digitalProducts, competitor: { value: "partial", text: "5 on Basic, 50 on Growth, unlimited on Pro", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "yes", text: "Cohort courses, transcriptions and translations", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "community", label: "Community", storelib: SL.communities, competitor: { value: "yes", text: "1 on Basic and Growth, 3 on Pro", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "coaching", label: "Coaching", storelib: { value: "no", text: "Not offered", code: "lib/onepage/types.ts" }, competitor: { value: "yes", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "email", label: "Email campaigns", storelib: SL.email, competitor: { value: "yes", text: "Unlimited emails, 2,500 to 100,000 contacts", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "affiliates", label: "Affiliates", storelib: SL.affiliates, competitor: { value: "partial", text: "Growth and Pro", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "website", label: "Websites", storelib: SL.website, competitor: { value: "yes", text: "1 on Basic and Growth, 3 on Pro", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "yes", text: "Every plan", sources: ["kajabi-pricing"], status: "verified" } },
    { id: "branding", label: "Remove the platform's branding", storelib: SL.removeBranding, competitor: { value: "partial", text: "Growth and Pro", sources: ["kajabi-pricing"], status: "verified" } },
  ],
  plans: [
    {
      id: "basic",
      name: "Basic",
      monthlyCents: 17900,
      yearlyMonthlyCents: 14300,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: kajabiPayments,
      sellsDigital: true,
      claim: { text: "$179 a month billed monthly, $143 billed yearly, no revenue share, Kajabi Payments at 2.9% + 30¢ in the US", sources: ["kajabi-pricing", "kajabi-fees"], status: "verified" },
    },
    {
      id: "growth",
      name: "Growth",
      monthlyCents: 24900,
      yearlyMonthlyCents: 19900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.8, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Kajabi Payments, 2.8% + 30¢ for a US business",
      sellsDigital: true,
      claim: { text: "$249 a month billed monthly, $199 billed yearly, Kajabi Payments at 2.8% + 30¢ in the US", sources: ["kajabi-pricing", "kajabi-fees"], status: "verified" },
    },
    {
      id: "pro",
      name: "Pro",
      monthlyCents: 49900,
      yearlyMonthlyCents: 39900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.7, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Kajabi Payments, 2.7% + 30¢ for a US business",
      sellsDigital: true,
      claim: { text: "$499 a month billed monthly, $399 billed yearly, Kajabi Payments at 2.7% + 30¢ in the US", sources: ["kajabi-pricing", "kajabi-fees"], status: "verified" },
    },
  ],
  pricingNotes: [
    { text: "The card rates are for businesses in the US. Kajabi Payments is offered in Australia, Canada, the UAE, the UK, the US and some European countries, at each country's own rates.", sources: ["kajabi-fees"], status: "verified" },
    { text: "Contacts beyond your plan come in blocks of 25,000 for $125 a month.", sources: ["kajabi-pricing"], status: "verified" },
    { text: "Billed yearly, the plans cost $143, $199 and $399 a month.", sources: ["kajabi-pricing"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 49, sales: 40 },
  examples: [
    { who: "Educators", title: "A $49 course, forty students a month", text: monthOfFees({ priceDollars: 49, sales: 40, name: "Kajabi Basic", rate: { percent: 0, fixedCents: 0 }, monthlyCents: 17900 }) },
    { who: "Creators", title: "Testing a first product", text: "Someone with a small audience trying a first guide or mini course pays nothing a month on Storelib Free until it sells, where Kajabi's plan is due from the first day after the trial." },
    { who: "Sellers", title: "A coaching business with a long email funnel", text: "A coach whose sales come from booked calls and multi step email funnels is better served by Kajabi, which has coaching and funnels that Storelib does not." },
  ],
  switching: [
    { title: "List what you sell", text: "Write down each Kajabi product, its price and what a buyer gets, and save your course videos and files from your own copies." },
    { title: "Create a free Storelib account", text: "Sign up and choose your name. Nothing to pay while you set up." },
    { title: "Connect Stripe", text: "Storelib pays out through Stripe, so connect a Stripe account before your first sale." },
    { title: "Rebuild courses and products", text: "Add each course as modules and lessons with its videos, and each download with its files and price." },
    { title: "Move your email", text: "Rebuild the welcome emails you rely on as Storelib automations, then tell your list where to find you." },
    { title: "Switch your domain last", text: "When everything is in place, connect your domain to a Storelib website on Pro and cancel Kajabi once old links have moved." },
  ],
  moving: {
    products: "Courses are rebuilt on Storelib as modules and lessons, and downloads as products with their files. Coaching and cohort courses have no Storelib version yet.",
    customers: "Storelib has no contact or list import. Email your list about the move from Kajabi before you leave, and rebuild the sequences you need as Storelib automations.",
    domain: "Your Kajabi site's domain connects to a Storelib website on Pro. Change its DNS when the new site is ready so visitors never land on a gap.",
  },
  movingHelp: { customers: ["/help/email/automations"] },
  faqs: [
    { q: "Why is Kajabi so much more a month than Storelib?", a: `Kajabi charges a flat plan, from $179 a month, and takes no cut of sales. Storelib Free charges nothing a month and takes ${STORELIB.freeFee} a sale. With smaller sales Storelib costs less; with large monthly sales Kajabi's flat price can.` },
    { q: "Does Storelib have funnels and email sequences like Kajabi?", a: "Storelib has emails to your list and automations, but no funnel builder. If multi step funnels are how you sell, Kajabi does that better." },
    { q: "Can I run a course and a community on Storelib?", a: "Yes. Courses have modules, lessons, video, captions and progress, and a community can sit beside them with posts, chat and paid plans.", flag: "communities", aOff: "Courses, yes: modules, lessons, video, captions and progress. Communities are not offered today." },
    { q: "Does Storelib take a cut where Kajabi does not?", a: `Yes. Kajabi takes no revenue share. Storelib takes ${STORELIB.freeFee} a sale on Free and ${STORELIB.proFee} on Pro. You pay card processing on both.` },
  ],
  visuals: ["course", "dashboard", "creator"],
  sources: [
    { id: "kajabi-pricing", title: "Kajabi pricing: Basic, Growth and Pro, with the feature table", url: "https://www.kajabi.com/pricing", publisher: "Kajabi", checkedOn: on },
    { id: "kajabi-fees", title: "Kajabi Payments processing fees (Help Center)", url: "https://help.kajabi.com/articles/sales/kajabi-payments/kajabi-payments-processing-fees", publisher: "Kajabi", checkedOn: on },
  ],
  updated: "2026-10-31",
}
