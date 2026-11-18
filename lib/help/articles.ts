/**
 * ===========================================================================
 *  THE HELP CENTRE'S ARTICLES
 * ===========================================================================
 * Every article at /help, as data: the index, the category pages, the article
 * pages, the search and the sitemap all read this one list, so an article
 * added here is linked, searchable and in the sitemap without anybody
 * remembering three other places.
 *
 * WRITTEN FROM THE CODE, NOT FROM THE MARKETING. Each statement here was
 * checked against what the product does today: the fee in
 * lib/billing/fee-calculator, the cash out rules on /app/payouts and
 * app/api/stripe/cashout, the refund route, the receipt rules in
 * lib/receipts/rules, the DNS records in Settings > Domains. When the
 * product changes, the article that describes it changes with it; an
 * article that is wrong is worse than no article.
 *
 * Text may carry links as [label](/path). Nothing else is parsed.
 */
import { MAX_UPLOAD_BYTES, formatLimit } from "@/lib/security/uploads/policy"

import { PHYSICAL_ARTICLES, PHYSICAL_CATEGORY, SITE_WIDE_ARTICLES } from "./physical-articles"
import { OFFER_ARTICLES } from "./offer-articles"

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  /** A smaller heading inside a section, for a long article (the playbook): linkable, but not in the contents list. */
  | { type: "sub"; text: string }
  /** Short labelled lines, like "What you connect" and its answer, read top to bottom. */
  | { type: "facts"; items: [label: string, text: string][] }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "note"; text: string }
  /** A drawn picture of the screen being explained (components/help/help-figures). */
  | { type: "figure"; figure: string; caption: string }
  /**
   * A screenshot of the real screen, a WebP under public/help/, taken at 2x
   * from the real components with made up demo data (see the note in
   * lib/help/physical-shots.ts). `width` and `height` are its size in CSS
   * pixels, so the page keeps its space while it loads.
   */
  | { type: "image"; src: string; alt: string; caption?: string; width: number; height: number; phone?: HelpPicture }

/** A second picture of the same screen, taken at phone width, shown instead on a narrow screen. */
export interface HelpPicture {
  src: string
  width: number
  height: number
}

export interface HelpCategory {
  slug: string
  title: string
  description: string
  /** Shown only while physical commerce is on in /admin. */
  physical?: boolean
  /** The article its page puts first under Start here, when it isn't the first in the list. */
  start?: string
}

export interface HelpArticle {
  slug: string
  category: string
  title: string
  /** One sentence, shown in lists, search results and the meta description. */
  summary: string
  /** Words people search with that the text itself may not use. */
  keywords?: string[]
  /** A group inside a big topic (the physical products guide), shown as a heading on the topic's page. */
  section?: string
  /** When the article was last checked against the product (YYYY-MM-DD): the page's date, the sitemap's lastmod. */
  updated?: string
  /** Other articles to read next, as slugs in the same topic or "topic/slug". */
  related?: string[]
  body: HelpBlock[]
}

export const SUPPORT_EMAIL = "support@storelib.com"

export const HELP_CATEGORIES: HelpCategory[] = [
  { slug: "getting-started", title: "Getting started", description: "Your account, your page address and your first product." },
  { slug: "products", title: "Products", description: "Creating, pricing and delivering what you sell." },
  { slug: "orders-and-payouts", title: "Orders and payouts", description: "Stripe, fees, orders, refunds and cashing out." },
  { slug: "website-builder", title: "Website builder", description: "Your creator page, your website, OnePage and your own domain." },
  { slug: "email", title: "Email", description: "Subscribers, emails to your list and automations." },
  { slug: "account-and-billing", title: "Account and billing", description: "Plans, signing in and closing your account." },
  { slug: "policies", title: "Policies", description: "Refund policies, cookies, privacy and reporting a product." },
]

