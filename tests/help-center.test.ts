/**
 * ===========================================================================
 *  THE HELP CENTER
 * ===========================================================================
 * The articles are data (lib/help/articles), the search is a function
 * (lib/help/search), and the pages and the sitemap read both. This holds:
 *
 *   the search finds what a person would type, and only that
 *   every article belongs to a category, every link in one goes somewhere
 *   the copy follows the house rules (no em dashes, none of the banned words)
 *   every page is in the sitemap, with its own metadata
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { articleText, HELP_ARTICLES, HELP_CATEGORIES, HELP_MOVED, helpArticle, helpArticlePath, helpArticlesIn, helpSectionsIn, SUPPORT_EMAIL } from "../lib/help/articles"
import { PHYSICAL_ARTICLES, PHYSICAL_CATEGORY, PHYSICAL_SECTIONS, SITE_WIDE_ARTICLES } from "../lib/help/physical-articles"
import { PHYSICAL_SHOTS } from "../lib/help/physical-shots"
import { EXPLAINERS } from "../lib/settings/explainers"
import { DEV_PAGES, devPath } from "../lib/developers/pages"
import { queryTerms, searchHelp, words } from "../lib/help/search"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const top = (q: string) => searchHelp(q)[0]?.article.slug
const slugs = (q: string) => searchHelp(q).map((r) => r.article.slug)

console.log("\nThe search")
check("an empty query finds nothing, rather than everything", searchHelp("").length === 0 && searchHelp("   ").length === 0)
check("only small words is an empty query", searchHelp("how do i").length === 0)
check("\"refund\" puts refunding an order first", top("refund") === "refund-an-order", slugs("refund"))
check("\"refunds\" is the same search as \"refund\"", top("refunds") === "refund-an-order")
check("\"custom domain\" finds the domain article first", top("custom domain") === "custom-domain", slugs("custom domain"))
check("\"cash out\" finds when you get paid", top("cash out") === "how-payouts-work", slugs("cash out"))
check("\"payout\" finds it too, through its keywords", slugs("payout").includes("how-payouts-work"))
check("a word matches the start of a word: \"pay\" finds payouts", slugs("pay").includes("how-payouts-work"))
check("\"fee\" puts the fee article first", top("fee") === "fees", slugs("fee"))
check("\"delete account\" finds deleting an account", top("delete account") === "delete-your-account", slugs("delete account"))
check("\"cookie\" finds cookies and privacy", top("cookie") === "cookies-and-privacy")
check("\"username\" finds the page address article", top("username") === "your-page-address")
check("between equal scores the shorter, more direct title wins: \"email\"", top("email") === "send-an-email", slugs("email"))
check("a snippet never runs two list items together", !searchHelp("resend receipt").some((r) => /order Resend/.test(r.snippet)))
check("every word must match: \"refund zebra\" finds nothing", searchHelp("refund zebra").length === 0)
check("case and accents do not matter", top("RÉFUND") === "refund-an-order")
check("a query that is only punctuation finds nothing", searchHelp("?!.,").length === 0)
check("results are capped", searchHelp("the a product", 3).length <= 3)
check("each result has a snippet from its article", searchHelp("domain").every((r) => r.snippet.length > 0 && r.snippet.length <= 163))
check("the words helper splits on anything that is not a letter or digit", words("Cash-out, $1.00!").join(" ") === "cash out 1 00")
check("query terms drop small words and plurals", queryTerms("how do I get my payouts").join(" ") === "get payout")

console.log("\nThe articles")
const catSlugs = new Set(HELP_CATEGORIES.map((c) => c.slug))
check("the seven categories asked for, in order",
  HELP_CATEGORIES.map((c) => c.title).join(" | ") === "Getting started | Products | Orders and payouts | Website builder | Email | Account and billing | Policies")
check("every article is in a category that exists", HELP_ARTICLES.every((a) => catSlugs.has(a.category)))
check("every category has articles", HELP_CATEGORIES.every((c) => helpArticlesIn(c.slug).length >= 3))
const keys = HELP_ARTICLES.map((a) => `${a.category}/${a.slug}`)
check("no two articles share an address", new Set(keys).size === keys.length)
check("no category is called search, which is the results page's address", !catSlugs.has("search"))
check("every summary fits a meta description", HELP_ARTICLES.every((a) => a.summary.length >= 30 && a.summary.length <= 160), HELP_ARTICLES.filter((a) => a.summary.length > 160).map((a) => a.slug))

const allText = HELP_ARTICLES.map((a) => [a.title, a.summary, articleText(a)].join(" ")).join(" ") + " " + HELP_CATEGORIES.map((c) => `${c.title} ${c.description}`).join(" ")
const rawText = JSON.stringify(HELP_ARTICLES) + JSON.stringify(HELP_CATEGORIES)
check("no em dashes or en dashes", !/[—–]/.test(rawText))
const banned = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform"]
check("none of the banned words", !banned.some((w) => new RegExp(`\\b${w}`, "i").test(allText)), banned.filter((w) => new RegExp(`\\b${w}`, "i").test(allText)))

/* Every link inside an article goes to a page that exists. */
const links = [...rawText.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
const pageExists = (href: string) => {
  if (href.startsWith("mailto:")) return href === `mailto:${SUPPORT_EMAIL}`
  const help = href.match(/^\/help\/([^/]+)\/([^/]+)$/)
  if (help) return !!helpArticle(help[1], help[2])
  const seg = href.slice(1)
  return ["", "(marketing)/", "(auth)/", "(platform)/"].some((g) => existsSync(join(process.cwd(), `app/${g}${seg}/page.tsx`)))
}
const broken = links.filter((h) => !pageExists(h))
check("every link in an article goes to a page that exists", links.length >= 10 && broken.length === 0, broken)
check("no link is a placeholder", !links.some((h) => h === "#" || h === ""))

console.log("\nThe pages")
const index = read("app/help/page.tsx")
const category = read("app/help/[category]/page.tsx")
const article = read("app/help/[category]/[article]/page.tsx")
check("the index no longer links to \"#\"", !/href="#"/.test(index))
check("no purple gradient anywhere in the Help Center",
  ![index, category, article, read("components/help/help-parts.tsx"), read("components/help/help-search.tsx")].some((s) => /bg-gradient|from-\[#8b5cf6\]/.test(s)))
check("no icon library on the pages", ![index, category, article, read("components/help/help-parts.tsx")].some((s) => /from "lucide-react"/.test(s)))
check("each category and article page has its own title, description and canonical",
  /generateMetadata/.test(category) && /alternates: \{ canonical: `\/help\/\$\{category\.slug\}` \}/.test(category) &&
  /generateMetadata/.test(article) && /description: article\.summary/.test(article) && /alternates: \{ canonical: path \}/.test(article))
check("pages are built ahead of time and unknown ones 404", /dynamicParams = false/.test(category) && /dynamicParams = false/.test(article))
/* Changed on purpose (round K): the form posts to the search of the Help Center it is in, /help/search by default or /app/help/search in the app. */
check("the search is a form that works without script", /action=\{`\$\{base\}\/search`\} method="get" role="search"/.test(read("components/help/help-search.tsx")) && /base = HELP_BASE/.test(read("components/help/help-search.tsx")) && /export const HELP_BASE = "\/help"/.test(read("lib/help/paths.ts")))
check("and the results page runs the same search, unindexed", /searchHelp\(q, 30, \{ physical: await isPhysicalCommerceEnabled\(\) \}\)/.test(read("app/help/search/page.tsx")) && /index: false/.test(read("app/help/search/page.tsx")))
check("support is the real address", /SUPPORT_EMAIL = "support@storelib\.com"/.test(read("lib/help/articles.ts")))
check("no \"Was this helpful\" that records nothing", ![index, category, article].some((s) => /helpful/i.test(s)))


console.log("\nThe physical products guide")
{
  const P = PHYSICAL_ARTICLES
  const slugsP = P.map((a) => a.slug)
  check("no two physical articles share an address", new Set(slugsP).size === slugsP.length)
  check("every one is in the physical topic", P.every((a) => a.category === PHYSICAL_CATEGORY.slug))
  check("the groups read like a book, in order (round 23)",
    PHYSICAL_SECTIONS.join(" | ") === "Getting started | Set up your store | Products | Shipping and delivery | Locations and inventory | Taxes | Orders and tracking | Returns and refunds | Customer emails | Website and integrations | Payouts, fees and policies")
  const groups = helpSectionsIn(PHYSICAL_CATEGORY.slug)
  check("the topic page reads them in those groups, each with at least one article",
    groups.map((g) => g.title).join(" | ") === PHYSICAL_SECTIONS.join(" | ") && groups.every((g) => g.articles.length >= 1))
  check("Zero to 100 opens the guide", P[0]?.slug === "zero-to-100" && /^Zero to 100/.test(P[0].title))
  const zeroLinks = new Set([...JSON.stringify(P[0]?.body ?? []).matchAll(/\(\/help\/physical-products\/([a-z0-9-]+)\)/g)].map((m) => m[1]))
  check("and links on to at least ten of the detailed articles", zeroLinks.size >= 10, [...zeroLinks])
  /* Addresses already linked from the app, emails and search engines are kept. */
  const kept = ["how-physical-products-work", "create-a-physical-product", "inventory-and-stock", "variants-and-options", "fulfillment-methods", "shipping-profiles-zones-and-rates", "shipping-rate-examples", "local-pickup", "ship-your-orders", "returns-physical", "taxes", "tax-and-units", "upsells-and-bundles", "physical-products-questions"]
  /* An article that moved answers at its old address by sending people on (HELP_MOVED). */
  const answers = (k: string) => slugsP.includes(k) || !!HELP_MOVED[`physical-products/${k}`]
  check("every address the guide had before still answers", kept.every(answers), kept.filter((k) => !answers(k)))
  check("every summary fits a meta description", P.every((a) => a.summary.length >= 30 && a.summary.length <= 160), P.filter((a) => a.summary.length > 160).map((a) => a.slug))
  check("step by step: most articles have numbered steps", P.filter((a) => a.body.some((b) => b.type === "steps")).length >= 20)

  const rawP = JSON.stringify(P) + JSON.stringify(PHYSICAL_CATEGORY)
  const textP = P.map((a) => [a.title, a.summary, articleText(a)].join(" ")).join(" ")
  check("no em dashes or en dashes", !/[\u2014\u2013]/.test(rawP))
  const bannedP = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform", "game changer", "leverage", "delve"]
  check("none of the banned words", !bannedP.some((w) => new RegExp(`\\b${w}`, "i").test(textP)), bannedP.filter((w) => new RegExp(`\\b${w}`, "i").test(textP)))

  const linksP = [...rawP.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
  const devSlugs = new Set(DEV_PAGES.map((d) => devPath(d.slug)))
  const landsP = (href: string) => {
    const help = href.match(/^\/help\/([^/]+)\/([^/]+)$/)
    if (help) return !!helpArticle(help[1], help[2])
    if (href.startsWith("/developers")) return devSlugs.has(href)
    return false
  }
  const brokenP = linksP.filter((h) => !landsP(h))
  check("every link in the guide lands on an article or a developer page", linksP.length >= 25 && brokenP.length === 0, brokenP)

  /* The screenshots: each one a real file, the size it says, used, and described. */
  /* Changed on purpose: the currency and language articles moved under Website builder and keep their screenshots in public/help/physical. */
  const images = [...P, ...SITE_WIDE_ARTICLES].flatMap((a) => a.body.filter((b): b is Extract<typeof b, { type: "image" }> => b.type === "image"))
  check("the guide has screenshots of the real screens", images.length >= 30)
  check("each one is a WebP in public/help/physical", images.every((b) => /^\/help\/physical\/[a-z0-9-]+\.webp$/.test(b.src) && existsSync(join(process.cwd(), "public", b.src))), images.filter((b) => !existsSync(join(process.cwd(), "public", b.src))).map((b) => b.src))
  check("each says what it shows, for a screen reader", images.every((b) => b.alt.length >= 20 && !/[\u2014\u2013]/.test(b.alt)))
  const files = readdirSync(join(process.cwd(), "public/help/physical")).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5))
  /* A phone picture is used by the screenshot it belongs to. */
  const used = new Set(images.flatMap((b) => [b.src, b.phone?.src].filter((x): x is string => !!x)).map((src) => src.replace(/^\/help\/physical\/|\.webp$/g, "")))
  check("every file is used by an article, and the size table lists exactly the files", files.every((f) => used.has(f)) && files.length === Object.keys(PHYSICAL_SHOTS).length && files.every((f) => f in PHYSICAL_SHOTS), files.filter((f) => !used.has(f)))
  const webpSize = (f: string) => { const b = readFileSync(join(process.cwd(), "public/help/physical", `${f}.webp`)); const chunk = b.toString("ascii", 12, 16); if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]; if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)] } return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] }
  const wrong = files.filter((f) => { const [w, h] = webpSize(f); const [cw, ch] = PHYSICAL_SHOTS[f as keyof typeof PHYSICAL_SHOTS]; return Math.abs(w / 2 - cw) > 1 || Math.abs(h / 2 - ch) > 1 })
  check("each is drawn at 2x and its size in the table is half the file's", wrong.length === 0, wrong)
  check("small enough to load quickly (under 200 KB each)", files.every((f) => readFileSync(join(process.cwd(), "public/help/physical", `${f}.webp`)).length < 200_000))

  /* The app's own links into the guide land on articles that exist and fit. */
  const guides = Object.values(EXPLAINERS).map((e) => ("guide" in e ? e.guide : undefined)).filter((g): g is string => !!g)
  check("every How it works guide opens an article", guides.length >= 8 && guides.every((g) => landsP(g)), guides.filter((g) => !landsP(g)))
  check("  Locations opens the locations article, Checkout and Sales channels their own",
    EXPLAINERS.locations.guide === "/help/physical-products/locations" && EXPLAINERS.checkout.guide === "/help/physical-products/checkout-settings" && EXPLAINERS.channels.guide === "/help/physical-products/sales-channels" && EXPLAINERS.taxes.guide === "/help/physical-products/taxes")
  check("  and a physical guide is offered only while physical commerce is on", /usePhysicalCommerceEnabled\(\)/.test(read("components/app/settings/how-it-works.tsx")) && /physical \|\| !e\.guide\.startsWith\("\/help\/physical-products\/"\)/.test(read("components/app/settings/how-it-works.tsx")))
  const appLinks = ["components/physical/shipping-settings.tsx", "components/physical/product-cards.tsx", "lib/help/questions.ts", "app/app/payouts/payouts-client.tsx"].flatMap((f) => [...read(f).matchAll(/["(](\/help\/[a-z-]+\/[a-z0-9-]+)[")]/g)].map((m) => m[1]))
  check("every Help link in the shipping settings, product cards, questions and Payouts lands", appLinks.length >= 4 && appLinks.every((l) => landsP(l)), appLinks.filter((l) => !landsP(l)))
  check("Taxes' How tax regions work opens the tax guide, only while the guide is there",
    /\{physical \? \(\s*<a href="\/help\/physical-products\/taxes"/.test(read("components/app/settings/taxes-panel.tsx")) && landsP("/help/physical-products/taxes"))
  check("Shipping and delivery points newcomers at Zero to 100", /href="\/help\/physical-products\/zero-to-100"/.test(read("components/physical/shipping-settings.tsx")))
  check("the topic page shows the groups, the article page its own group", /helpSectionsIn\(category\.slug\)/.test(category) && /data-help-section/.test(category) && /helpSectionsIn\(category\.slug\)\.find/.test(article))
  check("a screenshot is drawn at its own size, lazily, with its words", /case "image":/.test(read("components/help/help-parts.tsx")) && /loading="lazy"/.test(read("components/help/help-parts.tsx")) && /alt=\{b\.alt\}/.test(read("components/help/help-parts.tsx")))
}

console.log("\nThe sitemap")
const sitemap = read("lib/seo/sitemaps.ts")
check("the Help Center is in the pages sitemap, from the same list",
  /\{ url: `\$\{BASE\}\/help` \}/.test(sitemap) && /helpCategoriesFor\(physicalGuide\)\.map/.test(sitemap) && /helpArticlesFor\(physicalGuide\)\.map\(\(a\) => \(\{ url: `\$\{BASE\}\$\{helpArticlePath\(a\)\}`/.test(sitemap))
check("article addresses are /help/<category>/<article>", helpArticlePath({ category: "products", slug: "coupons" }) === "/help/products/coupons")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
