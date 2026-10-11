/**
 * ===========================================================================
 *  ROUND 23: THE PHYSICAL PRODUCTS GUIDE AND THE HELP CENTER (H23)
 * ===========================================================================
 * What this round promised, held:
 *
 *   every physical commerce topic has its own article, and each one is
 *   reachable, dated, linked to what to read next, and searchable
 *   what the articles say is what the product does: the words on the
 *   buttons, the zone order, the rate steps, the carriers, the emails, the
 *   fulfilment answers and the integrations are read from the same code
 *   the product runs
 *   the screenshots are real files at their real size, with a phone picture
 *   where the screen is wide
 *   SEO: unique titles and descriptions, canonicals, JSON-LD (TechArticle,
 *   BreadcrumbList, FAQPage, HowTo, CollectionPage), sitemap rows with
 *   lastmod and images, moved articles sent on for good
 *   the Help Center's pages: no "What happens if" highlight on the home,
 *   one plain line instead; an article page with its contents, previous and
 *   next, and related articles
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ALL_HELP_ARTICLES,
  HELP_MOVED,
  POPULAR_HELP,
  articleText,
  helpArticle,
  helpArticlePath,
  helpArticlesIn,
  helpCategory,
  helpImages,
  helpNeighbours,
  helpRelated,
  helpToc,
  headingId,
  readingMinutes,
} from "../lib/help/articles"
import { PHYSICAL_ARTICLES, PHYSICAL_CATEGORY, PHYSICAL_SECTIONS } from "../lib/help/physical-articles"
import { PHYSICAL_SHOTS } from "../lib/help/physical-shots"
import { helpArticleJsonLd, helpCategoryJsonLd, helpFaq, helpHowTo, helpHomeJsonLd } from "../lib/help/structured-data"
import { searchHelp } from "../lib/help/search"
import { CARRIER_LIST } from "../lib/physical/carriers"
import { CUSTOMER_EMAILS } from "../lib/emails/customer-catalog"
import { PROVIDERS } from "../lib/physical/providers"
import { TRACKERS, TRACKER_ORDER } from "../lib/store/tracking"
import { tierPrice, zoneFor } from "../lib/physical/rates"
import type { ShippingProfile, ShippingZone } from "../lib/physical/types"
import { PLATFORM_DISALLOW } from "../lib/seo/indexing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const P = PHYSICAL_ARTICLES
const art = (slug: string) => P.find((a) => a.slug === slug)!
const text = (slug: string) => {
  const a = art(slug)
  return a ? [a.title, a.summary, articleText(a)].join(" ") : ""
}

/* ── 1. Every topic the owner listed has its own article ──────────────── */
console.log("\n1. Every physical commerce topic has an article")
const TOPICS: Record<string, string> = {
  "zero to 100": "zero-to-100",
  shipping: "shipping-profiles-zones-and-rates",
  rates: "shipping-rate-examples",
  zones: "shipping-zones",
  packages: "units-and-packages",
  locations: "locations",
  inventory: "inventory-and-stock",
  "low stock": "low-stock-alerts",
  taxes: "taxes",
  returns: "returns-physical",
  refunds: "refund-a-physical-order",
  "local pickup": "local-pickup",
  tracking: "tracking-and-order-status",
  "customer emails": "physical-order-emails",
  "checkout settings": "checkout-settings",
  "sales channels": "sales-channels",
  domains: "store-domain",
  integrations: "integrations",
  "fulfilment types": "fulfillment-methods",
  "store details": "store-details",
}
for (const [topic, slug] of Object.entries(TOPICS)) check(`${topic}: /help/physical-products/${slug}`, !!helpArticle("physical-products", slug))
check("each topic has its own article, not one shared", new Set(Object.values(TOPICS)).size === Object.keys(TOPICS).length)
for (const [topic, slug] of Object.entries(TOPICS)) {
  const words = topic === "zero to 100" ? "zero to 100" : topic.replace(/s$/, "").replace("fulfilment type", "fulfil")
  const ranked = searchHelp(topic, 5, { physical: true }).map((r) => r.article.slug)
  check(`  searching "${topic}" finds it in the first five`, ranked.includes(slug), { words, ranked })
}
check("the guide reads in eleven groups, start to getting paid", PHYSICAL_SECTIONS.length === 11 && PHYSICAL_SECTIONS[0] === "Getting started" && PHYSICAL_SECTIONS[PHYSICAL_SECTIONS.length - 1] === "Payouts, fees and policies")
check("every group has at least one article", PHYSICAL_SECTIONS.every((s) => P.some((a) => a.section === s)))
check("Zero to 100 still opens the guide", P[0].slug === "zero-to-100")