export const HELP_ARTICLES: HelpArticle[] = [
  /* ── Getting started ─────────────────────────────────────────────────── */
  {
    slug: "create-your-account",
    category: "getting-started",
    title: "Create your account",
    summary: "Sign up with your email, Google or Apple, and confirm your address with a code.",
    keywords: ["sign up", "signup", "register", "join", "verification code", "login"],
    body: [
      { type: "p", text: "Go to [storelib.com/signup](/signup). You can sign up with an email address and a password, or with your Google or Apple account." },
      { type: "p", text: "With an email address, we send a 6 digit code to that address. Enter it on the next screen to confirm the address is yours. If the code does not arrive within a few minutes, check your spam folder, then ask for a new one from the same screen." },
      { type: "p", text: "With Google or Apple, there is no code: the address comes from that account." },
      { type: "h", text: "Signing in later" },
      { type: "p", text: "Sign in at [storelib.com/login](/login) with the same method you signed up with. If you signed up with Google, use Continue with Google rather than a password." },
    ],
  },
  {
    slug: "your-page-address",
    category: "getting-started",
    title: "Your username and page address",
    summary: "Your username is the address of your creator page, storelib.com/yourname.",
    keywords: ["username", "handle", "url", "link", "address", "change username", "store link"],
    body: [
      { type: "p", text: "Your username decides where your pages live:" },
      {
        type: "table",
        head: ["Page", "Address"],
        rows: [
          ["Creator page", "storelib.com/yourname"],
          ["A product", "storelib.com/yourname/product-name"],
          ["OnePage (link in bio)", "storelib.me/yourname"],
          ["Website", "yourname.storelib.com"],
        ],
      },
      { type: "h", text: "Change your username" },
      { type: "steps", items: ["Open Settings from the menu under your profile picture.", "On the General tab, edit Username.", "Save."] },
      { type: "note", text: "Links you have already shared use the old username. Update them wherever you posted them, such as your social profiles." },
      { type: "p", text: "Some words are reserved because Storelib uses them for its own pages, such as help or explore. The field tells you when a name is not available." },
    ],
  },
  {
    slug: "add-your-first-product",
    category: "getting-started",
    title: "Add your first product",
    summary: "The shortest path from an empty account to a product people can buy.",
    keywords: ["first sale", "new product", "start selling", "setup", "checklist"],
    body: [
      { type: "steps", items: [
        "Open Products in the dashboard and press New product.",
        "Give it a title, a cover image and a description.",
        "Upload the files the buyer should receive.",
        "Set a price. Use 0 to give it away.",
        "Pick a category, so it can be found on Explore.",
        "Press Publish.",
      ] },
      { type: "p", text: "To be paid for a sale you also need Stripe connected. See [Connect Stripe to get paid](/help/orders-and-payouts/connect-stripe)." },
      { type: "p", text: "Everything else in the product editor (variants, FAQ, a refund policy, SEO) is optional and can be added later. See [Create and edit a product](/help/products/create-a-product)." },
    ],
  },
  {
    slug: "find-your-way-around",
    category: "getting-started",
    title: "Find your way around the dashboard",
    summary: "What each item in the dashboard menu is for.",
    keywords: ["dashboard", "menu", "sidebar", "navigation", "where is"],
    body: [
      { type: "table", head: ["Menu item", "What it is for"], rows: [
        ["Dashboard", "Your recent sales and visits at a glance."],
        ["Products", "Everything you sell. Coupons sits underneath it."],
        ["Analytics", "Visits, sales and where visitors come from."],
        ["Orders", "Every sale, with refunds, receipts and invoices."],
        ["Creator Page", "The page at storelib.com/yourname."],
        ["Website", "The site you build at yourname.storelib.com."],
        ["OnePage", "Your link in bio page."],
        ["Emails", "Subscribers, emails to your list and automations."],
        ["Payouts", "Your balance and cashing out to your bank."],
      ] },
      { type: "p", text: "Settings and Billing are in the menu under your profile picture, along with a link back to this Help Center." },
    ],
  },

  /* ── Products ────────────────────────────────────────────────────────── */
  {
    slug: "create-a-product",
    category: "products",
    title: "Create and edit a product",
    summary: "The parts of the product editor, and which of them you need.",
    keywords: ["product editor", "new product", "description", "images", "faq", "whats included", "seo", "call to action"],
    body: [
      { type: "p", text: "Open Products and press New product, or press a product in the list to edit it. The editor is split into parts. Only a title and a price are needed to publish; the rest makes the page better." },
      { type: "table", head: ["Part", "What goes in it"], rows: [
        ["About", "The title."],
        ["Media", "Images and video shown at the top of the product page."],
        ["Description", "What the product is, formatted text."],
        ["What's included", "A short list of what the buyer gets."],
        ["FAQ", "Questions and answers shown on the page."],
        ["Files", "What the buyer downloads after paying."],
        ["Variants", "Versions with their own price and files."],
        ["Pricing", "Price, compare at price and pay what you want."],
        ["Category", "Where it is listed on Explore."],
        ["Settings", "The buy button's words and a refund policy."],
        ["SEO", "The title and description search engines show."],
      ] },
      { type: "p", text: "Changes to a published product go live when you save. A product that is not published is only visible to you." },
    ],
  },
  {
    slug: "product-questions",
    category: "products",
    updated: "2026-10-25",
    title: "Add questions (FAQ) to a product",
    summary: "Write a product's own questions and answers once in the product editor, and they show on every page that shows that product.",
    keywords: ["faq", "faqs", "questions", "answers", "q&a", "frequently asked questions", "product questions", "accordion", "collapsible", "metafield"],
    related: ["create-a-product", "website-builder/build-your-website", "physical-products/set-up-size-charts"],
    body: [
      { type: "p", text: "A product's questions are short questions and answers about that one product, like Does it shrink? or How long is the course? You write them once in the product editor, and every page that shows the product shows them, in the order you put them in. They work for every kind of product: downloads, courses, memberships, services and things you ship." },

      { type: "h", text: "Add questions" },
      {
        type: "steps",
        items: [
          "Open Products and press the product, or press New product.",
          "Find the FAQ card and press Add FAQ.",
          "Type the question, then the answer. Press Enter in the answer for a new line.",
          "Add as many as you need. To change the order, hold the handle at the top of a question and move it.",
          "To take one out, press the bin on it.",
          "Save the product.",
        ],
      },
      { type: "p", text: "A question with no answer, or an answer with no question, is not saved. Up to 30 questions show." },

      { type: "h", text: "Where they show" },
      {
        type: "table",
        head: ["Place", "What buyers see"],
        rows: [
          ["Your product page on Storelib", "Under the description, after Details, as questions that open."],
          ["Your website, on a Storelib theme", "The Product questions block in the product section. An FAQ section on the product page shows them too."],
          ["Your OnePage", "In the product sheet that opens when someone taps the product, under the description."],
          ["Your website, on an imported theme", "In the theme's own folding rows, or under the description. A Featured product section shows its product's questions too."],
        ],
      },

      { type: "h", text: "On a Storelib theme" },
      { type: "p", text: "The product section has a Product questions block. It is there by itself on a new product page. Move it, change its heading, or open the first question from the block's settings in the website builder." },
      { type: "sub", text: "An FAQ section on the product page" },
      { type: "p", text: "Every FAQ section (Accordion FAQ, FAQ columns, FAQ with a button, and FAQ) has a Questions from setting. It decides what the section shows on a product page:" },
      {
        type: "table",
        head: ["Questions from", "On a product page"],
        rows: [
          ["The product, else these", "The product's own questions. On a product with none, or when the product section already shows them, the section's own questions."],
          ["The product only", "The product's own questions. On a product with none, the section is hidden from buyers."],
          ["These questions only", "The section's own questions, always."],
        ],
      },
      { type: "p", text: "On any other page, like your home page, an FAQ section always shows its own questions. The questions you type into the section are kept as they are, whichever you choose." },

      { type: "h", text: "On an imported theme" },
      {
        type: "list",
        items: [
          "If your theme has folding rows in its product section (often called Collapsible row or Collapsible tab), the questions go into an empty row headed FAQ, or into a new row like the theme's last one.",
          "If it has none, they show under the description, in the theme's own font and colours.",
          "A Featured product section shows its product's questions the same way, on any page.",
          "Theme developers can read them as product.metafields.storelib.faqs: a list where each item has question, answer and answer_html. Then Storelib adds nothing, and the theme draws them its own way. The details are in the [developer docs](/developers), under Imported Shopify themes.",
        ],
      },

      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "Questions and answers are plain text. A web address is shown as text, not a link, and anything that looks like code is shown as typed.",
          "A change shows on your live pages at the next visit, and in the website builder as soon as you come back to it.",
          "On your Storelib product page, a product with no questions of its own shows the questions set on the product page design, if any.",
          "Search engines read the questions as part of the page.",
        ],
      },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Adding the same questions to an FAQ section and to the product. On a product page the section shows the product's, so keep store wide questions, like shipping times, in the section and product questions on the product.",
          "Setting Questions from to The product only on a home page section. Off a product page it always shows its own questions.",
        ],
      },
    ],
  },
  {
    slug: "pricing",
    category: "products",
    title: "Price a product",
    summary: "Fixed prices, free products, compare at prices and pay what you want.",
    keywords: ["price", "free", "discount", "sale", "compare at", "pay what you want", "pwyw"],
    body: [
      { type: "h", text: "A fixed price" },
      { type: "p", text: "Enter the price in the Pricing part of the editor. A price of 0 makes the product free: buyers still go through checkout so they get a receipt and the download, but no payment is taken." },
      { type: "h", text: "Compare at price" },
      { type: "p", text: "A compare at price is shown crossed out next to the real price, to show a reduction. Turn on the sales badge in the same part to label the product as on sale." },
      { type: "h", text: "Pay what you want" },
      { type: "p", text: "Turn on Pay What You Want Pricing and set a minimum price and a suggested price. Buyers can pay anything from the minimum up." },
      { type: "p", text: "For temporary discounts on existing prices, use [coupons](/help/products/coupons) instead of changing the price." },
    ],
  },
  {
    slug: "files-and-delivery",
    category: "products",
    title: "Files and how buyers receive them",
    summary: "What happens between a buyer paying and a buyer downloading your files.",
    keywords: ["upload", "file size", "download", "delivery", "receipt", "library", "buyer", "didn't receive", "access"],
    body: [
      /* The per-file limit is the one the upload routes enforce (lib/security/uploads/policy MAX_UPLOAD_BYTES.product_file), never typed here. */
      { type: "p", text: `Upload files in the Digital Files part of the product editor. Each file can be up to ${formatLimit(MAX_UPLOAD_BYTES.product_file)}.` },
      { type: "h", text: "What the buyer gets" },
      { type: "steps", items: [
        "After paying, the buyer receives one receipt email for the payment.",
        "Its button opens the receipt page, which is also the download page.",
        "Each download link is made when it is pressed and works for a few minutes, so a copied link cannot be passed around.",
        "Buyers with a Storelib account also find every purchase in their Library.",
      ] },
      { type: "p", text: "The receipt email's link keeps working for as long as the order stands. If a buyer loses the email, open the order in Orders and choose Resend receipt, or Change customer email if they typed the wrong address." },
      { type: "note", text: "A full refund closes access to the files. A partial refund does not." },
    ],
  },
  {
    slug: "variants",
    category: "products",
    title: "Sell versions of a product with variants",
    summary: "Offer versions of one product, each with its own price and files.",
    keywords: ["variant", "options", "tiers", "versions", "license", "bundle"],
    body: [
      { type: "p", text: "Variants let one product page offer several versions, for example a personal and a commercial license, or a basic and a complete pack." },
      { type: "steps", items: [
        "In the product editor, open Variants and add one for each version.",
        "Give each a name and a price. A compare at price is optional.",
        "Attach the files that version should deliver.",
      ] },
      { type: "p", text: "Buyers choose a variant on the product page before checkout, and receive only that variant's files." },
    ],
  },
  {
    slug: "custom-fields",
    category: "products",
    updated: "2026-10-25",
    title: "Add custom fields to a product",
    summary: "Named details like Material, Care or ISBN: shown under Details on the product page, and read by your theme by name.",
    keywords: ["custom fields", "metafields", "product details", "specifications", "specs", "material", "care instructions", "dimensions", "isbn", "attributes", "product properties", "details block", "theme fields"],
    related: ["create-a-product", "variants", "website-builder/build-your-website"],
    body: [
      { type: "p", text: "A custom field is one named detail of a product: Material, Care, Dimensions, an ISBN, a link to a manual. You add them in the product editor. Each one can show under Details on the product page, and your website's theme can print any of them by name, wherever it likes." },
      { type: "note", text: "Custom fields are details you write for every buyer to read. To ask the buyer for something when they buy (a name to engrave, a photo to print), use Personalization fields on a physical product instead." },

      { type: "h", text: "Add a custom field" },
      { type: "steps", items: [
        "In the dashboard menu, open Products. Press Add product, or open the product you want to change.",
        "Find the Custom fields card, under the product's questions. Courses do not have it.",
        "Press Add field.",
        "Type the field's name, like Material. This is the label buyers see.",
        "Choose its type: Text, Long text, Number or Link.",
        "Type the value, like Waxed cotton canvas.",
        "Leave Show on the product page on to list it under Details. Turn it off to keep it only for your theme.",
        "Press Save. Add up to 20 fields to a product.",
      ] },

      { type: "h", text: "The four types" },
      { type: "table", head: ["Type", "What it holds", "What it checks"], rows: [
        ["Text", "One line, like a material or a colour name.", "Nothing but the length: up to 500 characters."],
        ["Long text", "A few lines, like care steps. Line breaks are kept on the page.", "Up to 500 characters."],
        ["Number", "A number, like 42 or 1.5. A comma is read as a decimal point and saved as one.", "Save says so if the value is not a number."],
        ["Link", "A web address, like a link to a manual or a size video. It shows as a link people can press.", "It must start with https:// or http://."],
      ] },
      { type: "p", text: "Two fields cannot share a name, and a field needs both a name and a value. If something is not right, the field says so in red and Save takes you to it. An empty row (no name, no value) is simply left out." },

      { type: "h", text: "Where buyers see them" },
      { type: "list", items: [
        "Your website's product page, in the Product details block. It is in every new product page. Its heading is Details, and you can change it, move the block or take it out in the website builder.",
        "Your product page on Storelib, the one your creator page and OnePage open, under Details.",
        "Only fields with Show on the product page turned on are listed, in the order you put them in.",
        "A Link field shows its address without https://, and opens in a new tab.",
      ] },

      { type: "h", text: "How themes use them" },
      { type: "p", text: "Each field also has a name your theme reads. It is made from the field's name: lower case, with an underscore for each space. Care instructions becomes care_instructions. The editor shows that name in small grey type under each field." },
      { type: "table", head: ["Where", "What the theme writes"], rows: [
        ["A Storelib theme, on a product card in a product list", "{{ block.settings.fields.material }}"],
        ["A Storelib theme, a product chosen in a section's settings", "{{ settings.product.fields.material }}"],
        ["A Storelib theme, the product page", "{{ page.product.fields.material }}"],
        ["An imported theme", "{{ product.metafields.custom.material }} or {{ product.metafields.custom.material.value }}"],
      ] },
      { type: "list", items: [
        "A theme reads every field, shown or not. Show on the product page only decides the Details list.",
        "Values are always plain words. A theme never gets markup from a custom field.",
        "An imported theme also gets .type: single_line_text_field, or multi_line_text_field for a value with line breaks, so a theme that checks the type keeps working.",
        "A field your theme names that the product does not have is empty, so an if around it in the theme reads false.",
        "Theme developers: the details are in the developer guide, under Imported themes.",
      ] },

      { type: "h", text: "Change or remove a field" },
      { type: "list", items: [
        "Change the value and press Save. The product page shows it at the next visit.",
        "Renaming a field changes the name your theme reads too. If your theme prints the old name, change it there as well.",
        "Press the cross beside a field and Save to remove it.",
      ] },

      { type: "h", text: "Common mistakes" },
      { type: "list", items: [
        "Putting a whole description in a field. A field is one detail. Long words belong in the description.",
        "Writing the same field twice with different spellings, like Material and Materials. Your theme reads them as two names.",
        "Turning Show on the product page off and wondering why it is not under Details. Turn it on, or print it from your theme.",
        "Taking the Product details block off the product page in the website builder. Add it back with Add block, Product details.",
      ] },
    ],
  },
  {
    slug: "coupons",
    category: "products",
    title: "Coupons",
    summary: "Discount codes by percentage or fixed amount, with dates, limits and a minimum spend.",
    keywords: ["coupon", "discount code", "promo code", "voucher", "percent off"],
    body: [
      { type: "p", text: "Open Coupons under Products and create a coupon. Each coupon has a code buyers type at checkout, and:" },
      { type: "list", items: [
        "a discount, as a percentage or a fixed amount",
        "optional start and end dates",
        "an optional usage limit",
        "an optional minimum purchase",
        "the products it applies to, or all of them",
      ] },
      { type: "p", text: "Buyers enter the code at checkout. The discount is shown before they pay." },
      { type: "p", text: "To give a better price without a code, for buying more or buying products together, use [upsells and bundles](/help/products/offers)." },
    ],
  },
  {
    slug: "publish-archive-delete",
    category: "products",
    title: "Publish, archive, duplicate or delete a product",
    summary: "What each action in a product's menu does.",
    keywords: ["publish", "unpublish", "draft", "hide", "archive", "restore", "duplicate", "copy", "delete", "remove"],
    body: [
      { type: "table", head: ["Action", "What happens"], rows: [
        ["Publish", "The product appears on your creator page and can be bought. Published products with a category can appear on Explore."],
        ["Unpublish", "The product goes back to a draft. Only you can see it."],
        ["Archive", "The product is moved out of your main list. Restore brings it back."],
        ["Duplicate", "A copy is made for you to edit, useful for similar products."],
        ["Delete", "The product is removed. This cannot be undone."],
      ] },
      { type: "p", text: "Publish and Unpublish are in the product editor. Archive, Duplicate and Delete are in the menu on each row of the Products list." },
    ],
  },

  /* ── Orders and payouts ──────────────────────────────────────────────── */
  {
    slug: "connect-stripe",
    category: "orders-and-payouts",
    title: "Set up payments",
    summary: "Three steps inside Storelib: your details, verifying who you are, and your bank account.",
    keywords: ["stripe", "connect", "bank account", "onboarding", "payments", "set up payments", "start selling", "payout account"],
    body: [
      { type: "p", text: "Storelib takes payments through Stripe, our payment partner. Setting up happens inside Storelib, in one panel, and takes about five minutes." },
      { type: "steps", items: [
        "Open Payouts in your dashboard, or Settings and then Payments, and press Set up payments.",
        "Account: your country and your full legal name as it appears on your ID, with any middle names. No business details.",
        "Your details: only what Stripe needs in your country to switch payments on, usually your date of birth and home address, with the bank account on the same page. Then, where Stripe wants to see your ID, the ID check: a passport or national ID through the camera, about a minute. See [Verifying your identity](/help/orders-and-payouts/identity-verification).",
        "Bank: your IBAN, or your account and routing number where your country does not use IBANs.",
      ] },
      { type: "note", text: "Your country sets your payout currency and cannot be changed afterwards. If you pick the wrong one, disconnect before you finish setting up and start again." },
      { type: "h", text: "What Storelib can and cannot see" },
      { type: "p", text: "Your ID photo, ID number, date of birth and full bank numbers are sent to Stripe over an encrypted connection the moment you press Continue. Storelib does not keep a copy of any of it: afterwards we see only your name, your country, the last four digits of your bank account and whether Stripe has verified you." },
      { type: "h", text: "When can I sell?" },
      { type: "p", text: "You can publish products before setting up payments, but checkout stays closed until Stripe has verified you, so set it up before you share your store. Payouts shows exactly what is still needed, and we email you when payments turn on." },
    ],
  },
  {
    slug: "identity-verification",
    category: "orders-and-payouts",
    title: "Verifying your identity",
    summary: "Why Stripe asks for your ID, what counts as a good photo, and what happens if it is declined.",
    keywords: ["identity", "verification", "id", "passport", "kyc", "document", "photo", "verify", "declined", "rejected"],
    body: [
      { type: "p", text: "Before anyone can be paid for selling online, the law in every country Storelib works in says the payment provider has to know who they are paying. That is what the ID step is, and it is the only identity check Storelib asks you for." },
      { type: "p", text: "In the Storelib app the camera opens inside the app: hold your document in the frame and it takes the photo for you, front and back, and sends it straight to Stripe. In a browser Stripe runs the check on its own screen over the page, scanning the document and matching a selfie to it. Either way Storelib never sees your document or your face, only whether Stripe is satisfied, and keeps no copy." },
      { type: "h", text: "What you need" },
      { type: "list", items: [
        "A passport, national ID card, residence permit or driving licence that has not expired",
        "A phone or a laptop with a camera. No camera, and you can choose a photo of the document instead",
        "Your legal name and date of birth exactly as they appear on the document",
      ] },
      { type: "h", text: "A photo that passes first time" },
      { type: "list", items: [
        "All four corners in the frame, nothing cut off",
        "Good even light, no flash on the plastic and no shadow across the page",
        "The original document, not a photocopy and not a photo of a screen",
        "Hold still until it has focused: blurred text is the most common reason a document comes back",
        "A colour photo, JPG or PNG. Stripe does not accept a PDF of an ID",
      ] },
      { type: "h", text: "How long it takes" },
      { type: "p", text: "Usually seconds. The screen waits with you and turns into Payments active by itself as soon as Stripe is satisfied, so most people never see a waiting screen at all. Now and then Stripe looks at a document by hand and takes longer; when that happens you can close the page and we email you the moment payments are on. There is nothing to do in the meantime." },
      { type: "h", text: "If it is declined" },
      { type: "p", text: "Open Payouts and start the step again. Stripe says what was wrong, and it is nearly always the photo rather than you: a blur, a cut corner, or a name that does not match what you typed. Make sure the name on your Storelib account matches the document exactly." },
      { type: "h", text: "If Stripe asks again later" },
      { type: "p", text: "Setup asks for three things: your personal info, a photo of your ID with your camera (front and back), and the bank account your payouts go to, in your local currency, euro or US dollar. Storelib never asks for a proof of address, a utility bill or a bank statement. If Stripe needs something else later, you get an email with a deadline and Payouts shows a button that opens setup at exactly that step. Answer before the deadline and nothing stops; miss it and payouts pause until you do. In the rare case Stripe asks for something the Storelib form does not cover, Payouts says so and support sorts it out with you." },
    ],
  },
  {
    slug: "fees",
    category: "orders-and-payouts",
    title: "What Storelib charges per sale",
    summary: "A percentage of each sale that depends on your plan, plus $0.25 on orders of $4.00 or more.",
    keywords: ["fee", "fees", "commission", "transaction fee", "percentage", "cost", "how much"],
    body: [
      { type: "p", text: "Storelib takes a fee from each sale. The percentage depends on your plan, and $0.25 is added to every order of $4.00 or more." },
      { type: "table", head: ["Plan", "Per sale"], rows: [
        ["Free", "5% + $0.25"],
        ["Grow", "3% + $0.25"],
      ] },
      { type: "p", text: "Orders under $4.00 pay a slightly higher percentage and no $0.25, so a small order never pays more than one at $4.00: 11.25% on Free and 9.25% on Grow. For example, a $10 sale on the Free plan is a fee of $0.75, and a $1 sale is $0.11." },
      { type: "p", text: "The Grow rate applies while its subscription is active. If you subscribed to an earlier plan, you keep that plan's rate while it stays active. The Payouts page shows the fees taken in any period under Platform Fees, and each sale's panel names the rule its fee came from. See [Plans](/help/account-and-billing/plans) and [Currencies, prices and payouts](/help/orders-and-payouts/currencies-prices-and-payouts)." },
    ],
  },
  {
    slug: "currencies-prices-and-payouts",
    category: "orders-and-payouts",
    title: "Currencies, prices and payouts: how it all fits",
    summary: "Which currency each place sells in, what Storelib takes per sale, where you see it, and how the money reaches your bank.",
    keywords: ["currency", "dollars", "usd", "euro", "lei", "explore price", "marketplace", "store currency", "exchange rate", "small order", "payouts", "statement", "bank statement", "descriptor", "traffic sources", "utm", "more from"],
    updated: "2026-10-19",
    related: ["fees", "how-payouts-work", "orders", "refund-an-order"],
    body: [
      { type: "p", text: "Storelib sells your products in two kinds of places, and each one has its own currency. This page walks through it from the buyer's first click to the money landing in your bank, so nothing at checkout surprises you or them." },
      { type: "h", text: "Which currency does each place sell in?" },
      { type: "table", head: ["Where the buyer is", "Currency they see and pay"], rows: [
        ["Your website, your own domain, your OnePage, a checkout link you shared", "Your store currency, set in Settings > Store details"],
        ["Storelib itself: Explore, your creator page, any product page on storelib.com, communities", "US dollars, for every buyer in every country"],
        ["Community and membership plans", "US dollars, everywhere"],
      ] },
      { type: "p", text: "It is the same product with the same files, not a copy. Only the price tag changes with the place. Physical products are sold on your website only, never on Explore." },
      { type: "h", text: "How is my dollar price on Explore worked out?" },
      { type: "p", text: "Your price is converted at the European Central Bank's rate of the day and rounded to the cent. A pay what you want minimum is rounded up, so you never get less than you asked for. The price the buyer sees on the card, the product page and the checkout is the same number, worked out once, and they are charged exactly that." },
      { type: "p", text: "Want a round number instead? In the product editor, under the price, there is a small line that reads \"Explore price: about $92.61\". Choose Set USD price, type your own, and that is what Explore shows and charges. Use rate goes back to the converted price." },
      { type: "note", text: "If today's rate has not arrived yet, Storelib fetches it on its own. A dollar purchase only waits for a few minutes in the rare case no fresh rate exists; it is never quietly charged in another currency." },
      { type: "h", text: "What happens when I change my store currency?" },
      { type: "p", text: "In Settings > Store details you can keep your amounts as they are (100 becomes 100 in the new currency) or convert them at today's rate. Before Save works you tick \"I understand the risk of changing the store currency\", because every price in your store moves: products, options, shipping rates and fixed coupons." },
      { type: "list", items: [
        "Orders already placed keep the currency they were paid in, forever. Receipts, emails and refunds for them stay in that currency.",
        "Your Home and Analytics figures are shown in your store currency, each sale converted at the rate of its own day.",
        "Payouts never change: each sale in Payouts shows what the buyer actually paid, in the currency they paid in, and your balance is whatever Stripe holds.",
      ] },
      { type: "h", text: "What does Storelib charge per sale?" },
      { type: "table", head: ["Plan", "Orders of $4.00 or more", "Orders under $4.00"], rows: [
        ["Free", "5% + $0.25", "11.25%, no fixed part"],
        ["Grow", "3% + $0.25", "9.25%, no fixed part"],
      ] },
      { type: "p", text: "The small order rule keeps tiny sales fair: under $4.00 the $0.25 is dropped and a slightly higher percentage carries it instead, so a $3.99 sale never pays more than a $4.00 one. The same rule applies in every currency, at the equivalent amount (for example 3.68 EUR). The Pro rate applies while your Pro subscription is active or trialing; otherwise the Free rate applies." },
      { type: "h", text: "Where do I see the fee?" },
      { type: "p", text: "In Payouts. Open any sale and the panel shows Paid, the Storelib fee with the rule that produced it (for example \"Free plan · 5% + $0.25\" or \"Pro plan · 9.25%, small order\"), and what you receive. Orders shows what the buyer paid, like any shop's order page; fees live in Payouts only." },
      { type: "h", text: "How does the money reach my bank?" },
      { type: "steps", items: [
        "The buyer pays. Storelib's Stripe account takes the card and sends your share to your own Stripe account at once, minus the fee.",
        "A sale in dollars that lands in a euro or lei account is converted once, by Stripe. Never twice.",
        "Your balance becomes available on Stripe's schedule, and you cash out from Payouts, or it is paid out automatically.",
        "A refund takes your share back from your account in proportion, including a partial refund. The buyer is refunded on their original payment method and gets an email.",
      ] },
      { type: "p", text: "Payouts work for stores in the US, the UK, the EEA, Canada and Switzerland." },
      { type: "h", text: "What name shows on my buyer's bank statement?" },
      { type: "p", text: "Your store name, automatically. It follows the name in Settings > Store details, so renaming your store renames the statement too. You can type your own in Settings > Payments; leave it empty to go back to the store name. Banks allow only a few characters, so a long name is shortened to whole words for you (\"Offgrid Sounds\" becomes OFFGRID), never refused." },
      { type: "h", text: "Do my communities show next to my products?" },
      { type: "p", text: "Yes. More from, under each product page on Storelib, shows your public communities first (with the price of the cheapest plan, or free to join), then your other products." },
      { type: "h", text: "How are visits tracked?" },
      { type: "p", text: "Every page is tracked: your website, every product page, your creator page and your OnePage. Analytics records where each visit came from: the site that linked to you, search engines, social apps (including Instagram and TikTok's in-app browsers, which often send no referrer), email, your utm tags (utm_source, utm_medium, utm_campaign) and ?ref= links. Ad and social click ids count too: a Google or Bing ad, a Facebook or Instagram link, a TikTok, X or LinkedIn ad is credited to it even with no tags. The first source of a visit is kept for the whole visit, so moving between your pages never turns it into Direct." },
      { type: "p", text: "Physical sales sit in the same chart, figures and reports as everything else; Top products splits Physical and Digital when you sell both." },
      { type: "h", text: "Do I need to translate my products?" },
      { type: "p", text: "No. When your website has more than one language, your product's words are translated automatically a few minutes after you publish, and any change you make yourself in the website editor is kept." },
    ],
  },
  {
    slug: "how-payouts-work",
    category: "orders-and-payouts",
    title: "When you get paid: balance and cash out",
    summary: "A sale settles, becomes available, and you press Cash out to send it to your bank.",
    keywords: ["payout", "payouts", "withdraw", "cash out", "cashout", "bank", "balance", "when do i get paid", "pending", "available", "negative balance", "currency"],
    body: [
      { type: "p", text: "Money from a sale is not sent to your bank on its own. It goes into your balance, and you cash out when you want to. Payouts shows three figures." },
      { type: "table", head: ["Figure", "What it is"], rows: [
        ["Available", "Settled and ready. This is what Cash out sends."],
        ["Arriving soon", "Paid but still settling. Payouts shows the day each part becomes available."],
        ["On the way", "Already sent to your bank and not arrived yet."],
      ] },
      { type: "h", text: "How long settling takes" },
      { type: "p", text: "It depends on your country and your account, and our payment partner sets it, not Storelib. For most new accounts it is about seven days, and it gets shorter as your account builds a history. Payouts shows the real date each amount becomes available, so you never have to guess." },
      { type: "h", text: "Cashing out" },
      { type: "steps", items: [
        "Open Payouts and press Cash out.",
        "Your whole available balance is sent to the bank account on file.",
        "It usually arrives in 1 to 3 business days.",
      ] },
      { type: "p", text: "Your first payout can take a little longer, because our payment partner runs extra checks on a new account. Later ones are faster." },
      { type: "h", text: "Which currency" },
      { type: "p", text: "Your balance and your payouts are in your account's own currency, set by the country you chose when you set up payments. Payouts shows every amount in the currency it is really in, with no conversion, so what you see is what reaches your bank." },
      { type: "h", text: "A balance below zero" },
      { type: "p", text: "A refund or a lost dispute can take your balance below zero. Future sales cover it automatically, with nothing for you to do, and Cash out comes back once your balance is above zero again." },
      { type: "h", text: "If a payout fails" },
      { type: "p", text: "The money comes back to your available balance and Payouts says so. It is nearly always the bank details: check the account number and that the name on the bank account matches your Storelib account, update the bank under Payout account, and cash out again." },
    ],
  },
  {
    slug: "disputes",
    category: "orders-and-payouts",
    title: "Disputes and chargebacks",
    summary: "What happens when a buyer asks their bank to reverse a payment, and how to help win it.",
    keywords: ["dispute", "chargeback", "charge back", "fraud", "reversed", "bank", "evidence", "inquiry", "case"],
    body: [
      { type: "p", text: "A dispute, also called a chargeback, is a buyer asking their bank to reverse a payment instead of asking you for a refund. The bank decides, not Storelib and not our payment partner." },
      { type: "h", text: "What happens" },
      { type: "steps", items: [
        "The bank opens the case and takes the money back while it decides. Your share of that sale is held, so your balance goes down by it.",
        "We email you and the case appears under Disputes on Payouts.",
        "Storelib answers the bank, because the payment was taken on Storelib's account. Your part is the evidence.",
        "The bank decides, which usually takes 60 to 75 days. If it decides for you, the money goes back to your balance.",
      ] },
      { type: "h", text: "Add your evidence" },
      { type: "p", text: "Under Disputes on Payouts, press Add evidence and write a few plain sentences: what the buyer bought, that the files were delivered or downloaded, and anything you discussed with them. We send it with the answer. Do it before the date shown on the case." },
      { type: "h", text: "An inquiry is not a chargeback" },
      { type: "p", text: "Sometimes a bank only asks a question first. No money is taken and there is nothing to pay; we answer it, and it often ends there. Payouts marks those as an inquiry." },
      { type: "h", text: "If the dispute is lost" },
      { type: "p", text: "The amount stays with the buyer. There is no appeal with the bank after that." },
      { type: "h", text: "Keeping disputes rare" },
      { type: "list", items: [
        "Describe exactly what the buyer gets, with no surprises after payment",
        "Make sure your store name is one they will recognise on their statement",
        "Answer messages quickly: most disputes start as somebody who could not reach you",
        "Refund early when something is genuinely wrong, since a refund costs far less than a dispute",
      ] },
    ],
  },
  {
    slug: "orders",
    category: "orders-and-payouts",
    title: "Find and manage orders",
    summary: "Search orders, open one, resend a receipt, download an invoice or export to CSV.",
    keywords: ["order", "orders", "sales", "customer", "invoice", "receipt", "export", "csv", "change email"],
    body: [
      { type: "p", text: "Orders in the dashboard lists every sale. Search by order, customer or product, and press an order to open it." },
      { type: "p", text: "The menu on an order has:" },
      { type: "list", items: [
        "Refund, see [Refund an order](/help/orders-and-payouts/refund-an-order)",
        "Resend receipt, which emails the buyer their receipt and download link again",
        "Download invoice",
        "Change customer email, when the buyer typed the wrong address",
        "View receipt, the page the buyer sees",
      ] },
      { type: "h", text: "Export" },
      { type: "p", text: "Use the export button on the Orders page to download orders as a CSV file, for the current page, a selection, a date range or all of them." },
    ],
  },
  {
    slug: "refund-an-order",
    category: "orders-and-payouts",
    title: "Refund an order",
    summary: "Refund all or part of an order from Orders. A full refund closes the buyer's access.",
    keywords: ["refund", "money back", "return", "partial refund", "chargeback", "dispute"],
    body: [
      { type: "steps", items: [
        "Open Orders and press the order.",
        "Press Refund in the payment card, or open More actions at the top and choose Refund.",
        "Enter the amount, up to what has not been refunded yet, and a reason.",
        "Confirm.",
      ] },
      { type: "p", text: "The money goes back to the buyer's card through Stripe, and the buyer and you both get an email." },
      { type: "list", items: [
        "A full refund removes the product from the buyer's Library and closes their download link.",
        "A partial refund leaves their access as it is.",
        "You can refund the same order more than once, until the whole amount is refunded.",
        "The refunded amount comes out of your balance. Storelib's fee on the sale is not returned.",
      ] },
      { type: "p", text: "Whether you give refunds, and for how long, is your choice. You can show it on your product pages. See [Your refund policy](/help/policies/refund-policy)." },
    ],
  },

  /* ── Website builder ─────────────────────────────────────────────────── */
  {
    slug: "creator-page-website-onepage",
    category: "website-builder",
    title: "Creator page, website and OnePage: which is which",
    summary: "Three pages you can publish, what each one is for and where each one lives.",
    keywords: ["creator page", "website", "onepage", "link in bio", "store", "difference", "which"],
    body: [
      { type: "table", head: ["", "Address", "What it is"], rows: [
        ["Creator page", "storelib.com/yourname", "Your profile: picture, bio, links and products. Every account has one."],
        ["Website", "yourname.storelib.com", "A site you build from a theme, with as many pages and sections as you like."],
        ["OnePage", "storelib.me/yourname", "A single link in bio page for your social profiles."],
      ] },
      { type: "p", text: "Each is edited from its own item in the dashboard menu: Creator Page, Website and OnePage. Your products appear on all three." },
      { type: "p", text: "You do not need all three. Most people start with the creator page and add a website later." },
    ],
  },
  {
    slug: "build-your-website",
    category: "website-builder",
    title: "Build and publish your website",
    summary: "Pick a theme, edit its sections and publish to yourname.storelib.com.",
    keywords: ["website", "theme", "sections", "editor", "publish", "template", "design", "pages"],
    body: [
      { type: "steps", items: [
        "Open Website in the dashboard and choose a theme.",
        "In the editor, press a section on the page to edit it, or Add section to add a new one.",
        "Theme settings holds what applies to the whole site: colours, fonts and your logo.",
        "Press Publish. Your site is live at yourname.storelib.com.",
      ] },
      { type: "p", text: "To move a section or a block, drag it by the grip beside its name in the sidebar. The other rows slide aside to show where it will go, and the page shows the new order as soon as you let go. Press Escape while dragging to put it back." },
      { type: "p", text: "A setting with two or three choices shows them as buttons side by side, such as Vertical or Horizontal. A setting with more choices opens a list." },
      { type: "p", text: "Edits are saved as you work but visitors only see them after you publish again. Use the preview switch in the editor to check the phone layout before publishing." },
      { type: "p", text: "Products, the cart and checkout are built in: products you publish appear on your website without being added by hand." },
    ],
  },
  {
    slug: "custom-domain",
    category: "website-builder",
    title: "Connect your own domain",
    summary: "Point a domain you own at your Storelib website. Part of the Grow plan.",
    keywords: ["domain", "custom domain", "dns", "cname", "a record", "ssl", "https", "www"],
    body: [
      { type: "p", text: "Custom domains are part of the Grow plan." },
      { type: "steps", items: [
        "Open Settings from the menu under your profile picture, then the Domains tab.",
        "Add your domain, for example yourname.com.",
        "At the company you bought the domain from, add the DNS records shown there.",
      ] },
      { type: "table", head: ["Type", "Name", "Value"], rows: [
        ["A", "@", "216.150.1.1"],
        ["CNAME", "www", "domains.storelib.com"],
        ["TXT", "_storelib", "The code shown next to your domain"],
      ] },
      { type: "p", text: "Connecting a subdomain such as shop.yourname.com instead? It needs one record: a CNAME on shop with the value domains.storelib.com." },
      { type: "p", text: "The domain shows Waiting for DNS until the records are found, then Securing while its HTTPS certificate is issued, then Connected. DNS changes can take from a few minutes to a day to reach everyone." },
      { type: "note", text: "If the domain stays on Waiting for DNS, check the records for typos and remove any other A record on @, which would send visitors elsewhere." },
    ],
  },
  {
    slug: "edit-your-creator-page",
    category: "website-builder",
    title: "Edit your creator page",
    summary: "Change the picture, bio, links and look of storelib.com/yourname.",
    keywords: ["creator page", "profile", "bio", "avatar", "banner", "colors", "store page"],
    body: [
      { type: "p", text: "Open Creator Page in the dashboard. The page you see is the page visitors see, and you edit it in place: your picture, name, bio, links, the products shown and the colour scheme." },
      { type: "p", text: "Your published products are listed on it automatically. Products that are drafts or archived are not." },
      { type: "p", text: "The same colours carry through to your product pages, so a buyer moving from your page to a product stays in your look." },
    ],
  },
  {
    slug: "onepage",
    category: "website-builder",
    title: "Set up OnePage, your link in bio",
    summary: "One page of links and products for your social profiles.",
    keywords: ["onepage", "link in bio", "linktree", "instagram bio", "tiktok bio", "links page"],
    body: [
      { type: "steps", items: [
        "Open OnePage in the dashboard.",
        "Add blocks: links, products, a newsletter sign up and more.",
        "Choose its look.",
        "Copy its address, storelib.me/yourname, into your social profiles.",
      ] },
      { type: "p", text: "People who sign up on your OnePage are added to your subscribers, marked with OnePage as the source." },
    ],
  },

  /* ── Email ───────────────────────────────────────────────────────────── */
  {
    slug: "subscribers",
    category: "email",
    title: "Where your subscribers come from",
    summary: "Sign up forms on your pages fill your list. Buyers are not added on their own.",
    keywords: ["subscribers", "email list", "newsletter", "audience", "export", "import", "unsubscribe", "buyers"],
    body: [
      { type: "p", text: "The Subscribers tab in Emails lists everyone on your list, with where they signed up." },
      { type: "list", items: [
        "People join through the sign up forms on your pages: your creator page and product pages, your website, and your OnePage.",
        "Buyers are not added to your list just by buying. The Emails page shows how many buyers are not on it.",
        "Every email you send has an unsubscribe link. Someone who unsubscribes stops getting your emails.",
        "Use the export button on the Subscribers tab to download your list.",
      ] },
    ],
  },
  {
    slug: "send-an-email",
    category: "email",
    title: "Send an email to your list",
    summary: "Write an email, then send it now or schedule it.",
    keywords: ["email", "newsletter", "broadcast", "campaign", "schedule", "send", "draft", "open rate", "clicks"],
    body: [
      { type: "steps", items: [
        "Open Emails and press New email.",
        "Write a subject and the email. Send yourself a test to check it.",
        "Send it now, or pick a date and time to schedule it.",
      ] },
      { type: "p", text: "Sent emails are under Published, with how many people opened them and clicked a link. Scheduled emails wait under Scheduled until their time, and unfinished ones stay under Drafts." },
      { type: "p", text: "Replies go to the email address on your Storelib account." },
    ],
  },
  {
    slug: "automations",
    category: "email",
    title: "Automations: welcome and thank you emails",
    summary: "Emails sent on their own when someone subscribes or buys.",
    keywords: ["automation", "automations", "flow", "welcome email", "thank you email", "after purchase", "sequence", "autoresponder"],
    body: [
      { type: "p", text: "The Automations tab in Emails has two automations:" },
      { type: "table", head: ["Automation", "Sent when"], rows: [
        ["New Subscriber", "Someone subscribes to your email list."],
        ["Purchase", "A customer buys one of your products."],
      ] },
      { type: "p", text: "Each comes with a starting email you can rewrite. Turn one on with its switch; it only sends while it is on." },
      { type: "p", text: "The purchase email is separate from the receipt. Buyers always get their receipt and download link, whether or not this automation is on." },
    ],
  },

  /* ── Account and billing ─────────────────────────────────────────────── */
  {
    slug: "plans",
    category: "account-and-billing",
    title: "Plans",
    summary: "Free, Grow and Pro, and what changes between them.",
    keywords: ["plan", "plans", "pricing", "free", "growth", "professional", "pro", "upgrade", "subscription", "price"],
    body: [
      { type: "table", head: ["", "Free", "Grow"], rows: [
        ["Price", "$0", "$29 a month"],
        ["Fee per sale", "5% + $0.25", "3% + $0.25"],
        ["Custom domain", "No", "Yes"],
        ["Storelib branding", "Shown", "Can be removed"],
        ["Verified badge", "No", "Yes"],
        ["Websites", "2, with 5 pages each", "3, with 20 pages each"],
        ["File storage", "1 GB", "25 GB"],
      ] },
      { type: "p", text: "Both plans can sell as many products as they like. The $0.25 applies to orders of $4.00 or more. See [What Storelib charges per sale](/help/orders-and-payouts/fees) and the [pricing page](/pricing) for the full list." },
      { type: "p", text: "If you subscribed to an earlier plan, it keeps working as it did until you change or cancel it." },
    ],
  },
  {
    slug: "change-or-cancel-plan",
    category: "account-and-billing",
    title: "Upgrade, change or cancel your plan",
    summary: "Change plans in Billing. Cancelling keeps your plan until the end of the period you paid for.",
    keywords: ["upgrade", "downgrade", "cancel", "billing", "invoice", "payment method", "card", "subscription"],
    body: [
      { type: "steps", items: [
        "Open Billing from the menu under your profile picture.",
        "To upgrade, choose a plan and pay.",
        "To change your card, see invoices or cancel, use the button that opens Stripe's billing portal.",
      ] },
      { type: "p", text: "When you cancel, the plan stays active until the date shown on the Billing page, then your account moves to the Free plan and its fee. Your products, pages and orders stay as they are." },
      { type: "p", text: "For billing questions, email [support@storelib.com](mailto:support@storelib.com)." },
    ],
  },
  {
    slug: "sign-in-and-security",
    category: "account-and-billing",
    title: "Sign in and account security",
    summary: "Reset your password, or sign out on every device.",
    keywords: ["password", "reset password", "forgot password", "security", "sessions", "sign out", "google", "apple", "login"],
    body: [
      { type: "h", text: "Forgot your password" },
      { type: "p", text: "On the sign in page, choose to reset your password and enter your email. We send a link to set a new one. If you signed up with Google or Apple, you have no Storelib password: use that button to sign in." },
      { type: "h", text: "In Settings" },
      { type: "p", text: "The Security tab in Settings can send you a password reset link, sign you out, or sign you out on every device at once, which is what to do if you signed in on a computer that is not yours." },
    ],
  },
  {
    slug: "delete-your-account",
    category: "account-and-billing",
    title: "Delete your account",
    summary: "Permanently delete your Storelib account from Settings.",
    keywords: ["delete account", "close account", "remove account", "gdpr", "data"],
    body: [
      { type: "steps", items: [
        "Open Settings, then the Security tab.",
        "Under Delete your account, press the delete button.",
        "We email you a 6 digit code. Enter it to confirm.",
      ] },
      { type: "note", text: "Deleting an account is permanent. Your pages and products go offline. If you have a paid plan, cancel it first so you are not charged again." },
      { type: "p", text: "You can also read [how account deletion works](/account-deletion)." },
    ],
  },

  {
    slug: "contact-storelib-support",
    category: "account-and-billing",
    title: "Get help from Storelib",
    summary: "Open a request from your dashboard and a person at Storelib replies there and by email.",
    keywords: ["support", "help", "contact", "ticket", "request", "problem", "bug", "question", "storelib team"],
    body: [
      { type: "steps", items: [
        "Open Settings and press Contact Storelib support, or go to [Support](/app/support).",
        "Press New request and choose what it's about: an order, payments, a dispute, payouts, shipping, your account, your website or something that isn't working.",
        "Add a subject and the details. If it's about an order, add its number (the code after # on the order).",
        "Press Send. You'll see it in Support, with whose turn it is.",
      ] },
      { type: "p", text: "When we reply you get an email, and the request says New reply. Reply right there to keep it all in one place. Press Mark resolved when you're sorted; writing again opens it back up." },
      { type: "note", text: "We never ask for your password or card details. Don't send them in a request." },
      { type: "p", text: "Rather email? Write to [support@storelib.com](mailto:support@storelib.com) with your username." },
    ],
  },
  {
    slug: "activity-log",
    category: "account-and-billing",
    title: "See every change to your store",
    summary: "Settings, Activity lists who changed what and when: products, orders, settings and files.",
    keywords: ["activity", "log", "history", "audit", "who changed", "changes", "record"],
    body: [
      { type: "p", text: "Open Settings, then Activity. Every change made to your store is there, newest first and grouped by day: a product added, renamed, repriced or archived, an order shipped or refunded, a tax region or location changed, an integration installed, a file deleted." },
      { type: "table", head: ["It says", "Means"], rows: [
        ["You", "You did it, signed in to your account."],
        ["Storelib", "Storelib did it for you, like a scheduled change or a fix."],
        ["A buyer", "A buyer did it, like asking to return items from their order page."],
      ] },
      { type: "p", text: "Use the filters to see only Products, Orders, Settings or Files, and Show more for older changes." },
    ],
  },
  {
    slug: "files-library",
    category: "website-builder",
    title: "Your files: every picture in one place",
    summary: "Products, Files holds every picture you've uploaded, ready to use again anywhere on your website.",
    keywords: ["files", "images", "pictures", "photos", "library", "media", "upload", "reuse"],
    body: [
      { type: "p", text: "Open Products, then Files. Every picture you've uploaded is there: your product photos, the pictures on your website and the ones you upload straight to Files. Search by name, or filter by where it came from." },
      { type: "steps", items: [
        "Press Upload, or drop pictures onto the page. JPG, PNG, GIF, WebP and AVIF, up to 5 MB each.",
        "Press a picture to see its size, type and date, copy its link or delete it.",
        "In the website builder, any image setting has Choose from your files. Pick one and it's in. No uploading the same picture twice.",
      ] },
      { type: "note", text: "Deleting a picture takes it off anything that still shows it, so check your website first." },
    ],
  },

  /* ── Policies ────────────────────────────────────────────────────────── */
  {
    slug: "refund-policy",
    category: "policies",
    title: "Your refund policy",
    summary: "Show buyers your refund terms on each product page.",
    keywords: ["refund policy", "money back guarantee", "no refunds", "returns", "7 day", "14 day", "30 day"],
    body: [
      { type: "p", text: "Each product can show a refund policy on its page. In the product editor, open Settings, turn on Enable refund policy and choose one:" },
      { type: "list", items: ["No refunds allowed", "7-day money back guarantee", "14-day money back guarantee", "30-day money back guarantee"] },
      { type: "p", text: "The policy is what you promise buyers. Storelib does not issue refunds for you: when a buyer asks within your policy, refund them from Orders. See [Refund an order](/help/orders-and-payouts/refund-an-order)." },
    ],
  },
  {
    slug: "help-with-a-purchase",
    category: "policies",
    title: "For buyers: help with a purchase",
    summary: "Finding your download, getting a refund, or reaching the creator.",
    keywords: ["buyer", "purchase", "download", "refund", "contact seller", "receipt", "library", "didn't get"],
    body: [
      { type: "list", items: [
        "Your download is on the receipt page linked from your receipt email. If you bought while signed in, it is also in your [Library](/account/library).",
        "Refunds are decided by the creator who sold the product, following the refund policy on its page. Press Contact the shop, under Need help with this order? on your receipt or order page: it goes to the store, and Storelib can step in if it isn't sorted out. See [Order problems, answered](/help/questions).",
        "If you cannot find the receipt email, check spam, then ask the creator to resend it: they can send it again, or to a corrected address.",
      ] },
      { type: "p", text: "If you cannot reach the creator, email [support@storelib.com](mailto:support@storelib.com) with the product and the email address you paid with." },
    ],
  },
  {
    slug: "cookies-and-privacy",
    category: "policies",
    title: "Cookies and privacy",
    summary: "What Storelib stores in your browser and how to change your choice.",
    keywords: ["cookies", "cookie preferences", "privacy", "gdpr", "tracking", "analytics", "consent", "terms"],
    body: [
      { type: "p", text: "The first time you visit, a banner asks whether optional cookies may be used. Accept all and Reject all are side by side; nothing optional is stored until you choose." },
      { type: "p", text: "To change your choice, press Cookie preferences at the bottom of any Storelib page, creator page or website." },
      { type: "p", text: "The [Privacy Policy](/privacy) lists every cookie and what it is for. The [Terms of Service](/terms) cover using Storelib as a creator or a buyer." },
    ],
  },
  {
    slug: "report-a-product",
    category: "policies",
    title: "Report a product",
    summary: "Tell us about a product that breaks the rules or infringes your rights.",
    keywords: ["report", "abuse", "copyright", "scam", "infringement", "illegal", "dmca", "takedown"],
    body: [
      { type: "steps", items: [
        "On the product page, open the menu with the three dots in the bar at the top.",
        "Choose Report. An email to support@storelib.com opens with the product's address filled in.",
        "Say what is wrong and send it.",
      ] },
      { type: "p", text: "You can also write to [support@storelib.com](mailto:support@storelib.com) directly. For a copyright claim, include the work you own and where the copy is." },
    ],
  },
  /* Store currency, more currencies and languages (written in ./physical-articles beside the guide they grew from). */
  ...SITE_WIDE_ARTICLES,
  /* Upsells and bundles, one kind of offer at a time, under Products (./offer-articles). */
  ...OFFER_ARTICLES,
]

