/**
 * ===========================================================================
 *  THE HELP CENTER'S UPSELLS AND BUNDLES GUIDE (lib/help/offer-articles.ts)
 * ===========================================================================
 * The articles are in the Products topic, linked, searchable and in the
 * sitemap like every other; their words are the screens' own words; their
 * pictures are real files in public/help/offers at the size the table says.
 *
 * Run with:  npx tsx tests/help-offers.test.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { articleText, helpArticle, helpArticlesFor, helpRelated, helpSectionsIn, type HelpArticle } from "../lib/help/articles"
import { OFFER_ARTICLES } from "../lib/help/offer-articles"
import { OFFER_SHOTS } from "../lib/help/offer-shots"
import { searchHelp } from "../lib/help/search"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const A = OFFER_ARTICLES
const text = (slug: string) => { const a = A.find((x) => x.slug === slug)!; return [a.title, a.summary, articleText(a)].join(" ") }
const all = A.map((a) => text(a.slug)).join(" ")

console.log("\nIn the Help Center")
check("seven articles, every one under Products > Upsells and bundles", A.length === 7 && A.every((a) => a.category === "products" && a.section === "Upsells and bundles"))
check("shown with physical commerce off and on", A.every((a) => helpArticlesFor(false).includes(a) && helpArticlesFor(true).includes(a)))
check("the Products topic lists them as their own group", helpSectionsIn("products").some((g) => g.title === "Upsells and bundles" && g.articles.length === A.length))
check("each found at its address", A.every((a) => helpArticle("products", a.slug) === a))
check("each has a date it was checked and something to read next", A.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.updated ?? "") && helpRelated(a).length >= 1))
check("titles fit a search result, summaries a meta description", A.every((a) => a.title.length <= 65 && a.summary.length >= 70 && a.summary.length <= 160), A.map((a) => [a.slug, a.title.length, a.summary.length]))
const searches: [string, string][] = [["quantity break", "quantity-breaks"], ["buy 2 get 1 free", "quantity-breaks"], ["bundle", "bundles"], ["upsell", "upsells"], ["cross sell", "upsells"], ["bundles and upsells block", "offers-on-your-website"], ["offer not showing", "offers-common-problems"], ["discount code offer", "how-offers-are-priced"]]
for (const [q, slug] of searches) check(`searching "${q}" finds ${slug} in the first five`, searchHelp(q).slice(0, 5).some((r) => r.article.slug === slug), searchHelp(q).slice(0, 5).map((r) => r.article.slug))
const links = [...JSON.stringify(A).matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
check("every link lands on an article that is always shown", links.length >= 5 && links.every((h) => { const m = h.match(/^\/help\/([^/]+)\/([^/]+)$/); return !!m && !!helpArticle(m[1], m[2]) && m[1] !== "physical-products" }), links)
check("no related article is in a topic that can be hidden", A.every((a) => (a.related ?? []).every((r) => !r.startsWith("physical-products/"))))

console.log("\nThe copy")
check("no em or en dashes", !/[—–]/.test(JSON.stringify(A)))
const banned = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform", "game changer", "leverage", "delve"]
check("none of the banned words", !banned.some((w) => new RegExp(`\\b${w}`, "i").test(all)), banned.filter((w) => new RegExp(`\\b${w}`, "i").test(all)))
check("no Shopify or Liquid in what readers see", !/Shopify|Liquid/.test(all))

console.log("\nThe screens' own words")
/* The editor is one page drawn from three files: the page (offer-editor), its fields (offer-fields: the tiers, the product picker) and what it shares with the list (offer-parts: the preview, the words for places and states). */
const editor = ["app/app/offers/offer-editor.tsx", "app/app/offers/offer-fields.tsx", "app/app/offers/offer-parts.tsx"].map(read).join("\n")
const list = read("app/app/offers/offers-client.tsx")
for (const w of ["Name buyers see", "Products in the bundle", "Product to offer", "Show it when the cart has", "Certain products", "And the rest of the order is at least", "Show it on", "Try it in a cart", "Price this cart", "Dates and limits", "Discounted sets per order", "Discounted items per order", "Discount codes can be used too", "Applies to", "Add tier", "Badge", "Preview", "Active", "Delete offer", "Discard changes?", "Keep editing"]) check(`editor: "${w}"`, editor.includes(w) && all.includes(w))
for (const w of ["Upsells and bundles", "New offer", "Create quantity break", "Move up", "Move down", "Sold, 90 days", "A product in it was deleted"]) check(`list: "${w}"`, list.includes(w) && all.includes(w))
const block = JSON.parse(read("themes/default/sections/product.json")).blocks.find((b: { type: string }) => b.type === "offers")
check("the block's name and every setting are in the website article", block.name === "Bundles and upsells" && block.fields.every((f: { label: string }) => text("offers-on-your-website").includes(f.label)), block.fields.map((f: { label: string }) => f.label).filter((l: string) => !text("offers-on-your-website").includes(l)))
check("the editor note on a product with no offer is quoted as it reads", read("components/website-builder/sections/renderers/product/offers-block.tsx").includes("No bundle, quantity break or upsell shows this product yet") && all.includes("No bundle, quantity break or upsell shows this product yet"))
check("the tier limits are the code's", /MAX_TIERS = 6/.test(read("lib/offers/pricing.ts")) && /MAX_FREE_QUANTITY = 10/.test(read("lib/offers/pricing.ts")) && /Up to six tiers\. Buy is 1 to 99, Free is 0 to 10, a percent is up to 90/.test(all))

