/**
 * ===========================================================================
 *  THE /sell PAGES: ONE PAGE PER THING A CREATOR SELLS, ONLY WHERE STORELIB
 *  REALLY DOES IT
 * ===========================================================================
 * storelib.com/sell is the door into seller onboarding (app/(auth)/sell). The
 * pages under it explain one use each, for somebody who searched for it:
 *
 *   /sell/digital-products   files: ebooks, templates, presets, sample packs
 *   /sell/online-courses     video courses with lessons and progress
 *   /sell/communities        free and paid communities (behind its switch)
 *   /sell/creator-website    a website of your own that sells
 *
 * Four, not fourteen. An ebook and a Notion template are both "a file a
 * buyer downloads" on Storelib, so they are examples on the digital products
 * page rather than pages of their own that would say the same thing. A page
 * is added only for a use Storelib supports differently from these.
 *
 * Every figure on these pages comes from lib/marketing/facts (prices, fees,
 * limits) and every worked example from facts.saleBreakdown, the function
 * checkout uses. Every help link names a real article (lib/help/articles;
 * tests/content-r45.test.ts checks each). Pictures are real Storelib screens
 * with made up demo content, and the page says so.
 *
 * Pure: the route, the sitemap, the footer and the tests read this list.
 */
import { PLANS, PRODUCT_FILE_LIMIT, PRODUCT_TYPES, type FactFlag } from "./facts"
import { SELL_SHOTS } from "./sell-shots"
import { SELL_PAGES, type UseCaseSlug } from "./sell-links"

export { SELL_BASE, useCasePath, type UseCaseSlug } from "./sell-links"

/** A page's name and switch, from lib/marketing/sell-links. */
const named = (slug: UseCaseSlug) => {
  const p = SELL_PAGES.find((x) => x.slug === slug)!
  return { slug, nav: p.nav, ...("flag" in p ? { flag: p.flag as FactFlag } : {}) }
}

export interface Shot {
  src: string
  alt: string
  width: number
  height: number
}

export interface UseCaseStep {
  title: string
  text: string
  shot?: Shot
}

export interface UseCase {
  slug: UseCaseSlug
  /** The footer's and the hub's short name. */
  nav: string
  seo: { title: string; description: string; h1: string }
  /** The lede under the heading: what this page helps with, in one or two sentences. */
  lede: string
  /** A page whose use waits behind a platform switch: it is a 404 and out of the sitemap while the switch is off. */
  flag?: FactFlag
  /** What you can sell, as short lines. */
  whatYouSell: string[]
  /** How a buyer receives it on Storelib, specifically. */
  delivery: { title: string; text: string }[]
  /** The walkthrough. */
  steps: UseCaseStep[]
  /** The worked example: one sale at this price, in US cents, and what it is. */
  example: { priceCents: number; what: string; per?: string }
  /** Generic examples, labelled as examples. A real store only when it is the owner's own and public. */
  examples: { title: string; text: string; href?: string }[]
  faqs: { q: string; a: string }[]
  /** Help Center articles, as /help/<category>/<slug>. */
  help: string[]
  /** Comparison pages this use is weighed against (lib/alternatives slugs). */
  alternatives: string[]
  /** Blog posts on storelib.com about this, by path. Only posts that are live. */
  blog: { title: string; path: string }[]
  /** The fact ids (lib/marketing/facts) the "What you get" list shows. */
  facts: string[]
  /** The limitation ids (lib/marketing/facts LIMITATIONS) that matter for this use. */
  limits: string[]
  /** When the page's words last changed, ISO. */
  updated: string
}

const free = PLANS.free
const pro = PLANS.pro
const shot = (name: keyof typeof SELL_SHOTS, alt: string): Shot => ({ src: `/marketing/sell/${name}.webp`, alt, width: SELL_SHOTS[name][0], height: SELL_SHOTS[name][1] })
const hero = (name: string, alt: string): Shot => ({ src: `/marketing/hero/slide-${name}.webp`, alt, width: 1200, height: 750 })

