/**
 * Landing round 14, faq-blog (/faq and the blog). The owner:
 *  - /faq: a clearer, simpler heading than "What sellers ask us, answered";
 *    the storelib.com footer the other marketing pages have; no dark sliver
 *    outside the white sheet's rounded corner beside the first chip
 *    (r14in/13.png); answer everything people look for about Storelib, every
 *    claim matching the code
 *  - the blog: Storelib's branding and the landing page's look (its display
 *    type, its shared width), light, clear cards, a readable article,
 *    related posts, the shared header and footer, with every post, its SEO
 *    metadata and its structured data kept
 *
 * Measured in a browser (390x844, 3x): of the 1,263 pixels outside the
 * sheet's top left curve, 367 were painted light by the chip row's frosted
 * square corner before, 0 after.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { DASHBOARD_LANGUAGES, faqTopics, SUPPORT_EMAIL } from "@/lib/marketing/faq-page"
import { FREE_SEATS, PRO_SEATS } from "@/lib/team/roles"
import { FREE_COMMUNITY_LIMIT } from "@/lib/communities/plan-limit"
import { PAYOUTS, PRODUCT_FILE_LIMIT } from "@/lib/marketing/facts"
import { YEARLY_BILLING_LIVE } from "@/lib/billing/plans"
import { translations } from "@/lib/i18n/translations"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const CLIENT = "components/marketing/faq-page-client.tsx"
const PAGE = "app/(storelib)/(marketing)/faq/page.tsx"
const BLOG = "app/(storelib)/(marketing)/blog"
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—|membership|Shopify|Liquid|What sellers ask|Juno Kada|junokada/i

const topics = faqTopics()
const all = topics.flatMap((t) => t.questions)
const byId = (id: string) => all.find((x) => x.id === id)?.a ?? ""
const html = renderToStaticMarkup(createElement(FaqPageClient, { topics, supportEmail: SUPPORT_EMAIL, helpUrl: "/help" }))
const css = (/const CSS = `([\s\S]*?)`/.exec(read(CLIENT))?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\n/faq: the heading and the footer")
{
  /* Changed on purpose (landing round 15): the owner asked for "Frequently asked questions" (tests/home-landing-r15-faq-blog.test.ts). */
  check("the heading is plain: Frequently asked questions", /<h1 id="fq-title" class="fq-title">Frequently <span>asked questions<\/span><\/h1>/.test(html))
  check("  and the old one is gone", !/What sellers ask/.test(read(CLIENT)))
  const footer = code("components/marketing/conditional-footer.tsx")
  check("/faq is one of the platform pages the footer is drawn on (the header's list had it, this one did not)", /pathname\.startsWith\("\/faq"\) \|\|/.test(footer) && /p\.startsWith\("\/faq"\)/.test(read("components/marketing/conditional-header.tsx")))
}