/* ── 2. Each article: dated, related, reachable, well formed ──────────── */
console.log("\n2. Each article is dated, linked and well formed")
check("every physical article says when it was last checked (YYYY-MM-DD)", P.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.updated ?? "")), P.filter((a) => !a.updated).map((a) => a.slug))
const relatedMissing = P.flatMap((a) => (a.related ?? []).filter((r) => {
  const [c, s] = r.includes("/") ? r.split("/") : [a.category, r]
  return !helpArticle(c, s)
}).map((r) => `${a.slug} -> ${r}`))
check("every related article it names exists", relatedMissing.length === 0, relatedMissing)
check("every physical article has something to read next", P.every((a) => helpRelated(a).length >= 1), P.filter((a) => helpRelated(a).length === 0).map((a) => a.slug))
check("related never repeats the article itself", P.every((a) => !helpRelated(a).some((r) => r.slug === a.slug)))
check("previous and next walk the topic in order, end to end", (() => {
  const list = helpArticlesIn(PHYSICAL_CATEGORY.slug)
  return list.every((a, i) => helpNeighbours(a).previous === (list[i - 1] ?? null) && helpNeighbours(a).next === (list[i + 1] ?? null))
})())
const allTitles = ALL_HELP_ARTICLES.map((a) => a.title.toLowerCase())
const allSummaries = ALL_HELP_ARTICLES.map((a) => a.summary.toLowerCase())
check("every title in the Help Center is unique", new Set(allTitles).size === allTitles.length, allTitles.filter((t, i) => allTitles.indexOf(t) !== i))
check("every description in the Help Center is unique", new Set(allSummaries).size === allSummaries.length)
check("physical titles fit a search result (at most 65 characters)", P.every((a) => a.title.length <= 65), P.filter((a) => a.title.length > 65).map((a) => `${a.slug} ${a.title.length}`))
check("physical descriptions are 70 to 160 characters", P.every((a) => a.summary.length >= 70 && a.summary.length <= 160), P.filter((a) => a.summary.length < 70 || a.summary.length > 160).map((a) => `${a.slug} ${a.summary.length}`))
check("headings get unique ids in every article", ALL_HELP_ARTICLES.every((a) => { const ids = helpToc(a).map((t) => t.id); return new Set(ids).size === ids.length }))
check("a heading's id is its words", headingId("Set up your General profile") === "set-up-your-general-profile" && headingId("Step 1. Set up payments") === "step-1-set-up-payments")
check("reading time is a whole number of minutes, at least one", P.every((a) => Number.isInteger(readingMinutes(a)) && readingMinutes(a) >= 1))