console.log("\nThe screenshots")
const images = A.flatMap((a: HelpArticle) => a.body.filter((b): b is Extract<typeof b, { type: "image" }> => b.type === "image"))
check("every article but the common problems has a real screenshot", A.filter((a) => a.slug !== "offers-common-problems").every((a) => a.body.some((b) => b.type === "image")))
check("each is a WebP in public/help/offers that exists", images.every((b) => /^\/help\/offers\/[a-z0-9-]+\.webp$/.test(b.src) && existsSync(join(process.cwd(), "public", b.src)) && (!b.phone || existsSync(join(process.cwd(), "public", b.phone.src)))))
check("each says what it shows, for a screen reader", images.every((b) => b.alt.length >= 20))
const files = readdirSync(join(process.cwd(), "public/help/offers")).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5))
const used = new Set(images.flatMap((b) => [b.src, b.phone?.src].filter((x): x is string => !!x)).map((s) => s.replace(/^\/help\/offers\/|\.webp$/g, "")))
check("every file is used, and the size table lists exactly the files", files.every((f) => used.has(f)) && files.length === Object.keys(OFFER_SHOTS).length && files.every((f) => f in OFFER_SHOTS), files.filter((f) => !used.has(f)))
const webpSize = (f: string) => { const b = readFileSync(join(process.cwd(), "public/help/offers", `${f}.webp`)); const chunk = b.toString("ascii", 12, 16); if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]; if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)] } return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] }
check("each is drawn at 2x and its size in the table is half the file's", files.every((f) => { const [w, h] = webpSize(f); const [cw, ch] = OFFER_SHOTS[f as keyof typeof OFFER_SHOTS]; return Math.abs(w / 2 - cw) <= 1 && Math.abs(h / 2 - ch) <= 1 }))
check("small enough to load quickly (under 200 KB each)", files.every((f) => readFileSync(join(process.cwd(), "public/help/offers", `${f}.webp`)).length < 200_000))
check("taken from the real components, priced by lib/offers", /from "@\/app\/app\/offers\/offers-client"/.test(read("scripts/render-help-offer-shots.tsx")) && /from "@\/app\/app\/offers\/offer-editor"/.test(read("scripts/render-help-offer-shots.tsx")) && /<OfferEditor /.test(read("scripts/render-help-offer-shots.tsx")) && /applyOffers\(/.test(read("scripts/render-help-offer-shots.tsx")) && /tryCart\(/.test(read("scripts/render-help-offer-shots.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
