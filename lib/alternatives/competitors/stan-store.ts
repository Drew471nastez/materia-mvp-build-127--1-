import type { Competitor } from "../types"
import { CHECKED_ON } from "../checked"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { money } from "../examples"
import { perSaleCents } from "../calculator"
import { STRIPE_US_RATE, storelibFeeCents } from "../storelib"

const on = CHECKED_ON

/** A small creator's month: 10 sales of $15. What each side costs, processing on both. */
function smallMonth(): string {
  const price = 1500
  const sales = 10
  const stripe = perSaleCents(price, STRIPE_US_RATE) * sales
  const free = storelibFeeCents(price, "free") * sales
  return `Ten sales of ${money(price)} is ${money(price * sales)}. On Stan's Creator plan the month costs ${money(2900)} before Stripe's ${money(stripe)}. On Storelib Free there is no plan, the fee is ${money(free)}, and Stripe's ${money(stripe)} is the same.`
}

export const stanStore: Competitor = {
  slug: "stan-store",
  name: "Stan Store",
  homepage: "https://stan.store",
  categories: ["link-in-bio", "digital-products"],
  summary: "A store that lives in your bio link, built for creators selling coaching calls, courses and digital downloads from social media.",
  pricingShort: "From $29 a month, 0% per sale",
  seo: {
    title: "Stan Store alternative: Storelib compared on price and features",
    description: `Stan Store costs $29 or $99 a month with no cut of sales. Storelib has a free plan at ${STORELIB.freeFee} a sale and Pro at ${STORELIB.proPrice}. See which costs less at your sales.`,
    h1: "Storelib as a Stan Store alternative",
  },
  intro: [
    "Stan Store, usually called Stan, puts a small shop where a link in bio would be. A follower taps the link on Instagram or TikTok and lands on a phone sized page with your products, coaching calls and courses, and can pay without leaving it.",
    "It is popular with coaches, fitness and wellness creators, and educators who sell calls and programs to an audience they built on social media. Coaching calls connect to Google Calendar and send the invite for you.",
    "Stan charges a monthly subscription, $29 for Creator and $99 for Creator Pro, and takes no percentage of your sales. There is no free plan, and both plans start with a 14 day trial.",
  ],
  whyStorelib: [
    { text: `You can start for nothing. Storelib Free has no monthly fee and takes ${STORELIB.freeFee} a sale, so a store that sells a few times a month costs far less than $29.`, code: "lib/billing/plans.ts" },
    { text: "Email campaigns and automations on every plan. On Stan, email broadcasts and flows are part of Creator Pro at $99 a month.", code: "app/app/emails" },
    { text: "Discount codes, bundles and upsells on every plan, where Stan keeps order bumps and discount codes for Creator Pro.", code: "app/app/offers" },
    { text: `A full website as well as the bio link: ${STORELIB.freeSites} sites on Free, ${STORELIB.proSites} on Pro${STORELIB.proCustomDomain ? ", with your own domain on Pro" : ""}.`, code: "lib/sites/plan.ts" },
  ],
  whenToStay: [
    { text: "Coaching calls booked straight into your Google Calendar are the heart of what you sell. Stan's booking flow is built for that.", sources: ["stan-coaching", "stan-calendar"], status: "verified" },
    { text: "You sell enough that a flat $29 or $99 costs less than a percentage. Stan takes 0% of each sale.", sources: ["stan-fees"], status: "verified" },
  ],
  strengths: [
    { text: "0% of each sale goes to Stan. You pay the subscription and the payment processor's fee.", sources: ["stan-fees"], status: "verified" },
    { text: "Coaching calls with Google Calendar sync, Zoom or Google Meet links and email reminders.", sources: ["stan-coaching", "stan-calendar"], status: "verified" },
    { text: "Courses and recurring memberships on the Creator plan.", sources: ["stan-plans"], status: "verified" },
    { text: "A store designed for the phone screen most followers arrive on.", sources: ["stan-plans"], status: "verified" },
  ],
  limits: [
    { text: "No free plan. The cheapest plan is $29 a month, or $300 a year.", sources: ["stan-pricing", "stan-plans"], status: "verified" },
    { text: "Email broadcasts, email flows, order bumps, discount codes and payment plans need Creator Pro at $99 a month.", sources: ["stan-plans"], status: "verified" },
    { text: "Your own domain: we could not confirm whether Stan supports one.", sources: [], status: "unverified", note: "Not found in Stan's help center or pricing pages." },
  ],
  storelibStrengths: [
    { text: `A free plan with no monthly fee, and Pro at ${STORELIB.proPrice} when the lower rate pays for itself.`, code: "lib/billing/plans.ts" },
    { text: "Email campaigns, automations, discount codes and bundles on every plan.", code: "app/app/emails" },
    { text: "A OnePage for your bio link, a creator page and a website builder, selling the same products.", code: "lib/onepage/address.ts" },
    { text: "Courses with lessons and progress, and memberships.", code: "app/app/courses" },
  ],
  storelibLimits: [
    { text: "Storelib takes a percentage of each sale. At high volume a flat subscription like Stan's can cost less, and the calculator shows where.", code: "lib/payments/fees/defaults.ts" },
    { text: "No built in booking of coaching calls into your calendar.", code: "lib/products" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "$29 Creator, $99 Creator Pro", sources: ["stan-pricing", "stan-plans"], status: "verified" } },
    { id: "per-sale", label: "Platform fee per sale", storelib: SL.perSaleFee, competitor: { value: "yes", text: "0%", sources: ["stan-fees"], status: "verified" } },
    { id: "free-plan", label: "Free plan", storelib: { value: "yes", text: "Free, no card needed", code: "lib/billing/plans.ts" }, competitor: { value: "no", text: "14 day trial", sources: ["stan-pricing"], status: "verified" } },
    { id: "bio", label: "Link in bio page", storelib: SL.linkInBio, competitor: { value: "yes", sources: ["stan-plans"], status: "verified" } },
    { id: "digital", label: "Digital products", storelib: SL.digitalProducts, competitor: { value: "yes", sources: ["stan-plans"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "yes", sources: ["stan-plans"], status: "verified" } },
    { id: "memberships", label: "Memberships", storelib: SL.memberships, competitor: { value: "yes", text: "Recurring subscriptions", sources: ["stan-plans"], status: "verified" } },
    { id: "coaching", label: "Coaching call booking", storelib: { value: "no", text: "Not offered", code: "lib/products" }, competitor: { value: "yes", text: "Google Calendar, Zoom, Meet", sources: ["stan-coaching", "stan-calendar"], status: "verified" } },
    { id: "email", label: "Email campaigns", storelib: SL.email, competitor: { value: "partial", text: "Creator Pro only", sources: ["stan-plans"], status: "verified" } },
    { id: "coupons", label: "Discount codes", storelib: SL.coupons, competitor: { value: "partial", text: "Creator Pro only", sources: ["stan-plans"], status: "verified" } },
    { id: "offers", label: "Order bumps and upsells", storelib: SL.offers, competitor: { value: "partial", text: "Creator Pro only", sources: ["stan-plans"], status: "verified" } },
    { id: "website", label: "Multi page website", storelib: SL.website, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Stan's pages." } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Stan's pages." } },
  ],
  plans: [
    {
      id: "creator",
      name: "Creator",
      monthlyCents: 2900,
      yearlyMonthlyCents: 2500,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, 2.9% + 30¢ (US cards)",
      sellsDigital: true,
      claim: { text: "$29 a month or $300 a year, 0% transaction fee, Stripe's standard US rate of 2.9% + 30¢", sources: ["stan-pricing", "stan-fees"], status: "verified" },
    },
    {
      id: "creator-pro",
      name: "Creator Pro",
      monthlyCents: 9900,
      yearlyMonthlyCents: 7900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Stripe, 2.9% + 30¢ (US cards)",
      sellsDigital: true,
      claim: { text: "$99 a month or $948 a year, 0% transaction fee", sources: ["stan-pricing", "stan-fees"], status: "verified" },
    },
  ],
  pricingNotes: [
    { text: "Both plans start with a 14 day free trial.", sources: ["stan-pricing"], status: "verified" },
    { text: "PayPal payments cost 3.49% plus a fixed fee that depends on the currency.", sources: ["stan-fees"], status: "verified" },
    { text: "Stripe's fee is not returned when you refund a sale.", sources: ["stan-fees"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 15, sales: 10 },
  examples: [
    { who: "Creators", title: "A first digital product", text: smallMonth() },
    { who: "Educators", title: "A course and a weekly email", text: "A teacher who sells a course and writes to students every week needs email. On Storelib that is on the free plan; on Stan email broadcasts come with Creator Pro." },
    { who: "Sellers", title: "A shop that has outgrown the bio link", text: `When a bio page is not enough, a Storelib website sells the same products with its own pages and navigation, and on Pro it can live on your own domain.` },
  ],
  switching: [
    { title: "List what you sell on Stan", text: "Note each product, its price and its files, and download your customer list from Stan before you change anything." },
    { title: "Create a free Storelib account", text: "Sign up, set up payments with Stripe inside Storelib, and choose your address. Your OnePage is at storelib.me/yourname." },
    { title: "Add your products", text: "Recreate each digital product and course with its price and files. Courses keep their lessons in order." },
    { title: "Swap the link in your bio", text: "Put your OnePage address in your Instagram, TikTok and YouTube bios, where your Stan link was." },
    { title: "Plan the overlap", text: "If you have monthly members on Stan, keep the account until their current periods end, or tell them how to join on Storelib." },
  ],
  faqs: [
    { q: "Is Storelib cheaper than Stan Store?", a: `It depends on how much you sell. Stan is $29 a month with 0% per sale. Storelib Free is $0 a month with ${STORELIB.freeFee} a sale, so it costs less until your sales are high enough for 5% to pass $29. The calculator on this page shows the point for your price.` },
    { q: "Does Storelib have a free plan like Stan's trial?", a: "Storelib Free is a plan, not a trial. It has no monthly fee and no end date, and it asks for no card." },
    { q: "Can I use Storelib as my link in bio?", a: "Yes. Your OnePage at storelib.me/yourname holds your links, your products and an email sign up, and you can put that address in any bio." },
    { q: "Can Storelib book coaching calls like Stan?", a: "Not with calendar booking built in. If calls booked into Google Calendar are most of your income, Stan's booking flow is the reason to stay." },
    { q: "How do I move from Stan to Storelib?", a: "Download your customer list, recreate your products on Storelib, then change the link in your bios. The switching guide on this page has each step." },
  ],
  visuals: ["onepage", "course", "dashboard"],
  sources: [
    { id: "stan-pricing", title: "Stan Store pricing: plans, costs, and what you get", url: "https://stan.store/blog/stan-store-pricing/", publisher: "Stan", checkedOn: on },
    { id: "stan-fees", title: "Stan, Stripe, and PayPal transaction fees (Help Center)", url: "https://help.stan.store/article/83-stan-stripes-transaction-fees", publisher: "Stan", checkedOn: on },
    { id: "stan-plans", title: "Creator vs. Creator Pro (Help Center)", url: "https://help.stan.store/article/31-creator-vs-creator-pro", publisher: "Stan", checkedOn: on },
    { id: "stan-coaching", title: "How to create a coaching call product (Help Center)", url: "https://help.stan.store/article/15-how-to-create-a-coaching-call-product", publisher: "Stan", checkedOn: on },
    { id: "stan-calendar", title: "How to sync your Google Calendar with Stan (Help Center)", url: "https://help.stan.store/article/51-how-to-sync-your-google-calendar-with-stan", publisher: "Stan", checkedOn: on },
  ],
  updated: on,
}
