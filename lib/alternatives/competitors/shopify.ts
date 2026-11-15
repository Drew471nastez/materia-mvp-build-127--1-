import type { Competitor } from "../types"
import { CHECKED_ON } from "../checked"
import { STORELIB } from "../storelib"
import { SL } from "../storelib-features"
import { money } from "../examples"
import { perSaleCents } from "../calculator"
import { STRIPE_US_RATE, storelibFeeCents } from "../storelib"

const on = CHECKED_ON

/** A small digital shop's month on Shopify Basic (billed monthly) against Storelib Free, processing on both. */
function smallShop(): string {
  const price = 1200
  const sales = 20
  const shopify = 3900 + perSaleCents(price, { percent: 2.9, fixedCents: 30 }) * sales
  const storelib = (storelibFeeCents(price, "free") + perSaleCents(price, STRIPE_US_RATE)) * sales
  return `Twenty ${money(price)} downloads a month on Shopify Basic, billed monthly, cost ${money(shopify)} with card processing. On Storelib Free the same month costs ${money(storelib)}, Stripe included.`
}

export const shopify: Competitor = {
  slug: "shopify",
  name: "Shopify",
  homepage: "https://www.shopify.com",
  categories: ["online-store"],
  summary: "The full online store platform for brands that ship physical products, with thousands of apps and themes.",
  pricingShort: "From $39 a month billed monthly, card rates from 2.5%",
  seo: {
    title: "Shopify alternative for digital products: Storelib compared",
    description: `Shopify Basic is $39 a month, or $29 billed yearly, with 2.9% + 30¢ card rates. Storelib starts free at ${STORELIB.freeFee} a sale. When each makes sense for digital sellers.`,
    h1: "Storelib as a Shopify alternative for digital products",
  },
  intro: [
    "Shopify runs online stores for businesses of every size, from a first shop to brands with warehouses and retail locations. It is built around physical products: inventory, shipping, point of sale and an app store with thousands of extensions.",
    "Digital products are possible on Shopify through an app, including Shopify's own free Digital Products app, which attaches files or links to a product and sends them after purchase.",
    "Shopify charges a monthly plan and card processing through Shopify Payments, at a lower rate on bigger plans. Using another payment provider adds a transaction fee on top.",
  ],
  whyStorelib: [
    { text: "Built for digital products from the start: files and courses are product types, not an app added to a store made for parcels.", code: "lib/billing/plans.ts" },
    { text: `No monthly fee on Free. Shopify's cheapest listed plan is $39 a month billed monthly; Storelib Grow is ${STORELIB.proPrice}.`, code: "lib/billing/plans.ts" },
    { text: "A bio link page, a creator page and a website from one account, without installing apps.", code: "lib/onepage/address.ts" },
    { text: "Email campaigns, discount codes, bundles and upsells are part of Storelib rather than separate apps.", code: "app/(storelib)/app/offers" },
  ],
  whenToStay: [
    { text: "You ship physical products at volume and depend on Shopify's inventory, shipping and point of sale.", sources: ["shopify-pricing"], status: "verified" },
    { text: "Your store relies on specific apps from the Shopify App Store.", sources: ["shopify-digital-app"], status: "verified" },
    { text: "Your sales are large enough that Advanced's 2.5% + 30¢ card rate matters more than the $399 a month it costs billed monthly.", sources: ["shopify-pricing"], status: "verified" },
  ],
  strengths: [
    { text: "Card rates fall with the plan: 2.9% + 30¢ on Basic, 2.7% + 30¢ on Grow, 2.5% + 30¢ on Advanced.", sources: ["shopify-pricing", "shopify-cc-blog"], status: "verified" },
    { text: "No transaction fee when Shopify Payments is your only processor.", sources: ["shopify-payments-cost"], status: "verified" },
    { text: "A free Digital Products app made by Shopify.", sources: ["shopify-digital-app"], status: "verified" },
    { text: "The largest app and theme ecosystem of any store platform.", sources: ["shopify-digital-app"], status: "verified" },
  ],
  limits: [
    { text: "A monthly plan from $39 billed monthly, $29 billed yearly.", sources: ["shopify-pricing"], status: "verified" },
    { text: "A transaction fee of 2% on Basic, 1% on Grow and 0.6% on Advanced when you use a payment provider other than Shopify Payments.", sources: ["shopify-pricing"], status: "verified" },
    { text: "Digital delivery needs an app rather than being part of the product.", sources: ["shopify-digital-app"], status: "verified" },
  ],
  storelibStrengths: [
    { text: "Digital products and courses without apps.", code: "app/(storelib)/app/courses" },
    { text: `A free plan, and Grow at ${STORELIB.proPrice} a month.`, code: "lib/billing/plans.ts" },
    { text: "OnePage for your bio link and a creator page, on top of the website.", code: "lib/onepage/address.ts" },
  ],
  storelibLimits: [
    { text: "Storelib takes a percentage of each sale; Shopify Payments takes none beyond its card rate.", code: "lib/payments/fees/defaults.ts" },
    { text: "Physical selling is newer on Storelib and built for creators, not warehouses.", code: "lib/platform/physical-commerce.ts", flag: "physical", textOff: "Storelib does not sell physical products today: it is built for digital products and courses." },
    { text: "No app store: what Storelib does is what is built in.", code: "app/(storelib)/app/integrations" },
    { text: "No point of sale for selling in person.", code: "lib/platform/physical-commerce.ts" },
  ],
  features: [
    { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee, competitor: { value: "yes", text: "$39 Basic, $105 Grow, $399 Advanced, billed monthly", sources: ["shopify-pricing"], status: "verified" } },
    { id: "per-sale", label: "Platform fee per sale", storelib: SL.perSaleFee, competitor: { value: "yes", text: "None with Shopify Payments, 2% to 0.6% with another provider", sources: ["shopify-pricing", "shopify-payments-cost"], status: "verified" } },
    { id: "cards", label: "Card processing", storelib: { value: "yes", wordless: true, text: "Stripe, 2.9% + 30¢ (US cards)", code: "lib/billing/plans.ts" }, competitor: { value: "yes", text: "2.9% to 2.5% + 30¢ by plan", sources: ["shopify-pricing"], status: "verified" } },
    { id: "digital", label: "Digital products", storelib: SL.digitalProducts, competitor: { value: "partial", text: "Through an app", sources: ["shopify-digital-app"], status: "verified" } },
    { id: "courses", label: "Courses", storelib: SL.courses, competitor: { value: "partial", text: "Through third party apps", sources: ["shopify-digital-category"], status: "verified" } },
    { id: "physical", label: "Physical products and shipping", storelib: SL.physical, competitor: { value: "yes", sources: ["shopify-pricing"], status: "verified" } },
    { id: "bio", label: "Link in bio page", storelib: SL.linkInBio, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from Shopify's pages." } },
    { id: "website", label: "Website and themes", storelib: SL.website, competitor: { value: "yes", sources: ["shopify-pricing"], status: "verified" } },
    { id: "domain", label: "Your own domain", storelib: SL.customDomain, competitor: { value: "yes", sources: ["shopify-pricing"], status: "verified" } },
    { id: "email", label: "Email campaigns", storelib: SL.email, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from the pages we checked." } },
    { id: "offers", label: "Bundles and upsells", storelib: SL.offers, competitor: { value: "unknown", sources: [], status: "unverified", note: "Not confirmed from the pages we checked." } },
  ],
  plans: [
    {
      id: "basic",
      name: "Basic",
      monthlyCents: 3900,
      yearlyMonthlyCents: 2900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.9, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Shopify Payments, 2.9% + 30¢",
      sellsDigital: true,
      claim: { text: "$39 a month billed monthly, $29 billed yearly, online cards 2.9% + 30¢", sources: ["shopify-pricing", "shopify-cc-blog"], status: "verified" },
    },
    {
      id: "grow",
      name: "Grow",
      monthlyCents: 10500,
      yearlyMonthlyCents: 7900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.7, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Shopify Payments, 2.7% + 30¢",
      sellsDigital: true,
      claim: { text: "$105 a month billed monthly, $79 billed yearly, online cards 2.7% + 30¢", sources: ["shopify-pricing", "shopify-cc-blog"], status: "verified" },
    },
    {
      id: "advanced",
      name: "Advanced",
      monthlyCents: 39900,
      yearlyMonthlyCents: 29900,
      fee: { percent: 0, fixedCents: 0 },
      processing: { percent: 2.5, fixedCents: 30 },
      processingKnown: true,
      processingLabel: "Shopify Payments, 2.5% + 30¢",
      sellsDigital: true,
      claim: { text: "$399 a month billed monthly, $299 billed yearly, online cards 2.5% + 30¢", sources: ["shopify-pricing", "shopify-cc-blog"], status: "verified" },
    },
  ],
  pricingNotes: [
    { text: "Shopify offers a free 3 day trial, then $1 a month for the first 3 months on most plans.", sources: ["shopify-pricing"], status: "conflicting", note: "Shopify's offer changes often; community threads describe different terms. Check it when you sign up." },
    { text: "The calculator assumes Shopify Payments. With another provider add 2%, 1% or 0.6% by plan.", sources: ["shopify-pricing"], status: "verified" },
    { text: "Digital product apps from other developers can have their own monthly price.", sources: ["shopify-digital-category"], status: "verified" },
  ],
  calculatorDefaults: { priceDollars: 12, sales: 20 },
  examples: [
    { who: "Sellers", title: "A small digital shop", text: smallShop() },
    { who: "Educators", title: "Courses without stitching apps together", text: "A course on Storelib has lessons, video and progress built in, and sells next to your downloads, where on Shopify it means choosing and paying for a course app." },
    { who: "Creators", title: "A brand that sells both", text: "If you sell printed merchandise in volume next to digital products, Shopify's shipping and stock tools are the stronger fit for the physical side." },
  ],
  switching: [
    { title: "Export your products and customers", text: "In Shopify admin, export products and customers as CSV, and download the files your digital products deliver." },
    { title: "Create a free Storelib account", text: "Sign up and set up payments with Stripe inside Storelib." },
    { title: "Add your digital products", text: "Recreate each product with its price and files, and courses with their lessons." },
    { title: "Build your website", text: "Pick a template in the website builder and add your pages. Your own domain connects on Grow." },
    { title: "Move the domain last", text: "Point your domain at Storelib only when the new site is ready, so the shop is never offline." },
  ],
  moving: {
    products: "There is no Shopify product import. Add each product with its price and files. Your theme can come along: upload its zip and it becomes a Storelib theme. Reviews come over as a CSV in Storelib Reviews.",
    customers: "Customer accounts and order history stay on Shopify: Storelib has no customer import. Keep your Shopify export for your records.",
    domain: "Move the domain last. In Settings, Domains on Grow, add it and copy the DNS records Storelib shows to the company you bought it from. Keep Shopify running until Storelib says Connected.",
  },
  faqs: [
    { q: "Is Storelib cheaper than Shopify for digital products?", a: `For a small or medium digital shop, usually. Shopify Basic is $39 a month billed monthly before card fees. Storelib Free has no monthly fee and takes ${STORELIB.freeFee} a sale, and Grow is ${STORELIB.proPrice}. Shopify takes no cut beyond its card rate, so at high volume Shopify can cost less. The calculator shows the point.` },
    { q: "Can I sell physical products on Storelib?", a: "Yes. Physical products sell on your Storelib website with shipping and stock, next to your digital products. For a warehouse operation, Shopify's tools go further.", flag: "physical", aOff: "Not today. Storelib is built for digital products and courses. If you ship parcels, Shopify is the better fit." },
    { q: "Do I need apps to sell digital products on Storelib?", a: "No. Files and courses are product types on Storelib, delivered by Storelib itself. On Shopify, digital delivery comes from an app." },
    { q: "Can I keep my own domain?", a: STORELIB.proCustomDomain ? "Yes, on Grow. Connect it in the website builder once your site is ready." : "Not on the current plans." },
    { q: "Does Storelib have themes?", a: "Yes. The website builder has templates you edit section by section, and Grow includes premium templates." },
  ],
  visuals: ["editor", "presets", "dashboard"],
  sources: [
    { id: "shopify-pricing", title: "Shopify pricing", url: "https://www.shopify.com/pricing", publisher: "Shopify", checkedOn: "2026-10-31" },
    { id: "shopify-cc-blog", title: "Credit card processing fees (Shopify blog)", url: "https://www.shopify.com/blog/credit-card-processing-fees", publisher: "Shopify", checkedOn: on },
    { id: "shopify-payments-cost", title: "Cost of Shopify Payments (Help Center)", url: "https://help.shopify.com/en/manual/payments/shopify-payments/onboarding/cost-of-shopify-payments", publisher: "Shopify", checkedOn: on },
    { id: "shopify-digital-app", title: "Shopify Digital Products app", url: "https://apps.shopify.com/digital-downloads", publisher: "Shopify", checkedOn: on },
    { id: "shopify-digital-category", title: "Digital products apps (Shopify App Store)", url: "https://apps.shopify.com/categories/selling-products-digital-goods-and-services-digital-products/all", publisher: "Shopify", checkedOn: on },
  ],
  updated: "2026-10-31",
}
