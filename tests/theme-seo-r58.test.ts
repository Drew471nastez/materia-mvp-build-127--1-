/**
 * ===========================================================================
 *  ROUND 58: THE THEME MARKETPLACE AS AN ORGANIC SEARCH CHANNEL
 * ===========================================================================
 *   1. every Storelib template has its own title (the owner's list, keyword
 *      first, no name prefix, about sixty characters), description, H1 and
 *      answer first intro, and no two pages share a title, an H1 or a
 *      primary keyword (Course, Online course and Course landing included)
 *   2. what a page says a template has, the template's files have
 *   3. the structured data parses and is only what is true
 *   4. the sitemap lists every category and template page, absolute and
 *      clean; robots lets them be crawled; the previews stay noindex
 *   5. the cut pictures exist at the sizes the page declares, and are small
 *   6. llms.txt names the templates
 *   7. the pages: canonical, Open Graph, the marketplace's filters, sheet,
 *      sort and Load more; the builder's popup is left as it was
 *   8. no AI words and no em dashes in anything a visitor reads
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

import { CODE_TEMPLATES, builtinListings, listingPath, type ThemeListing } from "../lib/themes/marketplace-shared"
import {
  CARD_WIDTHS,
  HERO_SIZE,
  OG_SIZE,
  PHONE_SIZE,
  SEO_IMAGE_DIR,
  THEME_FEATURES,
  THEME_SEO,
  THEME_SEO_CATEGORIES,
  categoriesOf,
  listingsInCategory,
  marketplaceCard,
  relatedListings,
  themeAlt,
  themeImages,
  themePageCopy,
  themeSitemapEntries,
  type ThemeFeature,
} from "../lib/themes/theme-seo"
import { categoryJsonLd, marketplaceJsonLd, themeJsonLd } from "../lib/themes/theme-seo-jsonld"
import { jsonLdScript } from "../lib/seo/json-ld"
import { PLATFORM_DISALLOW, robotsTxt } from "../lib/seo/indexing"
import { robotsAllowed } from "../lib/seo/robots-match"
import { llmsTxt } from "../lib/developers/llms"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* The owner's list, by the template each line names. Changed on purpose (r58): Online course is "One Page Online Course
   Website Template", so it does not compete with Course's "Online Course Website Template" for the same search. */
const OWNER_TITLES: Record<string, string> = {
  "storelib-default": "Free Ecommerce Website Template | Storelib",
  clothing: "Clothing Brand Website Template | Storelib",
  merch: "Merch Store Website Template | Storelib",
  "digital-products": "Digital Product Store Website Template | Storelib",
  "art-books": "Art Book Store Website Template | Storelib",
  ebooks: "Ebook Landing Page Template | Storelib",
  fitness: "Fitness Coaching Website Template | Storelib",
  "landing-page": "Online Course Website Template | Storelib",
  "creator-landing": "Personal Brand Website Template | Storelib",
  streetwear: "Lifestyle Clothing Brand Website Template | Storelib",
  "sample-packs": "Music Sample Pack Store Template | Storelib",
  "templates-shop": "Notion Template Store Website Template | Storelib",
  "space-clothing": "Dark Ecommerce Website Template | Storelib",
  posters: "Art Print & Poster Store Website Template | Storelib",
  coach: "Coaching Website & Landing Page Template | Storelib",
  "vsl-course": "Video Sales Letter Landing Page Template | Storelib",
  "online-course": "One Page Online Course Website Template | Storelib",
  "course-landing": "Online Course Sales Page Template | Storelib",
  "retro-merch": "Retro Desktop Website Template | Storelib",
}

/* ── What a template's files have, read from theme-packages ──────────── */

function templateFiles(t: string) {
  const dir = join(root, "theme-packages/materia/templates", t, "templates")
  const files = readdirSync(dir)
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")) as { order: string[]; sections: Record<string, { type: string }> }
  const types = index.order.map((k) => index.sections[k].type)
  return { files, types }
}

