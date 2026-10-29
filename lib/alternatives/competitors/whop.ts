import type { Competitor } from "../types"
import { CHECKED_ON } from "../checked"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"

const on = CHECKED_ON

export const whop: Competitor = {
  slug: "whop",
  name: "Whop",
  homepage: "https://whop.com",
  categories: ["communities", "digital-products"],
  summary: "A marketplace and payments platform for paid communities, Discord and Telegram access, courses and software.",
  pricingShort: "No monthly fee. 2.7% + 30¢ a card payment",
  seo: {
    title: "Whop alternative: Storelib compared on fees and features",
    description: `Whop charges 2.7% + 30¢ per card payment plus payout fees. Storelib charges ${STORELIB.freeFee} or ${STORELIB.proFee} with Stripe processing. An honest look at which suits you.`,
    h1: "Storelib as a Whop alternative",
  },
  intro: [
    "Whop started as the place to sell access to private Discord servers, and it still is: a buyer pays on Whop and gets their role in your server automatically. It has grown into a platform for paid communities, courses, software and digital products, with its own apps for chat, courses and forums.",
    "Its sellers are often trading, sports and reselling groups, software makers and creators who run a community on Discord or Telegram. Whop also has a marketplace where buyers browse, and an affiliate system where other people promote your product for a commission.",
    "Whop processes the payments itself and charges per payment, with no monthly fee. Payouts to you have their own fees, which depend on how you are paid.",
  ],
  whyStorelib: [
    { text: "Payouts from Storelib go to your bank through Stripe, and Cash out is free. On Whop each payout method has its own fee.", code: "lib/payments/stripe/payout-regions.ts" },
    { text: `A store, a website and a bio link that are yours to design: ${STORELIB.freeSites} websites on Free and ${STORELIB.proSites} on Pro${STORELIB.proCustomDomain ? ", your own domain on Pro" : ""}.`, code: "lib/sites/plan.ts" },
    { text: "Email campaigns and automations to your buyers and subscribers, built into the same dashboard as your orders.", code: "app/app/emails" },
    { text: "Digital products, courses and memberships sit side by side, so a community is one of the things you sell rather than the whole business.", code: "app/app/courses" },
  ],
  whenToStay: [
    { text: "Your product is access to a Discord or Telegram server. Whop gives buyers their role in your server automatically, and Storelib does not connect to Discord.", sources: ["whop-discord"], status: "verified" },
    { text: "You want other people to sell for you. Whop's affiliate system, with a 30% default commission you can change, is built in.", sources: ["whop-affiliates"], status: "verified" },
    { text: "On card fees alone Whop costs less than Storelib plus Stripe for most prices. The calculator shows by how much.", sources: ["whop-pricing", "whop-fees"], status: "verified" },
  ],
  strengths: [
    { text: "No monthly fee, and 2.7% + 30¢ per domestic card payment.", sources: ["whop-pricing", "whop-fees"], status: "verified" },
    { text: "Automatic Discord role access for paying members.", sources: ["whop-discord"], status: "verified" },
    { text: "Affiliates with a 30% default commission, and an affiliate marketplace.", sources: ["whop-affiliates", "whop-affiliate-marketplace"], status: "verified" },
    { text: "Apps for chat, courses and forums inside a whop.", sources: ["whop-apps"], status: "verified" },
  ],
  limits: [
    { text: "International cards add 1.5% and currency conversion adds 1%.", sources: ["whop-pricing"], status: "verified" },
    { text: "Payouts carry a fee that depends on the method, such as a bank wire or an instant deposit.", sources: ["whop-pricing", "whop-fees"], status: "conflicting", note: "Whop's pricing page, documentation and blog list different amounts for the same payout methods." },
    { text: "Collecting tax through Whop adds 2% to each payment where tax is collected.", sources: ["whop-pricing"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "Cashing out from Payouts to your bank has no Storelib fee: the per sale fee and Stripe's processing are all there is.", code: "lib/billing/plans.ts" },
    { text: "A website builder, a creator page and a OnePage that you design.", code: "lib/sites/plan.ts" },
    { text: "Email campaigns, automations, discount codes, bundles and upsells.", code: "app/app/offers" },
  ],
  storelibLimits: [
    { text: `Storelib's ${STORELIB.freeFee} on Free or ${STORELIB.proFee} on Pro comes before Stripe's processing, so per payment it costs more than Whop's 2.7% + 30¢.`, code: "lib/payments/fees/defaults.ts" },
    { text: "No Discord or Telegram integration.", code: "lib/communities" },
    { text: "No affiliate program for sellers.", code: "lib/attribution/touch.ts" },
    { text: "Payouts go through Stripe to banks in the US, UK, EEA, Canada and Switzerland only.", code: "lib/payments/stripe/payout-regions.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "None", sources: ["whop-pricing"], status: "verified" } },
    { id: "per-sale", label: "Fee per card payment", storelib: SL.perSaleFee, competitor: { value: "yes", text: "2.7% + 30¢, processing included", sources: ["whop-pricing", "whop-fees"], status: "verified" } },
    { id: "payouts", label: "Payouts", storelib: SL.payouts, competitor: { value: "yes", text: "Fee per payout, by method", sources: ["whop-pricing"], status: "conflicting", note: "Amounts differ between Whop's pages." } },
    { id: "community", label: "Community", storelib: SL.communities, competitor: { value: "yes", text: "Chat and forums apps", sources: ["whop-apps"], status: "verified" } },
    { id: "discord", label: "Discord role access", storelib: SL.discordAccess, competitor: { value: "yes", sources: ["whop-discord"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "yes", text: "Courses app", sources: ["whop-apps"], status: "verified" } },
    { id: "digital", label: "Digital products", storelib: SL.digitalProducts, competitor: { value: "yes", sources: ["whop-digital"], status: "verified" } },
    { id: "memberships", label: "Memberships", storelib: SL.memberships, competitor: { value: "yes", sources: ["whop-apps"], status: "verified" } },
    { id: "affiliates", label: "Affiliates", storelib: SL.affiliates, competitor: { value: "yes", text: "30% default commission", sources: ["whop-affiliates"], status: "verified" } },
    { id: "marketplace", label: "Marketplace", storelib: SL.marketplace, competitor: { value: "yes", sources: ["whop-affiliate-marketplace"], status: "verified" } },
    { id: "website", label: "Website builder", storelib: SL.website, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Whop's pages." } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Whop's pages." } },
    { id: "email", label: "Email campaigns", storelib: SL.email, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Whop's pages." } },
  ],
  plans: [
    {
      id: "standard",
      name: "Standard",
      monthlyCents: 0,
      fee: { percent: 2.7, fixedCents: 30 },
      processing: null,
      processingKnown: true,
      processingLabel: "Included in Whop's rate",
      sellsDigital: true,
      claim: { text: "2.7% + 30¢ per successful domestic card payment, no monthly fee", sources: ["whop-pricing", "whop-fees"], status: "verified" },
    },
  ],
  pricingNotes: [
    { text: "Payout fees are not in the calculator: they depend on the method and Whop's pages disagree on the amounts.", sources: ["whop-pricing", "whop-fees"], status: "conflicting" },
    { text: "Disputes cost $15 each.", sources: ["whop-pricing"], status: "verified" },
    { text: "US bank debits (ACH) cost 1.5%, at most $5.", sources: ["whop-pricing", "whop-fees"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 49, sales: 30 },
  examples: [
    { who: "Creators", title: "A monthly membership and a few guides", text: "A creator who sells a monthly membership and some downloadable guides can sell both on Storelib, show them on a website and a OnePage, and email the whole list from one place." },
    { who: "Educators", title: "A course first, a community second", text: "When the course is the product and the discussion is the extra, Storelib's course builder with lessons and progress is the centre of the store." },
    { who: "Sellers", title: "Software sold to a Discord audience", text: "If buyers expect a Discord role the moment they pay, Whop does that and Storelib does not. Stay on Whop for that part." },
  ],
  switching: [
    { title: "Decide what moves", text: "Courses, downloads and memberships move well. Discord or Telegram access does not: Storelib has no integration for it." },
    { title: "Create a free Storelib account", text: "Sign up and set up payments with Stripe inside Storelib. Check your country is one Stripe pays out to from Storelib." },
    { title: "Rebuild your products", text: "Add each product, course and membership plan with its price. Recurring members need to subscribe again on Storelib." },
    { title: "Move members at renewal", text: "Tell members before their next renewal on Whop, with the Storelib link, so nobody is charged twice." },
    { title: "Change your links", text: "Replace Whop links in your bios and posts with your Storelib product links or your OnePage." },
  ],
  faqs: [
    { q: "Is Storelib cheaper than Whop?", a: `On fees per payment, usually not. Whop takes 2.7% + 30¢ with processing included. Storelib takes ${STORELIB.freeFee} on Free or ${STORELIB.proFee} on Pro, and Stripe's processing comes on top. Whop charges for payouts, which Storelib does not, so the gap is smaller than the card rate alone suggests.` },
    { q: "Can Storelib give buyers access to a Discord server?", a: "No. Storelib has no Discord or Telegram integration. If server access is what you sell, Whop is built for it." },
    {
      q: "Can I run a paid community on Storelib?",
      a: "Yes. Storelib Communities has posts, chat, events and paid plans, next to your products and courses.",
      flag: "communities",
      aOff: "Not today. On Storelib, memberships and courses are the way to sell ongoing access.",
    },
    { q: "Does Storelib charge for payouts?", a: "No. You cash out your available balance from Payouts to the bank account on file. It usually arrives in 1 to 3 business days." },
    { q: "Does Storelib have affiliates like Whop?", a: "Not today. Whop's affiliate system is a reason to stay if other people sell your product for a commission." },
  ],
  visuals: ["community", "course", "dashboard"],
  sources: [
    { id: "whop-pricing", title: "Whop pricing", url: "https://whop.com/network/pricing/", publisher: "Whop", checkedOn: on },
    { id: "whop-fees", title: "Fees (Whop Docs)", url: "https://docs.whop.com/fees", publisher: "Whop", checkedOn: on },
    { id: "whop-discord", title: "How to link your whop to a Discord server", url: "https://whop.com/blog/link-whop-to-discord/", publisher: "Whop", checkedOn: on },
    { id: "whop-affiliates", title: "Set up custom affiliates (Whop Docs)", url: "https://docs.whop.com/affiliates/setup-custom", publisher: "Whop", checkedOn: on },
    { id: "whop-affiliate-marketplace", title: "Affiliate marketplace", url: "https://whop.com/discover/affiliate-marketplace/", publisher: "Whop", checkedOn: on },
    { id: "whop-apps", title: "15 of the best membership site platforms (Whop apps described)", url: "https://whop.com/blog/best-membership-site-platforms/", publisher: "Whop", checkedOn: on },
    { id: "whop-digital", title: "How to create and sell digital products", url: "https://whop.com/blog/create-sell-digital-products/", publisher: "Whop", checkedOn: on },
  ],
  updated: on,
}
