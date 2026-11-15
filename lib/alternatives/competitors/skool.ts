import type { Competitor } from "../types"
import { STORELIB, STRIPE_US_RATE, storelibFeeCents } from "../storelib"
import { perSaleCents } from "../calculator"
import { money } from "../examples"
import { SL } from "../storelib-features"

const on = "2026-10-31" as const

/** Skool's two published rules, card processing included (Skool Payments FAQ). */
const HOBBY = { percent: 10, fixedCents: 30 }
const PRO = { percent: 2.9, fixedCents: 30 }
const PRO_ABOVE = { overCents: 89900, fee: { percent: 3.9, fixedCents: 30 } }

/**
 * A month of a paid group, worked out with the calculator's own sums: Skool
 * Hobby's plan and fee (processing included), against Storelib Free's fee
 * plus Stripe's US rate, which Storelib does not include.
 */
function groupMonth(priceDollars: number, members: number): string {
  const price = Math.round(priceDollars * 100)
  const skool = 900 + perSaleCents(price, HOBBY) * members
  const free = (storelibFeeCents(price, "free") + perSaleCents(price, STRIPE_US_RATE)) * members
  return `${members} members at ${money(price)} a month is ${money(price * members)}. Skool Hobby takes ${money(skool)} with its $9 plan, card processing included. Storelib Free takes ${money(free)}: its fee and Stripe's card processing together. Skool Pro's lower rate pays for its $99 plan only with a much bigger group.`
}

