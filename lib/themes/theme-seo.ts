/**
 * ===========================================================================
 *  THE THEME MARKETPLACE AS A SEARCH ENGINE READS IT (round 58)
 * ===========================================================================
 * storelib.com/themes, a page per template at /themes/<slug> and a page per
 * category at /themes/category/<category>. This file holds the words each
 * of those pages is found by: the title, the description, the H1, an
 * answer first summary, who a template is for, what is in it, and the
 * questions people ask before they pick one.
 *
 * WHERE THE FACTS COME FROM. The listings stay in marketplace-shared.ts
 * (CODE_TEMPLATES and the table rows over them); the library's marketplace
 * popup reads that file and nothing here changes what it shows. A feature
 * claimed below is one the template's own files have:
 * tests/theme-seo-r58.test.ts reads theme-packages/materia/templates/<t>
 * and fails when a template is said to have a section or a page it does not.
 *
 * TITLES. The owner's list, keyword first, no theme name in front, under
 * about sixty characters. Three course templates, three intents: a school
 * of several courses (Course), one course on one long page with its
 * curriculum and plans (Online course), and a sales page for one offer
 * (Course landing). No two pages here share a title or a primary keyword.
 *
 * A LISTING THIS FILE DOES NOT KNOW (one uploaded in /admin/themes) still
 * gets a page that reads properly: its own name in a plain title, its
 * category's page as its parent, and the facts every template shares.
 *
 * Pure and client safe; the pages pass what the browser needs as props.
 */
import {
  CODE_TEMPLATES,
  CODE_THEME_PACKAGE,
  MARKETPLACE_PATH,
  categoryLabel,
  listingPath,
  tierLabel,
  type ThemeListing,
} from "./marketplace-shared"

/* ── What a template can have ─────────────────────────────────────────── */

/**
 * The features the marketplace filters by. Each is something a person
 * looks for when they choose a template, and each is checked against the
 * template's files (FEATURE_EVIDENCE in the test).
 */
export const THEME_FEATURES = [
  { key: "video", label: "Video section" },
  { key: "reviews", label: "Customer reviews" },
  { key: "faq", label: "FAQ section" },
  { key: "signup", label: "Email signup" },
  { key: "pricing", label: "Pricing plans" },
  { key: "curriculum", label: "Curriculum or chapters" },
  { key: "booking", label: "Book a call page" },
  { key: "lookbook", label: "Lookbook page" },
  { key: "shipping", label: "Shipping page" },
  { key: "licence", label: "Licence page" },
  { key: "podcast", label: "Podcast or show" },
  { key: "dark", label: "Dark design" },
] as const

export type ThemeFeature = (typeof THEME_FEATURES)[number]["key"]

export function featureLabel(key: ThemeFeature): string {
  return THEME_FEATURES.find((f) => f.key === key)?.label ?? key
}

/* ── The categories, each a page ──────────────────────────────────────── */

export interface ThemeSeoCategory {
  slug: string
  /** The sidebar's word for it. */
  name: string
  title: string
  description: string
  h1: string
  /** Answer first: what is on this page, in two sentences. */
  intro: string
  primaryKeyword: string
  secondaryKeywords: string[]
  /** The templates on it, in the order shown (code templates; an uploaded listing joins through LISTING_CATEGORY_TO_SEO). */
  members: string[]
  faqs: { q: string; a: string }[]
}

export const THEME_SEO_CATEGORIES: readonly ThemeSeoCategory[] = [
  {
    slug: "online-store",
    name: "Online stores",
    title: "Online Store Website Templates | Storelib",
    description: "Online store templates for Storelib: clothing, merch, posters and a general shop. Free to use, built for phones, with product pages and checkout included.",
    h1: "Online store website templates",
    intro: "These templates are for shops that sell products: clothes, merch, prints and anything that ships. Each one comes with a home page, product and collection pages, a cart and a shipping page.",
    primaryKeyword: "online store website template",
    secondaryKeywords: ["ecommerce website template", "online shop template", "store website design"],
    members: ["storelib-default", "clothing", "merch", "streetwear", "space-clothing", "posters", "retro-merch", "xp-merch"],
    faqs: [
      { q: "Can I sell physical products with these templates?", a: "Yes. Storelib sells products that ship as well as digital ones, and every template here has a shipping page for your delivery and returns terms." },
      { q: "Which template should I start with?", a: "Storelib Default if you want a plain shop that suits most products. Clothing or Lifestyle label for a fashion brand, Poster shop for prints, Merch, Retro desktop or XP shop for a creator's merch." },
    ],
  },
  {
    slug: "fashion",
    name: "Clothing and fashion",
    title: "Fashion and Clothing Store Templates | Storelib",
    description: "Website templates for clothing brands and fashion labels on Storelib, with lookbook pages, size friendly product pages and a free plan to start.",
    h1: "Fashion and clothing store templates",
    intro: "Eight templates for selling clothes: Clothing, Lifestyle label, Night shop, Merch, Caps and tees, Print on demand, Outerwear label and Streetwear drop. Four of them include a lookbook page for showing a collection on people.",
    primaryKeyword: "fashion website template",
    secondaryKeywords: ["clothing store website template", "apparel website template", "streetwear website template"],
    members: ["clothing", "streetwear", "space-clothing", "merch", "caps-tees", "print-on-demand", "outerwear", "streetwear-drop"],
    faqs: [
      { q: "Do these templates support sizes and colours?", a: "Yes. Product options such as size and colour are set on the product in Storelib, and the product page shows a picker for them." },
      { q: "What is a lookbook page?", a: "A page of large photos that shows a collection worn or styled, linking to the products in it. Clothing, Lifestyle label, Night shop and Streetwear drop include one." },
    ],
  },
  {
    slug: "digital-products",
    name: "Digital products",
    title: "Templates for Selling Digital Downloads | Storelib",
    description: "Website templates for selling digital downloads on Storelib: ebooks, sample packs, Notion templates, art books and other files, delivered after payment.",
    h1: "Templates for selling digital downloads",
    intro: "Nine templates for selling files: a general digital product store, a Notion template shop, a sales page for one Notion template, a Notion creator's website, two music sample pack stores, a cookbook shop, an ebook sales page and an art book store. Buyers get their download as soon as they pay.",
    primaryKeyword: "digital download store template",
    secondaryKeywords: ["sell digital products website", "digital product website template", "website to sell downloads"],
    members: ["digital-products", "templates-shop", "notion-sales-page", "notion-creator", "sample-packs", "sound-packs", "ebooks", "author-book", "art-books"],
    faqs: [
      { q: "How are files delivered to buyers?", a: "Storelib delivers the file after payment, on the receipt page and by email. The template only shows the product; delivery works the same on every template." },
      { q: "Can I add a licence for my files?", a: "Yes. Digital products and Sample packs include a licence page you can edit, and any template can have one added in the editor." },
    ],
  },
  {
    slug: "courses",
    name: "Courses",
    title: "Website Templates for Course Creators | Storelib",
    description: "Six Storelib templates for selling online courses: a course school, a one page course site, a sales page, a sales funnel and two video sales letters.",
    h1: "Website templates for course creators",
    intro: "Six ways to sell a course. Course is a small school, Online course puts one course on one long page, Course landing is a sales letter for one offer, Digital Renaissance is a funnel with bonuses and a guarantee, and Video sales letter (dark) and VSL funnel (light) lead with a video.",
    primaryKeyword: "course creator website template",
    secondaryKeywords: ["online course templates", "course website design", "sell online courses website"],
    members: ["landing-page", "online-course", "course-landing", "digital-renaissance", "vsl-course", "vsl-funnel"],
    faqs: [
      { q: "Which course template fits me?", a: "Selling several courses: Course. One course with a curriculum and price tiers on one page: Online course. One offer you want to sell hard: Course landing. A launch with editions, bonuses and a guarantee: Digital Renaissance. A sales video you already have: Video sales letter on a dark page, or VSL funnel on a light one with modules and prices." },
      { q: "Are the courses hosted on Storelib?", a: "Yes. You build the course in Storelib and the template links to it. Students sign in to watch after they buy." },
    ],
  },
  {
    slug: "coaching",
    name: "Coaching",
    title: "Coach and Consultant Website Templates | Storelib",
    description: "Website templates for coaches and consultants on Storelib: a coaching site with prices, a business coach with a show, a fitness coach and a video sales letter.",
    h1: "Website templates for coaches",
    intro: "Templates for people who sell their time and expertise. They show who you are, what working together costs and how to book, and they sell programmes or guides beside it.",
    primaryKeyword: "consultant website template",
    secondaryKeywords: ["coach website design", "life coach website"],
    members: ["coach", "personal-trainer", "coach-creator", "fitness", "creator-landing", "vsl-course"],
    faqs: [
      { q: "Can clients book a call from the site?", a: "Coach and Video sales letter include a book a call page, and you put your booking link or calendar on it." },
      { q: "Can I sell programmes as well as sessions?", a: "Yes. Programmes, guides and courses are Storelib products, and each template has sections that list them with their prices." },
    ],
  },
  {
    slug: "landing-pages",
    name: "Landing pages",
    title: "Landing Page Templates for Creators | Storelib",
    description: "Landing page templates on Storelib for one product, one course or one person: ebook pages, course sales pages, video sales letters and personal pages.",
    h1: "Landing page templates",
    intro: "Templates built around one thing to sell or one person to introduce. Each is a long single page that walks a visitor from the headline to the buy button, with the rest of the site behind it.",
    primaryKeyword: "landing page template",
    secondaryKeywords: ["sales page template", "single product landing page", "creator landing page"],
    members: ["ebooks", "author-book", "notion-sales-page", "course-landing", "digital-renaissance", "vsl-course", "vsl-funnel", "creator-landing", "online-course", "coach"],
    faqs: [
      { q: "Is a landing page template a whole website?", a: "Yes. The home page is the landing page, and the template also has product, about, contact and FAQ pages you can keep or hide." },
      { q: "Can I use my own domain?", a: "Yes. A Storelib website can be published on a domain you own." },
    ],
  },
  {
    slug: "creators",
    name: "Creators",
    title: "Creator Website Templates | Storelib",
    description: "Website templates for creators on Storelib: a content creator home, a personal brand site, merch shops, sample packs, art books and posters.",
    h1: "Website templates for creators",
    intro: "Templates for people with an audience who sell what they make: merch, music, prints, books or themselves. Each has room for your story beside the products.",
    primaryKeyword: "creator website template",
    secondaryKeywords: ["website for content creators", "influencer website template", "artist store template"],
    members: ["content-creator", "creator-landing", "coach-creator", "merch", "xp-merch", "sample-packs", "art-books", "posters", "retro-merch"],
    faqs: [
      { q: "Do I need my own domain to start?", a: "No. A Storelib website is live on a storelib.com address as soon as you publish, and you can connect your own domain later." },
      { q: "Can I tell my own story on these templates?", a: "Yes. Each one has an about page, and you can add a story or image with text section to the home page in the editor." },
    ],
  },
]