/*
  The physical products guide (./physical-articles) is a topic of its own,
  shown only while physical commerce is on in /admin. HELP_CATEGORIES and
  HELP_ARTICLES stay the topics that are always there; the lookups below
  find either, and each page asks helpVisible() before showing one.
*/
export const ALL_HELP_CATEGORIES: HelpCategory[] = [...HELP_CATEGORIES.slice(0, 2), PHYSICAL_CATEGORY, ...HELP_CATEGORIES.slice(2)]
export const ALL_HELP_ARTICLES: HelpArticle[] = [...HELP_ARTICLES, ...PHYSICAL_ARTICLES]

/** The topics to show: the physical guide only while physical commerce is on. */
export function helpCategoriesFor(physical: boolean): HelpCategory[] {
  return ALL_HELP_CATEGORIES.filter((c) => physical || !c.physical)
}

export function helpArticlesFor(physical: boolean): HelpArticle[] {
  return physical ? ALL_HELP_ARTICLES : HELP_ARTICLES
}

/**
 * A topic's articles in their groups, in the order the groups first appear.
 * A topic without groups is one group with no title.
 */
export function helpSectionsIn(category: string): { title: string | null; articles: HelpArticle[] }[] {
  const out: { title: string | null; articles: HelpArticle[] }[] = []
  for (const a of helpArticlesIn(category)) {
    const title = a.section ?? null
    const group = out.find((g) => g.title === title)
    if (group) group.articles.push(a)
    else out.push({ title, articles: [a] })
  }
  return out
}

