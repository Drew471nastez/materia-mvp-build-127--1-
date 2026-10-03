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
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { articleText, HELP_ARTICLES, HELP_CATEGORIES, helpArticle, helpArticlePath, helpArticlesIn, SUPPORT_EMAIL } from "../lib/help/articles"
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
check("the search is a form that works without script", /action="\/help\/search" method="get" role="search"/.test(read("components/help/help-search.tsx")))
check("and the results page runs the same search, unindexed", /searchHelp\(q, 30, \{ physical: await isPhysicalCommerceEnabled\(\) \}\)/.test(read("app/help/search/page.tsx")) && /index: false/.test(read("app/help/search/page.tsx")))
check("support is the real address", /SUPPORT_EMAIL = "support@storelib\.com"/.test(read("lib/help/articles.ts")))
check("no \"Was this helpful\" that records nothing", ![index, category, article].some((s) => /helpful/i.test(s)))

console.log("\nThe sitemap")
const sitemap = read("lib/seo/sitemaps.ts")
check("the Help Center is in the pages sitemap, from the same list",
  /\{ url: `\$\{BASE\}\/help` \}/.test(sitemap) && /helpCategoriesFor\(physicalGuide\)\.map/.test(sitemap) && /helpArticlesFor\(physicalGuide\)\.map\(\(a\) => \(\{ url: `\$\{BASE\}\$\{helpArticlePath\(a\)\}` \}\)\)/.test(sitemap))
check("article addresses are /help/<category>/<article>", helpArticlePath({ category: "products", slug: "coupons" }) === "/help/products/coupons")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