/* ── 3. The words match the product ───────────────────────────────────── */
console.log("\n3. What the articles say is what the product does")
const orderPanel = read("components/physical/order-panel.tsx")
const orderDetail = read("app/app/orders/order-detail.tsx")
const guideText = P.map((a) => articleText(a)).join(" ")
for (const words of ["Fulfill items", "Send shipment details to the buyer", "Mark as delivered", "Mark ready for pickup", "Mark picked up", "Not ready after all", "Cancel fulfillment", "Edit tracking", "Email the buyer the new number", "Mark as in progress", "Packing slip", "Start return", "Mark as in transit", "Cancel order", "Tell the buyer it's ready"]) {
  check(`order page: "${words}" is on the screen and in the guide`, orderPanel.includes(words) && guideText.includes(words))
}
check("Refund lives under More actions and in the payment card, and only the owner sees it", orderDetail.includes('label: "Refund"') && orderDetail.includes("More actions") && /canRefund && refundable/.test(orderDetail) && text("refund-a-physical-order").includes("More actions") && text("refund-a-physical-order").includes("payment card") && text("refund-a-physical-order").includes("Only the store's owner can refund"))
check("the guide no longer says Mark as shipped, which the order page doesn't have", !/Mark as shipped/.test(guideText) && !orderPanel.includes(">Mark as shipped<"))
const store = read("components/app/settings/store-details-panel.tsx")
for (const words of ["Choose a logo", "Store name", "Contact email", "Where your store is based", "Where orders ship from"]) check(`store details: "${words}"`, store.includes(words) && text("store-details").includes(words))
const shipping = read("components/physical/shipping-settings.tsx")
for (const words of ["Low stock line", "Email me when stock runs low", "Add shipping zone", "Rest of world", "Accept returns", "Return window", "Ships orders from here", "Usually ready in", "Pickup instructions"]) check(`shipping settings: "${words}"`, shipping.includes(words) && guideText.includes(words))
const models = [...shipping.matchAll(/\{ id: "[a-z_]+", title: "([^"]+)", line: "([^"]+)" \}/g)].map((m) => [m[1], m[2]])
check("the fulfilment answers in the guide are the seven in Settings, word for word", models.length === 7 && models.every(([t, l]) => text("fulfillment-methods").includes(t) && text("fulfillment-methods").includes(l)), models)
check("every carrier Storelib makes a tracking link for is named in the tracking article", CARRIER_LIST.every((c) => text("tracking-and-order-status").includes(c.name)), CARRIER_LIST.filter((c) => !text("tracking-and-order-status").includes(c.name)).map((c) => c.name))
const emails = CUSTOMER_EMAILS.filter((e) => e.physical && !e.id.startsWith("return_")).map((e) => e.name)
check("every order email in Settings is in the customer emails article", emails.every((n) => text("physical-order-emails").includes(n)), emails.filter((n) => !text("physical-order-emails").includes(n)))
check("  and the returns emails too", text("physical-order-emails").includes("Return approved, received and complete"))
const live = PROVIDERS.filter((p) => p.availability === "live").map((p) => p.name)
check("the integrations that send orders today are the ones the article says work today", live.length >= 3 && live.every((n) => text("integrations").includes(n)), live)
check("  and the ones that only keep a key are said to not send orders yet", PROVIDERS.filter((p) => p.availability !== "live").every((p) => text("integrations").includes(p.name)) && /isn't available yet|aren't available yet/.test(text("integrations")))
check("every analytics and pixel integration is named", TRACKER_ORDER.every((id) => text("integrations").includes(TRACKERS[id].name)), TRACKER_ORDER.filter((id) => !text("integrations").includes(TRACKERS[id].name)))

