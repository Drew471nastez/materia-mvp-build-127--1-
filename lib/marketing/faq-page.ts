/**
 * THE QUESTIONS ON /faq (landing round 13), grouped by topic.
 *
 * Every number in an answer is read from the table that decides it, the same
 * tables the pricing cards read (lib/billing/plans.ts says which), so an
 * answer cannot drift from what checkout, the plans and the uploads do:
 *
 *   prices and names   lib/billing/plans.ts
 *   fees               lib/billing/fee-calculator.ts getFeeDescription
 *   small orders       lib/marketing/facts.ts FEES (the $4.00 line)
 *   websites, pages    lib/sites/plan.ts
 *   storage, files     lib/storage/plans.ts, lib/marketing/facts.ts
 *   payout countries   lib/marketing/facts.ts PAYOUTS
 *   bookings           lib/bookings, lib/forms/booking-payment.ts (a paid
 *                      booking is paid through a product's checkout)
 *
 * Each question has a stable id, its address on the page (/faq#<id>), so a
 * link somebody shared keeps working when the wording of a question changes.
 *
 * Pure: tables only, so the server page builds it and hands the client plain
 * strings.
 */
import { PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, SCALE_CHECKOUT_PLAN_ID, SCALE_PRICE_CENTS, formatPlanPrice, planDisplayName } from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"
import { FEES, PAYOUTS, PRODUCT_FILE_LIMIT, proBreakEvenDollars } from "@/lib/marketing/facts"

export interface FaqQuestion {
  /** The question's address on the page: /faq#<id>. Never change one that has shipped. */
  id: string
  q: string
  a: string
}

export interface FaqTopic {
  id: string
  /** The short name in the topic list and the phone's chip row. */
  label: string
  /** The heading over the topic's questions. */
  title: string
  questions: FaqQuestion[]
}

/** The address people write to. */
export const SUPPORT_EMAIL = "support@storelib.com"