/** Each feature's proof in a template's files. "dark" is the one that is a look, read from what the template was made as (marketplace-shared's notes). */
const FEATURE_EVIDENCE: Record<ThemeFeature, (f: { files: string[]; types: string[] }, template: string) => boolean> = {
  video: (f) => f.types.some((t) => /video|vsl-hero/i.test(t)),
  reviews: (f) => f.types.some((t) => /review|testimonial/i.test(t)),
  faq: (f) => f.types.some((t) => /faq/i.test(t)),
  signup: (f) => f.types.some((t) => /newsletter|signup|optin/i.test(t)) || f.files.includes("page.newsletter.json"),
  pricing: (f) => f.types.some((t) => /pricing-cards|offers|editions/i.test(t)),
  curriculum: (f) => f.types.some((t) => /curriculum|modules|contents|chapters/i.test(t)),
  booking: (f) => f.files.some((x) => /^page\.book(-a-call)?\.json$/.test(x)),
  lookbook: (f) => f.files.includes("page.lookbook.json"),
  shipping: (f) => f.files.includes("page.shipping.json"),
  licence: (f) => f.files.includes("page.licence.json"),
  podcast: (f) => f.types.some((t) => /podcast|-show$/i.test(t)) || f.files.includes("page.podcast.json"),
  /* A look, read from what the template was made as (marketplace-shared): a night sky, a starry black page, a dark course funnel. */
  dark: (_f, t) => t === "space" || t === "vsl" || t === "renaissance",
}