/** Whether a topic may be shown now. */
export function helpVisible(category: HelpCategory | undefined, physical: boolean): boolean {
  return !!category && (physical || !category.physical)
}

export function helpCategory(slug: string): HelpCategory | undefined {
  return ALL_HELP_CATEGORIES.find((c) => c.slug === slug)
}

export function helpArticlesIn(category: string): HelpArticle[] {
  return ALL_HELP_ARTICLES.filter((a) => a.category === category)
}

export function helpArticle(category: string, slug: string): HelpArticle | undefined {
  return ALL_HELP_ARTICLES.find((a) => a.category === category && a.slug === slug)
}

export function helpArticlePath(a: Pick<HelpArticle, "category" | "slug">): string {
  return `/help/${a.category}/${a.slug}`
}

/** The article's words as plain text, links reduced to their labels. */
export function plainText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
}

const sentence = (t: string) => (/[.!?:]$/.test(t.trim()) ? t : `${t}.`)

export function articleText(a: HelpArticle): string {
  const parts: string[] = []
  for (const b of a.body) {
    if (b.type === "p" || b.type === "h" || b.type === "sub" || b.type === "note") parts.push(b.text)
    else if (b.type === "facts") parts.push(...b.items.map(([label, text]) => sentence(`${label}: ${text}`)))
    /* Each item and each row ends as a sentence, so a search snippet cut
       from the text reads as one rather than running two items together. */
    else if (b.type === "steps" || b.type === "list") parts.push(...b.items.map(sentence))
    else if (b.type === "table") parts.push(...b.rows.map((r) => sentence(r.filter(Boolean).join(", "))))
    else if (b.type === "figure") parts.push(sentence(b.caption))
    else if (b.type === "image") parts.push(sentence(b.caption ?? b.alt))
  }
  return parts.map(plainText).join(" ")
}