export const THEME_CATEGORY_BASE = `${MARKETPLACE_PATH}/category`
export const themeCategoryPath = (slug: string) => `${THEME_CATEGORY_BASE}/${encodeURIComponent(slug)}`

export function seoCategory(slug: string | null | undefined): ThemeSeoCategory | null {
  return THEME_SEO_CATEGORIES.find((c) => c.slug === slug) ?? null
}

/** An uploaded listing's category (marketplace-shared THEME_CATEGORIES) to the category page it belongs on. */
export const LISTING_CATEGORY_TO_SEO: Record<string, string> = {
  general: "online-store",
  fashion: "fashion",
  creators: "creators",
  digital: "digital-products",
  ebooks: "digital-products",
  design: "digital-products",
  music: "digital-products",
  software: "digital-products",
  photography: "digital-products",
  courses: "courses",
  coaching: "coaching",
  fitness: "coaching",
}

/** Every category page a listing appears on, its own first. */
export function categoriesOf(listing: Pick<ThemeListing, "slug" | "category">): ThemeSeoCategory[] {
  const known = THEME_SEO.find((t) => t.slug === listing.slug)
  if (known) return [known.primaryCategory, ...THEME_SEO_CATEGORIES.filter((c) => c.members.includes(listing.slug)).map((c) => c.slug)].filter((s, i, a) => a.indexOf(s) === i).map((s) => seoCategory(s)!).filter(Boolean)
  const own = seoCategory(LISTING_CATEGORY_TO_SEO[listing.category] ?? "online-store")
  return own ? [own] : []
}

/** The listings on one category page, in its order, with uploaded ones of that kind after. */
export function listingsInCategory(listings: readonly ThemeListing[], slug: string): ThemeListing[] {
  const cat = seoCategory(slug)
  if (!cat) return []
  const inOrder = cat.members.map((m) => listings.find((l) => l.slug === m)).filter((l): l is ThemeListing => !!l)
  const others = listings.filter((l) => !cat.members.includes(l.slug) && categoriesOf(l).some((c) => c.slug === slug))
  return [...inOrder, ...others]
}

/* ── One template ─────────────────────────────────────────────────────── */

export interface ThemeSeo {
  slug: string
  /** The whole <title>, as written. */
  title: string
  description: string
  h1: string
  /** Answer first: what it is and who it is for, two sentences. */
  intro: string
  primaryCategory: string
  primaryKeyword: string
  secondaryKeywords: string[]
  bestFor: string[]
  features: ThemeFeature[]
  /** Pages beyond home, product, collection, cart, about, contact and FAQ, each named by its file (page.<handle>.json). */
  extraPages: { handle: string; label: string }[]
  /** Questions about this template; the shared facts are added after them (themeFaqs). */
  faqs: { q: string; a: string }[]
}

