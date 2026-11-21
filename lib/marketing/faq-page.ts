/**
 * THE QUESTIONS ON /faq (landing round 13, widened in round 14), grouped by
 * topic.
 *
 * Every number in an answer is read from the table that decides it, the same
 * tables the pricing cards read (lib/billing/plans.ts says which), so an
 * answer cannot drift from what checkout, the plans and the uploads do:
 *
 *   prices and names   lib/billing/plans.ts (and YEARLY_BILLING_LIVE)
 *   fees               lib/billing/fee-calculator.ts getFeeDescription
 *   small orders       lib/marketing/facts.ts FEES (the $4.00 line)
 *   websites, pages    lib/sites/plan.ts
 *   storage, files     lib/storage/plans.ts, lib/marketing/facts.ts
 *   payout countries   lib/marketing/facts.ts PAYOUTS
 *   bookings           lib/bookings, lib/forms/booking-payment.ts (a paid
 *                      booking is paid through a product's checkout)
 *   communities        lib/communities/plan-limit.ts
 *   team seats         lib/team/roles.ts
 *
 * Round 14 (the owner: "make the FAQ answer everything people look for about
 * Storelib"). The words that are not numbers were each checked against the
 * code that does the thing, and the Help Center article that explains it:
 *
 *   refunds            app/api/stripe/refund (reverse_transfer, the fee is
 *                      not returned), help refund-an-order
 *   tax and VAT        lib/tax/rules.ts (Settings, Taxes; digital off by
 *                      default), facts LIMITATIONS "mor"
 *   when you are paid  help how-payouts-work (settling, Cash out)
 *   disputes           help disputes
 *   delivery           help files-and-delivery
 *   emails             app/(storelib)/app/emails, help subscribers,
 *                      send-an-email, automations
 *   analytics          help currencies-prices-and-payouts (how visits are
 *                      tracked), app/(storelib)/app/analytics/export-button
 *   team               lib/team/roles.ts, permissions.ts
 *   deleting           lib/account/delete-account.ts, help delete-your-account
 *   exports            Orders' Export, the Subscribers tab, Analytics' export
 *   languages          lib/i18n/translations.ts (the dashboard),
 *                      lib/markets/auto-translate.ts (a website)
 *
 * A feature that waits behind a platform switch (communities, physical
 * products, Explore: lib/alternatives/flags.ts) is only promised while its
 * switch is on. The page reads the switches; with none given every one is on.
 *
 * Each question has a stable id, its address on the page (/faq#<id>), so a
 * link somebody shared keeps working when the wording of a question changes.
 *
 * Pure: tables only, so the server page builds it and hands the client plain
 * strings.
 */
import { PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, SCALE_CHECKOUT_PLAN_ID, SCALE_PRICE_CENTS, YEARLY_BILLING_LIVE, formatPlanPrice, planDisplayName } from "@/lib/billing/plans"
import { cardRateLabel, getFeeDescription, standardRateFor } from "@/lib/billing/fee-calculator"
import { ratePercentLabel } from "@/lib/payments/fees/config"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"
import { FREE_COMMUNITY_LIMIT } from "@/lib/communities/plan-limit"
import { FREE_SEATS, PRO_SEATS } from "@/lib/team/roles"
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

/** Which platform switches are on (lib/alternatives/flags.ts). */
export interface FaqFlags {
  communities: boolean
  explore: boolean
  physical: boolean
}

/** The address people write to. */
export const SUPPORT_EMAIL = "support@storelib.com"

/** The languages the dashboard has words for (lib/i18n/translations.ts), by their English names. */
export const DASHBOARD_LANGUAGES = "English, Spanish, French, German, Italian, Portuguese and Polish"

const ALL_ON: FaqFlags = { communities: true, explore: true, physical: true }