const UPDATED = "2026-10-31"

export const USE_CASES: readonly UseCase[] = [
  {
    ...named("digital-products"),
    seo: {
      title: "Sell digital products online: files, ebooks, templates | Storelib",
      description: `Sell ebooks, templates, presets and sample packs on Storelib. Buyers get a receipt with a download link. No monthly fee on Free, ${free.feeLabel} a sale.`,
      h1: "Sell digital products on Storelib",
    },
    lede: "Upload a file, set a price and share the link. Storelib takes the payment and sends the buyer their download.",
    whatYouSell: [
      "Ebooks and guides (PDF, EPUB)",
      "Templates: Notion, Canva, spreadsheets",
      "Presets, LUTs and brushes",
      "Sample packs, loops and drum kits",
      "Fonts, icons and printables",
      "Anything else people download",
    ],
    delivery: [
      { title: "A receipt that is the download page", text: "After paying, the buyer gets one email. Its button opens the receipt page, which lists the files to download. The link in that email keeps working for as long as the order stands." },
      { title: "Links that cannot be shared around", text: "Each download link is made when the buyer presses it and stops working soon after, so a copied link is no use to anyone else." },
      { title: "A library for buyers with an account", text: "Buyers who make a Storelib account find every purchase in their Library, from any device." },
      { title: "Versions with their own files", text: "Variants let one product sell a personal and a commercial license, or a basic and a full pack, each with its own price and files." },
    ],
    steps: [
      { title: "Make the product", text: "In Products, press New product and choose Digital product. Give it a title, a description and a cover.", shot: shot("editor-media", "The Storelib product editor's Photos and video card, with three demo cover images") },
      { title: "Upload the files", text: `Drop your files into Digital Files. Up to ${free.filesPerProduct} files on Free and ${pro.filesPerProduct} on Pro, each up to ${PRODUCT_FILE_LIMIT}.`, shot: shot("editor-files", "The Digital Files card in the Storelib product editor, with two demo zip files") },
      { title: "Set the price", text: "A fixed price, a crossed out compare at price, or pay what you want above a minimum. A price of 0 makes it free.", shot: shot("editor-pricing", "The Pricing card in the Storelib product editor: a $29 price and a $39 compare at price") },
      { title: "Publish and share", text: "Publish, then share the product link, your creator page at storelib.com/yourname or your OnePage at storelib.me/yourname." },
    ],
    example: { priceCents: 2900, what: "a $29 ebook" },
    examples: [
      { title: "Example: a template shop", text: "A designer sells six Notion templates at $12 each, with a bundle of all six at a discount." },
      { title: "Example: a preset pack", text: "A photographer sells one preset pack with two variants: Lightroom and Capture One, each with its own zip." },
      { title: "Example: a sample pack", text: "A music producer sells a drum kit for $19 and a bigger bundle for $49, and gives one small pack away for free to grow an email list." },
    ],
    faqs: [
      { q: "What file types can I sell?", a: `Almost any file people download: PDF, EPUB, ZIP, audio, video, images, fonts, presets and code. Each file can be up to ${PRODUCT_FILE_LIMIT}. Programs that run when double clicked, like .exe files, are refused.` },
      { q: "How does the buyer get the file?", a: "By email. The receipt email has a button that opens a page with the downloads. Buyers with a Storelib account also see the purchase in their Library." },
      { q: "Can I sell a Notion or Canva template?", a: "Yes. Most people sell these as a link inside a PDF, or as a file. Upload the PDF and the buyer gets it like any other download." },
      { q: "Does Storelib add license keys?", a: "No. There are no software license keys. If you sell software that checks a key, Storelib is not the right fit for that product." },
      { q: "Do I need a website?", a: "No. Every product has its own page, and your creator page and OnePage list your products. A website is there when you want one." },
    ],
    help: ["/help/products/create-a-product", "/help/products/files-and-delivery", "/help/products/pricing", "/help/products/variants", "/help/orders-and-payouts/fees"],
    alternatives: ["gumroad", "payhip", "stan-store", "linktree"],
    blog: [
      { title: "How to start selling digital products with no experience", path: "/blog/how-to-start-selling-digital-products-no-experience-2026" },
      { title: "How to sell Notion templates online", path: "/blog/how-to-sell-notion-templates-online" },
      { title: "How to sell fonts online", path: "/blog/how-to-sell-fonts-online" },
    ],
    facts: ["digital", "variants", "pwyw", "offers", "coupons", "email"],
    limits: ["license-keys", "mor", "stripe-fee"],
    updated: UPDATED,
  },
  {
    ...named("online-courses"),
    seo: {
      title: "Sell online courses with video lessons and progress | Storelib",
      description: `Build a video course on Storelib with modules, lessons, captions and student progress. Sell it from your own pages. ${free.feeLabel} a sale on Free.`,
      h1: "Sell an online course on Storelib",
    },
    lede: "A course on Storelib is a product with lessons. Buyers watch in a player that remembers where they stopped.",
    whatYouSell: [
      "Video courses in modules and lessons",
      "Lessons with notes and files to download",
      "Lessons from YouTube or Vimeo, if your videos already live there",
      "A free preview lesson or two before buying",
    ],
    delivery: [
      { title: "A player with progress", text: "Buyers open the course from their receipt or their Library. The player shows each lesson in order and opens where they left off." },
      { title: "Captions and files", text: "Add captions as a .vtt or .srt file, and attach worksheets or project files to any lesson." },
      { title: "Reminder emails", text: "A student who started and went quiet for three days gets one reminder with the next lesson. Students can turn course emails off." },
      { title: "Preview lessons", text: "Mark lessons as previews and visitors can watch them on the course page before they buy." },
    ],
    steps: [
      { title: "Make a course", text: "In Products, press New product and choose Video course. The Lessons card comes first, right under the title." },
      { title: "Add modules and lessons", text: "Upload a video, or paste a YouTube or Vimeo link. Add notes, captions and files to each lesson.", shot: hero("course", "A demo pottery course's page on Storelib, with its lessons") },
      { title: "Price it and publish", text: "Set a price like any product, then publish. The course page lists the lessons and plays the previews.", shot: shot("editor-pricing", "The Pricing card in the Storelib product editor: a $29 price and a $39 compare at price") },
      { title: "Sell it next to your other products", text: "The course shows on your creator page, your OnePage and your website with everything else you sell.", shot: hero("creator", "A demo photographer's creator page on Storelib, with presets, a course and prints") },
    ],
    example: { priceCents: 14900, what: "a $149 course" },
    examples: [
      { title: "Example: a skills course", text: "A potter films twelve short lessons, makes the first one a free preview, and sells the course for $149." },
      { title: "Example: a course from a PDF guide", text: "A guide that grew into lessons keeps the PDF as a file on the first lesson, so buyers get both." },
    ],
    faqs: [
      { q: "Where are the videos hosted?", a: "On Storelib, when you upload them. If your videos are already on YouTube or Vimeo, a lesson can play them from there instead." },
      { q: "Can students see their progress?", a: "Yes. The player marks finished lessons and opens the course where the student stopped." },
      { q: "Can I give certificates or quizzes?", a: "Not today. A course on Storelib is lessons, notes, files and progress." },
      { q: "Can a course be part of a paid community?", a: "A community can have its own classroom with lessons for members. A course sold as a product is bought once." },
      { q: "Is there a limit on lessons?", a: `No fixed number. Uploaded videos count toward your file storage: ${free.storage} on Free and ${pro.storage} on Pro.` },
    ],
    help: ["/help/products/create-a-product", "/help/products/pricing", "/help/email/automations", "/help/orders-and-payouts/fees"],
    alternatives: ["kajabi", "podia", "stan-store", "gumroad", "whop", "skool"],
    blog: [{ title: "How to turn your skills into a digital product business", path: "/blog/how-to-turn-your-skills-into-a-digital-product-business-2026-guide" }],
    facts: ["courses", "digital", "coupons", "email", "offers"],
    limits: ["mor", "stripe-fee", "payout-regions"],
    updated: UPDATED,
  },
  {
    ...named("communities"),
    seo: {
      title: "Run a free or paid online community | Storelib",
      description: `Start a community on Storelib with a feed, chat, events and paid plans billed monthly or yearly. ${free.communities} communities on Free, more on Pro.`,
      h1: "Run a community on Storelib",
    },
    lede: "A community on Storelib is a place your members visit: posts, chat, events and files, free or paid.",
    whatYouSell: [
      "Paid membership, billed monthly or yearly",
      "A one time price to join",
      "Free plans next to paid ones",
      "Tickets to events",
      "Files and lessons for members",
    ],
    delivery: [
      { title: "Spaces inside the community", text: "Each community has spaces: a feed for posts, chat, announcements and resources. Members see the spaces their plan includes." },
      { title: "Billing handled by Stripe", text: "Paid plans renew through Stripe, and the same Storelib fee is taken from each payment as from any sale." },
      { title: "Public, unlisted or private", text: "A public community can be found in Explore. A private one needs an invite or an approved request, paid or not." },
      { title: "The iPhone app", text: "Members can follow along in the Storelib app on iPhone. On Android they use the browser." },
    ],
    steps: [
      { title: "Create the community", text: "Open Community and press New community. Give it a name, a cover and a short description." },
      { title: "Set its plans", text: "Keep it free, or add paid plans with a monthly or yearly price. You can have free and paid plans side by side." },
      { title: "Add spaces and invite people", text: "Set up the feed, chat and resources, then share the community's link or send invites.", shot: hero("community", "Inside a demo community on Storelib: its spaces and members' posts") },
    ],
    example: { priceCents: 1500, what: "a $15 monthly membership", per: "each month, for each paying member" },
    examples: [
      { title: "Example: a club for a craft", text: "A ceramics teacher runs a free community for everyone and a $15 a month plan with live sessions and a files library." },
      { title: "Example: a private group", text: "A coach keeps a private, invite only community for clients, with a yearly plan." },
    ],
    faqs: [
      { q: "How many communities can I have?", a: `${free.communities} on Free. On Pro, as many as you like.` },
      { q: "Can I connect Discord or Telegram?", a: "No. A Storelib community has its own feed and chat. There is no Discord or Telegram integration." },
      { q: "What currency are plans in?", a: "Community plans are priced and paid in US dollars." },
      { q: "Can members pay once instead of monthly?", a: "Yes. A plan can be recurring, monthly or yearly, or a one time price." },
    ],
    help: ["/help/orders-and-payouts/fees", "/help/orders-and-payouts/currencies-prices-and-payouts", "/help/orders-and-payouts/how-payouts-work"],
    alternatives: ["skool", "whop", "kajabi", "podia", "stan-store"],
    blog: [{ title: "Building an audience before you launch", path: "/blog/building-an-audience-before-you-launch" }],
    facts: ["communities", "memberships", "email", "explore"],
    limits: ["android", "stripe-fee", "payout-regions"],
    updated: UPDATED,
  },
  {
    ...named("creator-website"),
    seo: {
      title: "Creator website builder with a built in store | Storelib",
      description: `Build a website that sells your products, on yourname.storelib.com or your own domain. ${free.websites} websites on Free, ${pro.websites} on Pro with your own domain.`,
      h1: "Build a creator website on Storelib",
    },
    lede: "A website on Storelib comes with its store already in it: your products, the cart and checkout.",
    whatYouSell: [
      "Everything you sell on Storelib, on your own site",
      "Physical products with shipping, on your website",
      "Your site in more languages, and prices in more currencies",
    ],
    delivery: [
      { title: "Products appear on their own", text: "Products you publish show on your website without being added by hand. The cart and checkout are built in." },
      { title: "Your own domain on Pro", text: `On Free your site is at yourname.storelib.com. On Pro you connect a domain you own${pro.removeBranding ? " and can hide the Storelib branding" : ""}.` },
      { title: "Themes, including Shopify's", text: "Start from a Storelib theme, or upload a Shopify theme's zip and it becomes a Storelib theme. Most of a theme comes across; the Developer Hub lists what does not." },
      { title: "Languages and currencies", text: "Add a language and the site is translated, products included. Visitors in the countries you choose can see and pay in their own currency." },
    ],
    steps: [
      { title: "Pick a theme", text: "Open Websites, press New website and choose a theme, or upload one." },
      { title: "Edit the pages", text: "Change sections, text and pictures in the editor and check the phone layout with the preview switch.", shot: hero("editor", "The Storelib website builder with a demo streetwear store open") },
      { title: "Publish, then add your domain", text: "Publish to yourname.storelib.com. On Pro, connect your own domain from Settings, Domains.", shot: hero("street", "A demo streetwear store on Storelib, on a computer and a phone") },
    ],
    example: { priceCents: 4000, what: "a $40 order on your website" },
    examples: [
      { title: "Example: a shop that grew out of a bio link", text: "A seller who started with a OnePage moves to a website when the list of products gets long, and keeps the OnePage as the bio link." },
      { title: "Example: a store with prints and files", text: "A photographer sells prints that ship and preset packs that download, from one website and one checkout." },
    ],
    faqs: [
      { q: "How many websites can I make?", a: `${free.websites} on Free with ${free.pagesPerWebsite} pages each, and ${pro.websites} on Pro with ${pro.pagesPerWebsite} pages each.` },
      { q: "Can I use my own domain?", a: free.ownDomain ? "Yes, on every plan." : "Yes, on Pro. On Free your website is at yourname.storelib.com." },
      { q: "Can I bring my Shopify theme?", a: "You can upload a Shopify theme's zip and Storelib turns it into a theme for your website. Your Shopify products and customers do not come with it." },
      { q: "Do I need a website to sell?", a: "No. Your creator page and OnePage sell your products too. A website is for when you want your own address and design." },
    ],
    help: ["/help/website-builder/build-your-website", "/help/website-builder/custom-domain", "/help/website-builder/creator-page-website-onepage", "/help/website-builder/translate-your-website", "/help/website-builder/sell-in-more-currencies"],
    alternatives: ["shopify", "linktree", "stan-store"],
    blog: [{ title: "Where to sell digital products: a full guide for creators", path: "/blog/where-to-sell-digital-products-in-2026-a-full-guide-for-creators" }],
    facts: ["website", "domain", "shopify-themes", "translations", "currencies", "physical"],
    limits: ["mor", "stripe-fee", "payout-regions"],
    updated: UPDATED,
  },
]

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug)
}

/** The use case pages a comparison page links to: those that name it. */
export function useCasesFor(alternativeSlug: string): UseCase[] {
  return USE_CASES.filter((u) => u.alternatives.includes(alternativeSlug))
}

/** The /signup source a page's buttons carry: sell-digital-products. Read back by lib/alternatives/attribution readSignupSource. */
export function useCaseSource(slug: string): string {
  return `sell-${slug}`
}

/** Whether a use case is on today, given the switches. */
export function useCaseOn(u: UseCase, flags: Record<FactFlag, boolean>): boolean {
  return !u.flag || flags[u.flag]
}

/** The product type facts behind a page, for the tests: a page is only built for a type Storelib supports. */
export const SUPPORTED_TYPES = PRODUCT_TYPES.filter((t) => t.status !== "no").map((t) => t.id)
