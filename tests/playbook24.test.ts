/**
 * ===========================================================================
 *  ROUND 24: THE PHYSICAL PRODUCTS PLAYBOOK (P24)
 * ===========================================================================
 * One article, /help/physical-products/playbook, that tells a seller in plain
 * words what happens when someone orders: the setup checklist, every way to
 * fulfil, the order from Pay to the door, what to do when things go wrong,
 * every connection, and a test order. What this suite holds:
 *
 *   the article has its seven parts, in order, and each part the shape the
 *   owner asked for (what it is, why, where, how; what you connect, what
 *   happens, what you do, how tracking reaches the buyer; the buyer sees,
 *   you see, you do)
 *   every button and screen it names is in the code that draws it, and
 *   every integration it lists is one the catalog has
 *   it never promises courier tracking without saying it needs Storelib's
 *   tracking on, and never calls Stripe test mode something a live store has
 *   its screenshots are real files, under 200 KB, with phone pictures
 *   it is reachable: Start here on the topic page, Settings › Shipping, its
 *   How it works, the empty Orders page, Zero to 100, the sitemap
 *   SEO: a TechArticle and its breadcrumbs, no FAQPage or HowTo (round 45)
 *   the other articles no longer say what round 24 made untrue
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ArticleBody } from "@/components/help/help-parts"
import { articleText, helpArticle, helpArticlesFor, helpArticlesIn, helpCategory, helpToc, type HelpBlock } from "@/lib/help/articles"
import { PHYSICAL_ARTICLES, PHYSICAL_CATEGORY } from "@/lib/help/physical-articles"
import { PHYSICAL_SHOTS } from "@/lib/help/physical-shots"
import { helpArticleJsonLd } from "@/lib/help/structured-data"
import { PROVIDERS } from "@/lib/physical/providers"
import { EXPLAINERS } from "@/lib/settings/explainers"
import { HELP_TOPICS } from "@/lib/help/questions"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const a = helpArticle("physical-products", "playbook")!
const body = a?.body ?? []
const text = a ? [a.title, a.summary, articleText(a)].join(" ") : ""

/** The blocks under a main heading, up to the next one. */
function part(heading: string): HelpBlock[] {
  const i = body.findIndex((b) => b.type === "h" && b.text === heading)
  if (i < 0) return []
  const j = body.findIndex((b, k) => k > i && b.type === "h")
  return body.slice(i + 1, j < 0 ? undefined : j)
}
/** Each smaller heading in a part with the labels of the facts right under it. */
function subs(blocks: HelpBlock[]): { title: string; labels: string[]; blocks: HelpBlock[] }[] {
  const out: { title: string; labels: string[]; blocks: HelpBlock[] }[] = []
  for (const b of blocks) {
    if (b.type === "sub") out.push({ title: b.text, labels: [], blocks: [] })
    else if (out.length) {
      out[out.length - 1].blocks.push(b)
      if (b.type === "facts" && out[out.length - 1].labels.length === 0) out[out.length - 1].labels = b.items.map(([l]) => l)
    }
  }
  return out
}