/** "a, b and c". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function faqTopics(flags: FaqFlags = ALL_ON): FaqTopic[] {
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
  const { communities, explore, physical } = flags
  const kinds = listOf(["files people download", "video courses", ...(communities ? ["paid communities"] : []), "calls and sessions", ...(physical ? ["things you ship"] : [])])
  const inExplore = explore ? ", and in Explore if you list it there" : ""

  const q = (id: string, question: string, a: string): FaqQuestion => ({ id, q: question, a })

  const topics: (FaqTopic | null)[] = [
    {
      id: "getting-started",
      label: "Getting started",
      title: "Getting started",
      questions: [
        q(
          "what-is-storelib",
          "What is Storelib?",
          `Storelib is one place to sell what you make: ${kinds}. You get a website, a store page at storelib.com/yourname and a OnePage for your link in bio, with checkout, payouts, email and analytics built in, so you are not paying for six tools that do not talk to each other.${explore ? " Your products can also be listed in Explore, Storelib's marketplace." : ""}`,
        ),
        q("create-an-account", "How do I create an account?", "Press Sign up on any page and use your email, your Google account or your Apple account. Free asks for no card, so you can add your first product straight away."),
        q("coding-skills", "Do I need any coding skills to set up my store?", "No. Pick a theme, then change the words, pictures and colours in the editor, or describe the change you want and the AI makes it. Your OnePage and your product pages work the same way."),
        q("how-long-to-launch", "How long does it take to launch my store?", "As long as it takes to add one product. Sign up, add a title, a price and your file, publish, and your store page is live. Connect Stripe so the money reaches your bank. A website and your own domain can come later."),
        q(
          "another-platform",
          "What if I already sell on another platform?",
          "Yes. Products on Gumroad can be imported as drafts with your Gumroad access token, from Products in your dashboard; you upload their files again. From anywhere else, add your products here. You can run both stores side by side, point your links at Storelib when you are ready and close the old store once you no longer need it.",
        ),
      ],
    },
    {
      id: "selling",
      label: "Selling",
      title: "Selling and products",
      questions: [
        q(
          "what-can-i-sell",
          "What can I sell on Storelib?",
          `Files people download, like ebooks, templates, presets, music, fonts and software, video courses with lessons, free previews and each student's progress, and paid calls and sessions.${communities ? " You can also run a community, free or paid." : ""}${physical ? " Things you ship can be sold from your website." : ""} Each file can be up to ${PRODUCT_FILE_LIMIT}. For calls, make a booking form with the times you are free and put it on your OnePage or your website: a visitor picks a time and, for a paid session, pays through your product's checkout. Bookings arrive in Bookings in your dashboard and can go straight to your Google Calendar, and the visitor can move or cancel from their email.`,
        ),
        q("list-a-product", "How do I upload and list a product?", `In your dashboard, open Products and press New product. Add a title, a description, a price and your files, add a cover picture, and publish. It shows on your store page at once${inExplore}.`),
        q("product-limit", "Is there a limit on how many products I can sell?", `No. Every plan has unlimited products. What changes by plan is room: ${files.free} files per product and ${storage.free} of storage on Free, ${files.grow} files per product and ${storage.grow} on ${grow}, ${storage.pro} on ${pro}.`),
        q("file-size", "How big can my files be?", `Up to ${PRODUCT_FILE_LIMIT} each, on every plan. How many files a product holds and how much you can store in all depends on your plan: ${files.free} files per product and ${storage.free} on Free, ${files.grow} files per product and ${storage.grow} on ${grow}, ${storage.pro} on ${pro}.`),
        q(
          "delivery",
          "How do buyers get their files?",
          "Right after paying, the buyer gets a receipt email whose button opens their download page. Each download link is made when it is pressed and works for a few minutes, so a copied link cannot be passed around. Buyers with a Storelib account also find every purchase in their Library. If someone loses the email, resend the receipt from Orders.",
        ),
        q("free-products", "Can I offer free products?", "Yes. Set the price to 0. Buyers still go through checkout, so they get a receipt and the download and you get their email address, but no payment is taken. You can also let buyers pay what they want above a minimum you set."),
        q(
          "courses",
          "Can I sell a video course?",
          "Yes. A course is made of modules and lessons, each with an uploaded video or a YouTube or Vimeo link, captions and files to download. Mark some lessons as free previews so people can try before they buy. Students pick up where they left off, because each one's progress is kept.",
        ),
        communities
          ? q(
              "communities",
              "Can I run a community?",
              `Yes, free or paid, public or private, with a feed, chat, announcements, resources and events. Paid communities have monthly or yearly plans, billed in US dollars. Free includes ${FREE_COMMUNITY_LIMIT} communities; ${grow} and ${pro} have no limit.`,
            )
          : null,
        q(
          "bookings",
          "Can I sell calls and coaching sessions?",
          "Yes. Make a booking form with the times you are free and add it to your OnePage or your website. A visitor picks a time and, for a paid session, pays at checkout. Bookings arrive in Bookings in your dashboard and can go to your Google Calendar, and the visitor can move or cancel from their email.",
        ),
        physical
          ? q(
              "physical-products",
              "Can I sell physical products?",
              `Yes, from your website, with variants, stock, shipping zones and rates, and the tax rates you set. Physical products are sold on your website only${explore ? ", not in Explore" : ""}.`,
            )
          : null,
      ].filter((x): x is FaqQuestion => x !== null),
    },
    {
      id: "payments",
      label: "Payments",
      title: "Payments and payouts",
      questions: [
        q(
          "how-fast-paid",
          "How fast do I get paid?",
          "Every sale goes into your balance at once, minus the fee. It first settles, which for most new accounts takes about seven days and gets shorter as your account builds a history; Payouts shows the day each amount becomes available. Then press Cash out and it usually reaches your bank in 1 to 3 business days.",
        ),
        q("set-up-payouts", "How do I set up payouts?", `Open Payouts in your dashboard and connect a Stripe account; Stripe asks for your details, to verify who you are, and your bank. Payouts can go to banks in ${PAYOUTS.regions}.`),
        q(
          "payout-countries",
          "Which countries can receive payouts?",
          `Banks in ${PAYOUTS.regions}. Your balance and your payouts are in your account's own currency, set by the country you choose when you set up payments.`,
        ),
        q(
          "payment-methods",
          "What payment methods do buyers have?",
          `Cards, including Apple Pay and Google Pay on the devices that offer them. Your website can show prices in a visitor's own currency and charge in it; your store page${explore ? " and Explore" : ""} sell in US dollars.`,
        ),
        q(
          "fees",
          "Does Storelib take a commission on my sales?",
          `Yes, a fee on each sale that depends on your plan: ${fee("free")} on Free, ${fee(GROW)} on ${grow} and ${fee(PRO)} on ${pro}.${physical ? ` Products that ship pay ${cardRateLabel("free", "physical")} on Free, ${cardRateLabel(GROW, "physical")} on ${grow} and ${cardRateLabel(PRO, "physical")} on ${pro}.` : ""} Orders under ${FEES.smallOrderBelow} pay a small order rate and no ${FEES.fixed}. Stripe's card processing fee is charged on top, on every plan, and there is nothing else. Payouts shows the fee on every sale.`,
        ),
        q(
          "refunds",
          "How do refunds work?",
          "Whether you give refunds, and for how long, is your choice, and you can show your refund policy on your product pages. To refund, open the order in Orders and press Refund, for the whole amount or part of it. The buyer gets the money back on the card they paid with and an email. A full refund also closes their access to the files. The amount comes out of your balance, and Storelib's fee on the sale is not returned.",
        ),
        q(
          "taxes",
          "Does Storelib handle sales tax and VAT?",
          "You are the seller, so the tax is yours to charge and to file; Storelib does not collect or file sales tax or VAT for you. In Settings, Taxes, add the countries, states or provinces you charge tax in with their rates, choose whether your prices already include tax, and whether downloads and courses are taxed too, which is off until you turn it on. A buyer outside every region you added pays no tax.",
        ),
        q(
          "disputes",
          "What happens if a buyer disputes a payment?",
          "We email you and the case appears under Disputes on Payouts. The bank holds your share of the sale while it decides, which usually takes 60 to 75 days. Press Add evidence and say what the buyer bought and that it was delivered; Storelib answers the bank with it. If the bank decides for you, the money goes back to your balance.",
        ),
      ],
    },
    {
      id: "plans",
      label: "Plans",
      title: "Plans and pricing",
      questions: [
        q("is-it-free", "Is Storelib free to use?", `Yes. Free has no monthly fee and no time limit; you pay only the fee on each sale (${fee("free")}). ${grow} at ${growPrice} a month and ${pro} at ${proPrice} a month lower that fee and give you more room.`),
        q(
          "grow-plan",
          `What's included in ${grow}?`,
          `${grow} is ${growPrice} a month. The fee on each sale drops from ${rate("free")} to ${rate(GROW)}${physical ? ` (from ${ratePercentLabel(standardRateFor("free", "physical"))} to ${ratePercentLabel(standardRateFor(GROW, "physical"))} on products that ship)` : ""}, you can connect your own domain, Storelib branding comes off, and you get premium templates, the verified badge, ${sites.grow.maxSites} websites of ${sites.grow.maxPages} pages, ${storage.grow} of storage and ${sites.grow.aiEditsPerMonth} AI edits a month.`,
        ),
        q(
          "pro-plan",
          `What's included in ${pro}?`,
          `${pro} is ${proPrice} a month, for a bigger business. Everything in ${grow}, the lowest fee on each sale (${fee(PRO)}), ${sites.pro.maxSites} websites of ${sites.pro.maxPages} pages, ${storage.pro} of storage and ${sites.pro.aiEditsPerMonth.toLocaleString("en-US")} AI edits a month.`,
        ),
        q("free-trial", "Is there a free trial for paid plans?", `There is no trial, because Free has no time limit. Sell on Free as long as you like and upgrade when it pays: at ${rate(GROW)} instead of ${rate("free")}, ${grow} covers its ${growPrice} from about $${breakEven} in sales a month.`),
        q(
          "billing-period",
          "Can I pay yearly?",
          YEARLY_BILLING_LIVE
            ? `Yes. ${grow} and ${pro} can be paid monthly or yearly, from Plan in Settings.`
            : `Not yet. ${grow} and ${pro} are paid monthly, by card, and you can upgrade, change plan or cancel whenever you like.`,
        ),
        q(
          "cancel-anytime",
          "Can I cancel my subscription anytime?",
          "Yes, from Plan in Settings, with no contract and no cancellation fee. Your paid plan stays active until the end of the period you paid for, then your account moves to Free and its fee. Your products, pages and orders stay as they are. Invoices and the card on file are there too.",
        ),
      ],
    },
    {
      id: "website",
      label: "Your website",
      title: "Your website and brand",
      questions: [
        q(
          "store-website-onepage",
          "What's the difference between my store page, website and OnePage?",
          "Your store page, storelib.com/yourname, is your profile: picture, bio, links and products, and every account has one. Your website, yourname.storelib.com or your own domain, is a site you build from a theme with as many sections as you like. Your OnePage, storelib.me/yourname, is one page for your social bios. Your products appear on all three, and you do not need all three: most people start with the store page.",
        ),
        q(
          "own-domain",
          "Can I use my own domain?",
          `Yes, on ${grow} (${growPrice} a month) and ${pro}. Add it in Settings, Domains, then add the records shown there where you bought the domain. Once they are found, the HTTPS certificate is set up for you. On Free your website is at yourname.storelib.com.`,
        ),
        q("customize-look", "Can I customize the look of my store?", `Yes. Pick a theme, then change colours, fonts, layouts, your logo and your pictures in the editor, or ask the AI for the change. Premium templates come with ${grow} and ${pro}. None of it needs code.`),
        q("remove-branding", "Can I remove the Storelib branding?", `Yes, on ${grow} and ${pro}. On Free, Storelib's branding shows on your website.`),
        q(
          "languages",
          "Can my website be in more than one language?",
          "Yes. Add a language in Settings, Languages & Currency, and your website's pages and products are translated a few minutes after you publish. You can read and edit every translation, and a change you make yourself is kept. Your website can also show prices in a visitor's own currency and charge in it.",
        ),
        q("what-is-onepage", "What is OnePage?", "Your link in bio page at storelib.me/yourname: your links, your socials, an email sign up and your products, which people can buy right there. Put it in your bio and everything you sell is one tap away."),
        q("link-in-bio", "What's the difference between Storelib and a link-in-bio tool?", "A link-in-bio tool lists your links. Storelib sells: product pages, checkout, payouts, email and analytics. Your OnePage is the link in bio, and people buy right on it."),
      ],
    },
    {
      id: "marketing",
      label: "Marketing",
      title: "Email, analytics and marketing",
      questions: [
        q(
          "emails",
          "Can I send emails and newsletters?",
          "Yes, from Emails in your dashboard, on every plan. People join your list through the sign up forms on your store page, product pages, website and OnePage; buyers are not added just by buying. Write an email, send it now or schedule it, and see who opened it and clicked. Two automations send on their own: a welcome when someone subscribes and a thank you when someone buys. Every email has an unsubscribe link.",
        ),
        q(
          "analytics",
          "What analytics do I get?",
          "Visitors, where they came from and your sales, across your website, product pages, store page and OnePage. Sources include search engines, social apps, email, your utm tags and ?ref= links, and clicks from Google, Facebook, Instagram, TikTok, X and LinkedIn ads. Every report can be exported to CSV.",
        ),
        q(
          "discounts",
          "Can I offer discount codes and bundles?",
          "Yes. Discount codes take a percentage or an amount off, with dates, usage limits and a minimum spend. Offers add bundles of products at a lower price, a product suggested in the cart and at checkout, and tiers like Buy 2 get 1 free.",
        ),
        q("reviews", "Can buyers leave reviews on my products?", "Yes. Storelib can email buyers a review request a few days after they buy, and their stars and reviews show on your product pages."),
      ],
    },
    explore
      ? {
          id: "explore",
          label: "Explore",
          title: "Explore, the marketplace",
          questions: [
            q("marketplace", "How does the Storelib marketplace work?", "Explore is Storelib's marketplace. Products you list there can be found by people browsing it, on top of the buyers you bring yourself. A sale through Explore pays the same fee as a direct sale."),
            q("visibility", "How can I increase my product visibility?", "Give it a title that says what it is, a description with the words people search for, a sharp cover picture and the right category. Reviews from buyers help too."),
          ],
        }
      : null,
    {
      id: "account",
      label: "Account",
      title: "Support and account",
      questions: [
        q("contact-support", "How do I contact support?", `Email ${SUPPORT_EMAIL}, or open Support in your dashboard and start a new request; a person replies there and by email. The Help Center has step by step guides for most things.`),
        q("multiple-stores", "Can I have multiple stores?", `One account has one store page and one OnePage, and more than one website: ${sites.free.maxSites} on Free, ${sites.grow.maxSites} on ${grow} and ${sites.pro.maxSites} on ${pro}.`),
        q(
          "team",
          "Can my team help run my store?",
          `Yes. Invite people in Settings, Team, and choose what each one can see and change, such as products, orders, emails or payouts. Free has room for ${FREE_SEATS} people besides you, ${grow} and ${pro} for ${PRO_SEATS}. Settings, Activity shows who changed what and when. Refunds and deleting the store stay with you.`,
        ),
        q(
          "data-secure",
          "Is my data secure?",
          "Card payments are handled by Stripe, so your buyers' card numbers never reach Storelib. Every page is served over an encrypted connection. You can sign in with Google or Apple, and Settings, Security can sign you out on every device at once. The Privacy Policy says what we keep and why.",
        ),
        q(
          "export-data",
          "Can I export my data?",
          "Yes. Orders exports your orders to a CSV file, the Subscribers tab in Emails downloads your list, and Analytics exports its reports. Your buyers and subscribers are yours to take with you.",
        ),
        q(
          "delete-account",
          "How do I delete my account?",
          "Open Settings, Security, press Delete account and enter the code we email you. Cancel a paid plan first. If money from your sales is still on its way or a dispute is open, you are told what is left to settle first. Your pages and products go offline. Buyers keep what they bought, and orders stay as financial records.",
        ),
        q("dashboard-language", "Which languages is the dashboard in?", `${DASHBOARD_LANGUAGES}. Choose yours in Settings.`),
        q("mobile-app", "Is there a Storelib app?", "Yes, for iPhone and iPad on the App Store. On Android, Storelib works in the browser."),
      ],
    },
  ]
  return topics.filter((t): t is FaqTopic => t !== null)
}