/* The shipping rules the zones article states, run against the real zoneFor. */
const zone = (id: string, countries: string[], regions: string[], restOfWorld = false): ShippingZone => ({ id, profileId: "p", name: id, countries, regions, restOfWorld, rates: [] })
const lower48: ShippingProfile = { id: "p", name: "General", isDefault: true, zones: [zone("lower48", [], ["US-CA", "US-NY", "US-TX"]), zone("world", [], [], true)] }
check("zones: a state zone wins for its state", zoneFor(lower48, { country: "US", region: "CA" })?.id === "lower48")
check("zones: a state left out of a states only country is not shipped to, even with Rest of world", zoneFor(lower48, { country: "US", region: "AK" }) === null)
check("zones: any other country falls to Rest of world", zoneFor(lower48, { country: "DE", region: null })?.id === "world")
const both: ShippingProfile = { id: "p", name: "General", isDefault: true, zones: [zone("us", ["US"], []), zone("alaska", [], ["US-AK"]), zone("world", [], [], true)] }
check("zones: a state zone wins over a whole country zone", zoneFor(both, { country: "US", region: "AK" })?.id === "alaska" && zoneFor(both, { country: "US", region: "CA" })?.id === "us")
const noWorld: ShippingProfile = { id: "p", name: "General", isDefault: true, zones: [zone("us", ["US"], [])] }
check("zones: no zone and no Rest of world means no shipping", zoneFor(noWorld, { country: "FR", region: null }) === null)
const steps = [{ from: 0, priceCents: 800 }, { from: 3000, priceCents: 400 }, { from: 8000, priceCents: 0 }]
check("rates: the order price example pays $8, $4 and nothing at $25, $45 and $95", tierPrice(steps, 2500) === 800 && tierPrice(steps, 4500) === 400 && tierPrice(steps, 9500) === 0)
check("  and the article says exactly that", text("shipping-rate-examples").includes("An order of $25 pays $8, $45 pays $4, $95 pays nothing"))