export const skool: Competitor = {
  slug: "skool",
  name: "Skool",
  homepage: "https://www.skool.com",
  categories: ["communities"],
  summary: "A community platform built around points, levels and live calls, with a course classroom and a directory people browse.",
  pricingShort: "$9 a month and 10% a sale, or $99 a month and 2.9%",
  seo: {
    title: "Skool alternative for paid communities: Storelib compared",
    description: "Skool runs paid groups with points, levels and Discovery, and handles VAT for you. Its fees next to Storelib's, who each one suits, and how to move a group.",
    h1: "Storelib as a Skool alternative",
  },
  intro: [
    "Skool is a community platform. A group has a feed, a classroom for courses, a calendar for events and live calls built in, and members earn points and levels when others like what they post. It is made for running a group people pay to join.",
    "The whole product is the group. You sell a membership, and courses inside it, and Skool's Discovery directory can show your group to people browsing for one.",
    "Skool has two plans with the same features: Hobby at $9 a month with a 10% fee, and Pro at $99 a month with 2.9%. Card processing is included in that fee, and Skool is the merchant of record, so it deals with EU VAT and sales tax for you.",
  ],
  whyStorelib: [
    { text: "Sell more than a membership. Downloads, courses and a website with a store sit next to your community, with your own domain on Grow.", code: "lib/sites/plan.ts" },
    {
      text: "Your community, your store, email campaigns and a link in bio page in one dashboard, with one set of orders and buyers.",
      code: "app/(storelib)/app/community",
      flag: "communities",
      textOff: "Your courses, downloads, email campaigns and a link in bio page in one dashboard, with one set of orders and buyers.",
    },
    { text: "Email your buyers and members with campaigns and automations.", code: "app/(storelib)/app/emails" },
  ],
  whenToStay: [
    { text: "The community is the product and you want members to keep coming back. Skool's points, levels and leaderboards are at the centre of it, and courses can open only to members who reach a level.", sources: ["skool-levels"], status: "verified" },
    { text: "You do not want to deal with VAT or sales tax. Skool is the merchant of record: it adds EU VAT at checkout, pays it and handles sales tax.", sources: ["skool-payments"], status: "verified" },
    { text: "Your bank is outside the US, UK, EEA, Canada or Switzerland. Skool pays out weekly in local currency to banks in more than 150 countries.", sources: ["skool-payments", "skool-payouts"], status: "verified" },
    { text: "You want new members found for you. Discovery lists groups to Skool users, and Growth Boost advertises yours for 30% of what members it brings pay.", sources: ["skool-discovery", "skool-payments"], status: "verified" },
  ],
  strengths: [
    { text: "Points, levels and leaderboards for every member, and courses that open at a level you choose.", sources: ["skool-levels"], status: "verified" },
    { text: "Live calls inside the group, with screen sharing and recording, without another streaming tool.", sources: ["skool-live"], status: "verified" },
    { text: "Unlimited members, courses, videos and live calls on both plans.", sources: ["skool-pricing"], status: "verified" },
    { text: "Merchant of record: Skool collects and pays EU VAT and is responsible for sales tax.", sources: ["skool-payments"], status: "verified" },
    { text: "Weekly payouts every Wednesday, in your own currency.", sources: ["skool-payments"], status: "verified" },
  ],
  limits: [
    { text: "Every price is in US dollars, and members pay in US dollars.", sources: ["skool-payments"], status: "verified" },
    { text: "Hobby takes 10% + 30¢ of each payment. The lower 2.9% + 30¢ needs Pro at $99 a month, and a payment over $899 pays 3.9% + 30¢.", sources: ["skool-payments", "skool-pricing"], status: "conflicting", note: "Skool's pricing page shows 10% and 2.9% without the 30¢; its payments help article adds it." },
    { text: "Affiliates and your own group URL are on Pro only, and each change of URL after the first costs $100.", sources: ["skool-affiliates", "skool-url"], status: "verified" },
    { text: "You cannot use your own Stripe account; Skool sets up a Stripe Express account only for payouts.", sources: ["skool-payments"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "A website builder with a store, and your own domain on Pro.", code: "lib/sites/plan.ts" },
    { text: "Digital downloads and physical products beside the community.", code: "lib/platform/physical-commerce.ts", flag: "physical", textOff: "Digital downloads and courses sold on their own, outside any membership." },
    { text: "Discount codes, bundles and upsells.", code: "app/(storelib)/app/offers" },
  ],
  storelibLimits: [
    { text: "Storelib is not a merchant of record. You set the tax your store charges and you file it.", code: "lib/tax/rules.ts" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
    { text: "Community plans sell in US dollars, the same as Skool.", code: "lib/markets/pricing.ts" },
    { text: `Stripe's card processing is on top of Storelib's ${STORELIB.freeFee} on Free. Skool's fee already includes it.`, code: "lib/billing/plans.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "$9 Hobby, $99 Pro", sources: ["skool-pricing"], status: "verified" } },
    { id: "per-sale", label: "Fee per payment", storelib: { value: "yes", wordless: true, text: `${STORELIB.freeFee} on Free, ${STORELIB.proFee} on Grow, Stripe on top`, code: "lib/payments/fees/defaults.ts" }, competitor: { value: "yes", text: "10% + 30¢ Hobby, 2.9% + 30¢ Pro, processing included", sources: ["skool-payments", "skool-pricing"], status: "conflicting", note: "The pricing page leaves out the 30¢." } },
    { id: "community", label: "Community", storelib: SL.communities, competitor: { value: "yes", text: "Feed, classroom, calendar", sources: ["skool-pricing", "skool-levels"], status: "verified" } },
    { id: "levels", label: "Points and levels", storelib: { value: "yes", text: "Points, levels and a leaderboard", code: "lib/communities/blocks.ts", flag: "communities" }, competitor: { value: "yes", text: "Levels 1 to 9, leaderboards", sources: ["skool-levels"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "yes", text: "Inside the group, or bought once", sources: ["skool-courses"], status: "verified" } },
    { id: "memberships", label: "Memberships", storelib: SL.memberships, competitor: { value: "yes", text: "Paid group subscriptions in USD", sources: ["skool-payments"], status: "verified" } },
    { id: "tax", label: "Sales tax and VAT", storelib: SL.tax, competitor: { value: "yes", text: "Skool is the merchant of record", sources: ["skool-payments"], status: "verified" } },
    { id: "payouts", label: "Payouts", storelib: SL.payouts, competitor: { value: "yes", text: "Weekly, local currency, 150+ countries", sources: ["skool-payments"], status: "verified" } },
    { id: "affiliates", label: "Affiliates", storelib: SL.affiliates, competitor: { value: "partial", text: "Pro only", sources: ["skool-affiliates"], status: "verified" } },
    { id: "marketplace", label: "Directory or marketplace", storelib: SL.marketplace, competitor: { value: "yes", text: "Discovery; 30% on members Growth Boost brings", sources: ["skool-discovery"], status: "verified" } },
  ],
  plans: [
    {
      id: "hobby",
      name: "Hobby",
      monthlyCents: 900,
      fee: HOBBY,
      processing: null,
      processingKnown: true,
      processingLabel: "included in Skool's fee",
      sellsDigital: true,
      claim: { text: "$9 a month and 10% + 30¢ a payment, card processing included", sources: ["skool-pricing", "skool-payments"], status: "conflicting", note: "The pricing page shows 10%; the payments help article says 10% + 30¢. The calculator uses the help article." },
    },
    {
      id: "pro",
      name: "Pro",
      monthlyCents: 9900,
      fee: PRO,
      feeAbove: PRO_ABOVE,
      processing: null,
      processingKnown: true,
      processingLabel: "included in Skool's fee",
      sellsDigital: true,
      claim: { text: "$99 a month, 2.9% + 30¢ a payment up to $899 and 3.9% + 30¢ above, card processing included", sources: ["skool-pricing", "skool-payments"], status: "conflicting", note: "The pricing page shows 2.9%; the help article adds 30¢ and the higher rate above $899 (it says above $900). The calculator uses the help article." },
    },
  ],
  pricingNotes: [
    { text: "Paying yearly for Skool gives two months free.", sources: ["skool-pricing"], status: "verified" },
    { text: "Both plans start with a 14 day free trial, and Skool does not refund its own subscription.", sources: ["skool-terms"], status: "verified" },
    { text: "Transaction fees are not refunded when you refund a member.", sources: ["skool-payments"], status: "verified" },
    { text: "With Growth Boost on, which it is by default, Skool keeps 30% of what a member it found for you pays, for as long as they stay.", sources: ["skool-payments", "skool-discovery"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 29, sales: 40 },
  examples: [
    { who: "Creators", title: "A $29 group with forty members", text: groupMonth(29, 40) },
    { who: "Educators", title: "A course people buy without joining", text: "A teacher who sells a course to people who never join the group, and an ebook beside it, can list both as products on Storelib. On Skool a course is bought inside a group." },
    { who: "Sellers", title: "A group that needs to be found", text: "Someone starting from no audience may get more from Skool's Discovery directory than from any fee saving, and pays its 30% only on members it brings." },
  ],
  switching: [
    { title: "Plan the move with your members", text: "Tell your group when you are moving and why, a few weeks ahead, so nobody is surprised by a new link." },
    { title: "Create a free Storelib account", text: "Sign up and connect Stripe for payouts. Storelib pays out to banks in the US, UK, EEA, Canada and Switzerland." },
    { title: "Build the community and its plans", text: "Create the community, its spaces and its paid plans, and rebuild your classroom as courses." },
    { title: "Invite your members", text: "Post the new link in your Skool group and email it. Paid members sign up to a Storelib plan themselves; subscriptions do not move across." },
    { title: "Keep both open for one billing cycle", text: "Leave the Skool group up until members have moved, then close it." },
  ],
  moving: {
    products: "Classroom courses are rebuilt as Storelib courses with modules and lessons. Membership plans are recreated as paid community plans, at the price you choose.",
    customers: "Storelib has no member or subscription import. Members join again and pay through Storelib, so give them a date and a reason to move.",
    domain: "A Skool group lives on a skool.com address. Share your new Storelib link in the group and your bios, and connect your own domain to a Storelib website on Grow if you have one.",
  },
  movingHelp: { products: ["/help/orders-and-payouts/how-payouts-work"] },
  faqs: [
    { q: "Does Skool's fee include card processing?", a: "Yes. Skool's payments help article says processing happens on Skool's own merchant account and its 10% + 30¢ or 2.9% + 30¢ covers it. On Storelib, Stripe's processing is on top of Storelib's fee." },
    { q: "Is Storelib a merchant of record like Skool?", a: "No. Skool collects and pays EU VAT and handles sales tax. On Storelib you are the seller and you set and file your own tax." },
    {
      q: "Does Storelib have points and levels like Skool?",
      a: "Yes. A Storelib community can show points, levels and a leaderboard. Skool builds more of its product around them.",
      flag: "communities",
      aOff: "Communities are not offered on Storelib today, so for a gamified group Skool is the choice.",
    },
    { q: "Can my members pay in their own currency?", a: "Not on either. Skool charges in US dollars, and Storelib's community plans sell in US dollars too. Storelib websites can charge in a visitor's currency for products." },
  ],
  visuals: ["community", "course", "dashboard"],
  sources: [
    { id: "skool-pricing", title: "Skool pricing: Hobby and Pro", url: "https://www.skool.com/pricing", publisher: "Skool", checkedOn: on },
    { id: "skool-payments", title: "Skool Payments FAQs: fees, payouts, VAT (Help Center)", url: "https://help.skool.com/article/86-subscriptions-faq", publisher: "Skool", checkedOn: on },
    { id: "skool-payouts", title: "How to set up payouts (Help Center)", url: "https://help.skool.com/article/240-how-to-set-up-payouts-new", publisher: "Skool", checkedOn: on },
    { id: "skool-levels", title: "How do points and levels work? (Help Center)", url: "https://help.skool.com/article/31-how-do-points-and-levels-work", publisher: "Skool", checkedOn: on },
    { id: "skool-courses", title: "How to set up one time course purchases (Help Center)", url: "https://help.skool.com/article/168-how-to-set-up-one-time-course-purchases", publisher: "Skool", checkedOn: on },
    { id: "skool-live", title: "How to go live on Skool (Help Center)", url: "https://help.skool.com/article/210-how-to-go-live-on-skool", publisher: "Skool", checkedOn: on },
    { id: "skool-discovery", title: "Discovery FAQs (Help Center)", url: "https://help.skool.com/article/153-discovery-faqs", publisher: "Skool", checkedOn: on },
    { id: "skool-affiliates", title: "How to set up member affiliates (Help Center)", url: "https://help.skool.com/article/192-how-to-set-up-member-referrals-for-your-community", publisher: "Skool", checkedOn: on },
    { id: "skool-url", title: "How to change my group URL (Help Center)", url: "https://help.skool.com/article/121-how-to-change-my-group-url", publisher: "Skool", checkedOn: on },
    { id: "skool-terms", title: "Payment terms and policy (Help Center)", url: "https://help.skool.com/article/227-payment-terms-and-policy", publisher: "Skool", checkedOn: on },
  ],
  updated: "2026-10-31",
}