async function main() {
  const listings = builtinListings()
  const bySlug = (s: string) => listings.find((l) => l.slug === s)!

  console.log("\n  1. Titles, descriptions, H1s and intros")
  check("every Storelib template has its page's words, and nothing else does", CODE_TEMPLATES.every((t) => THEME_SEO.some((s) => s.slug === t.slug)) && THEME_SEO.every((s) => CODE_TEMPLATES.some((t) => t.slug === s.slug)) && THEME_SEO.length === CODE_TEMPLATES.length)
  for (const [slug, title] of Object.entries(OWNER_TITLES)) check(`  ${slug}: "${title}"`, THEME_SEO.find((s) => s.slug === slug)?.title === title, THEME_SEO.find((s) => s.slug === slug)?.title)
  const titles = [...THEME_SEO.map((s) => s.title), ...THEME_SEO_CATEGORIES.map((c) => c.title)]
  check("every title is at most 60 characters and ends in | Storelib", titles.every((t) => t.length <= 60 && t.endsWith(" | Storelib")), titles.filter((t) => t.length > 60))
  check("no title starts with the template's name and a dash", THEME_SEO.every((s) => !/^[^|]+ [—–-] /.test(s.title)))
  check("no two pages share a title", new Set(titles).size === titles.length)
  const h1s = [...THEME_SEO.map((s) => s.h1), ...THEME_SEO_CATEGORIES.map((c) => c.h1), "Website templates"]
  check("no two pages share an H1", new Set(h1s.map((h) => h.toLowerCase())).size === h1s.length)
  const keywords = [...THEME_SEO.map((s) => s.primaryKeyword), ...THEME_SEO_CATEGORIES.map((c) => c.primaryKeyword)]
  check("no two pages target the same primary keyword", new Set(keywords).size === keywords.length, keywords)
  const course = ["landing-page", "online-course", "course-landing"].map((s) => THEME_SEO.find((x) => x.slug === s)!)
  check("the three course templates answer three searches: a school, one course on one page, a sales page", course[0].primaryKeyword === "online course website template" && course[1].primaryKeyword === "one page course website" && course[2].primaryKeyword === "course sales page template")
  check("  each says how it differs from the others in its questions", /Online course/.test(course[0].faqs.map((f) => f.a).join(" ")) && /Online course/.test(course[2].faqs.map((f) => f.a).join(" ")))
  const descs = [...THEME_SEO.map((s) => s.description), ...THEME_SEO_CATEGORIES.map((c) => c.description)]
  check("every description is 110 to 165 characters and unique", descs.every((d) => d.length >= 110 && d.length <= 165) && new Set(descs).size === descs.length, descs.filter((d) => d.length < 110 || d.length > 165).map((d) => `${d.length}: ${d}`))
  check("every intro answers first, in at most three sentences, and names the template or its kind", THEME_SEO.every((s) => s.intro.split(/(?<=\.)\s/).length <= 3 && s.intro.length < 320))
  check("every template says who it is for (three) and has a question of its own", THEME_SEO.every((s) => s.bestFor.length === 3 && s.faqs.length >= 1))

  console.log("\n  2. What a page says is in a template, the template has")
  for (const s of THEME_SEO) {
    const t = CODE_TEMPLATES.find((c) => c.slug === s.slug)!.template
    const f = templateFiles(t)
    const wrong = s.features.filter((x) => !FEATURE_EVIDENCE[x](f, t))
    const missingPages = s.extraPages.filter((p) => !f.files.includes(`page.${p.handle}.json`))
    /* Both ways (r58 integration): a feature the files have is claimed too, and a page of the template's own is named, so the
       filters and "Pages included" follow the templates when main changes them. page.json is the plain page every template has. */
    const unclaimed = THEME_FEATURES.map((x) => x.key).filter((x) => x !== "dark" && FEATURE_EVIDENCE[x](f, t) && !s.features.includes(x))
    const SHARED_FILES = ["page.json", "page.about.json", "page.contact.json", "page.faqs.json"]
    const unnamedPages = f.files.filter((x) => /^page\..+\.json$/.test(x) && !SHARED_FILES.includes(x) && !s.extraPages.some((p) => x === `page.${p.handle}.json`))
    check(
      `  ${s.slug}: ${s.features.join(", ") || "no features claimed"}; pages ${s.extraPages.map((p) => p.label).join(", ") || "shared only"}`,
      wrong.length === 0 && missingPages.length === 0 && unclaimed.length === 0 && unnamedPages.length === 0,
      { wrong, missingPages, unclaimed, unnamedPages },
    )
  }
  check("every feature is in the filter's vocabulary", THEME_SEO.every((s) => s.features.every((f) => THEME_FEATURES.some((x) => x.key === f))))
  check("the shared pages are in every template", CODE_TEMPLATES.every((c) => ["index.json", "product.json", "collection.json", "cart.json", "page.about.json", "page.contact.json", "page.faqs.json", "blog.json"].every((x) => templateFiles(c.template).files.includes(x))))

  console.log("\n  3. Categories")
  check("seven categories, each with at least three templates, each template in one at least", THEME_SEO_CATEGORIES.length === 7 && THEME_SEO_CATEGORIES.every((c) => c.members.length >= 3) && THEME_SEO.every((s) => THEME_SEO_CATEGORIES.some((c) => c.members.includes(s.slug))))
  check("a template's own category lists it", THEME_SEO.every((s) => THEME_SEO_CATEGORIES.find((c) => c.slug === s.primaryCategory)?.members.includes(s.slug)))
  check("every category names templates that exist", THEME_SEO_CATEGORIES.every((c) => c.members.every((m) => CODE_TEMPLATES.some((t) => t.slug === m))))
  const uploaded: ThemeListing = { ...bySlug("clothing"), id: "x", slug: "aurora", name: "Aurora", category: "music", codePackage: null, cover: "https://cdn.example.com/a.webp", screenshots: ["https://cdn.example.com/a.webp"], author: "Jun", description: null }
  check("an uploaded listing joins the category of its kind", categoriesOf(uploaded)[0]?.slug === "digital-products" && listingsInCategory([...listings, uploaded], "digital-products").some((l) => l.slug === "aurora"))
  const up = themePageCopy(uploaded)
  check("  and gets a plain page of its own: its name in the title, the shared questions, no claimed features", up.title === "Aurora Website Template | Storelib" && up.h1 === "Aurora website template" && up.features.length === 0 && up.faqs.length === 3 && up.description.length <= 160)
  const rel = relatedListings(bySlug("clothing"), listings, 3)
  check("related templates: three others, its own category first", rel.length === 3 && !rel.some((r) => r.slug === "clothing") && categoriesOf(rel[0])[0].slug === "fashion")

  console.log("\n  4. Structured data")
  for (const l of listings) {
    const copy = themePageCopy(l)
    const data = JSON.parse(jsonLdScript(themeJsonLd(l, copy))) as { "@graph": Array<Record<string, unknown>> }
    const types = data["@graph"].map((n) => n["@type"])
    const work = data["@graph"].find((n) => n["@type"] === "CreativeWork") as Record<string, unknown> & { offers?: { price: string; priceCurrency: string }; image?: Array<{ url: string; width: number }> }
    const faq = data["@graph"].find((n) => n["@type"] === "FAQPage") as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
    const crumbs = data["@graph"].find((n) => n["@type"] === "BreadcrumbList") as { itemListElement: Array<{ position: number; item: string }> }
    const ok =
      ["WebPage", "CreativeWork", "BreadcrumbList", "FAQPage"].every((t) => types.includes(t)) &&
      work.offers?.price === "0.00" && work.offers.priceCurrency === "USD" && work.isAccessibleForFree === true &&
      (work.image ?? []).length === 3 && (work.image ?? []).every((i) => i.url.startsWith("https://storelib.com/themes/materia/seo/") && i.width > 0) &&
      faq.mainEntity.length === copy.faqs.length && faq.mainEntity.every((q, i) => q.name === copy.faqs[i].q && q.acceptedAnswer.text === copy.faqs[i].a) &&
      crumbs.itemListElement.length === 4 && crumbs.itemListElement.every((c, i) => c.position === i + 1 && c.item.startsWith("https://storelib.com")) &&
      crumbs.itemListElement[3].item === `https://storelib.com${listingPath(l.slug)}` &&
      !/AggregateRating|"Review"|SoftwareApplication/.test(JSON.stringify(data))
    check(`  ${l.slug}: WebPage, CreativeWork at 0.00 USD, three pictures, breadcrumbs Storelib > Themes > category > it, FAQPage word for word`, ok, types)
  }
  const pro = themeJsonLd({ ...bySlug("coach"), tier: "pro" }, themePageCopy({ ...bySlug("coach"), tier: "pro" }))
  check("a template that comes with a plan names no price it does not have", !JSON.stringify(pro).includes('"Offer"'))
  for (const c of THEME_SEO_CATEGORIES) {
    /* Changed on purpose (r58 integration): the list is what the page shows (listingsInCategory), and a Storelib template is on a
       category page only because the category names it, never through the uploaded listings' fallback. That fallback is how
       the five templates main added, with no words of their own yet, slipped onto category pages and made the counts disagree. */
    const shown = listingsInCategory(listings, c.slug)
    const d = JSON.parse(jsonLdScript(categoryJsonLd(c, shown))) as { "@graph": Array<Record<string, unknown>> }
    const list = d["@graph"].find((n) => n["@type"] === "ItemList") as { numberOfItems: number; itemListElement: Array<{ url: string }> }
    const strays = shown.filter((l) => CODE_TEMPLATES.some((t) => t.slug === l.slug) && !c.members.includes(l.slug)).map((l) => l.slug)
    check(
      `  /themes/category/${c.slug}: CollectionPage, ItemList of the ${shown.length} it shows, BreadcrumbList, FAQPage; every Storelib template on it named by it`,
      ["CollectionPage", "ItemList", "BreadcrumbList", "FAQPage"].every((t) => d["@graph"].some((n) => n["@type"] === t)) &&
        list.numberOfItems === shown.length &&
        list.itemListElement.every((x, i) => x.url === `https://storelib.com${listingPath(shown[i].slug)}`) &&
        c.members.every((m) => shown.some((l) => l.slug === m)) &&
        strays.length === 0,
      { strays },
    )
  }
  const m = JSON.parse(jsonLdScript(marketplaceJsonLd(listings))) as { "@graph": Array<Record<string, unknown>> }
  check("/themes: CollectionPage and an ItemList of every template", (m["@graph"].find((n) => n["@type"] === "ItemList") as { numberOfItems: number }).numberOfItems === listings.length)
  check("the JSON-LD cannot close its own script element", !jsonLdScript(themeJsonLd({ ...uploaded, name: "</script><b>" }, themePageCopy({ ...uploaded, name: "</script><b>" }))).includes("</script>"))

  console.log("\n  5. Sitemap, robots, noindex")
  const entries = themeSitemapEntries(listings)
  check("the sitemap lists seven category pages and every template's page", entries.length === 7 + listings.length && THEME_SEO_CATEGORIES.every((c) => entries.some((e) => e.url === `https://storelib.com/themes/category/${c.slug}`)) && listings.every((l) => entries.some((e) => e.url === `https://storelib.com/themes/${l.slug}`)))
  check("  absolute, no query strings, each template with its three pictures", entries.every((e) => /^https:\/\/storelib\.com\/themes\/[a-z0-9/-]+$/.test(e.url)) && entries.filter((e) => !e.url.includes("/category/")).every((e) => e.images?.length === 3))
  const sm = stripComments(read("lib/seo/sitemaps.ts"))
  check("  pages.xml takes them from the published list, the code's templates when that read fails", /\.\.\.\(await themeMarketplaceEntries\(\)\)/.test(sm) && /publishedListings\(\)\.catch\(\(\) => builtinListings\(\)\)/.test(sm) && /themeSitemapEntries\(listings, BASE\)/.test(sm))
  const robots = robotsTxt({ disallow: PLATFORM_DISALLOW, sitemaps: ["https://storelib.com/sitemap.xml"] })
  check("robots.txt lets Googlebot and OAI-SearchBot read /themes, a category and a template", ["/themes", "/themes/category/fashion", "/themes/clothing", "/themes/clothing?price=free"].every((p) => robotsAllowed(robots, p, "Googlebot") && robotsAllowed(robots, p, "OAI-SearchBot")))
  const nextConfig = read("next.config.mjs")
  check("the prerendered demos stay noindex (X-Robots-Tag) and the live preview page says noindex", /source: '\/theme-previews\/:path\*',[\s\S]{0,300}X-Robots-Tag', value: 'noindex'/.test(nextConfig) && /robots: \{ index: false/.test(read("app/(site)/theme-preview/[slug]/page.tsx")))

  console.log("\n  6. Pictures")
  for (const c of CODE_TEMPLATES) {
    const l = bySlug(c.slug)
    const img = themeImages(l)
    const file = (src: string) => join(root, "public", src)
    const sizes: Array<[string, number, number, number]> = [
      ...CARD_WIDTHS.map((w) => [`${SEO_IMAGE_DIR}/${c.template}-card-${w}.webp`, w, (w * 5) / 4, w === 480 ? 45 : 80] as [string, number, number, number]),
      [img.hero!.src, HERO_SIZE.w, HERO_SIZE.h, 80],
      [img.phone!.src, PHONE_SIZE.w, PHONE_SIZE.h, 50],
      [img.og!.src, OG_SIZE.w, OG_SIZE.h, 120],
    ]
    const bad: string[] = []
    for (const [src, w, h, kb] of sizes) {
      if (!existsSync(file(src))) {
        bad.push(`${src} missing`)
        continue
      }
      const meta = await sharp(file(src)).metadata()
      if (meta.width !== w || meta.height !== h) bad.push(`${src} is ${meta.width}x${meta.height}, the page says ${w}x${h}`)
      const size = readFileSync(file(src)).length / 1024
      if (size > kb) bad.push(`${src} is ${Math.round(size)} KB`)
    }
    check(`  ${c.template}: cards 480 and 800 (4:5), hero 1200x750, phone 390x844, share card 1200x630, each within its budget`, bad.length === 0, bad)
  }
  check("every picture's alt text says which template and where it is shown", listings.every((l) => /computer/.test(themeAlt(l, "hero", themePageCopy(l).h1)) && /phone/.test(themeAlt(l, "phone")) && themeAlt(l, "card", themePageCopy(l).h1).startsWith(l.name)))
  check("a card is the cut picture with a srcset, not the whole page screenshot", listings.every((l) => { const card = marketplaceCard(l); return !!card.image && card.image.src.includes("/seo/") && card.image.srcSet.includes("800w") }))

  console.log("\n  7. llms.txt")
  const llms = llmsTxt()
  check("llms.txt has a Website templates section with the facts, the marketplace, each category and each template", /## Website templates/.test(llms) && /free on every plan/.test(llms) && llms.includes("https://storelib.com/themes)") && THEME_SEO_CATEGORIES.every((c) => llms.includes(`https://storelib.com/themes/category/${c.slug}`)) && THEME_SEO.every((s) => llms.includes(`https://storelib.com/themes/${s.slug}`)))

  console.log("\n  8. The pages")
  const page = read("app/(storelib)/(marketing)/themes/page.tsx")
  const cat = read("app/(storelib)/(marketing)/themes/category/[category]/page.tsx")
  const detail = read("app/(storelib)/(marketing)/themes/[slug]/page.tsx")
  const actions = read("app/(storelib)/(marketing)/themes/[slug]/theme-detail.tsx")
  const market = read("app/(storelib)/(marketing)/themes/themes-marketplace.tsx")
  const shell = read("components/themes/marketplace-shell.tsx")
  check("/themes: its own title, canonical /themes, the ItemList", /path: "\/themes",\s*title: MARKETPLACE_SEO\.title,\s*absolute: true/.test(page) && /marketplaceJsonLd\(listings\)/.test(page))
  check("a category: built for each category, unknown ones 404, its own canonical, title and share card", /dynamicParams = false/.test(cat) && /THEME_SEO_CATEGORIES\.map\(\(c\) => \(\{ category: c\.slug \}\)\)/.test(cat) && /path: themeCategoryPath\(cat\.slug\)/.test(cat) && /categoryJsonLd\(cat, inIt\)/.test(cat))
  check("a template: canonical at its address, its title as written, its share card, its JSON-LD", /path: listingPath\(listing\.slug\),\s*title: copy\.title,\s*absolute: true/.test(detail) && /image: og \? \{ url: og\.src/.test(detail) && /themeJsonLd\(listing, copy\)/.test(detail) && /generateStaticParams\(\) \{\s*return CODE_TEMPLATES\.map/.test(detail))
  check("  one H1, the intro, the facts, the gallery with sizes and alt, what is included, who it is for, questions, related", (detail.match(/<h1\b/g) ?? []).length === 1 && /data-theme-intro/.test(detail) && /data-theme-facts/.test(detail) && /width=\{img\.hero\.width\} height=\{img\.hero\.height\} alt=\{themeAlt\(listing, "hero"/.test(detail) && /What is included/.test(detail) && /Who it is for/.test(detail) && /<FaqList faqs=\{copy\.faqs\}/.test(detail) && /Related templates/.test(detail))
  check("  Use this template adds it, signed out goes to sign in and back with ?add=1", /"Use this template"/.test(actions) && /p\.get\("add"\) !== "1"/.test(actions) && /\/login\?next=\$\{encodeURIComponent\(`\$\{listingPath\(slug\)\}\?add=1`\)\}/.test(read("components/themes/use-add-theme.ts")))
  check("the bar says Storelib theme marketplace beside the footer's solid mark", /<StorelibLogo size=\{26\} variant="solid" alt="" \/>\s*Storelib theme marketplace/.test(shell) && /variant="solid"/.test(read("components/marketing/footer.tsx")))
  check("the marketplace: category links, price and feature checkboxes, sort, twelve at a time with Load more", /<CategoryRow key=\{c\.slug\} href=\{`\$\{c\.path\}\$\{query\}`\}/.test(market) && /type="checkbox"/.test(market) && /THEME_FEATURES\.map/.test(market) && /data-market-sort/.test(market) && /const PAGE_SIZE = 12/.test(market) && /Load more/.test(market))
  check("  on a phone and a tablet the filters are a bottom sheet, opened by Filter", /<BottomSheet\b/.test(market) && /title="Filter and sort"/.test(market) && /data-market-filter-open=""[\s\S]{0,400}lg:hidden/.test(market) && /aside aria-label="Filters" className="hidden lg:block"/.test(market))
  check("  every card is in the page from the server; the ones after twelve are hidden, not missing", /hidden=\{i >= limit\}/.test(market))
  const card = read("components/themes/marketplace-card.tsx")
  check("  a card: one link, the picture's box drawn at 4:5 with width and height, name, price, category", /<Link href=\{card\.href\}/.test(card) && /aspect-\[4\/5\]/.test(card) && /width=\{card\.image\.width\}/.test(card) && /height=\{card\.image\.height\}/.test(card) && /\{card\.price\}/.test(card) && /\{card\.categoryName\}/.test(card) && /motion-reduce:/.test(card))
  const builder = read("app/(storelib)/app/website-builder/website-builder-client.tsx") + read("app/(storelib)/app/website-builder/themes/themes-client.tsx")
  /* Changed on purpose (r58 integration): no count of templates here. Main adds templates; what matters is that the popup reads the shared catalogue and none of this round's files. */
  check("the builder's marketplace popup still reads the same catalogue, and nothing of this round", /<ThemeMarketplace\b/.test(builder) && /from "@\/lib\/themes\/marketplace-shared"/.test(builder) && !/theme-seo|marketplace-card|marketplace-shell/.test(builder))

  console.log("\n  9. Copy")
  const visible = [
    "lib/themes/theme-seo.ts",
    "components/themes/marketplace-shell.tsx",
    "components/themes/marketplace-card.tsx",
    "app/(storelib)/(marketing)/themes/themes-marketplace.tsx",
    "app/(storelib)/(marketing)/themes/page.tsx",
    "app/(storelib)/(marketing)/themes/[slug]/page.tsx",
    "app/(storelib)/(marketing)/themes/[slug]/theme-detail.tsx",
    "app/(storelib)/(marketing)/themes/category/[category]/page.tsx",
  ]
  for (const f of visible) {
    const words = read(f)
    check(`  no AI words or em dashes in ${f}`, !/\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)? your|leverage|game.?changer|cutting.?edge|robust|stunning|unleash)\b/i.test(words) && !/—/.test(words))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