export const THEME_SEO: readonly ThemeSeo[] = [
  {
    slug: "storelib-default",
    title: "Free Ecommerce Website Template | Storelib",
    description: "Storelib Default is a free ecommerce website template: a clean shop with a product grid, category banners, FAQ and newsletter signup. Ready on phones.",
    h1: "Free ecommerce website template",
    intro: "Storelib Default is a clean, general shop template for any kind of product. It opens with a split hero, then your products in a carousel, category banners, a benefits row, FAQ and a newsletter signup.",
    primaryCategory: "online-store",
    primaryKeyword: "free ecommerce website template",
    secondaryKeywords: ["free online store template", "simple ecommerce website", "free shop website template"],
    bestFor: ["A first online shop that should look finished on day one", "Stores with products in several categories", "Brands that want a neutral design to put their own photos in"],
    features: ["video", "faq", "signup", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "What can I sell with Storelib Default?", a: "Physical products, digital downloads, courses and memberships. The product grid shows whatever you add in Storelib, with its price and picture." }],
  },
  {
    slug: "clothing",
    title: "Clothing Brand Website Template | Storelib",
    description: "A clothing brand website template with a slideshow, collection banners, a featured product with size picker and a lookbook page. Free on Storelib.",
    h1: "Clothing brand website template",
    intro: "Clothing is a template for a fashion brand that sells its own collections. It leads with a full width slideshow, then products, collection banners, a featured product with its size picker and a lookbook page.",
    primaryCategory: "fashion",
    primaryKeyword: "clothing brand website template",
    secondaryKeywords: ["clothing store website template", "apparel brand website", "fashion brand website design"],
    bestFor: ["Independent clothing brands with seasonal collections", "Labels that shoot their own campaign photos", "Shops that sell sizes and colours"],
    features: ["signup", "lookbook", "shipping"],
    extraPages: [{ handle: "lookbook", label: "Lookbook" }, { handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can I feature one product on the home page?", a: "Yes. Clothing has a featured product section with the price, the size and colour picker and the buy button right on the home page." }],
  },
  {
    slug: "merch",
    title: "Merch Store Website Template | Storelib",
    description: "A merch store website template for creators and bands: product carousel, categories, an offer bar, customer reviews and a photo gallery. Free on Storelib.",
    h1: "Merch store website template",
    intro: "Merch is a template for a creator, band or community selling its own merch. It has a bold hero, a product carousel, scrolling text, shop by category, an offer bar, reviews and a photo gallery.",
    primaryCategory: "creators",
    primaryKeyword: "merch store website template",
    secondaryKeywords: ["merch website template", "band merch store", "creator merch shop"],
    bestFor: ["YouTubers, streamers and podcasters with merch", "Bands and artists selling shirts and prints", "Communities with a drop or a limited run"],
    features: ["reviews", "signup", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can I announce a sale or a drop?", a: "Yes. The offer bar under the categories holds a short message and a link, and you can change it whenever a drop starts." }],
  },
  {
    slug: "digital-products",
    title: "Digital Product Store Website Template | Storelib",
    description: "A website template for selling digital products: a product grid, how it works steps, a video section, FAQ and a licence page. Free on Storelib.",
    h1: "Digital product store website template",
    intro: "Digital products is a template for selling downloads such as presets, guides, fonts or templates. It explains what buyers get in a few steps, shows a video and answers questions before they ask.",
    primaryCategory: "digital-products",
    primaryKeyword: "digital product store template",
    secondaryKeywords: ["sell digital products website", "digital download website template", "digital shop template"],
    bestFor: ["Designers selling presets, fonts or assets", "Writers selling guides and workbooks", "Anyone moving a download shop off a marketplace"],
    features: ["video", "faq", "signup", "licence"],
    extraPages: [{ handle: "licence", label: "Licence" }],
    faqs: [{ q: "Is there a page for my licence terms?", a: "Yes. The template includes a licence page you can edit, linked from the footer." }],
  },
  {
    slug: "art-books",
    title: "Art Book Store Website Template | Storelib",
    description: "An art book store template with a two image hero, subjects, a look inside the spreads, reader quotes and a video. For digital art books. Free on Storelib.",
    h1: "Art book store website template",
    intro: "Art books is a template for selling digital art and photo books. Its two image hero, subject tiles and a look inside the spreads let people see the pages before they buy.",
    primaryCategory: "digital-products",
    primaryKeyword: "art book store template",
    secondaryKeywords: ["photo book website template", "sell digital art books", "artist book shop website"],
    bestFor: ["Illustrators and photographers selling books", "Small publishers of digital art books", "Artists selling zines as PDFs"],
    features: ["video", "reviews"],
    extraPages: [],
    faqs: [{ q: "Can buyers see inside a book before buying?", a: "Yes. The spreads section shows pages side by side, and you choose which ones to show." }],
  },
  {
    slug: "ebooks",
    title: "Ebook Landing Page Template | Storelib",
    description: "An ebook landing page template, shown as a cookbook: the cover, what is inside, ebook or hardback side by side, reader reviews, FAQ and an email signup.",
    h1: "Ebook landing page template",
    intro: "Cookbook is a landing page for selling one book, set up here as a cookbook in ebook and hardback. It shows the cover, a look inside, the two editions side by side, reader reviews beside the book they are about, an FAQ and a signup for new recipes.",
    primaryCategory: "landing-pages",
    primaryKeyword: "ebook landing page template",
    secondaryKeywords: ["cookbook website template", "sell an ebook website", "recipe book landing page"],
    bestFor: ["Cooks and food writers selling a cookbook", "Authors with an ebook and a printed edition", "Newsletter writers turning recipes or posts into a book"],
    features: ["video", "reviews", "faq", "signup", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can I sell the ebook and a printed copy?", a: "Yes. The comparison shows both editions side by side, the ebook is delivered after payment and the shipping page covers the printed one." }],
  },
  {
    slug: "fitness",
    title: "Fitness Coaching Website Template | Storelib",
    description: "A fitness coaching website template with a bold hero, benefits, programmes for sale, steps, client results and FAQ. Free on Storelib.",
    h1: "Fitness coaching website template",
    intro: "Fitness is a template for personal trainers and online fitness coaches. It sells training programmes, explains how coaching works in steps and shows client testimonials.",
    primaryCategory: "coaching",
    primaryKeyword: "fitness coaching website template",
    secondaryKeywords: ["personal trainer website template", "online fitness coach website", "gym coach website"],
    bestFor: ["Personal trainers moving clients online", "Coaches selling training plans", "Yoga and pilates teachers with programmes"],
    features: ["reviews", "faq"],
    extraPages: [],
    faqs: [{ q: "Can I sell training plans as downloads?", a: "Yes. A plan can be a digital product, a course or a membership in Storelib, and the programmes section lists them." }],
  },
  {
    slug: "landing-page",
    title: "Online Course Website Template | Storelib",
    description: "An online course website template for a small course school: a flagship course, more courses beside it, student reviews and FAQ. Free on Storelib.",
    h1: "Online course website template",
    intro: "Course is a website for a small online school. A flagship course leads, the rest of your courses sit beside it, and student reviews and an FAQ answer what people ask before they enrol.",
    primaryCategory: "courses",
    primaryKeyword: "online course website template",
    secondaryKeywords: ["course school website", "website for multiple courses", "online academy template"],
    bestFor: ["Teachers with more than one course", "Course creators building a school brand", "Educators adding courses over time"],
    features: ["reviews", "faq"],
    extraPages: [],
    faqs: [{ q: "How is this different from the Online course template?", a: "Course is built for several courses, with one leading. Online course puts a single course on one long page with its curriculum and price tiers." }],
  },
  {
    slug: "creator-landing",
    title: "Personal Brand Website Template | Storelib",
    description: "A personal brand website template: a hello hero, how you help, your story, shelves of what you sell and a newsletter page. Free on Storelib.",
    h1: "Personal brand website template",
    intro: "Creator Landing is a personal home page for a creator or expert. It says hello, shows how you help and tells your story, then lists what you sell on shelves and invites people to your newsletter.",
    primaryCategory: "creators",
    primaryKeyword: "personal brand website template",
    secondaryKeywords: ["personal website template", "creator website template", "link in bio website"],
    bestFor: ["Creators who sell several things under their own name", "Writers and educators with a newsletter", "Experts who want one page that explains them"],
    features: ["video", "signup"],
    extraPages: [{ handle: "newsletter", label: "Newsletter" }],
    faqs: [{ q: "Can I use it instead of a link in bio page?", a: "Yes. It works as a single page for everything you make, and Storelib also has OnePage if you want something shorter." }],
  },
  {
    slug: "streetwear",
    title: "Lifestyle Clothing Brand Website Template | Storelib",
    description: "A lifestyle clothing brand template with a full screen hero, large promo banners, a weekly offer countdown, fabric facts and a lookbook page. Free on Storelib.",
    h1: "Lifestyle clothing brand website template",
    intro: "Lifestyle label is a template for a clothing brand built on its imagery. Full screen photos and large promo banners carry the page, with products, a weekly offer countdown and fabric facts in between.",
    primaryCategory: "fashion",
    primaryKeyword: "lifestyle clothing brand website template",
    secondaryKeywords: ["streetwear website template", "lifestyle brand website", "clothing label website"],
    bestFor: ["Streetwear and lifestyle labels", "Brands with strong campaign photography", "Drops and collections told through images"],
    features: ["lookbook", "shipping"],
    extraPages: [{ handle: "lookbook", label: "Lookbook" }, { handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "How is it different from the Clothing template?", a: "Lifestyle label lets large photos and banners lead. Clothing is more of a shop, with a slideshow, collection banners and a featured product." }],
  },
  {
    slug: "sample-packs",
    title: "Music Sample Pack Store Template | Storelib",
    description: "A sample pack store template for producers: a studio photo hero, pack cards with previews, a release spotlight, a free pack page, a licence page and FAQ.",
    h1: "Music sample pack store template",
    intro: "Sample packs is a template for producers selling sounds. A studio photo opens the page, packs sit in cards with a preview player, a new release gets a spotlight of its own, and a free pack page and licence page answer the two things buyers check first.",
    primaryCategory: "digital-products",
    primaryKeyword: "sample pack store template",
    secondaryKeywords: ["sell sample packs website", "beat store template", "music producer website template"],
    bestFor: ["Producers selling sample packs and loops", "Sound designers selling presets", "Beat makers with a free pack to share"],
    features: ["reviews", "faq", "signup", "licence"],
    extraPages: [{ handle: "free", label: "Free pack" }, { handle: "licence", label: "Licence" }],
    faqs: [{ q: "Can I give away a free pack for an email?", a: "Yes. The template has a free pack page and an email signup section, so people can join your list when they take the free pack." }],
  },
  {
    slug: "templates-shop",
    title: "Notion Template Store Website Template | Storelib",
    description: "A website template for selling Notion templates: a how to use section, features, products, reviews, a searchable FAQ and a video. Free on Storelib.",
    h1: "Notion template store website template",
    intro: "Notion templates is a store for people who sell Notion, Figma or spreadsheet templates. It shows how to use a template step by step, lists the products and answers questions in a searchable FAQ.",
    primaryCategory: "digital-products",
    primaryKeyword: "notion template store website",
    secondaryKeywords: ["sell notion templates website", "template shop website", "digital template store"],
    bestFor: ["Notion creators with a set of templates", "Designers selling Figma kits", "Anyone selling spreadsheets and planners"],
    features: ["video", "reviews", "faq", "signup"],
    extraPages: [{ handle: "how-it-works", label: "How it works" }],
    faqs: [{ q: "How do buyers get a Notion template?", a: "You add the duplicate link or a file to the product, and Storelib shows it to the buyer after payment." }],
  },
  {
    slug: "space-clothing",
    title: "Dark Ecommerce Website Template | Storelib",
    description: "A dark ecommerce website template: products float on a night sky with a soft glow, with a lookbook page. For clothing and design led shops. Free on Storelib.",
    h1: "Dark ecommerce website template",
    intro: "Night shop is a dark store template. Products float on a night sky with a soft glow, so a small collection looks like a gallery rather than a catalogue.",
    primaryCategory: "fashion",
    primaryKeyword: "dark ecommerce website template",
    secondaryKeywords: ["dark theme online store", "black website template store", "minimal dark shop template"],
    bestFor: ["Small collections that should look like a gallery", "Brands with a dark or night look", "Drops of a few products at a time"],
    features: ["lookbook", "shipping", "dark"],
    extraPages: [{ handle: "lookbook", label: "Lookbook" }, { handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Does a dark template work for a large catalogue?", a: "It suits a few products best. With many products, Clothing or Storelib Default are easier to browse." }],
  },
  {
    slug: "posters",
    title: "Art Print & Poster Store Website Template | Storelib",
    description: "An art print and poster store template with pastel wavy bands, framed prints, image links, an FAQ and a newsletter. Free on Storelib.",
    h1: "Art print and poster store website template",
    intro: "Poster shop is a template for selling art prints and posters. Framed prints sit between pastel wavy bands, image links lead to collections and an FAQ covers sizes and shipping.",
    primaryCategory: "online-store",
    primaryKeyword: "poster store website template",
    secondaryKeywords: ["art print shop website", "sell posters online template", "illustration shop website"],
    bestFor: ["Illustrators selling prints", "Poster shops with several collections", "Artists selling both prints and downloads"],
    features: ["faq", "signup", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can I sell prints as downloads too?", a: "Yes. A print can be a physical product, a digital file or both, each with its own price." }],
  },
  {
    slug: "coach",
    title: "Coaching Website & Landing Page Template | Storelib",
    description: "A coaching website template, shown as a running coach: training plans, how it works, client stories, a photo wall, FAQ and a book a call page.",
    h1: "Coaching website and landing page template",
    intro: "Coach is a website for a coach who sells plans and calls, shown here as a running coach. It leads with a bold photo, then the training plans, the steps from the first call, client stories, a photo wall and an FAQ.",
    primaryCategory: "coaching",
    primaryKeyword: "coaching website template",
    secondaryKeywords: ["running coach website", "personal trainer website template", "coaching landing page"],
    bestFor: ["Running, fitness and sports coaches", "Coaches who sell training plans beside calls", "Clubs and coaches with a race or event calendar"],
    features: ["video", "reviews", "faq", "booking"],
    extraPages: [{ handle: "book", label: "Book a call" }],
    faqs: [{ q: "Can I sell plans as well as calls?", a: "Yes. Plans are Storelib products listed on the home page with their prices, and the book a call page holds your booking link for anyone who wants to talk first." }],
  },
  /* Templates round 25: a personal strength coach (Mateo Ruiz), online and in person. */
  {
    slug: "personal-trainer",
    title: "Personal Trainer Website Template | Storelib",
    description: "A personal trainer website template: a split hero, coaching offers with prices, before and after, testimonials, a booking page, an application and a quiz.",
    h1: "Personal trainer website template",
    intro: "Personal trainer is a black and white website for one coach who trains clients online and in person. It opens on the coach beside a tall heading, then three offers with prices, before and after, testimonials and a free call. Storelib booking pages, an application form and a quiz have pages of their own.",
    primaryCategory: "coaching",
    primaryKeyword: "personal trainer website template",
    secondaryKeywords: ["online coaching website", "strength coach website", "personal training booking page"],
    bestFor: ["Personal trainers with clients online and in person", "Strength coaches selling programs beside coaching", "Coaches who start every client with a free call"],
    features: ["reviews", "faq", "signup", "pricing", "booking"],
    extraPages: [{ handle: "book-a-call", label: "Book a free call" }, { handle: "apply", label: "Apply for coaching" }, { handle: "find-your-plan", label: "Find your plan quiz" }],
    faqs: [
      { q: "How is this different from the Fitness and Running coach templates?", a: "Fitness is a bold dark template that sells training programmes. Running coach is built around race plans and a group run. Personal trainer is for one coach selling their own time: a black and white site with three offers and their prices, before and after, testimonials, a free call to book, an application form and a quiz that points people to the right offer." },
      { q: "Can clients book the free call on the site?", a: "Yes. The book a call page holds a Storelib booking form, and every button on the site that says Book a free call leads to it." },
      { q: "Can I add a quiz and a community?", a: "Yes. The Find your plan page holds a Storelib quiz, the Apply page a Storelib form, and the community is a monthly product that gives members access, sold beside the coaching." },
    ],
  },
  {
    slug: "vsl-course",
    title: "Video Sales Letter Landing Page Template | Storelib",
    description: "A video sales letter template: your sales video on a dark page, logos, who it is for, results, reviews, FAQ and a book a call page. Free on Storelib.",
    h1: "Video sales letter landing page template",
    intro: "Video sales letter is a dark landing page that leads with your sales video. Under it come logos, who the offer is for, results, reviews and FAQ, with a call to book after each part.",
    primaryCategory: "courses",
    primaryKeyword: "video sales letter template",
    secondaryKeywords: ["vsl landing page", "vsl funnel template", "video sales page template"],
    bestFor: ["Course creators with a sales video", "High ticket coaching offers sold on a call", "Programmes with a waitlist or application"],
    features: ["video", "reviews", "faq", "booking", "dark"],
    extraPages: [{ handle: "book-a-call", label: "Book a call" }],
    faqs: [{ q: "Do I need a sales video to use it?", a: "The page is built around one, so it works best with a video. Without one, the hero can hold a picture and a headline instead." }],
  },
  {
    slug: "vsl-funnel",
    title: "Light VSL Funnel Template for Online Courses | Storelib",
    description: "A light video sales funnel for one course: the sales video with your own cover picture, who it is for, modules, teacher, reviews, prices, refund and FAQ.",
    h1: "Video course funnel template",
    intro: "VSL funnel is a light sales page that opens with your course video in a large player, with your own cover picture until it plays, shown here as a watercolour course in a deep teal. Under it come who the course is for, the modules, the teacher, student quotes, two prices with a refund, questions and a book a call page.",
    primaryCategory: "courses",
    primaryKeyword: "video course funnel template",
    secondaryKeywords: ["light vsl landing page", "course sales funnel template", "sales video landing page"],
    bestFor: ["Course creators with a sales video and one main course", "Cohort courses that open a class once or twice a year", "Teachers who offer a call before people join"],
    features: ["video", "reviews", "faq", "signup", "pricing", "curriculum", "booking"],
    extraPages: [{ handle: "book-a-call", label: "Book a call" }],
    faqs: [
      { q: "How is it different from Video sales letter?", a: "Video sales letter is a dark, short page built to send people to a call. VSL funnel is light and longer: under the video it lists the modules, shows two prices with a refund and has a free email signup, so people can buy without a call." },
      { q: "Can I use my own cover picture for the video?", a: "Yes. You choose the picture that shows until play is pressed, and the video can be a file you upload or a YouTube or Vimeo link." },
    ],
  },
  {
    slug: "notion-sales-page",
    title: "Notion Template Sales Page Template | Storelib",
    description: "A sales page template for one Notion template: a hero over your workspace, the pages inside as cards, the offer with editions, a comparison and FAQ.",
    h1: "Sales page template for one Notion template",
    intro: "Notion sales page is a long landing page for selling a single Notion template, shown here as Creator OS, a content planner for creators. It opens on the workspace under a label with the Notion logo, shows each page inside on a card, then the template to buy, a with and without comparison, buyer notes and questions.",
    primaryCategory: "digital-products",
    primaryKeyword: "notion template sales page",
    secondaryKeywords: ["sell a notion template", "notion template landing page", "notion product page template"],
    bestFor: ["Creators selling one Notion template or system", "Notion makers launching a new template with a bundle", "Anyone selling a content planner or tracker built in Notion"],
    features: ["reviews", "faq"],
    extraPages: [],
    faqs: [
      { q: "How is it different from Notion templates?", a: "Notion templates is a store for a catalogue of templates, with a product grid and a how it works page. Notion sales page sells one template on one long page: your screenshots, the pages inside, the offer with its editions and questions, with the other products a click away." },
      { q: "Can I show my own Notion screenshots?", a: "Yes. Every screenshot is a picture you replace in the editor, and the cards take as many pages as your template has." },
    ],
  },
  /* Templates round 25: Notion creator, a Notion template maker's website with a templates page. */
  {
    slug: "notion-creator",
    title: "Notion Template Creator Website Template | Storelib",
    description: "A website template for a Notion template creator: a drawn avatar, template cards, free templates, how duplicating works, buyer reviews, FAQ and a list.",
    h1: "Website template for Notion template creators",
    intro: "Notion creator is a personal website for someone who makes and sells Notion templates, shown here as Margin, business templates by Nora Lind. It opens on a line drawn avatar over a large heading, then the templates as cards, how duplicating works, free ones, buyer notes and questions, with a templates page by type.",
    primaryCategory: "digital-products",
    primaryKeyword: "notion template creator website",
    secondaryKeywords: ["sell notion templates website", "notion creator portfolio", "notion template store design"],
    bestFor: ["Creators selling several Notion templates, free and paid", "Notion makers who want their own site instead of a marketplace page", "Anyone selling CRMs, planners, trackers or bundles built in Notion"],
    features: ["reviews", "faq", "signup"],
    extraPages: [],
    faqs: [
      { q: "How is it different from Notion templates and Notion sales page?", a: "Notion templates is a shop for a catalogue, with a guided tour of one workspace and a how it works page. Notion sales page sells one template on one long page. Notion creator is the creator's own website: your avatar first, every template as a card with free ones beside paid ones, a templates page with premium, free, on sale and bundles, and a blog and email list." },
      { q: "Can I give templates away for free?", a: "Yes. Price a template at $0 and buyers check out without paying and get the same duplicate link by email. The free templates section lists them on their own." },
    ],
  },
  {
    slug: "sound-packs",
    title: "Dark Sound Pack Store Website Template | Storelib",
    description: "A dark store template for sample packs: illustrated pack covers, previews that play on every card, demos with BPM and key, bundles and a support page.",
    h1: "Dark sound pack store website template",
    intro: "Sound packs is a dark store for producers who sell sample packs, with something to play everywhere. A wall of bold illustrated pack covers opens it, every pack card plays its preview, and each pack page has a demo, a table of its sounds, the folders inside as tabs and the DAWs it works in.",
    primaryCategory: "digital-products",
    primaryKeyword: "sound pack store website template",
    secondaryKeywords: ["sample pack website with audio previews", "sell loops and one shots online", "producer store template"],
    bestFor: ["Sample labels with several packs and free ones", "Producers who want buyers to hear every sound first", "Sound designers selling bundles of packs"],
    features: ["reviews", "signup", "pricing", "licence"],
    extraPages: [{ handle: "licence", label: "Licence" }, { handle: "support", label: "Support" }],
    faqs: [
      { q: "How is it different from the Sample packs template?", a: "Sample packs opens on a studio photo with a release spotlight and pack cards that each carry a small player, in violet. Sound packs is closer to a sound library: a hero of illustrated pack covers, pack rows with a play button on each cover, a table of demos with file names, BPM and key, bundle prices, and pack pages built around a demo player and a table of the pack's sounds." },
      { q: "Can I upload my own previews?", a: "Yes. Every player takes an audio file you upload in the editor, an mp3, wav, m4a or ogg. The waveform is read from the file the first time it plays, or you can paste its peaks so it shows before anyone presses play." },
    ],
  },
  {
    slug: "online-course",
    title: "One Page Online Course Website Template | Storelib",
    description: "A one page website template for one online course: key facts, who it is for, a curriculum that opens, price tiers, reviews, FAQ and a contact form.",
    h1: "One page online course website template",
    intro: "Online course puts a single course on one long page. Key facts and who it is for come first, then a curriculum that opens module by module, price tiers, reviews, FAQ and a contact form.",
    primaryCategory: "courses",
    primaryKeyword: "one page course website",
    secondaryKeywords: ["single course website template", "course curriculum page", "online course selling website"],
    bestFor: ["Creators selling one main course", "Courses with several price tiers", "Cohort courses that take questions before enrolling"],
    features: ["reviews", "faq", "pricing", "curriculum"],
    extraPages: [],
    faqs: [{ q: "Can I offer more than one price?", a: "Yes. The pricing section shows your tiers side by side, each with its own price and button." }],
  },
  {
    slug: "course-landing",
    title: "Online Course Sales Page Template | Storelib",
    description: "A course sales page template for one offer, shown as a reformer Pilates course: who it is for, the weeks, the teacher, reviews, the course to buy and FAQ.",
    h1: "Online course sales page template",
    intro: "Course landing is a sales page for one course, shown here as a six week online reformer Pilates course. It moves from who it is for and how a week works through the teacher and reviews to the course itself, with its price, options and refund, then questions.",
    primaryCategory: "landing-pages",
    primaryKeyword: "course sales page template",
    secondaryKeywords: ["online course landing page", "pilates course website", "program sales page"],
    bestFor: ["A launch of one course or programme", "Fitness teachers, coaches and skill teachers", "Creators driving ads or emails to one page"],
    features: ["video", "reviews", "faq"],
    extraPages: [],
    faqs: [
      { q: "How is it different from Online course?", a: "Course landing is written as a sales page for one offer, sold as one product with its options and a refund. Online course is a site for the course itself, with facts and a curriculum first." },
      { q: "Where does the price come from?", a: "The offer near the end of the page is your course product, so its picture, price, options and buy buttons come from the product you add in Storelib." },
    ],
  },
  {
    slug: "retro-merch",
    title: "Retro Desktop Website Template | Storelib",
    description: "A retro desktop website template: products open in windows on an old computer desktop, with a taskbar, a Start menu and quick view. Free on Storelib.",
    h1: "Retro desktop website template",
    intro: "Retro desktop turns a merch shop into an old computer desktop. Products open in windows, the taskbar has a Start menu, and quick view and added to cart appear as dialogs.",
    primaryCategory: "creators",
    primaryKeyword: "retro desktop website template",
    secondaryKeywords: ["windows 95 website template", "90s website template", "retro merch store"],
    bestFor: ["Creators and bands with a playful brand", "Small merch drops", "Game, music and internet culture shops"],
    features: ["shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Is it only for merch?", a: "It is laid out as a merch shop, but the windows hold any Storelib product, so it also suits music, zines or downloads from a brand with a sense of humour." }],
  },
  /* Templates round 21 (main), round 58 integration: the five templates main added, each read from its own files. */
  {
    slug: "author-book",
    title: "Ebook Sales Page Template for One Book | Storelib",
    description: "An ebook sales page template: the book on a dark hero, open spreads, who it is for, reader quotes, what the book covers, the author, editions and FAQ.",
    h1: "Ebook sales page template",
    intro: "Ebook is a sales page for one book, shown here as a houseplant care guide in three editions, with its own logo. The book comes first on a dark hero, then open pages, who it is for, reader quotes, what it covers, the author and a free chapter.",
    primaryCategory: "digital-products",
    primaryKeyword: "ebook sales page template",
    secondaryKeywords: ["sell an ebook online", "nonfiction book website", "book launch website"],
    bestFor: ["Authors selling a nonfiction ebook", "Teachers and coaches turning a method into a book", "Writers offering a free chapter by email"],
    features: ["video", "reviews", "faq", "signup"],
    extraPages: [{ handle: "newsletter", label: "Free chapter" }],
    faqs: [{ q: "How is it different from the Cookbook template?", a: "Ebook sells one book with one long sales page, open spreads and a free chapter by email. Cookbook is a small shop for several books, each in ebook and print." }],
  },
  {
    slug: "content-creator",
    title: "Content Creator Website Template | Storelib",
    description: "A content creator website template: a hero with your photo, start here steps, a featured product, courses and tools, reviews, a weekly letter and FAQ.",
    h1: "Content creator website template",
    intro: "Content creator is a home for a creator who teaches online. New visitors get three places to start, then a featured product, the courses and tools with prices, reviews, a signup for the weekly letter and your socials.",
    primaryCategory: "creators",
    primaryKeyword: "content creator website template",
    secondaryKeywords: ["youtuber website template", "newsletter creator website", "creator course website"],
    bestFor: ["YouTubers who sell courses", "Newsletter writers with digital products", "Educators who teach a skill online"],
    features: ["video", "reviews", "faq", "signup"],
    extraPages: [{ handle: "newsletter", label: "Newsletter" }],
    faqs: [{ q: "How is it different from Creator Landing?", a: "Content creator is built for someone who publishes every week, with a featured product, courses with prices and a letter signup. Creator Landing is a quieter personal page with shelves of what you sell." }],
  },
  {
    slug: "coach-creator",
    title: "Business Coach Website Template | Storelib",
    description: "A business coach website template: a portrait hero, programmes, a podcast, client stories, a free worksheet signup, a photo wall and FAQ.",
    h1: "Business coach website template",
    intro: "Coach creator is a personal brand site for a coach who also runs a show. A large portrait introduces you, then the programmes, the podcast, client stories and a free worksheet bring people in.",
    primaryCategory: "coaching",
    primaryKeyword: "business coach website template",
    secondaryKeywords: ["coach personal brand website", "coach podcast website", "life coach website"],
    bestFor: ["Coaches with a podcast or video show", "Coaches who sell group programmes", "Consultants who grow a list with a free worksheet"],
    features: ["video", "reviews", "faq", "signup", "podcast"],
    extraPages: [{ handle: "programmes", label: "Programmes" }, { handle: "podcast", label: "Podcast" }, { handle: "worksheet", label: "Free worksheet" }],
    faqs: [{ q: "How is it different from the Coach template?", a: "Coach creator is for a coach who is also a creator: a show, programmes and a free worksheet. Coach is built around plans you sell and a call to book." }],
  },
  {
    slug: "digital-renaissance",
    title: "Course Sales Funnel Website Template | Storelib",
    description: "A black and gold course sales funnel template: the offer, who it is for, six modules, bonuses, reviews, editions with prices, a guarantee and FAQ.",
    h1: "Course sales funnel website template",
    intro: "Digital Renaissance is a black and gold sales funnel for a course launch. It moves from the offer and who it is for through the modules, bonuses and reviews to the editions, a money back guarantee and questions.",
    primaryCategory: "courses",
    primaryKeyword: "course sales funnel template",
    secondaryKeywords: ["course launch page", "digital product launch website", "online course funnel"],
    bestFor: ["Course launches with a date", "Courses with several editions and a guarantee", "Experts teaching a practical skill online"],
    features: ["video", "reviews", "faq", "pricing", "curriculum", "dark"],
    extraPages: [],
    faqs: [{ q: "How is it different from Course landing?", a: "Digital Renaissance is a dark funnel with modules, bonuses, editions and a guarantee. Course landing is a lighter sales page with one price." }],
  },
  {
    slug: "xp-merch",
    title: "Y2K Merch Store Website Template | Storelib",
    description: "A Y2K merch store template on a sunny early 2000s desktop: glossy windows, a taskbar, quick view and cart windows, a guestbook and a help window.",
    h1: "Y2K merch store website template",
    intro: "XP shop puts a merch shop on a sunny early 2000s desktop. Products open in glossy blue windows, the taskbar sits at the foot, and reviews appear as a guestbook beside a help window you can search.",
    primaryCategory: "creators",
    primaryKeyword: "y2k website template",
    secondaryKeywords: ["2000s website template", "nostalgic merch store", "desktop style online shop"],
    bestFor: ["Merch drops from a playful brand", "Print on demand clothing and stickers", "Creators whose audience grew up online"],
    features: ["reviews", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "How is it different from Retro desktop?", a: "XP shop is a bright early 2000s desktop with glossy windows and a hill under a blue sky. Retro desktop is an older computer desktop with a taskbar and a Start menu." }],
  },
  {
    slug: "caps-tees",
    title: "Caps and T-Shirt Store Website Template | Storelib",
    description: "A caps and t-shirt store template: the latest products first, shop by category, the brand story, trust points, press logos and your socials.",
    h1: "Caps and t-shirt store website template",
    intro: "Caps and tees is a shop for a small headwear and t-shirt brand. Products come first, with Add to cart showing when you point at a card, then categories with photos, the story behind the brand, delivery and returns points, press logos and your socials.",
    primaryCategory: "fashion",
    primaryKeyword: "t-shirt store website template",
    secondaryKeywords: ["hat store website", "apparel brand website", "small clothing brand website"],
    bestFor: ["Small cap and t-shirt brands", "Clothing drops from a creator or club", "Brands that sell a few core products in many colours"],
    features: ["video", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can a product come in several colours and sizes?", a: "Yes. Colour and size are options on the product in Storelib, and the product page shows a picker for each." }],
  },
  {
    slug: "print-on-demand",
    title: "Print on Demand Store Website Template | Storelib",
    description: "A print on demand store template for tees and hoodies: campaign slides, photo strips, collections, new arrivals, the brand story, signup and reviews.",
    h1: "Print on demand store website template",
    intro: "Print on demand is a shop for a clothing brand whose tees and hoodies are printed when ordered. Campaign slides and photo strips sit between the collections and new arrivals, with a signup, customer reviews and collections behind every menu link below.",
    primaryCategory: "fashion",
    primaryKeyword: "print on demand website template",
    secondaryKeywords: ["print on demand store", "custom t-shirt website", "hoodie brand website"],
    bestFor: ["Print on demand clothing brands", "Designers selling prints on tees and hoodies", "Sports, college and team style apparel"],
    features: ["video", "reviews", "signup", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Does it say that items are made to order?", a: "Yes. The shipping page and product details say how long printing takes before an order ships, and you change the wording to match your supplier." }],
  },
  {
    slug: "outerwear",
    title: "Streetwear Outerwear Store Website Template | Storelib",
    description: "A streetwear template for an outerwear label: a moving photo hero, a mega menu with pictures, trending pieces, category banners and an Instagram strip.",
    h1: "Streetwear outerwear store website template",
    intro: "Outerwear label is a shop for a streetwear brand that sells jackets, puffers and knitwear. Editorial photographs scroll slowly behind a big condensed heading, the menu opens into a mega menu with collection pictures, every menu link opens a collection, and a giant wordmark closes the page above the footer.",
    primaryCategory: "fashion",
    primaryKeyword: "streetwear store website template",
    secondaryKeywords: ["outerwear brand website", "jacket store website", "urban clothing brand website"],
    bestFor: ["Streetwear and outerwear labels", "Jacket, puffer and knitwear brands", "Clothing drops with a strong photo story"],
    features: ["video", "shipping"],
    extraPages: [{ handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Can the product cards show colours?", a: "Yes. When a product has a Colour option, its swatches show on the card and the product page shows a picker for colour and size." }],
  },
  {
    slug: "streetwear-drop",
    title: "Streetwear Drop Store Website Template | Storelib",
    description: "A streetwear store template that opens on a clothing rail: hoodies and tees turn to face you, then lift into a view with sizes, Add to cart and the look.",
    h1: "Streetwear drop store website template",
    intro: "Streetwear drop is a label's store that opens on a rail of its own garments hanging side on: point at one and it turns to face you, click it and it lifts into a window with sizes, Add to cart and the pieces it is worn with. New arrival rows, banners, shop the look, a journal and a lookbook page follow.",
    primaryCategory: "fashion",
    primaryKeyword: "streetwear drop website template",
    secondaryKeywords: ["streetwear brand website", "hoodie brand website", "clothing rail website"],
    bestFor: ["Streetwear labels that release in drops", "Hoodie, sweat and tee brands", "Brands with cut out photos of their garments"],
    features: ["lookbook", "shipping"],
    extraPages: [{ handle: "lookbook", label: "Lookbook" }, { handle: "shipping", label: "Shipping" }],
    faqs: [{ q: "Do I need special photos for the rail?", a: "Yes: a side view and a front view of each garment on its hanger with the background removed, saved as transparent PNG or WebP. Any background remover makes them from photos you already have." }],
  },
]

export function themeSeoFor(slug: string): ThemeSeo | null {
  return THEME_SEO.find((t) => t.slug === slug) ?? null
}

/* ── What every template shares, and the page's words for any listing ── */

/** The pages every template ships with besides its own (each template's templates/ folder). */
export const SHARED_PAGES = ["Home", "Product", "Collection", "Cart", "About", "Contact", "FAQ", "Blog"]

export interface ThemePageCopy {
  title: string
  description: string
  h1: string
  intro: string
  bestFor: string[]
  features: ThemeFeature[]
  pages: string[]
  faqs: { q: string; a: string }[]
  primaryCategory: ThemeSeoCategory | null
  /** The facts an answer engine quotes: price, what is included, where it runs. */
  facts: { label: string; value: string }[]
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}.`)

export function themePageCopy(listing: ThemeListing): ThemePageCopy {
  const seo = themeSeoFor(listing.slug)
  const cats = categoriesOf(listing)
  const price = tierLabel(listing)
  const free = listing.tier === "free"
  const name = listing.name
  const pages = seo ? [...SHARED_PAGES, ...seo.extraPages.map((p) => p.label)] : SHARED_PAGES
  const priceFact = free ? "Free on every Storelib plan" : listing.tier === "pro" ? "Included with the Grow and Pro plans" : `${price}, one time`
  const facts = [
    { label: "Price", value: priceFact },
    { label: "Works with", value: "Storelib websites, with your Storelib products, checkout and domain" },
    { label: "Pages included", value: pages.join(", ") },
    { label: "Made by", value: listing.author },
  ]
  const shared = [
    free
      ? { q: `Is the ${name} template free?`, a: "Yes. It is free on every Storelib plan, including Free, which has no monthly fee. Storelib takes a fee per sale on each plan; the pricing page lists them." }
      : { q: `What does the ${name} template cost?`, a: `${priceFact}.` },
    { q: `How do I start a website with ${name}?`, a: "Press Use this template. It is added to your Storelib website library, where you change the words, pictures and colours in the editor and publish when it is ready. Without an account you sign in or sign up first, then it is added." },
    { q: "Will it work on phones?", a: "Yes. Every section is laid out for phones as well as computers, and the gallery on this page shows the home page on both." },
  ]
  if (seo) {
    return {
      title: seo.title,
      description: seo.description,
      h1: seo.h1,
      intro: seo.intro,
      bestFor: seo.bestFor,
      features: seo.features,
      pages,
      faqs: [...seo.faqs, ...shared],
      primaryCategory: seoCategory(seo.primaryCategory),
      facts,
    }
  }
  const kind = categoryLabel(listing.category).toLowerCase()
  const intro = listing.description?.trim() || `${name} is a ${kind} website template for Storelib by ${listing.author}.`
  return {
    title: cut(`${name} Website Template | Storelib`, 70),
    description: cut(`${name} is a ${kind} website template for Storelib by ${listing.author}. ${free ? "Free to use." : `${priceFact}.`} Preview it and add it to your website library.`, 160),
    h1: `${name} website template`,
    intro,
    bestFor: [],
    features: [],
    pages,
    faqs: shared,
    primaryCategory: cats[0] ?? null,
    facts,
  }
}

/* ── Related templates ────────────────────────────────────────────────── */

/**
 * Categories that sit next to each other: a visitor looking at one is the
 * likeliest to want the others. Fashion and online stores share shoppers;
 * courses, coaching and landing pages share the people who sell expertise.
 */
export const NEIGHBOUR_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  fashion: ["online-store", "creators"],
  "online-store": ["fashion", "creators"],
  creators: ["online-store", "fashion", "digital-products"],
  "digital-products": ["landing-pages", "creators", "courses"],
  courses: ["landing-pages", "coaching", "digital-products"],
  coaching: ["courses", "landing-pages", "creators"],
  "landing-pages": ["courses", "digital-products", "coaching"],
}

/** How many related templates a template's page shows (marketplace round 24: more than three, a full row of six). */
export const RELATED_COUNT = 6

/**
 * Up to `n` other listings, closest first (marketplace round 24, the owner:
 * "for a fashion template, all the fashion templates before anything else;
 * the same category first, then related categories"):
 *   0  in this template's own category, in that category's own order; a
 *      template in the fashion category counts fashion as its own too, so
 *      Merch (filed under creators) shows the clothing templates first;
 *   1  shares any other category with it, the more shared the sooner;
 *   2  in a neighbouring category (NEIGHBOUR_CATEGORIES);
 *   3  the rest, in the featured order.
 */
export function relatedListings(listing: ThemeListing, all: readonly ThemeListing[], n = RELATED_COUNT): ThemeListing[] {
  const mine = categoriesOf(listing).map((c) => c.slug)
  /* A template that sells clothes is a fashion template first, wherever else it is filed (Merch is filed under creators); then its own category. */
  const homes = [...(mine.includes("fashion") ? ["fashion"] : []), mine[0]].filter((s, i, a): s is string => !!s && a.indexOf(s) === i)
  const near = new Set(homes.flatMap((h) => NEIGHBOUR_CATEGORIES[h] ?? []))
  const rank = (l: ThemeListing) => {
    const theirs = categoriesOf(l).map((c) => c.slug)
    const shared = theirs.filter((s) => mine.includes(s)).length
    const home = homes.findIndex((h) => theirs.includes(h))
    if (home >= 0) {
      const at = seoCategory(homes[home])?.members.indexOf(l.slug) ?? -1
      return [0, home, at < 0 ? 999 : at]
    }
    if (shared) return [1, -shared, 0]
    if (theirs.some((s) => near.has(s))) return [2, 0, 0]
    return [3, 0, 0]
  }
  return all
    .filter((l) => l.slug !== listing.slug)
    .map((l, i) => ({ l, r: rank(l), i }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .slice(0, n)
    .map((x) => x.l)
}

/* ── Pictures ─────────────────────────────────────────────────────────── */

/**
 * The pictures scripts/build-theme-seo-images.mjs cuts from each code
 * template's full page screenshots (templateCoverPath): a card at 4:5 in
 * two widths, the top of the home page at 8:5 for the gallery, the top of
 * the phone page, and the 1200 by 630 share card. All WebP, the share card
 * JPEG because that is what every network reads.
 */
export const SEO_IMAGE_DIR = `/themes/${CODE_THEME_PACKAGE}/seo`
export const CARD_WIDTHS = [480, 800] as const
export const CARD_RATIO = { w: 4, h: 5 } as const
/* The covers are 1200 wide (scripts/build-theme-template-covers.ts), so the hero is never enlarged. */
export const HERO_SIZE = { w: 1200, h: 750 } as const
export const PHONE_SIZE = { w: 390, h: 844 } as const
export const OG_SIZE = { w: 1200, h: 630 } as const

export interface ThemeImages {
  card: { src: string; srcSet: string; width: number; height: number } | null
  hero: { src: string; width: number; height: number } | null
  phone: { src: string; width: number; height: number } | null
  og: { src: string; width: number; height: number } | null
  /** The full page screenshots, for anyone who wants to see the whole page. */
  fullDesktop: string | null
  fullPhone: string | null
}

/** The overlay folder of a code template (its pictures are named by it), or null for an uploaded listing. */
export function templateOf(listing: Pick<ThemeListing, "slug" | "codePackage">): string | null {
  const t = CODE_TEMPLATES.find((c) => c.slug === listing.slug)
  if (!t) return null
  return listing.codePackage === `${CODE_THEME_PACKAGE}/${t.template}` ? t.template : null
}

export function themeImages(listing: ThemeListing): ThemeImages {
  const t = templateOf(listing)
  if (t) {
    const card = (w: number) => `${SEO_IMAGE_DIR}/${t}-card-${w}.webp`
    return {
      card: { src: card(CARD_WIDTHS[0]), srcSet: CARD_WIDTHS.map((w) => `${card(w)} ${w}w`).join(", "), width: CARD_WIDTHS[1], height: (CARD_WIDTHS[1] * CARD_RATIO.h) / CARD_RATIO.w },
      hero: { src: `${SEO_IMAGE_DIR}/${t}-hero.webp`, ...dims(HERO_SIZE) },
      phone: { src: `${SEO_IMAGE_DIR}/${t}-phone.webp`, ...dims(PHONE_SIZE) },
      og: { src: `${SEO_IMAGE_DIR}/${t}-og.jpg`, ...dims(OG_SIZE) },
      fullDesktop: listing.screenshots[0] ?? listing.cover,
      fullPhone: listing.screenshots[1] ?? null,
    }
  }
  /* An uploaded listing: its own cover, at a size the page does not know, drawn in a frame of fixed shape so nothing moves. */
  const cover = listing.cover ?? listing.screenshots[0] ?? null
  return {
    card: cover ? { src: cover, srcSet: "", width: 800, height: 1000 } : null,
    hero: cover ? { src: cover, ...dims(HERO_SIZE) } : null,
    phone: listing.phoneCover ?? listing.screenshots[1] ? { src: (listing.phoneCover ?? listing.screenshots[1])!, ...dims(PHONE_SIZE) } : null,
    og: cover?.startsWith("https://") ? { src: cover, ...dims(OG_SIZE) } : null,
    fullDesktop: cover,
    fullPhone: listing.phoneCover ?? listing.screenshots[1] ?? null,
  }
}

function dims(s: { w: number; h: number }) {
  return { width: s.w, height: s.h }
}

/** Alt text that says what the picture shows, not that it is a picture. */
export function themeAlt(listing: Pick<ThemeListing, "name">, view: "card" | "hero" | "phone" | "og", h1?: string): string {
  const what = h1 ? h1.charAt(0).toLowerCase() + h1.slice(1) : "website template"
  if (view === "phone") return `${listing.name} ${what}, home page on a phone`
  if (view === "og") return `${listing.name}, a ${what} for Storelib`
  return `${listing.name} ${what}, home page on a computer`
}

/* ── What the marketplace page sends to the browser ───────────────────── */

/** One card's worth of a listing, with what the filters read. */
export interface MarketplaceCard {
  slug: string
  name: string
  href: string
  tier: ThemeListing["tier"]
  priceCents: number
  price: string
  categoryName: string
  categories: string[]
  features: ThemeFeature[]
  sortOrder: number
  createdAt: string
  image: ThemeImages["card"]
  alt: string
}

export function marketplaceCard(l: ThemeListing): MarketplaceCard {
  const copy = themePageCopy(l)
  const cats = categoriesOf(l)
  return {
    slug: l.slug,
    name: l.name,
    href: listingPath(l.slug),
    tier: l.tier,
    priceCents: l.priceCents,
    price: tierLabel(l),
    categoryName: cats[0]?.name ?? categoryLabel(l.category),
    categories: cats.map((c) => c.slug),
    features: copy.features,
    sortOrder: l.sortOrder,
    createdAt: l.createdAt,
    image: themeImages(l).card,
    alt: themeAlt(l, "card", copy.h1),
  }
}

/** The category copy the browser swaps in when a category is chosen without a page load. */
export interface MarketplaceCategoryCopy {
  slug: string
  name: string
  path: string
  title: string
  h1: string
  intro: string
}

export function marketplaceCategoryCopy(c: ThemeSeoCategory): MarketplaceCategoryCopy {
  return { slug: c.slug, name: c.name, path: themeCategoryPath(c.slug), title: c.title, h1: c.h1, intro: c.intro }
}

/** /themes itself. */
export const MARKETPLACE_SEO = {
  title: "Website Templates for Stores, Courses and Creators | Storelib",
  description: "Free website templates for online stores, courses, coaching and digital products. Preview each one on a computer and a phone, then use it on Storelib.",
  h1: "Website templates",
  intro: (count: number) =>
    `Storelib has ${count} website templates for online stores, courses, coaching and digital products. Each is a whole website with its pages, works on phones and sells through Storelib checkout.`,
  primaryKeyword: "website templates",
  secondaryKeywords: ["free website templates", "website builder templates", "online store templates"],
}

/* ── The sitemap ──────────────────────────────────────────────────────── */

/**
 * The marketplace's addresses for storelib.com/sitemap/pages.xml
 * (lib/seo/sitemaps.ts pagesSitemap): every category page that has a
 * template on it, and every template's page with its pictures for Google
 * Images. Absolute addresses; no date, because nothing here records when a
 * template's page last changed (lib/seo/indexing: a lastmod is left out
 * when nothing real is known).
 */
export function themeSitemapEntries(listings: readonly ThemeListing[], origin = "https://storelib.com"): { url: string; images?: string[] }[] {
  const abs = (p: string) => (/^https?:\/\//i.test(p) ? p : `${origin}${p}`)
  const cats = THEME_SEO_CATEGORIES.filter((c) => listingsInCategory(listings, c.slug).length > 0).map((c) => ({ url: abs(themeCategoryPath(c.slug)) }))
  const pages = listings.map((l) => {
    const img = themeImages(l)
    const images = [img.hero?.src, img.phone?.src, img.og?.src].filter((s): s is string => !!s).map(abs)
    return { url: abs(listingPath(l.slug)), ...(images.length ? { images } : {}) }
  })
  return [...cats, ...pages]
}