export function faqTopics(): FaqTopic[] {
  const GROW = PRO_CHECKOUT_PLAN_ID
  const PRO = SCALE_CHECKOUT_PLAN_ID
  const grow = planDisplayName(GROW)
  const pro = planDisplayName(PRO)
  const growPrice = formatPlanPrice(PRO_PRICE_CENTS)
  const proPrice = formatPlanPrice(SCALE_PRICE_CENTS)
  const fee = (id: "free" | typeof GROW | typeof PRO) => getFeeDescription(id).replace(" per sale", "")
  const rate = (id: "free" | typeof GROW | typeof PRO) => fee(id).split(" + ")[0]
  const sites = { free: siteLimits("free"), grow: siteLimits(GROW), pro: siteLimits(PRO) }
  const storage = { free: formatBytes(PLAN_LIMITS.free.storageQuotaBytes), grow: formatBytes(PLAN_LIMITS[GROW].storageQuotaBytes), pro: formatBytes(PLAN_LIMITS[PRO].storageQuotaBytes) }
  const files = { free: PLAN_LIMITS.free.maxFilesPerProduct, grow: PLAN_LIMITS[GROW].maxFilesPerProduct }
  const breakEven = proBreakEvenDollars().toLocaleString("en-US")

  return [
    {
      id: "getting-started",
      label: "Getting started",
      title: "Getting started",
      questions: [
        {
          id: "what-is-storelib",
          q: "What is Storelib?",
          a: "Storelib is one place to sell what you make. You get a website, a store page at storelib.com/yourname and a OnePage for your link in bio, with checkout, payouts, email and analytics built in, so you are not paying for six tools that do not talk to each other. Your products can also be listed in Explore, Storelib's marketplace.",
        },
        {
          id: "create-an-account",
          q: "How do I create an account?",
          a: "Press Sign up on any page and use your email, your Google account or your Apple account. Free asks for no card, so you can add your first product straight away.",
        },
        {
          id: "coding-skills",
          q: "Do I need any coding skills to set up my store?",
          a: "No. Pick a theme, then change the words, pictures and colours in the editor, or describe the change you want and the AI makes it. Your OnePage and your product pages work the same way.",
        },
        {
          id: "how-long-to-launch",
          q: "How long does it take to launch my store?",
          a: "As long as it takes to add one product. Sign up, add a title, a price and your file, publish, and your store page is live. Connect Stripe so the money reaches your bank. A website and your own domain can come later.",
        },
      ],
    },
    {
      id: "selling",
      label: "Selling",
      title: "Selling and products",
      questions: [
        {
          id: "what-can-i-sell",
          q: "What can I sell on Storelib?",
          a: `Files people download, like ebooks, templates, presets, music, fonts and software, video courses with lessons, free previews and each student's progress, and paid calls and sessions. Each file can be up to ${PRODUCT_FILE_LIMIT}. For calls, make a booking form with the times you are free and put it on your OnePage or your website: a visitor picks a time and, for a paid session, pays through your product's checkout. Bookings arrive in Bookings in your dashboard and can go straight to your Google Calendar, and the visitor can move or cancel from their email.`,
        },
        {
          id: "list-a-product",
          q: "How do I upload and list a product?",
          a: "In your dashboard, open Products and press New product. Add a title, a description, a price and your files, add a cover picture, and publish. It shows on your store page at once, and in Explore if you list it there.",
        },
        {
          id: "product-limit",
          q: "Is there a limit on how many products I can sell?",
          a: `No. Every plan has unlimited products. What changes by plan is room: ${files.free} files per product and ${storage.free} of storage on Free, ${files.grow} files per product and ${storage.grow} on ${grow}, ${storage.pro} on ${pro}.`,
        },
        {
          id: "free-products",
          q: "Can I offer free products?",
          a: "Yes. Set the price to 0. Buyers still go through checkout, so they get a receipt and the download and you get their email address, but no payment is taken. You can also let buyers pay what they want above a minimum you set.",
        },
        {
          id: "another-platform",
          q: "What if I already sell on another platform?",
          a: "Run both side by side. Add your products here, point your links at Storelib when you are ready, and close the old store once you no longer need it. Products on Gumroad can be imported as drafts; you upload their files again.",
        },
      ],
    },
    {
      id: "payments",
      label: "Payments",
      title: "Payments and payouts",
      questions: [
        {
          id: "how-fast-paid",
          q: "How fast do I get paid?",
          a: "Every sale is paid into your Stripe account. Once the money is available you cash it out, and it usually reaches your bank in 1 to 3 business days.",
        },
        {
          id: "payment-methods",
          q: "What payment methods do buyers have?",
          a: "Cards, including Apple Pay and Google Pay on the devices that offer them. Your website can show prices in a visitor's own currency and charge in it; your store page and Explore sell in US dollars.",
        },
        {
          id: "fees",
          q: "Does Storelib take a commission on my sales?",
          a: `Yes, a fee on each sale that depends on your plan: ${fee("free")} on Free, ${fee(GROW)} on ${grow} and ${fee(PRO)} on ${pro}. Orders under ${FEES.smallOrderBelow} pay a small order rate and no ${FEES.fixed}. Stripe's card processing fee is charged on top, on every plan, and there is nothing else.`,
        },
        {
          id: "set-up-payouts",
          q: "How do I set up payouts?",
          a: `Open Payouts in your dashboard and connect a Stripe account; Stripe asks for your details and your bank. Payouts can go to banks in ${PAYOUTS.regions}.`,
        },
      ],
    },
    {
      id: "plans",
      label: "Plans",
      title: "Plans and pricing",
      questions: [
        {
          id: "is-it-free",
          q: "Is Storelib free to use?",
          a: `Yes. Free has no monthly fee and no time limit; you pay only the fee on each sale (${fee("free")}). ${grow} at ${growPrice} a month and ${pro} at ${proPrice} a month lower that fee and give you more room.`,
        },
        {
          id: "grow-plan",
          q: `What's included in ${grow}?`,
          a: `${grow} is ${growPrice} a month. The fee on each sale drops from ${rate("free")} to ${rate(GROW)}, you can connect your own domain, Storelib branding comes off, and you get premium templates, the verified badge, ${sites.grow.maxSites} websites of ${sites.grow.maxPages} pages, ${storage.grow} of storage and ${sites.grow.aiEditsPerMonth} AI edits a month.`,
        },
        {
          id: "pro-plan",
          q: `What's included in ${pro}?`,
          a: `${pro} is ${proPrice} a month, for a bigger business. Everything in ${grow}, the lowest fee on each sale (${fee(PRO)}), ${sites.pro.maxSites} websites of ${sites.pro.maxPages} pages, ${storage.pro} of storage and ${sites.pro.aiEditsPerMonth.toLocaleString("en-US")} AI edits a month.`,
        },
        {
          id: "cancel-anytime",
          q: "Can I cancel my subscription anytime?",
          a: "Yes, from Billing in Settings, with no contract and no cancellation fee. Your paid plan stays active until the end of the period you paid for, then your account moves to Free. Your products, pages and orders stay as they are.",
        },
        {
          id: "free-trial",
          q: "Is there a free trial for paid plans?",
          a: `There is no trial, because Free has no time limit. Sell on Free as long as you like and upgrade when it pays: at ${rate(GROW)} instead of ${rate("free")}, ${grow} covers its ${growPrice} from about $${breakEven} in sales a month.`,
        },
      ],
    },
    {
      id: "website",
      label: "Your website",
      title: "Your website and brand",
      questions: [
        {
          id: "own-domain",
          q: "Can I use my own domain?",
          a: `Yes, on ${grow} (${growPrice} a month) and ${pro}. Your website then lives at yourname.com. On Free it is at yourname.storelib.com.`,
        },
        {
          id: "link-in-bio",
          q: "What's the difference between Storelib and a link-in-bio tool?",
          a: "A link-in-bio tool lists your links. Storelib sells: product pages, checkout, payouts, email and analytics. Your OnePage is the link in bio, and people buy right on it.",
        },
        {
          id: "customize-look",
          q: "Can I customize the look of my store?",
          a: `Yes. Pick a theme, then change colours, fonts, layouts, your logo and your pictures in the editor, or ask the AI for the change. Premium templates come with ${grow} and ${pro}. None of it needs code.`,
        },
        {
          id: "what-is-onepage",
          q: "What is OnePage?",
          a: "Your link in bio page at storelib.me/yourname: your links, your socials, an email sign up and your products, which people can buy right there. Put it in your bio and everything you sell is one tap away.",
        },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      title: "Explore, the marketplace",
      questions: [
        {
          id: "marketplace",
          q: "How does the Storelib marketplace work?",
          a: `Explore is Storelib's marketplace. Products you list there can be found by people browsing it, on top of the buyers you bring yourself. A sale through Explore pays the same fee as a direct sale.`,
        },
        {
          id: "visibility",
          q: "How can I increase my product visibility?",
          a: "Give it a title that says what it is, a description with the words people search for, a sharp cover picture and the right category. Reviews from buyers help too.",
        },
        {
          id: "reviews",
          q: "Can buyers leave reviews on my products?",
          a: "Yes. Storelib can email buyers a review request a few days after they buy, and their stars and reviews show on your product pages.",
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      title: "Support and account",
      questions: [
        {
          id: "contact-support",
          q: "How do I contact support?",
          a: `Email ${SUPPORT_EMAIL}, or open Support in your dashboard and start a new request. The Help Center has step by step guides for most things.`,
        },
        {
          id: "multiple-stores",
          q: "Can I have multiple stores?",
          a: `One account has one store page and one OnePage, and more than one website: ${sites.free.maxSites} on Free, ${sites.grow.maxSites} on ${grow} and ${sites.pro.maxSites} on ${pro}.`,
        },
        {
          id: "data-secure",
          q: "Is my data secure?",
          a: "Card payments are handled by Stripe, so your buyers' card numbers never reach Storelib. Every page is served over an encrypted connection, and the Privacy Policy says what we keep and why.",
        },
      ],
    },
  ]
}