/* ── 4. Screenshots ───────────────────────────────────────────────────── */
console.log("\n4. Screenshots of the real screens, at desktop and phone sizes")
const images = P.flatMap((a) => a.body.filter((b): b is Extract<typeof b, { type: "image" }> => b.type === "image"))
check("the guide has screenshots", images.length >= 40, images.length)
check("each has its size, so the page keeps its space while it loads", images.every((b) => b.width > 0 && b.height > 0 && (!b.phone || (b.phone.width > 0 && b.phone.height > 0))))
const phones = images.filter((b) => b.phone)
check("wide screens have a phone picture too (at least 12)", new Set(phones.map((b) => b.src)).size >= 12, new Set(phones.map((b) => b.src)).size)
check("each phone picture is a file, drawn at phone width", phones.every((b) => existsSync(join(process.cwd(), "public", b.phone!.src)) && b.phone!.width <= 390), phones.filter((b) => !existsSync(join(process.cwd(), "public", b.phone!.src))).map((b) => b.phone!.src))
check("a phone picture is in the size table with its screen", Object.keys(PHYSICAL_SHOTS).filter((k) => k.endsWith("-phone")).every((k) => k.replace(/-phone$/, "") in PHYSICAL_SHOTS))
for (const slug of ["store-details", "shipping-zones", "low-stock-alerts", "tracking-and-order-status", "integrations", "ship-your-orders"]) {
  check(`  ${slug} shows the real screen`, helpImages(art(slug)).length >= 1)
}
check("the order shots are of the order page as it is now (Fulfill items)", "order-fulfill-items" in PHYSICAL_SHOTS && !("order-mark-shipped" in PHYSICAL_SHOTS))
check("the low stock email and shipping email are the real templates, not drawings", "low-stock-email" in PHYSICAL_SHOTS && "shipping-email" in PHYSICAL_SHOTS && /lowStockEmail\(/.test(read("scripts/render-help-shots.tsx")) && /shipmentEmail\(/.test(read("scripts/render-help-shots.tsx")))
check("the guide draws no picture of a screen: figures are only diagrams", P.every((a) => a.body.every((b) => b.type !== "figure" || ["order-journey", "profiles", "tiers", "order-steps", "split-order"].includes(b.figure))), P.flatMap((a) => a.body.filter((b) => b.type === "figure").map((b) => (b as { figure: string }).figure)))
check("the demo order has its prices (no $NaN on the order shots)", /unitCents: 3200/.test(read("scripts/render-help-shots.tsx")))

/* ── 5. SEO ───────────────────────────────────────────────────────────── */
console.log("\n5. SEO")
const page = read("app/help/[category]/[article]/page.tsx")
const catPage = read("app/help/[category]/page.tsx")
const home = read("app/help/page.tsx")
check("article pages: own title, description, canonical, Open Graph and Twitter", /title: \{ absolute: `\$\{article\.title\} \| Storelib Help Center` \}/.test(page) && /alternates: \{ canonical: path \}/.test(page) && /openGraph:/.test(page) && /twitter:/.test(page))
check("  the social card is the article's first screenshot", /helpImages\(article\)\[0\]/.test(page))
check("topic pages and the home have their own titles and canonicals", /alternates: \{ canonical: `\/help\/\$\{category\.slug\}` \}/.test(catPage) && /alternates: \{ canonical: "\/help" \}/.test(home))
const z = art("zero-to-100")
const ld = helpArticleJsonLd(z, helpCategory("physical-products")!) as { "@graph": Record<string, unknown>[] }
const types = ld["@graph"].map((g) => g["@type"])
check("an article's JSON-LD is a TechArticle with its breadcrumbs", types.includes("TechArticle") && types.includes("BreadcrumbList"), types)
const tech = ld["@graph"].find((g) => g["@type"] === "TechArticle")!
check("  with dateModified, its screenshots and Storelib as publisher", tech.dateModified === z.updated && Array.isArray(tech.image) && (tech.image as string[]).every((u) => u.startsWith("https://storelib.com/help/physical/")) && (tech.publisher as { name: string }).name === "Storelib")
check("  a HowTo for its first numbered steps", types.includes("HowTo") && (helpHowTo(z)?.steps.length ?? 0) >= 3)
const crumbs = ld["@graph"].find((g) => g["@type"] === "BreadcrumbList") as { itemListElement: { item: string }[] }
check("  breadcrumbs: Help Center, Physical products, the article", crumbs.itemListElement.length === 3 && crumbs.itemListElement[2].item === "https://storelib.com/help/physical-products/zero-to-100")
const q = art("physical-products-questions")
const qa = helpFaq(q)
const qld = helpArticleJsonLd(q, helpCategory("physical-products")!) as { "@graph": Record<string, unknown>[] }
check("the common questions article is an FAQPage, every question with its answer", q.faq === true && qa.length >= 7 && qa.every((x) => x.q.endsWith("?") && x.a.length > 20) && qld["@graph"].some((g) => g["@type"] === "FAQPage"), qa.length)
check("an article without real questions gets no FAQPage", !(helpArticleJsonLd(art("taxes"), helpCategory("physical-products")!) as { "@graph": Record<string, unknown>[] })["@graph"].some((g) => g["@type"] === "FAQPage"))
const cld = helpCategoryJsonLd(PHYSICAL_CATEGORY, helpArticlesIn("physical-products")) as { "@graph": { "@type": string; mainEntity?: { numberOfItems: number } }[] }
check("the topic page is a CollectionPage listing every article", cld["@graph"][0]["@type"] === "CollectionPage" && cld["@graph"][0].mainEntity?.numberOfItems === helpArticlesIn("physical-products").length)
check("the home says how to search it", (helpHomeJsonLd("x") as { potentialAction: { target: string } }).potentialAction.target.includes("/help/search?q={search_term_string}"))
check("JSON-LD is printed through jsonLdScript on all three pages", [page, catPage, home].every((s) => /jsonLdScript\(/.test(s)))
const sitemap = read("lib/seo/sitemaps.ts")
check("the sitemap gives each article its lastmod and screenshots", /lastModified: a\.updated \?\? null, images: helpImages\(a\)/.test(sitemap))
check("  and each topic the newest of its articles", /lastModified: newestOf\(\.\.\.helpArticlesIn\(c\.slug\)\.map\(\(a\) => a\.updated\)\)/.test(sitemap))
check("robots let search engines read /help", PLATFORM_DISALLOW.length > 5 && !PLATFORM_DISALLOW.some((d) => d.startsWith("/help")) && /allow: "\/"/.test(read("app/robots.ts")))
check("the old Units and packages address sends people on, for good", HELP_MOVED["physical-products/tax-and-units"] === "physical-products/units-and-packages" && /permanentRedirect\(`\/help\/\$\{moved\}`\)/.test(page) && /HELP_MOVED\)\.map/.test(page))
check("  and isn't listed twice in the sitemap", !ALL_HELP_ARTICLES.some((a) => a.slug === "tax-and-units"))
check("pages are built ahead (static) and revalidate", /export const revalidate = 60/.test(page) && /dynamicParams = false/.test(page))

/* ── 6. The Help Center's pages ───────────────────────────────────────── */
console.log("\n6. The Help Center's pages")
check("no \"What happens if\" highlight on the Help Center home", !/What happens if/.test(home) && !/data-help-questions-link/.test(home))
check("  one plain line says the main thing instead", /data-help-questions-line/.test(home) && /A problem with an order\?/.test(home))
check("the questions page is named plainly", /Order problems, answered/.test(read("app/help/questions/page.tsx")) && !/What happens if\.\.\./.test(read("app/help/questions/page.tsx")))
check("the home leads with search, then popular articles, then topics", home.indexOf("<HelpSearch") < home.indexOf("Popular articles") && home.indexOf("Popular articles") < home.indexOf("Browse by topic"))
check("every popular article exists", POPULAR_HELP.every((p) => { const [c, s] = p.split("/"); return !!helpArticle(c, s) }))
check("an article page has its contents, beside it and folded on a phone", /<OnThisPage items=\{toc\} variant="side" \/>/.test(page) && /<OnThisPage items=\{toc\} variant="inline" \/>/.test(page))
check("  previous and next, related articles, and the date it was checked", /data-help-prevnext/.test(page) && /data-help-related/.test(page) && /Updated <time dateTime/.test(page))
const parts = read("components/help/help-parts.tsx")
check("a heading carries the id its contents link to, clear of the sticky header", /id=\{idOf\(b\.text\)\}/.test(parts) && /scroll-mt-24/.test(parts))
check("a screenshot shows its phone picture on a phone", /<source media="\(max-width: 639px\)" srcSet=\{b\.phone\.src\}/.test(parts))
check("a table becomes stacked rows on a phone instead of scrolling sideways", /content-\[attr\(data-label\)/.test(parts) && /max-sm:block/.test(parts))
const helpUi = [home, catPage, page, parts, read("components/help/toc-spy.tsx"), read("lib/help/structured-data.ts")].join("\n")
check("no purple gradient or icon library in the Help Center", !/bg-gradient|from-\[#8b5cf6\]|from "lucide-react"/.test(helpUi))

/* ── 7. House rules ───────────────────────────────────────────────────── */
console.log("\n7. Copy")
const raw = JSON.stringify(P) + JSON.stringify(PHYSICAL_CATEGORY) + helpUi
check("no em or en dashes in the guide or the pages", !/[—–]/.test(raw))
const banned = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform"]
check("none of the banned words", !banned.some((w) => new RegExp(`\\b${w}`, "i").test(raw)), banned.filter((w) => new RegExp(`\\b${w}`, "i").test(raw)))
check("short sentences: the guide averages under 20 words a sentence", (() => {
  const sentences = guideText.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 2)
  const avg = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length
  return avg < 20
})())
check("every link in the guide goes to an article or a developer page", (() => {
  const links = [...JSON.stringify(P).matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
  return links.every((h) => {
    const m = h.match(/^\/help\/([^/]+)\/([^/]+)$/)
    return m ? !!helpArticle(m[1], m[2]) : h.startsWith("/developers/")
  })
})())
check("every app link into the guide lands (no old slugs)", (() => {
  const files = ["lib/settings/explainers.ts", "components/physical/shipping-settings.tsx", "components/app/settings/taxes-panel.tsx", "lib/help/questions.ts"]
  const links = files.flatMap((f) => [...read(f).matchAll(/\/help\/physical-products\/([a-z0-9-]+)/g)].map((m) => m[1]))
  return links.length >= 8 && links.every((s) => !!helpArticle("physical-products", s))
})())
check("the article path helper", helpArticlePath({ category: "physical-products", slug: "shipping-zones" }) === "/help/physical-products/shipping-zones")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