/* ── For the article page: its contents, its neighbours, what to read next ── */

/** A heading's id on the page, from its words: "Set up your General profile" is #set-up-your-general-profile. */
export function headingId(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  )
}

/** The article's headings, in order, each with the id the page gives it (a repeated heading gets -2, -3). */
export function helpToc(a: HelpArticle): { id: string; text: string }[] {
  const seen = new Map<string, number>()
  const out: { id: string; text: string }[] = []
  for (const b of a.body) {
    if (b.type !== "h") continue
    const base = headingId(b.text)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ id: n === 1 ? base : `${base}-${n}`, text: plainText(b.text) })
  }
  return out
}

/** The article before and after this one in its topic's reading order. */
export function helpNeighbours(a: HelpArticle): { previous: HelpArticle | null; next: HelpArticle | null } {
  const list = helpArticlesIn(a.category)
  const i = list.findIndex((x) => x.slug === a.slug)
  return { previous: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null }
}

/**
 * What to read next: the article's own picks first, then the others in its
 * group, never itself or the two the previous and next links already show.
 */
export function helpRelated(a: HelpArticle, limit = 4): HelpArticle[] {
  const { previous, next } = helpNeighbours(a)
  const skip = new Set([a, previous, next].filter(Boolean).map((x) => helpArticlePath(x!)))
  const out: HelpArticle[] = []
  const add = (x: HelpArticle | undefined) => {
    if (!x || skip.has(helpArticlePath(x)) || out.includes(x)) return
    out.push(x)
  }
  for (const r of a.related ?? []) {
    const [cat, slug] = r.includes("/") ? r.split("/") : [a.category, r]
    add(helpArticle(cat, slug))
  }
  if (a.section) for (const x of helpArticlesIn(a.category)) if (x.section === a.section) add(x)
  return out.slice(0, limit)
}

