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
    members: ["storelib-default", "clothing", "merch", "streetwear", "space-clothing", "posters", "retro-merch"],
    faqs: [
      { q: "Can I sell physical products with these templates?", a: "Yes. Storelib sells products that ship as well as digital ones, and every template here has a shipping page for your delivery and returns terms." },
      { q: "Which template should I start with?", a: "Storelib Default if you want a plain shop that suits most products. Clothing or Lifestyle label for a fashion brand, Poster shop for prints, Merch or Retro desktop for a creator's merch." },
    ],
  },
  {
    slug: "fashion",
    name: "Clothing and fashion",
    title: "Fashion and Clothing Store Templates | Storelib",
    description: "Website templates for clothing brands and fashion labels on Storelib, with lookbook pages, size friendly product pages and a free plan to start.",
    h1: "Fashion and clothing store templates",
    intro: "Four templates for selling clothes: a classic clothing brand, a lifestyle label, a dark night themed shop and a merch store. Three of them include a lookbook page for showing a collection on people.",
    primaryKeyword: "fashion website template",
    secondaryKeywords: ["clothing store website template", "apparel website template", "streetwear website template"],
    members: ["clothing", "streetwear", "space-clothing", "merch"],
    faqs: [
      { q: "Do these templates support sizes and colours?", a: "Yes. Product options such as size and colour are set on the product in Storelib, and the product page shows a picker for them." },
      { q: "What is a lookbook page?", a: "A page of large photos that shows a collection worn or styled, linking to the products in it. Clothing, Lifestyle label and Night shop include one." },
    ],
  },
  {
    slug: "digital-products",
    name: "Digital products",
    title: "Templates for Selling Digital Downloads | Storelib",
    description: "Website templates for selling digital downloads on Storelib: ebooks, sample packs, Notion templates, art books and other files, delivered after payment.",
    h1: "Templates for selling digital downloads",
    intro: "Five templates for selling files: a general digital product store, a Notion template shop, a music sample pack store, an ebook page and an art book store. Buyers get their download as soon as they pay.",
    primaryKeyword: "digital download store template",
    secondaryKeywords: ["sell digital products website", "digital product website template", "website to sell downloads"],
    members: ["digital-products", "templates-shop", "sample-packs", "ebooks", "art-books"],
    faqs: [
      { q: "How are files delivered to buyers?", a: "Storelib delivers the file after payment, on the receipt page and by email. The template only shows the product; delivery works the same on every template." },
      { q: "Can I add a licence for my files?", a: "Yes. Digital products and Sample packs include a licence page you can edit, and any template can have one added in the editor." },
    ],
  },
  {
    slug: "courses",
    name: "Courses",
    title: "Website Templates for Course Creators | Storelib",
    description: "Four Storelib templates for selling online courses: a course school, a one page course site, a course sales page and a video sales letter.",
    h1: "Website templates for course creators",
    intro: "Four ways to sell a course. Course is a small school with several courses, Online course puts one course on one long page, Course landing is a sales page for a single offer and Video sales letter leads with a video.",
    primaryKeyword: "course creator website template",
    secondaryKeywords: ["online course templates", "course website design", "sell online courses website"],
    members: ["landing-page", "online-course", "course-landing", "vsl-course"],
    faqs: [
      { q: "Which course template fits me?", a: "Selling several courses: Course. One course with a curriculum and price tiers on one page: Online course. One offer you want to sell hard: Course landing. A sales video you already have: Video sales letter." },
      { q: "Are the courses hosted on Storelib?", a: "Yes. You build the course in Storelib and the template links to it. Students sign in to watch after they buy." },
    ],
  },
  {
    slug: "coaching",
    name: "Coaching",
    title: "Coach and Consultant Website Templates | Storelib",
    description: "Website templates for coaches and consultants on Storelib: a coaching site with packages, a fitness coach site, a personal brand page and a video sales letter.",
    h1: "Website templates for coaches",
    intro: "Templates for people who sell their time and expertise. They show who you are, what working together costs and how to book, and they sell programmes or guides beside it.",
    primaryKeyword: "coaching website template",
    secondaryKeywords: ["coach website design", "consultant website template", "life coach website"],
    members: ["coach", "fitness", "creator-landing", "vsl-course"],
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
    members: ["ebooks", "course-landing", "vsl-course", "creator-landing", "online-course", "coach"],
    faqs: [
      { q: "Is a landing page template a whole website?", a: "Yes. The home page is the landing page, and the template also has product, about, contact and FAQ pages you can keep or hide." },
      { q: "Can I use my own domain?", a: "Yes. A Storelib website can be published on a domain you own." },
    ],
  },
  {
    slug: "creators",
    name: "Creators",
    title: "Creator Website Templates | Storelib",
    description: "Website templates for creators on Storelib: a personal brand site, merch shops, music sample packs, art books and posters. Free to use and edit.",
    h1: "Website templates for creators",
    intro: "Templates for people with an audience who sell what they make: merch, music, prints, books or themselves. Each has room for your story beside the products.",
    primaryKeyword: "creator website template",
    secondaryKeywords: ["website for content creators", "influencer website template", "artist store template"],
    members: ["creator-landing", "merch", "sample-packs", "art-books", "posters", "retro-merch"],
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
    intro: "Storelib Default is a clean, general shop template for any kind of product. It opens with a split hero, then your products, category banners, a benefits row, FAQ and a newsletter signup.",
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
    description: "An ebook landing page template: cover hero, about the author, chapter list, an excerpt, editions with prices, reviews and FAQ. Free on Storelib.",
    h1: "Ebook landing page template",
    intro: "Ebooks is a landing page for selling one book. It shows the cover, the author, the chapters and an excerpt, then the editions with their prices, reader reviews, FAQ and an email signup.",
    primaryCategory: "landing-pages",
    primaryKeyword: "ebook landing page template",
    secondaryKeywords: ["ebook sales page", "book landing page template", "sell an ebook website"],
    bestFor: ["Authors selling an ebook directly", "Newsletter writers turning posts into a book", "Experts selling a guide with several editions"],
    features: ["reviews", "faq", "signup", "pricing", "curriculum"],
    extraPages: [{ handle: "sample", label: "Free sample" }],
    faqs: [{ q: "Can I give away a free chapter?", a: "Yes. The template has a free sample page, and the signup section collects emails from people who want it." }],
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
    description: "A lifestyle clothing brand template with a full screen hero, large promo banners, category tiles and a lookbook page. Free on Storelib.",
    h1: "Lifestyle clothing brand website template",
    intro: "Lifestyle label is a template for a clothing brand built on its imagery. Full screen photos and large promo banners carry the page, with products and category tiles in between.",
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
    description: "A sample pack store template for producers: release heroes, pack cards, a free pack page, a licence page, reviews and FAQ tabs. Free on Storelib.",
    h1: "Music sample pack store template",
    intro: "Sample packs is a template for producers selling sounds. New releases get a hero of their own, packs sit in cards, and a free pack page and licence page answer the two things buyers check first.",
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
    description: "A coaching website template with an arched portrait hero, ways to work together with prices, a free first call, a journal and a book a call page.",
    h1: "Coaching website and landing page template",
    intro: "Coach is a template for life and business coaches. It shows your portrait and story, the ways to work together with their prices and a free first call, then a journal and a page to book.",
    primaryCategory: "coaching",
    primaryKeyword: "coaching website template",
    secondaryKeywords: ["life coach website template", "business coach website", "coaching landing page"],
    bestFor: ["Life and business coaches", "Consultants who sell packages", "Therapists and mentors who offer a first call"],
    features: ["pricing", "booking"],
    extraPages: [{ handle: "book", label: "Book a call" }, { handle: "guide", label: "Free guide" }],
    faqs: [{ q: "Can I show prices for my packages?", a: "Yes. The ways to work together section lists each offer with its price and a button, and you can mark one as a free first call." }],
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
    description: "A course sales page template for one offer: a letter, steps, modules, everything included with its value, reviews, pricing and FAQ. Free on Storelib.",
    h1: "Online course sales page template",
    intro: "Course landing is a sales page for one course or programme. A short letter opens, then the steps, the modules, everything included in the offer, reviews, pricing and FAQ.",
    primaryCategory: "landing-pages",
    primaryKeyword: "course sales page template",
    secondaryKeywords: ["online course landing page", "course sales letter", "program sales page"],
    bestFor: ["A launch of one course or programme", "Offers that need a long explanation", "Creators driving ads or emails to one page"],
    features: ["reviews", "faq", "pricing", "curriculum"],
    extraPages: [],
    faqs: [{ q: "How is it different from Online course?", a: "Course landing is written as a sales letter for one offer and lists everything included with its value. Online course is a site for the course itself, with facts and a curriculum first." }],
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

/** Up to `n` other listings: the same category first, then ones that share a category, then the rest in the featured order. */
export function relatedListings(listing: ThemeListing, all: readonly ThemeListing[], n = 3): ThemeListing[] {
  const mine = categoriesOf(listing).map((c) => c.slug)
  const score = (l: ThemeListing) => {
    const theirs = categoriesOf(l).map((c) => c.slug)
    if (theirs[0] === mine[0]) return 0
    if (theirs.some((s) => mine.includes(s))) return 1
    return 2
  }
  return all
    .filter((l) => l.slug !== listing.slug)
    .map((l, i) => ({ l, s: score(l), i }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
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