/* ── 1. The article and its seven parts ───────────────────────────────── */
console.log("\n1. One flagship article, in seven parts")
check("it is at /help/physical-products/playbook", !!a)
check("  in Getting started, right after Zero to 100 (which still opens the guide)", a?.section === "Getting started" && PHYSICAL_ARTICLES[0].slug === "zero-to-100" && PHYSICAL_ARTICLES[1].slug === "playbook")
check("  its title says what it is and fits a search result", /playbook/i.test(a?.title ?? "") && /customer's door/.test(a?.title ?? "") && (a?.title.length ?? 99) <= 65, a?.title)
check("  its description is 70 to 160 characters", (a?.summary.length ?? 0) >= 70 && (a?.summary.length ?? 0) <= 160, a?.summary.length)
const PARTS = ["The big picture", "The setup checklist", "Choose how you fulfil", "What happens when someone orders", "After delivery, and when things go wrong", "Connections at a glance", "How to check it all works"]
const toc = helpToc(a).map((t) => t.text)
check("the seven parts are its contents, in order", PARTS.every((p, i) => toc.indexOf(p) === i), toc)
check("  and the smaller headings stay out of the contents list", !toc.some((t) => /^Step \d|^\d+\. |^What if/.test(t)))
const big = part("The big picture").find((b) => b.type === "p") as Extract<HelpBlock, { type: "p" }> | undefined
check("the big picture is five sentences", !!big && big.text.split(/(?<=[.!?])\s+/).filter(Boolean).length === 5, big?.text)

/* ── 2. The setup checklist ────────────────────────────────────────────── */
console.log("\n2. The setup checklist")
const setup = subs(part("The setup checklist"))
const SETUP = ["Store details and Business details", "Payments", "Locations", "Shipping zones and rates", "Packages", "Taxes", "Checkout settings", "Customer emails", "Returns", "A product with variants and stock", "Your website and domain", "A test order"]
check("twelve items, numbered, in the owner's order", setup.length === 12 && SETUP.every((t, i) => setup[i]?.title === `${i + 1}. ${t}`), setup.map((s) => s.title))
check("  each says what it is, why it matters, where and how", setup.every((s) => s.labels.join("|") === "What it is|Why it matters|Where|How"), setup.filter((s) => s.labels.join("|") !== "What it is|Why it matters|Where|How").map((s) => s.title))
check("  each but the test order has a screenshot of its real screen", setup.slice(0, 11).every((s) => s.blocks.some((b) => b.type === "image")), setup.filter((s) => !s.blocks.some((b) => b.type === "image")).map((s) => s.title))

/* ── 3. Every way to fulfil ────────────────────────────────────────────── */
console.log("\n3. Choose how you fulfil")
const ways = subs(part("Choose how you fulfil"))
const WAYS = ["Ship it yourself", "Shippo or EasyPost", "Your own warehouse", "ShipStation", "Printful, Printify and Gelato", "CJ Dropshipping", "A supplier by email", "Your own system, by webhook", "A fulfillment center (3PL)", "Local delivery", "Local pickup", "A mix of these"]
check("one part per way: yourself, labels, warehouse, ShipStation, print on demand, CJ, supplier email, webhook, 3PL, local delivery, pickup, a mix", WAYS.every((w) => ways.some((s) => s.title.includes(w))), ways.map((s) => s.title))
const four = ways.filter((s) => !s.title.startsWith("A mix"))
check("  each says what you connect, what happens, what you do and how tracking reaches the buyer", four.every((s) => s.labels[0] === "What you connect" && s.labels.includes("When an order comes in") && s.labels.includes("What you do") && s.labels[s.labels.length - 1] === "How tracking reaches the buyer"), four.map((s) => `${s.title}: ${s.labels.join("|")}`))

/* ── 4. The order, from Pay to the door ────────────────────────────────── */
console.log("\n4. What happens when someone orders")
const steps = subs(part("What happens when someone orders"))
check("nine steps, Pay to the order page", steps.length === 9 && steps.every((s, i) => s.title.startsWith(`Step ${i + 1}.`)), steps.map((s) => s.title))
check("  steps 1 to 8 say what the buyer sees, what you see and what you do", steps.slice(0, 8).every((s) => s.labels[0] === "The buyer sees" && s.labels.includes("You see") && s.labels[s.labels.length - 1] === "You do"), steps.map((s) => s.labels.join("|")))
const stepText = JSON.stringify(steps.map((s) => s.blocks))
check("  payment, stock held, emails both ways, Orders, sent, tracking, out for delivery, delivered, the order page", ["35 minutes", "Order confirmation", "new order email", "Unfulfilled", "Fulfill items", "Updated automatically", "Out for delivery", "Delivered", "/checkout/track"].every((w) => stepText.includes(w)))
check("courier tracking is only promised when Storelib's tracking is on", /When Storelib's tracking is on, every shipment/.test(stepText) && /AfterShip or 17TRACK/.test(stepText) && /Storelib's tracking not on yet\?/.test(stepText))
check("  and nowhere in the article without saying so", (text.match(/followed for you|by itself when|Updated automatically/g) ?? []).length > 0 && !/always followed|every parcel is followed automatically/i.test(text))

/* ── 5. When things go wrong ───────────────────────────────────────────── */
console.log("\n5. After delivery, and when things go wrong")
const wrong = subs(part("After delivery, and when things go wrong"))
const WRONG = ["question", "change the address", "cancel", "send it back", "money back", "lost or arrives damaged", "can't deliver", "never shows as delivered", "Storelib step in", "bank"]
check("each case is its own question: a question, address, cancel, return, refund, lost or damaged, delivery problem, not confirmed, Storelib, disputes", WRONG.every((w) => wrong.some((s) => s.title.includes(w) && s.title.endsWith("?"))), wrong.map((s) => s.title))
check("  each says what happens and what you do", wrong.every((s) => s.blocks.some((b) => b.type === "p" && b.text.length > 80)))
check("  the dispute links the disputes article", /\(\/help\/orders-and-payouts\/disputes\)/.test(JSON.stringify(wrong)))

/* ── 6. Connections ────────────────────────────────────────────────────── */
console.log("\n6. Connections at a glance")
const table = part("Connections at a glance").find((b) => b.type === "table") as Extract<HelpBlock, { type: "table" }> | undefined
check("a table: what it does, what goes out, what comes back", !!table && table.head.join("|") === "Connection|What it does|What goes out|What comes back")
const rowNames = (table?.rows ?? []).map((r) => r[0]).join(" ")
const names = ["Courier tracking", "Shippo", "EasyPost", "ShipStation", "Printful", "Printify", "Gelato", "CJ Dropshipping", "Supplier by email", "Your own system (webhook)", "CSV export", "Klaviyo", "Omnisend", "pixels"]
check("  every connection the owner listed is a row", names.every((n) => rowNames.includes(n)), names.filter((n) => !rowNames.includes(n)))
check("  every order integration in the catalog is in it", PROVIDERS.filter((p) => p.id !== "manual").every((p) => rowNames.includes(p.name)), PROVIDERS.filter((p) => p.id !== "manual" && !rowNames.includes(p.name)).map((p) => p.name))

/* ── 7. The test order ─────────────────────────────────────────────────── */
console.log("\n7. How to check it all works")
const test = part("How to check it all works")
const testSteps = test.find((b) => b.type === "steps") as Extract<HelpBlock, { type: "steps" }> | undefined
check("ten steps or more, from a code to the buyer's page and back", (testSteps?.items.length ?? 0) >= 10)
check("  honest about Stripe's test mode: a test site's, not a live store's", /test mode/.test(JSON.stringify(test)) && /4242 4242 4242 4242/.test(JSON.stringify(test)) && /only work on a Storelib test site/.test(JSON.stringify(test)))
check("  a free order instead: 100 percent and free shipping, once per customer", /Percentage and type 100/.test(JSON.stringify(testSteps)) && /Free shipping/.test(JSON.stringify(testSteps)) && /Limit uses per customer/.test(JSON.stringify(testSteps)))
const coupon = read("components/physical/coupon-options.tsx") + read("app/app/coupons/coupons-client.tsx") + read("app/app/coupons/coupon-editor.tsx") + read("app/app/coupons/coupon-form.ts")
check("  the coupon really allows 100 percent and free shipping", /value > 100/.test(coupon) && /(label|title)="Free shipping"/.test(coupon) && /(label|title)="Limit uses per customer"/.test(coupon) && coupon.includes("Create coupon") && coupon.includes('"Percentage"'))
const siteRoute = read("app/api/checkout/site/route.ts")
check("  and a free order that ships is placed with no card", /async function free\(/.test(siteRoute) && /if \(ships\)/.test(siteRoute) && read("app/checkout/site/site-checkout.tsx").includes('"Place order"'))

/* ── 8. The words are the product's ────────────────────────────────────── */
console.log("\n8. Every button it names is on the screen")
const WORDS: [string, string][] = [
  ["components/app/settings/store-details-panel.tsx", "Add business details"],
  ["components/physical/buy-label.tsx", "Buy a label"],
  ["components/physical/buy-label.tsx", "Get rates"],
  ["components/physical/buy-label.tsx", "Buy label"],
  ["components/physical/order-panel.tsx", "Updated automatically"],
  ["components/physical/order-panel.tsx", "Pause automatic updates"],
  ["components/physical/order-panel.tsx", "Report a delivery problem"],
  ["components/physical/order-panel.tsx", "Delivery not confirmed"],
  ["components/physical/order-panel.tsx", "Void label"],
  ["components/physical/order-panel.tsx", "Mark as out for delivery"],
  ["components/physical/order-panel.tsx", "Email the buyer the new address"],
  ["components/physical/order-panel.tsx", "Cancel and refund"],
  ["components/physical/order-panel.tsx", "Keep order"],
  ["components/support/order-help.tsx", "Need help with this order?"],
  ["components/support/order-help.tsx", "Contact the shop"],
  ["components/support/order-messages-card.tsx", "Messages from the buyer"],
  ["app/order-help/[id]/case-view.tsx", "Ask Storelib for help"],
  ["app/app/support/buyer-cases.tsx", "Ask Storelib to step in"],
  ["app/app/support/buyer-cases.tsx", "Mark resolved"],
  ["components/physical/integrations-marketplace.tsx", "Match products to"],
  ["components/physical/integrations-marketplace.tsx", "Download orders"],
  ["components/physical/partner-links.tsx", "Keep stock in step with CJ"],
  ["components/app/settings/tracking-app-panel.tsx", "Use my own account"],
  /* Changed on purpose (round 27, B27): the switch now lets buyers cancel, not ask. */
  ["components/app/settings/checkout-panel.tsx", "Let buyers cancel"],
  ["components/physical/shipping-settings.tsx", "Carrier calculated"],
  ["components/physical/shipping-settings.tsx", "Local delivery"],
  ["components/physical/shipping-settings.tsx", "A partner: email each order to them"],
  ["components/physical/shipping-settings.tsx", "My own system: send each order to my webhook"],
  ["lib/physical/email-templates.ts", "View your order"],
]
for (const [file, words] of WORDS) check(`"${words}" is in ${file} and in the playbook`, read(file).includes(words) && text.includes(words))
check("the topics a buyer picks are the form's own", ["Change the address", "It hasn't arrived", "It arrived damaged", "Something is missing", "I got the wrong item"].every((w) => read("lib/support/cases.ts").includes(`"${w}"`) && text.includes(w)))
check("the three days before a buyer can ask Storelib in is the code's", /ESCALATE_AFTER_DAYS = 3/.test(read("lib/support/cases.ts")) && /three days/.test(text))

/* ── 9. Screenshots ────────────────────────────────────────────────────── */
console.log("\n9. Screenshots of the real screens")
const images = body.filter((b): b is Extract<HelpBlock, { type: "image" }> => b.type === "image")
const NEW = ["business-details", "label-buy", "tracking-buyer", "tracking-seller", "contact-shop", "order-messages", "case-conversation", "integration-tracking", "integration-klaviyo", "integration-gelato", "integration-cj", "match-products", "integration-shipstation", "integration-shippo"]
check("the playbook has at least 25 screenshots", images.length >= 25, images.length)
check("every new screen is in the size table and on disk, under 200 KB", NEW.every((n) => n in PHYSICAL_SHOTS && existsSync(join(process.cwd(), "public/help/physical", `${n}.webp`)) && readFileSync(join(process.cwd(), "public/help/physical", `${n}.webp`)).length < 200_000), NEW.filter((n) => !(n in PHYSICAL_SHOTS)))
check("  the label dialog, tracking on both pages, Contact the shop, the buyer's messages and Match products have phone pictures", ["label-buy", "tracking-buyer", "tracking-seller", "contact-shop", "order-messages", "case-conversation", "match-products", "business-details"].every((n) => `${n}-phone` in PHYSICAL_SHOTS && (PHYSICAL_SHOTS as Record<string, readonly number[]>)[`${n}-phone`][0] <= 390))
const used = new Set(PHYSICAL_ARTICLES.flatMap((x) => x.body.filter((b) => b.type === "image").map((b) => (b as { src: string }).src)))
check("  and every new screen is used by an article", NEW.every((n) => used.has(`/help/physical/${n}.webp`)), NEW.filter((n) => !used.has(`/help/physical/${n}.webp`)))
check("  each says what it shows", images.every((b) => b.alt.length >= 30))
const shots = read("scripts/help-shots.mjs") + read("scripts/render-help-shots.tsx")
check("taken from the real components by the shots script", ["OrderMessagesCard", "CaseView", "OrderStatusView", "PhysicalOrderPanel", "IntegrationsDirectory"].every((c) => shots.includes(c)) && NEW.every((n) => shots.includes(`name: "${n}"`)))

/* ── 10. Reachable ─────────────────────────────────────────────────────── */
console.log("\n10. Reachable from the Help Center and the app")
check("the topic page opens with it under Start here", PHYSICAL_CATEGORY.start === "playbook" && /category\.start \? "Start here"/.test(read("app/help/[category]/page.tsx")) && /articles\.find\(\(a\) => a\.slug === category\.start\)/.test(read("app/help/[category]/page.tsx")))
check("Zero to 100 and How selling works point to it", JSON.stringify(helpArticle("physical-products", "zero-to-100")!.body).includes("(/help/physical-products/playbook)") && JSON.stringify(helpArticle("physical-products", "how-physical-products-work")!.body).includes("(/help/physical-products/playbook)"))
check("Settings › Shipping and delivery links it, beside the step by step guide", /href="\/help\/physical-products\/playbook"/.test(read("components/physical/shipping-settings.tsx")) && /href="\/help\/physical-products\/zero-to-100"/.test(read("components/physical/shipping-settings.tsx")))
check("  and its How it works (who ships your orders) opens it", EXPLAINERS.fulfilment.guide === "/help/physical-products/playbook")
const orders = read("app/app/orders/orders-list.tsx")
check("the empty Orders page links it while physical commerce is on", /!hasOrders && physical \?/.test(orders) && /href="\/help\/physical-products\/playbook"/.test(orders) && /usePhysicalCommerceEnabled\(\)/.test(orders))
check("it is in the sitemap's list while physical commerce is on, and gone while it is off", helpArticlesFor(true).some((x) => x.slug === "playbook") && !helpArticlesFor(false).some((x) => x.slug === "playbook"))
check("searching for it finds it", helpArticlesIn("physical-products").includes(a))

/* ── 11. SEO ───────────────────────────────────────────────────────────── */
console.log("\n11. Structured data")
const ld = helpArticleJsonLd(a, helpCategory("physical-products")!) as { "@graph": Record<string, unknown>[] }
const types = ld["@graph"].map((g) => g["@type"])
/* Changed on purpose (round 45): Google shows FAQ rich results only for government and health sites and has retired HowTo, so the playbook is a TechArticle and its breadcrumbs only. Its what if questions and its test order stay in the page. */
check("TechArticle and BreadcrumbList, no FAQPage or HowTo", types.join(",") === "TechArticle,BreadcrumbList", types)
check("  the what if questions are still headings in the page", a.body.filter((b) => (b.type === "h" || b.type === "sub") && b.text.trim().endsWith("?")).length >= 10)
check("  and the test order is still its numbered steps", a.body.some((b) => b.type === "sub" && b.text === "How to check it all works") || a.body.some((b) => b.type === "h" && b.text === "How to check it all works"))

/* ── 12. The page draws the new parts ──────────────────────────────────── */
console.log("\n12. The article page")
const html = renderToStaticMarkup(createElement(ArticleBody, { blocks: body }))
check("smaller headings are h3 with ids, labelled lines a definition list", (html.match(/<h3 id="/g) ?? []).length === body.filter((b) => b.type === "sub").length && (html.match(/data-help-facts=""/g) ?? []).length === body.filter((b) => b.type === "facts").length && /<dt[^>]*>What you connect<\/dt>/.test(html))
check("  the main headings keep the ids the contents list links to", helpToc(a).every((t) => html.includes(`<h2 id="${t.id}"`)))
check("  a label sits above its words on a phone and beside them at a desk", /sm:grid-cols-\[168px_minmax\(0,1fr\)\]/.test(read("components/help/help-parts.tsx")))

/* ── 13. Other articles say what is true now ───────────────────────────── */
console.log("\n13. Nothing outdated left")
const guide = PHYSICAL_ARTICLES.map((x) => articleText(x)).join(" ")
check("labels: no more \"Storelib doesn't buy labels yet\"", !/doesn't buy labels or postage for you yet/.test(guide) && /Buy a label/.test(articleText(helpArticle("physical-products", "ship-your-orders")!)))
check("tracking: out for delivery and delivered come from the carrier too, not only a partner", !/A partner's update says it's out for delivery/.test(guide) && /Parcels followed for you/.test(articleText(helpArticle("physical-products", "tracking-and-order-status")!)))
check("Delivered is no longer only a button", /On its own when Storelib's tracking or a partner says so/.test(articleText(helpArticle("physical-products", "ship-your-orders")!)) && !/When it arrives, press Mark as delivered\. Done\./.test(guide))
check("Printful's article has no Coming soon heading over partners that work", !helpArticle("physical-products", "printful-and-printify")!.body.some((b) => b.type === "h" && b.text === "Coming soon"))
check("the integrations article has Courier tracking", /Courier tracking/.test(articleText(helpArticle("physical-products", "integrations")!)))
check("the return window says what happens to a parcel never marked delivered", /should have arrived/.test(articleText(helpArticle("physical-products", "returns-physical")!)))
const problems = JSON.stringify(HELP_TOPICS)
check("Order problems names the buyer's buttons as they are now", !/Get help with this order/.test(problems + read("lib/help/articles.ts")) && /Contact the shop/.test(problems) && /Ask Storelib for help/.test(problems))

/* ── 14. Copy ──────────────────────────────────────────────────────────── */
console.log("\n14. Copy")
const raw = JSON.stringify(a)
check("no em or en dashes", !/[—–]/.test(raw))
const banned = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform", "leverage", "delve"]
check("none of the banned words", !banned.some((w) => new RegExp(`\\b${w}`, "i").test(raw)), banned.filter((w) => new RegExp(`\\b${w}`, "i").test(raw)))
check("no Shopify or Liquid", !/Shopify|Liquid/.test(text))
const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 2)
const avg = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length
check("short sentences: under 15 words on average", avg < 15, Math.round(avg * 10) / 10)
check("every link lands on a Help Center article", [...raw.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).every((h) => { const m = h.match(/^\/help\/([^/]+)\/([^/]+)$/); return !!m && !!helpArticle(m[1], m[2]) }))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