console.log("\n/faq: the sheet's corner")
{
  check("the sheet clips what it holds to its rounded shape (clip makes no scroll box, so the chip row still sticks)", /\.fq-sheet\{position:relative;z-index:1;overflow:clip;/.test(css) && !/\.fq-sheet\{[^}]*overflow:hidden/.test(css))
  check("the chip row is plain white, with no backdrop filter sampling the dark ground", /\.fq-nav\{position:sticky;top:var\(--fq-top\);z-index:5;margin:0 calc\(var\(--fq-edge\) \* -1\);background:#fff\}/.test(css) && !/backdrop-filter/.test(css))
}

console.log("\n/faq: what people look for, answered from the code")
{
  const want = ["refunds", "taxes", "how-fast-paid", "payout-countries", "file-size", "delivery", "own-domain", "store-website-onepage", "courses", "communities", "bookings", "physical-products", "emails", "analytics", "discounts", "another-platform", "delete-account", "export-data", "data-secure", "team", "languages", "dashboard-language", "fees", "cancel-anytime", "billing-period", "mobile-app", "disputes", "remove-branding"]
  const missing = want.filter((id) => !byId(id))
  check("a question for each of them", missing.length === 0, missing)
  check("every question the round 13 page had keeps its address", ["what-is-storelib", "create-an-account", "coding-skills", "how-long-to-launch", "what-can-i-sell", "list-a-product", "product-limit", "free-products", "another-platform", "how-fast-paid", "payment-methods", "fees", "set-up-payouts", "is-it-free", "grow-plan", "pro-plan", "cancel-anytime", "free-trial", "own-domain", "link-in-bio", "customize-look", "what-is-onepage", "marketplace", "visibility", "reviews", "contact-support", "multiple-stores", "data-secure"].every((id) => byId(id)))
  check("refunds: from Orders, whole or part, a full one closes access, Storelib's fee is not returned (app/api/stripe/refund)", /Orders/.test(byId("refunds")) && /part of it/.test(byId("refunds")) && /full refund also closes their access/.test(byId("refunds")) && /fee on the sale is not returned/.test(byId("refunds")))
  check("tax: the seller's to charge and file, set in Settings, Taxes, digital off until turned on (lib/tax/rules)", /does not collect or file sales tax or VAT/.test(byId("taxes")) && /Settings, Taxes/.test(byId("taxes")) && /off until you turn it on/.test(byId("taxes")))
  check("payouts: settling, Cash out, 1 to 3 business days, the countries from facts", /settles/.test(byId("how-fast-paid")) && /Cash out/.test(byId("how-fast-paid")) && byId("payout-countries").includes(PAYOUTS.regions))
  check("files: the upload limit the routes enforce", byId("file-size").includes(PRODUCT_FILE_LIMIT))
  check("communities: the Free limit from plan-limit", byId("communities").includes(`Free includes ${FREE_COMMUNITY_LIMIT} communities`))
  check("team: the seats from lib/team/roles, refunds stay with the owner", byId("team").includes(`${FREE_SEATS} people besides you`) && byId("team").includes(`for ${PRO_SEATS}`) && /Refunds and deleting the store stay with you/.test(byId("team")))
  check("yearly billing follows YEARLY_BILLING_LIVE", YEARLY_BILLING_LIVE ? /^Yes/.test(byId("billing-period")) : /^Not yet/.test(byId("billing-period")))
  const dashboard = Object.keys(translations).map((c) => new Intl.DisplayNames(["en"], { type: "language" }).of(c.split("-")[0]) ?? c)
  check("the dashboard's languages are the ones lib/i18n has words for", dashboard.every((n) => DASHBOARD_LANGUAGES.includes(n)) && DASHBOARD_LANGUAGES.split(/, | and /).length === dashboard.length, dashboard)
  check("Android is the browser, not a store app (facts LIMITATIONS)", /On Android, Storelib works in the browser/.test(byId("mobile-app")))
  check("deleting: Settings, Security, an emailed code, money to settle first (lib/account/delete-account)", /Settings, Security/.test(byId("delete-account")) && /code we email you/.test(byId("delete-account")) && /left to settle/.test(byId("delete-account")))
  check("no banned words, no em dash, no Shopify, no memberships", !BANNED.test(all.map((x) => `${x.q} ${x.a}`).join(" ") + topics.map((t) => t.title + t.label).join(" ")))
}

console.log("\n/faq: a switch that is off is never promised")
{
  const off = faqTopics({ communities: false, explore: false, physical: false })
  const text = off.flatMap((t) => t.questions.map((x) => `${x.q} ${x.a}`)).join(" ")
  check("with every switch off: no Explore topic, no community, no physical question", !off.some((t) => t.id === "explore") && !off.flatMap((t) => t.questions).some((x) => x.id === "communities" || x.id === "physical-products"))
  check("  and no answer names Explore or a community", !/Explore|communit/i.test(text), text.match(/.{40}(Explore|communit).{40}/i)?.[0])
  const page = code(PAGE)
  check("the page reads the switches and is rebuilt hourly", /const flags = await alternativesFlags\(\)/.test(page) && /export const revalidate = 3600/.test(page) && /faqTopics\(flags\)/.test(page))
}

console.log("\nThe blog: the landing's width and type")
{
  const nav = code(`${BLOG}/_components/blog-nav.tsx`)
  const list = code(`${BLOG}/_blog-listing.tsx`)
  const card = code(`${BLOG}/_components/post-card.tsx`)
  const view = code(`${BLOG}/_components/article-view.tsx`)
  const blocks = code(`${BLOG}/_components/article-blocks.tsx`)
  check("the lists' title, line, pills and posts sit on the landing's shared width (home-wrap, --home-edge, --home-max)", /* Changed on purpose (landing round 15): the title is no longer re-keyed or faded, so its class is a plain string. */ /className="home-wrap pt-10/.test(nav) && /max-w-\[var\(--home-max\)\] min-\[640px\]:px-\[var\(--home-edge\)\]/.test(nav) && /<div className="home-wrap pb-24/.test(list) && !/max-w-\[1240px\]/.test(nav + list))
  check("the title in the landing's display type: 500 weight, tight tracking", /text-\[clamp\(44px,5vw,76px\)\] font-medium leading-\[1\.04\] tracking-\[-0\.05em\]/.test(nav))
  /* Changed on purpose (blog round 15): the owner asked for three to a row at most on a computer, two on a tablet, one on a phone, in Storelib's own card. */
  check("cards one, two from 640px, three from 1024px and never four", /grid-cols-1 gap-5 min-\[640px\]:grid-cols-2 min-\[640px\]:gap-6 min-\[1024px\]:grid-cols-3/.test(list) && !/grid-cols-4/.test(list))
  check("a card: Storelib's card, cover, category in its colour, a 600 weight title", /rounded-2xl border border-\[#e5e7eb\]\/60 bg-white shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\]/.test(card) && /rounded-\[20px\]/.test(card) && /categoryTint\(post\.category\)\.ink/.test(card) && /font-semibold leading-\[1\.3\]/.test(card))
  check("the article title and headings in the same type", /font-medium leading-\[1\.06\] tracking-\[-0\.045em\]/.test(view) && /text-\[28px\] font-medium leading-\[1\.15\] tracking-\[-0\.035em\]/.test(blocks))
  check("the article on the same edge, its reading column kept (720px, 760px beside the rail)", /<div className="home-wrap pb-24/.test(view) && /const COLUMN = "mx-auto w-full max-w-\[720px\]/.test(view))
  check("quotes, code, the author and the older and newer post on the landing's soft surfaces", /border-l-\[3px\] border-\[#7c3aed\]/.test(blocks) && /rounded-2xl bg-\[#f5f5f6\]/.test(blocks) && /rounded-\[20px\] bg-\[#f5f5f6\] p-5/.test(view) && /rounded-\[20px\] bg-\[#f5f5f6\] px-5 py-4/.test(view))
  check("related articles kept, as wide as the site's header and footer at most", /data-blog-related=""/.test(view) && /mx-auto mt-20 max-w-\[1400px\]/.test(view))
  check("hover motion is transform only and off with reduced motion", /group-hover:scale-\[1\.025\] motion-reduce:transition-none/.test(card))
}

console.log("\nThe blog: posts, SEO and structured data untouched")
{
  const post = code(`${BLOG}/[slug]/page.tsx`)
  check("the post still writes BlogPosting, breadcrumbs and video objects", /blogPostingJsonLd\(/.test(post) && /breadcrumbListJsonLd\(/.test(post) && /videoObjectsJsonLd\(/.test(post))
  check("its metadata: canonical, Open Graph article, noindex from the editor", /alternates: \{ canonical, types: BLOG_FEED_ALTERNATE \}/.test(post) && /type: "article"/.test(post) && /noindex/.test(post))
  check("the index still writes the Blog's JSON-LD", /blogJsonLd\(posts/.test(code(`${BLOG}/_blog-index.tsx`)))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 13 entries", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r14-faq-blog\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
