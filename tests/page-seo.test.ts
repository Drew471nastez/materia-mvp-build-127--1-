/**
 * ===========================================================================
 *  EACH PAGE'S OWN SEARCH RESULT, AND A DOMAIN ADDED IN PLACE
 * ===========================================================================
 * Website Settings › Pages & Navigation edits a page's title, description
 * and whether search engines see it; Domains adds a domain where it is
 * shown. Held here: what is stored, what the live page and the sitemap do
 * with it, and that replacing a connected domain is asked first.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PAGE_DESCRIPTION_MAX, PAGE_TITLE_MAX, hiddenPages, pageSeoOf, typedPageSeo, withPageSeo } from "@/lib/website-builder/page-seo"
import { onePageIndexable } from "@/lib/seo/indexing"
import { onePageSameAs, profilePageJsonLd } from "@/lib/seo/structured-data"
import { getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { soldOut, toCard } from "@/lib/website-builder/shop-products"
import { DB_CATEGORY_TO_ID, categoryPath } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhat is stored")
{
  const one = withPageSeo({}, "about", { title: "About Astrid" })
  check("a page's title is stored under its key", JSON.stringify(one) === JSON.stringify({ about: { title: "About Astrid" } }), JSON.stringify(one))
  const two = withPageSeo({ page_seo: one }, "about", { hidden: true })
  check("a second field joins the first, it does not replace it", two.about?.title === "About Astrid" && two.about?.hidden === true, JSON.stringify(two))
  const other = withPageSeo({ page_seo: two }, "contact", { description: "Write to me" })
  check("and another page leaves this one as it was", other.about?.hidden === true && other.contact?.description === "Write to me")
  const cleared = withPageSeo({ page_seo: { about: { title: "About Astrid" } } }, "about", { title: "" })
  check("emptying the only field drops the page, so the value holds only what was chosen", !("about" in cleared), JSON.stringify(cleared))
  const shown = withPageSeo({ page_seo: { about: { hidden: true } } }, "about", { hidden: false })
  check("switching search back on drops the flag rather than storing false", !("about" in shown), JSON.stringify(shown))
  check("home is never stored here: its search result is the site's own", !("home" in withPageSeo({}, "home", { title: "x" })) && Object.keys(pageSeoOf({ page_seo: { home: { title: "x", hidden: true } } }, "home")).length === 0)
  const junk = withPageSeo({ page_seo: { about: "nonsense", shop: [1], faq: { hidden: "yes", title: 4 } } }, "contact", { title: "Hi" })
  check("a malformed value from anywhere is dropped on the next write", JSON.stringify(junk) === JSON.stringify({ contact: { title: "Hi" } }), JSON.stringify(junk))
  check("a long title is capped when stored", (withPageSeo({}, "about", { title: "a".repeat(500) }).about?.title ?? "").length === 120)
  check("and the limits shown are what a search result shows", PAGE_TITLE_MAX === 70 && PAGE_DESCRIPTION_MAX === 160)
}

console.log("\nWhat is read")
{
  const s = { page_seo: { about: { title: "  About\n\tAstrid  ", description: "   ", hidden: true } } }
  const seo = pageSeoOf(s, "about")
  check("whitespace and control characters are folded, and an empty field is nothing", seo.title === "About Astrid" && seo.description === undefined && seo.hidden === true, JSON.stringify(seo))
  check("a page with nothing set reads as nothing", Object.keys(pageSeoOf(s, "contact")).length === 0 && Object.keys(pageSeoOf(null, "about")).length === 0)
  check("only a real true hides a page", [...hiddenPages({ page_seo: { a: { hidden: true }, b: { hidden: "true" }, c: { hidden: 1 }, home: { hidden: true } } })].join() === "a")
  check("the inputs get what was typed, spaces included", typedPageSeo({ page_seo: { about: { title: "About " } } }, "about").title === "About ")
}

console.log("\nWhere it is used")
{
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("the live page's title and description come from the page first", /const own = pageSeoOf\(settings as Record<string, unknown>, pageKey\)/.test(render) && /own\.title \?\?/.test(render) && /own\.description \?\?/.test(render))
  check("and a hidden page says noindex", /own\.hidden \? \{ robots: \{ index: false, follow: true \} \}/.test(render))
  const data = read("lib/website-builder/site-seo-data.ts")
  check("the sitemap leaves out a hidden page", /hiddenPages\(site\.themeSettings/.test(data) && /filter\(\(k\) => !hidden\.has\(k\)\)/.test(data))
  const pages = read("components/website-builder/website-settings/pages.tsx")
  check("Pages & Navigation writes through the draft, like every other setting", /ctx\.onSettingChange\("page_seo", withPageSeo\(/.test(pages))
  check("and sends Home to SEO & Social, where its result is edited", /ctx\.go\("seo"\)/.test(pages))
}

console.log("\nA domain, added in place")
{
  const domains = read("components/website-builder/website-settings/domains.tsx")
  check("it is added with the same route the account page uses", /fetch\("\/api\/domains", \{\s*method: "POST"/.test(domains))
  check("replacing a connected domain is said, and asked, before anything is sent", /This replaces/.test(domains) && /if \(current && current\.domain !== clean && !confirming\)/.test(domains) && /For 30 days/.test(domains))
  check("a waiting domain shows the records to set and can be checked", /DEFAULT_A/.test(domains) && /CNAME_TARGET/.test(domains) && !/vercel-dns/i.test(domains) && /\/api\/domains\/verify/.test(domains))
  const route = read("app/api/domains/route.ts")
  check("and the route is the signed-in creator's own", /auth\.getUser\(\)/.test(route) && /creator_id/.test(route))
}

/* The page's source with its comments taken out, so a check reads code only. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nA OnePage says where it lives and who it is about")
{
  check("it is canonical under the handle, or at /links on a connected domain",
    getLinksShareUrl("Mara") === "https://storelib.com/mara/links" && getLinksUrlWithCustomDomain("mara", "marashop.com") === "https://www.marashop.com/links")
  check("it is listed by the sitemap's rule: published, with something published, under a handle that is not a farm's",
    onePageIndexable({ status: "published", publishedProducts: 2, handle: "mariapopescu" }) &&
      !onePageIndexable({ status: "draft", publishedProducts: 2, handle: "mariapopescu" }) &&
      !onePageIndexable({ status: "published", publishedProducts: 0, handle: "mariapopescu" }) &&
      !onePageIndexable({ status: "published", publishedProducts: 2, handle: "powerokebos999" }) &&
      !onePageIndexable({ status: "published", publishedProducts: 2, handle: null }))
  const same = onePageSameAs({ instagram: "@mara.studio", youtube: "https://youtube.com/@mara", email: "mara@example.com", whatsapp: "+15550100", tiktok: "", twitter: "javascript:alert(1)" })
  check("its social links become sameAs addresses, a handle made whole the way the page draws it",
    same.includes("https://instagram.com/mara.studio") && same.includes("https://youtube.com/@mara"), JSON.stringify(same))
  check("and an email, a phone number, an empty field or a script is not who somebody is",
    same.length === 2 && !same.some((u) => /mailto|wa\.me|javascript/.test(u)), JSON.stringify(same))
  const ld = profilePageJsonLd({ url: "https://storelib.com/mara/links", name: "Mara", image: "https://cdn.example.com/m.png", description: "<p>Film &amp; photo</p>", sameAs: same }) as {
    "@type": string
    mainEntity: { "@type": string; name: string; image?: string; description?: string; sameAs?: string[] }
  }
  check("its structured data is a ProfilePage about a Person, with a picture, a plain description and sameAs",
    ld["@type"] === "ProfilePage" && ld.mainEntity["@type"] === "Person" && ld.mainEntity.name === "Mara" &&
      ld.mainEntity.image === "https://cdn.example.com/m.png" && ld.mainEntity.description === "Film & photo" && ld.mainEntity.sameAs?.length === 2)
  check("a picture that is not a full address is left out rather than guessed", !("image" in (profilePageJsonLd({ url: "u", name: "n", image: "/placeholder.svg" }) as { mainEntity: object }).mainEntity))

  const page = code("app/(marketing)/l/[slug]/page.tsx")
  /* The row, the owner and the address are read in lib/onepage/published-page, and the tags written by lib/onepage/seo, for the page and its share image alike. */
  const loader = code("lib/onepage/published-page.ts")
  const seoLib = code("lib/onepage/seo.ts")
  check("the page names its canonical, and the share card its address and kind",
    /if \(owner\.canonical\) return owner\.canonical/.test(loader) && /return getLinksShareUrl\(slug, pageHost\)/.test(loader) &&
      /alternates: \{ canonical: seo\.url \}/.test(seoLib) && /type: "profile" as const/.test(seoLib) && /url: seo\.url,/.test(seoLib) && /onePageMetadataFrom\(seo, /.test(page))
  check("its robots tag is the sitemap's rule, and noindex means nofollow too",
    /const indexable = !owner\.banned && onePageIndexable\(\{ status: onepage\.status, publishedProducts: owner\.publishedProducts, handle: owner\.handle \}\)/.test(page) &&
      /robots: extra\.indexable\s*\?[^:]*index: true[\s\S]{0,200}: \{ index: false, follow: false/.test(seoLib))
  check("its structured data is printed only when it may be listed, and escaped",
    /owner\.canonical && onePageIndexable\(/.test(page) && /jsonLdScript\(\s*profilePageJsonLd\(/.test(page) && /sameAs: onePageSameAs\(transformedOnepage\.social_links\)/.test(page))
  /*
    MOVED, ON PURPOSE: the route builds the page's shape in
    lib/onepage/public-shape.ts now, the one place the editor's preview
    builds it too (the preview frames the live component, so the two
    cannot drift). The same fallbacks and the same schedule rule, read
    where they live.
  */
  const shape = read("lib/onepage/public-shape.ts")
  check("and a page published before the published columns existed still draws its draft content",
    /publicOnePage\(onepage, \{\s*source: "published"/.test(loader) &&
      /published \? row\.published_blocks \|\| row\.draft_blocks : row\.draft_blocks/.test(shape) && /published \? row\.published_social_links \|\| row\.social_links : row\.social_links/.test(shape))
  check("and a block outside its schedule is left out before the page is sent",
    /blocks: blocks\.filter\(\(b\) => isScheduledNow\(b, now\)\)/.test(shape) && /import \{ isScheduledNow \} from "@\/lib\/onepage\/extra-blocks"/.test(shape))
  check("the handle and the counts are asked once per request, for the metadata and the page",
    /export const onePageOwner = cache\(async/.test(loader) && (page.match(/await onePageOwner\(/g) ?? []).length === 2)
}

console.log("\nThe creator page is one address, described in the creator's own words")
{
  const page = code("app/(marketing)/u/[username]/page.tsx")
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default async function StorefrontPage"))
  check("its metadata finds the profile the way the page does, so /Andrew is Andrew's page",
    /const profile = await loadProfileByUsername\(username\)/.test(meta) && !/\.eq\("username", username\)/.test(meta) && /const creator = await loadCreatorForUser\(profile\.id\)/.test(meta))
  check("and every address in it is the stored username's, the share card's included",
    /const handle: string = profile\.username \|\| username/.test(meta) && /canonical: pageUrl,/.test(meta) &&
      /const pageUrl = pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{handle\}`/.test(meta) && /url: pageUrl/.test(meta) && !/\.storelib\.com`/.test(meta) &&
      /url: pageAddress,/.test(page) && /getProductShareUrl\(pageHandle, p\.slug, pageHost\)/.test(page))
  check("the description is the creator's own before anything generic: override, SEO tab, headline or bio, then the sentence",
    /seoOverride\?\.seo_description \|\|\s*ownDescription \|\|\s*plainSummary\(creator\?\.headline \|\| headerBio \|\| creator\?\.bio \|\| "", 200\) \|\|\s*defaultDescription/.test(meta) &&
      /ownDescription = globalSettings\?\.seoDescription\?\.trim\(\)/.test(meta) && /ownTitle = globalSettings\?\.seoTitle\?\.trim\(\)/.test(meta))
  check("its robots rule judges the stored handle", /deservesIndexing\(\{ publishedProducts, handle \}\)/.test(meta) && /deservesIndexing\(\{ publishedProducts: products\?\.length \?\? 0, handle: pageHandle \}\)/.test(page))
  check("its structured data carries sameAs and the products, in both branches, behind the same gate",
    /sameAs: sameAsUrls\(Object\.values\(shopHeader\?\.socialLinks \?\? \{\}\)/.test(page) && /\.slice\(0, MAX_LISTED_PRODUCTS\)/.test(page) &&
      (page.match(/jsonLdScript\(profileJsonLd\)/g) ?? []).length === 2)
  const products = Array.from({ length: 25 }, (_, i) => ({ name: `Pack ${i + 1}`, url: `https://storelib.com/mara/pack-${i + 1}` }))
  const ld = profilePageJsonLd({ url: "https://storelib.com/mara", name: "Mara", sameAs: ["https://x.com/mara"], products }) as {
    "@graph": Array<{ "@type": string; mainEntity?: { sameAs?: string[] }; itemListElement?: Array<{ position: number; url: string }> }>
  }
  const list = ld["@graph"]?.find((n) => n["@type"] === "ItemList")
  check("the products are an ItemList of at most twenty, in order, beside the ProfilePage",
    ld["@graph"]?.[0]["@type"] === "ProfilePage" && ld["@graph"][0].mainEntity?.sameAs?.[0] === "https://x.com/mara" &&
      list?.itemListElement?.length === 20 && list.itemListElement[0].position === 1 && list.itemListElement[19].url.endsWith("pack-20"))
}

console.log("\nA product is described in its creator's words, with its real availability and category")
{
  check("sold out means stock is counted and none is left; stock nobody counts never runs out",
    soldOut({ inventory_count: 0 }) && soldOut({ inventory_count: -1 }) && !soldOut({ inventory_count: 3 }) && !soldOut({ inventory_count: null }) && !soldOut({}))
  check("the shop's card says so by the same rule", toCard({ id: "p", title: "Pack", slug: "pack", price_cents: 1200, compare_at_cents: null, thumbnail_url: null, status: "published", inventory_count: 0 }).settings.tag === "Sold out")
  check("a product's category is the Explore page the sitemap lists",
    DB_CATEGORY_TO_ID["lightroom presets"] === "photography" && hasCategoryPage("photography") && categoryPath("photography") === "/explore/photography" && !hasCategoryPage("for-you"))

  const page = code("app/(marketing)/p/[slug]/page.tsx")
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default async function ProductPage"))
  check("its title and description are the ones its creator wrote in the editor, when they wrote them",
    /const ownTitle = typeof product\.seo_title === "string"/.test(meta) && /const tabTitle = ownTitle \|\|/.test(meta) && /const ogTitle = ownTitle \|\|/.test(meta) &&
      /const pageDescription = ownDescription \|\| plainSummary\(product\.description\)/.test(meta) && /product\.seo_description/.test(meta))
  check("its structured data says sold out when it is, and its trail points at a page that exists",
    /availability: soldOut\(product\) \? "https:\/\/schema\.org\/OutOfStock" : "https:\/\/schema\.org\/InStock"/.test(page) &&
      /item: `https:\/\/storelib\.com\$\{categoryPath\(exploreCategory\)\}`/.test(page) && !/explore\?category=/.test(page) && /hasCategoryPage\(id\)/.test(page))
  check("and both layouts print it, not only the one nobody arranged",
    (page.match(/jsonLdScript\(productJsonLd\)/g) ?? []).length === 2 && (page.match(/jsonLdScript\(breadcrumbJsonLd\)/g) ?? []).length === 2 &&
      page.indexOf("const productJsonLd = {") < page.indexOf("if (themedSections && themedSections.length > 0 && productPageConfig)"))
  const site = code("components/website-builder/theme/render-product.tsx")
  check("a website's product page says sold out by the same rule, reading the row whole so a missing column cannot fail it",
    /inStock: !soldOut\(product\)/.test(site) && !/inStock: true/.test(site) && /\.from\("products"\)\s*\.select\("\*"\)/.test(site) && /products!inner \( \* \)/.test(site))
  check("and is described in the creator's words there too",
    /const ownTitle = typeof product\.seo_title === "string"/.test(site) && /plainSummary\(product\.seo_description \?\? "", 300\) \|\| plainSummary\(product\.description\)/.test(site))
}

console.log("\nA picture that means something says what it is")
{
  const onepage = read("components/onepage/public-onepage.tsx")
  check("a OnePage names every product, link and file thumbnail by its title, and the avatar by the name",
    !/alt=""/.test(onepage) && (onepage.match(/alt=\{data\.label \|\| ""\}/g) ?? []).length === 4 &&
      (onepage.match(/alt=\{data\.product_title \|\| ""\}/g) ?? []).length === 3 && (onepage.match(/alt=\{data\.title \|\| ""\}/g) ?? []).length === 3 &&
      /alt=\{quickCheckoutModalData\.productTitle\}/.test(onepage) && /alt=\{profile\.title \|\| ""\}/.test(onepage) && /alt=\{data\.headline \|\| ""\}/.test(onepage))
  const product = read("components/website-builder/sections/renderers/ProductSection.tsx")
  check("a website's product gallery names each thumbnail button by the product", !/alt=""/.test(product) && /alt=\{`\$\{title\} thumbnail \$\{i \+ 1\}`\}/.test(product))
  check("the reference hero names the picture beside its heading", /alt=\{str\(s\.heading\)\}/.test(read("components/website-builder/sections/renderers/HeroSection.tsx")))
  const hero = renderStorelibSection(
    { id: "h1", type: "hero", name: "Hero", settings: { layout: "split", heading: "Film presets", hero_image: "https://cdn.example.com/hero.jpg" }, blocks: [] },
    {} as ThemeSettingsValues,
    { template: "index" },
    {},
  )
  check("and the live hero does, drawn from the theme's own file", hero.ok === true && /<img src="https:\/\/cdn\.example\.com\/hero\.jpg" alt="Film presets"/.test(hero.html), hero.ok ? hero.html.slice(0, 200) : "did not render")
  const split = renderStorelibSection(
    { id: "h2", type: "hero_split", name: "Hero", settings: { heading: "Film presets", image: "https://cdn.example.com/split.jpg", image_alt: "" }, blocks: [] },
    {} as ThemeSettingsValues,
    { template: "index" },
    {},
  )
  check("a split hero uses its own alt text, and its heading when that is empty", split.ok === true && /alt="Film presets"/.test(split.html))
  check("a backdrop behind the text stays decorative", /class="hero__media" src="\{\{ settings\.bg_image \| asset \}\}" alt=""/.test(read("themes/default/sections/hero.storelib")))
}

console.log("\nAn old address moved for good says so")
{
  /* A 307 keeps a search engine on the old address; a 308 moves what it knows to the new one. */
  check("a renamed creator's page", /permanentRedirect\(`\/\$\{historyRecord\.new_username\}`\)/.test(code("app/(marketing)/u/[username]/page.tsx")) && !/\bredirect\(`\/\$\{historyRecord/.test(code("app/(marketing)/u/[username]/page.tsx")))
  check("their OnePage", /permanentRedirect\(getLinksInternalPath\(historyRecord\.new_username\)\)/.test(code("app/(marketing)/l/[slug]/page.tsx")))
  check("a renamed product", /permanentRedirect\(`\/p\/\$\{product\.slug\}`\)/.test(code("app/(marketing)/p/[slug]/page.tsx")))
  const c = code("app/(marketing)/c/[slug]/page.tsx")
  check("the old /c/ address, while a guess with nothing behind it stays temporary",
    /permanentRedirect\(`\/\$\{creator\.profile\.username\}`\)/.test(c) && /\bredirect\(`\/\$\{slug\}`\)/.test(c))
  check("a renamed creator's website, to the same page, and its shop",
    /found\.kind === "renamed"\) permanentRedirect\(pageUrl\(/.test(code("app/(site)/w/[username]/render-site.tsx")) &&
      /found\.kind === "renamed"\) permanentRedirect\(`https:\/\/\$\{found\.to\}\.\$\{getMainDomain\(\)\}\/products`\)/.test(code("app/(site)/w/[username]/products/page.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