/** About how long it takes to read, at 200 words a minute. */
export function readingMinutes(a: HelpArticle): number {
  return Math.max(1, Math.round(words(articleText(a)) / 200))
}
const words = (t: string) => t.split(/\s+/).filter(Boolean).length

/** Every screenshot in an article, for its social card and its sitemap row. */
export function helpImages(a: HelpArticle): string[] {
  return a.body.filter((b): b is Extract<HelpBlock, { type: "image" }> => b.type === "image").map((b) => b.src)
}

/**
 * ARTICLES THAT MOVED. An address already shared, emailed or indexed keeps
 * working: the article page sends it on, for good, to where the article is
 * now. "topic/old-slug" to "topic/new-slug".
 */
export const HELP_MOVED: Record<string, string> = {
  "physical-products/tax-and-units": "physical-products/units-and-packages",
  /* The currency is set in Store details › Country & Currency now, apart from the payout currency. */
  "physical-products/store-currency": "website-builder/country-and-currency",
  /* Languages and visitor currencies were one article; now Translate your website, Edit a translation and Sell in more currencies. */
  "physical-products/languages-and-currencies-for-visitors": "website-builder/translate-your-website",
  /* Currency and languages are in Settings for every store: under Website builder, which every store sees. */
  "physical-products/country-and-currency": "website-builder/country-and-currency",
  "physical-products/sell-in-more-currencies": "website-builder/sell-in-more-currencies",
  "physical-products/translate-your-website": "website-builder/translate-your-website",
  "physical-products/edit-a-translation": "website-builder/edit-a-translation",
}

/** The articles most people come for, first on the Help Center's home. The physical ones show only while the guide is on. */
export const POPULAR_HELP: string[] = [
  "physical-products/zero-to-100",
  "orders-and-payouts/connect-stripe",
  "physical-products/shipping-profiles-zones-and-rates",
  "orders-and-payouts/how-payouts-work",
  "physical-products/ship-your-orders",
  "website-builder/custom-domain",
  "physical-products/taxes",
  "products/create-a-product",
]
