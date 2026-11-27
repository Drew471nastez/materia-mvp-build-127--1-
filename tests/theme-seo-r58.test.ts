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
  NEIGHBOUR_CATEGORIES,
  RELATED_COUNT,
  relatedListings,
  themeAlt,
  themeImages,
  themePageCopy,
  themeSitemapEntries,
  themeImagePath,
  themeImageStem,
  themeSeoFor,
  slugWords,
  type ThemeFeature,
} from "../lib/themes/theme-seo"
import { categoryJsonLd, marketplaceJsonLd, themeJsonLd } from "../lib/themes/theme-seo-jsonld"
import { jsonLdScript } from "../lib/seo/json-ld"
import { PLATFORM_DISALLOW, robotsTxt } from "../lib/seo/indexing"
import { robotsAllowed } from "../lib/seo/robots-match"
import { llmsTxt } from "../lib/developers/llms"
import { stripComments } from "./_source"
import { CARD_PAN_SPEED, PAN_ACCEL, RETURN_RAMP_S, glide, returnSpeedFor, type Glide } from "../components/themes/card-glide"

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
  /* Changed on purpose (r68): LUT shop (lutshop) is made as a dark store, like a grading suite. */
  dark: (_f, t) => t === "space" || t === "vsl" || t === "renaissance" || t === "lutshop",
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
  /* Changed on purpose (round 30): ten categories. The owner asked for a page answering each use people search for; Notion template websites, ebook websites and streetwear stores had none, so each is a category of the templates that really are that. */
  check("ten categories, each with at least three templates, each template in one at least", THEME_SEO_CATEGORIES.length === 10 && THEME_SEO_CATEGORIES.every((c) => c.members.length >= 3) && THEME_SEO.every((s) => THEME_SEO_CATEGORIES.some((c) => c.members.includes(s.slug))))
  check("a template's own category lists it", THEME_SEO.every((s) => THEME_SEO_CATEGORIES.find((c) => c.slug === s.primaryCategory)?.members.includes(s.slug)))
  check("every category names templates that exist", THEME_SEO_CATEGORIES.every((c) => c.members.every((m) => CODE_TEMPLATES.some((t) => t.slug === m))))
  const uploaded: ThemeListing = { ...bySlug("clothing"), id: "x", slug: "aurora", name: "Aurora", category: "music", codePackage: null, cover: "https://cdn.example.com/a.webp", screenshots: ["https://cdn.example.com/a.webp"], author: "Jun", description: null }
  check("an uploaded listing joins the category of its kind", categoriesOf(uploaded)[0]?.slug === "digital-products" && listingsInCategory([...listings, uploaded], "digital-products").some((l) => l.slug === "aurora"))
  const up = themePageCopy(uploaded)
  check("  and gets a plain page of its own: its name in the title, the shared questions, no claimed features", up.title === "Aurora Website Template | Storelib" && up.h1 === "Aurora website template" && up.features.length === 0 && up.faqs.length === 3 && up.description.length <= 160)
  /* Changed on purpose (marketplace round 24, the owner: "for a fashion template, all the fashion templates before others; same category first, then related categories; more than three"). */
  const rel = relatedListings(bySlug("clothing"), listings)
  const fashion = THEME_SEO_CATEGORIES.find((c) => c.slug === "fashion")!.members
  check("related templates: six by default, never itself", RELATED_COUNT === 6 && rel.length === 6 && listings.every((l) => !relatedListings(l, listings).some((r) => r.slug === l.slug) && relatedListings(l, listings).length === 6))
  check("  Clothing: every other fashion template (print on demand, caps and tees, outerwear, lifestyle label, night shop, merch), nothing else first", rel.every((r) => fashion.includes(r.slug)) && rel.length === Math.min(RELATED_COUNT, fashion.filter((m) => m !== "clothing").length) /* Changed on purpose (templates round 24): Boutique rail makes eight fashion templates, more than the six related places, so Clothing shows six of the other seven, all of them fashion. */, rel.map((r) => r.slug))
  for (const slug of fashion) {
    const r = relatedListings(bySlug(slug), listings).map((x) => x.slug)
    const others = fashion.filter((m) => m !== slug)
    check(`  ${slug}: the fashion templates come before any other`, r.slice(0, Math.min(6, others.length)).every((x) => others.includes(x)), r)
  }
  const coachRel = relatedListings(bySlug("coach"), listings)
  check("  Coach: its own category's templates first, then ones sharing a category or a neighbouring one", categoriesOf(coachRel[0]).some((c) => c.slug === "coaching") && coachRel.every((r) => categoriesOf(r).some((c) => categoriesOf(bySlug("coach")).some((m) => m.slug === c.slug) || (NEIGHBOUR_CATEGORIES.coaching ?? []).includes(c.slug))), coachRel.map((r) => r.slug))
  check("  every category has neighbours that are categories", Object.entries(NEIGHBOUR_CATEGORIES).every(([k, v]) => THEME_SEO_CATEGORIES.some((c) => c.slug === k) && v.every((x) => THEME_SEO_CATEGORIES.some((c) => c.slug === x))))

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
  /* Changed on purpose (round 30): ten category pages (above), each with the card pictures it shows. */
  check("the sitemap lists ten category pages and every template's page", entries.length === 10 + listings.length && THEME_SEO_CATEGORIES.every((c) => entries.some((e) => e.url === `https://storelib.com/themes/category/${c.slug}`)) && listings.every((l) => entries.some((e) => e.url === `https://storelib.com/themes/${l.slug}`)))
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
      /* Changed on purpose (round 30): each template's pictures in a folder by its address, each file named for what the template is (themeImagePath). */
      ...CARD_WIDTHS.map((w) => [themeImagePath(c.slug, `card-${w}`), w, (w * 5) / 4, w === 480 ? 45 : 80] as [string, number, number, number]),
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
  /* Round 30: the file names say what the template is, and the record of what was written is current. */
  const stems = JSON.parse(read("lib/themes/theme-image-stems.json")) as Record<string, string>
  const stale = CODE_TEMPLATES.filter((c) => stems[c.slug] !== themeImageStem(c.slug)).map((c) => `${c.slug}: written ${stems[c.slug] ?? "never"}, now ${themeImageStem(c.slug)} (run node scripts/build-theme-seo-images.mjs ${c.template})`)
  check("every template's SEO pictures are written under the name it has now: its primary keyword, then its name", stale.length === 0, stale)
  check("  in a folder by its address, the file a word list of what it is", CODE_TEMPLATES.every((c) => new RegExp(`^${SEO_IMAGE_DIR}/${c.slug}/[a-z0-9-]+-hero\\.webp$`).test(themeImagePath(c.slug, "hero")) && themeImagePath(c.slug, "hero").includes(slugWords(themeSeoFor(c.slug)!.primaryKeyword))))
  check("  no flat <template>-<kind> file of before round 30 is left", CODE_TEMPLATES.every((c) => !existsSync(join(root, "public", SEO_IMAGE_DIR, `${c.template}-hero.webp`))))
  check("  the builder's preview finds the same files through the small names module, not the copy deck", /themeImagePathOf\(t\.slug, device === "phone" \? "phone" : "card-480"\)/.test(read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")) && !/theme-seo"/.test(read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")))
  check("  the category pages carry their cards' pictures in the sitemap", entries.filter((e) => e.url.includes("/category/")).every((e) => (e.images?.length ?? 0) >= 3 && e.images!.every((u) => /-card-800\.webp$/.test(u))))
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
  /* Changed on purpose (marketplace round 24, the owner): checks instead of dots; the gallery is the live website with a Desktop / Phone switch over the pictures; six related templates. */
  const live = read("app/(storelib)/(marketing)/themes/[slug]/theme-live.tsx")
  check("  what is included and who it is for: a check before each line, no dots", (detail.match(/<Check \/>/g) ?? []).length === 2 && /function Check\(\)[\s\S]{0,300}<svg aria-hidden/.test(detail) && !/rounded-full bg-\[#9ca3af\]/.test(detail))
  check("  the gallery: the live website (the static preview, sandboxed) with the server's pictures under it as placeholders, the whole page links kept", /<ThemeLivePreview\b[\s\S]{0,200}src=\{templatePreviewPath\(listing\)\}/.test(detail) && /desktop=\{\s*img\.hero \?/.test(detail) && /phone=\{\s*img\.phone \?/.test(detail) && /img\.fullDesktop/.test(detail) && /sandbox=\{templatePreviewFrame\(src!\)\.sandbox\}/.test(live) && /data-theme-live-switch/.test(live) && />\s*\{d === "desktop" \? "Desktop" : "Phone"\}/.test(live))
  check("    one stage whose height CSS sets before anything loads; Desktop fills it, Phone is a 390 by 844 screen at the same height", /data-theme-live-stage="" className="relative aspect-\[4\/5\] w-full sm:aspect-\[8\/5\]"/.test(live) && /"absolute inset-y-0 overflow-hidden/.test(live) && /aspect-\[390\/844\]/.test(live))
  check("    the pictures blurred until the website says it drew, then the website fades in over them; never white (the template's ground)", /filter: `blur\(\$\{BLUR_PX\}px\)/.test(live) && /storelib:template-preview-drawn/.test(live) && /transitionDuration: `\$\{LIVE_FADE_MS\}ms`/.test(live) && /TEMPLATE_PREVIEW_GROUNDS\[listing\.slug\]/.test(detail) && /backgroundColor: ground\?\.\[d\]/.test(live))
  check("    lazy: the frame is made only after the page has loaded, the gallery is on screen and the visitor has moved (or a quiet while)", /new IntersectionObserver/.test(live) && /addEventListener\("load", afterLoad/.test(live) && /LIVE_IDLE_MS/.test(live) && /loading="lazy"/.test(live) && /live && made\[d\] && stage \?/.test(live))
  check("  related: RELATED_COUNT of them, a row a finger scrolls on a phone and a grid of three on a computer", /relatedListings\(listing, all, RELATED_COUNT\)/.test(detail) && /snap-x snap-mandatory/.test(detail) && /lg:grid lg:grid-cols-3/.test(detail))
  check("  Use this template adds it, signed out goes to sign in and back with ?add=1", /"Use this template"/.test(actions) && /p\.get\("add"\) !== "1"/.test(actions) && /\/login\?next=\$\{encodeURIComponent\(`\$\{listingPath\(slug\)\}\?add=1`\)\}/.test(read("components/themes/use-add-theme.ts")))
  /* Changed on purpose (marketplace round 23, the owner: "no double header, keep one: the Storelib theme marketplace header", with the purple logo, Dashboard, the bell and the photo signed in; no line under the heading; a black footer). */
  const bar = read("components/themes/marketplace-header.tsx")
  const layout = read("app/(storelib)/(marketing)/themes/layout.tsx")
  const siteHeader = read("components/marketing/conditional-header.tsx")
  check("one header: the marketplace's own bar on every page under /themes, the site's header not drawn there", /<MarketplaceHeader \/>/.test(layout) && /function isOwnScreen\(p: string\): boolean \{[^}]*isThemeStore\(p\)/.test(siteHeader) && /function isThemeStore\(p: string\): boolean \{\s*return p === "\/themes" \|\| p\.startsWith\("\/themes\/"\)/.test(siteHeader) && !/MarketplaceBar/.test(page + cat + detail))
  /* Changed on purpose (marketplace round 24, the owner: the icon and the name "slightly bigger"): 34px and 20px, from 30 and 18. */
  check("  the purple logo picture and the marketplace's name, a touch larger", /<StorelibLogo size=\{34\} priority alt="" \/>/.test(bar) && /sm:text-\[20px\]/.test(bar) && !/variant="solid"/.test(bar) && /Storelib theme marketplace/.test(bar))
  check("  signed in: Dashboard to /app, the site's bell and the site's account menu and sheet; signed out: Sign in and Get started", /href="\/app"[\s\S]{0,400}Dashboard/.test(bar) && /<NotificationBell\b/.test(bar) && /<DesktopAccountMenu\b/.test(bar) && /<AccountSheet\b/.test(bar) && /readAuthSnapshot\(\)/.test(bar) && /Sign in/.test(bar) && /Get started/.test(bar))
  check("  no line under the heading: MarketplaceHeading takes no intro, and /themes says no count of templates there", !/intro/.test(shell.slice(shell.indexOf("export function MarketplaceHeading"), shell.indexOf("export function CategorySummary"))) && !/MARKETPLACE_SEO\.intro/.test(page) && /<CategorySummary text=\{cat\.intro\} \/>/.test(cat))
  /* Changed on purpose (marketplace round 24, the owner: "the footer the same as storelib.com's main footer, not the custom black one"). */
  const conditionalFooter = read("components/marketing/conditional-footer.tsx")
  check("  storelib.com's own footer, drawn by the layout in the server's HTML; the marketplace's black footer is gone and ConditionalFooter adds no second one", /<MarketingFooter \/>/.test(layout) && /from "@\/components\/marketing\/footer"/.test(layout) && !/MarketplaceFooter/.test(layout + shell) && !/bg-\[#0a0a0c\]/.test(shell) && !/startsWith\("\/themes/.test(conditionalFooter) && !/shopify/i.test(bar + shell + layout))
  /* Changed on purpose (marketplace round 24, the owner: Dashboard "a solid button with a little depth, like Storelib's app buttons", not plain text). */
  check("  Dashboard is a solid button with depth: the near black fill, a hairline, a soft shadow and a light top edge", ["bg-[#1a1a2e]", "border border-", "shadow-[0_1px_2px", "inset_0_1px_0", "hover:bg-"].every((c) => (/const SOLID =\s*"([^"]*)"/.exec(bar)?.[1] ?? "").includes(c)) && /data-market-dashboard=""\s*className=\{cn\(SOLID/.test(bar))
  /* Changed on purpose (marketplace round 24, the owner: "show 20 templates by default before Load more"). */
  check("the marketplace: category links, price and feature checkboxes, sort, twenty at a time with Load more", /<CategoryRow key=\{c\.slug\} href=\{`\$\{c\.path\}\$\{query\}`\}/.test(market) && /type="checkbox"/.test(market) && /THEME_FEATURES\.map/.test(market) && /data-market-sort/.test(market) && /const PAGE_SIZE = 20/.test(market) && /Load more/.test(market))
  check("  on a phone and a tablet the filters are a bottom sheet, opened by Filter", /<BottomSheet\b/.test(market) && /title="Filter and sort"/.test(market) && /data-market-filter-open=""[\s\S]{0,400}lg:hidden/.test(market) && /aside aria-label="Filters" className="hidden lg:block"/.test(market))
  check("  every card is in the page from the server; the ones after twenty are hidden, not missing", /hidden=\{i >= limit\}/.test(market))
  const card = read("components/themes/marketplace-card.tsx")
  /* Changed on purpose (marketplace round 23, the owner: "cards: the screenshot in a rounded frame, name, price or Free below"; on hover the page scrolls smoothly, transform only). The category line under the price is gone. */
  check("  a card: one link, the picture's box drawn at 4:5 with width and height, the name, the price under it", /<Link\s+href=\{card\.href\}/.test(card) && /aspect-\[4\/5\]/.test(card) && /width=\{card\.image\.width\}/.test(card) && /height=\{card\.image\.height\}/.test(card) && /\{card\.name\}<\/h3>\s*<p data-market-price=""[^>]*>\s*\{card\.price\}/.test(card))
  /* Changed on purpose (marketplace round 24, the owner: the way back "snaps very fast and glitchy"; both ways smooth and in proportion, from wherever it is, never a jump): one motion with a position and a speed, moved each frame (glide), not two CSS transitions. */
  check("  on a mouse's hover the whole page slides by transform, asked for only then, never under reduced motion, back on leave", /-scroll\.webp/.test(card) && /e\.pointerType !== "mouse" \|\| !scroll \|\| still\(\)/.test(card) && /img\.style\.transform = `translate3d\(0, \$\{motion\.current\.y\.toFixed\(2\)\}px, 0\)`/.test(card) && /requestAnimationFrame\(step\)/.test(card) && !/transition-property:transform|transitionDuration/.test(card) && /motion-reduce:/.test(card) && !/className="group /.test(card) && /-scroll\.webp/.test(read("scripts/build-theme-seo-images.mjs")))
  {
    /* The slide, frame by frame at 60 a second: a long page under the mouse for a second, then away, then back half way up. */
    const D = 2400
    const s: Glide = { y: 0, v: 0 }
    const ys: number[] = [0]
    const run = (to: number, cruise: number, accel: number, frames: number) => {
      for (let i = 0; i < frames; i++) {
        const done = glide(s, to, cruise, accel, 1 / 60, -D, 0)
        ys.push(s.y)
        if (done) return i + 1
      }
      return -1
    }
    const down = { to: -D, cruise: CARD_PAN_SPEED, accel: PAN_ACCEL }
    run(down.to, down.cruise, down.accel, 60)
    const after1s = -s.y
    const back = returnSpeedFor(after1s)
    const tookBack = run(0, back, back / RETURN_RAMP_S, 600)
    run(down.to, down.cruise, down.accel, 40)
    const mid = -s.y
    const back2 = returnSpeedFor(mid)
    run(0, back2, back2 / RETURN_RAMP_S, 20)
    /* the mouse comes back while it is still on its way up */
    run(down.to, down.cruise, down.accel, 90)
    const steps = ys.slice(1).map((y, i) => y - ys[i])
    const jerks = steps.slice(1).map((d, i) => Math.abs(d - steps[i]))
    check(`  after a second's hover (${Math.round(after1s)}px down) it comes back in ${Math.round((tookBack / 60) * 1000)}ms: not a snap, not a crawl`, after1s > 120 && after1s < 220 && tookBack > 0 && tookBack / 60 >= 0.35 && tookBack / 60 <= 0.75, { after1s, tookBack })
    check("  never outside the page, never a jump: no frame moves more than its cruising speed allows, and the speed never changes abruptly", ys.every((y) => y <= 0 && y >= -D) && Math.max(...steps.map(Math.abs)) <= returnSpeedFor(D) / 60 + 0.01 && Math.max(...jerks) < 3, { maxStep: Math.max(...steps.map(Math.abs)), maxJerk: Math.max(...jerks) })
    const longBack = returnSpeedFor(D)
    check("  a whole page comes back in about a second and a half, a short way in under half a second's cruising", D / longBack <= 1.4 && D / longBack >= 0.9 && 100 / returnSpeedFor(100) < 0.5)
  }
  check("  Back lands where it left: the filters, Load more's cards and the scroll kept in the history entry, put back before the first frame", /MARKET_RETURN_KEY/.test(market) && /document\.addEventListener\("click", onClick, true\)/.test(market) && /window\.addEventListener\("pagehide", keep\)/.test(market) && /h\.scrollRestoration = "manual"/.test(market) && /useIsoLayoutEffect\(\(\) => \{\s*const kept = readKept\(\)/.test(market))
  const preview = read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")
  check("the preview: the template's first screen blurred under the website while it loads, and This is a preview that goes by itself", /<BlurPlaceholder key=\{blur\} src=\{blur\} \/>/.test(preview) && /blur\(\$\{BLUR_PX\}px\)/.test(preview) && /tt\("This is a preview"\)/.test(preview) && /pointer-events-none absolute inset-x-0 bottom-/.test(preview) && /PREVIEW_NOTE_FOR_MS/.test(preview))
  const builder = read("app/(storelib)/app/website-builder/website-builder-client.tsx") + read("app/(storelib)/app/website-builder/themes/themes-client.tsx")
  /* Changed on purpose (r58 integration): no count of templates here. Main adds templates; what matters is that the popup reads the shared catalogue and none of this round's files. */
  check("the builder's marketplace popup still reads the same catalogue, and nothing of this round", /<ThemeMarketplace\b/.test(builder) && /from "@\/lib\/themes\/marketplace-shared"/.test(builder) && !/theme-seo|marketplace-card|marketplace-shell/.test(builder))

  console.log("\n  9. Copy")
  const visible = [
    "lib/themes/theme-seo.ts",
    "components/themes/marketplace-shell.tsx",
    "components/themes/marketplace-header.tsx",
    "components/themes/marketplace-card.tsx",
    "app/(storelib)/(marketing)/themes/themes-marketplace.tsx",
    "app/(storelib)/(marketing)/themes/page.tsx",
    "app/(storelib)/(marketing)/themes/[slug]/page.tsx",
    "app/(storelib)/(marketing)/themes/[slug]/theme-detail.tsx",
    "app/(storelib)/(marketing)/themes/[slug]/theme-live.tsx",
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
