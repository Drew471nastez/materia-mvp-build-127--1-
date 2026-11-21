/**
 * Landing round 13, faq (/faq). The owner: "make the FAQ page of storelib.com
 * more modern, adapted to our design, inherit the landing page's look, very
 * smooth and clean, build the best FAQ page."
 *  - the page is built from the home page's parts: the dark of the header and
 *    the closing call with its dot field, the landing's display type, a
 *    search field drawn like the closing call's email field, a white sheet
 *    with rounded corners lapping over the dark, and the home page's question
 *    rows (light grey, a plus turning into a minus, the answer opening by its
 *    grid row)
 *  - the questions are grouped by topic, with a sticky topic list beside them
 *    from 1024px and a sticky row of chips under the header below that; the
 *    header's height is measured once and shared as --fq-top
 *  - search keeps a question when every word is in it or its answer, marks
 *    the words, and says when nothing matches
 *  - every question has an address (/faq#<id>) that opens it
 *  - every question the page had is still there, its answer read from the
 *    plan, fee and storage tables (Free, Grow at $29 and Pro at $99; no
 *    memberships), and Pro has its own question
 *  - a support line at the end; no FAQPage markup (round 45 took it off every
 *    page on purpose: Google shows FAQ results only for government and health
 *    sites), breadcrumbs kept
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { faqTopics, SUPPORT_EMAIL } from "@/lib/marketing/faq-page"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const CLIENT = "components/marketing/faq-page-client.tsx"
const PAGE = "app/(storelib)/(marketing)/faq/page.tsx"
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—|membership|Growth|Professional|Shopify|Liquid/i

const topics = faqTopics()
const all = topics.flatMap((t) => t.questions)
const html = renderToStaticMarkup(createElement(FaqPageClient, { topics, supportEmail: SUPPORT_EMAIL, helpUrl: "/help" }))
const css = (/const CSS = `([\s\S]*?)`/.exec(read(CLIENT))?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\nEvery question the page had is still there")
{
  const before = [
    "What is Storelib?", "How do I create an account?", "Do I need any coding skills to set up my store?", "How long does it take to launch my store?",
    "What can I sell on Storelib?", "How do I upload and list a product?", "Is there a limit on how many products I can sell?", "Can I offer free products?", "What if I already sell on another platform?",
    "How fast do I get paid?", "What payment methods do buyers have?", "Does Storelib take a commission on my sales?", "How do I set up payouts?",
    "Is Storelib free to use?", "What's included in Grow?", "Can I cancel my subscription anytime?", "Is there a free trial for paid plans?",
    "Can I use my own domain?", "What's the difference between Storelib and a link-in-bio tool?", "Can I customize the look of my store?", "What is OnePage?",
    "How does the Storelib marketplace work?", "How can I increase my product visibility?", "Can buyers leave reviews on my products?",
    "How do I contact support?", "Can I have multiple stores?", "Is my data secure?",
  ]
  const qs = all.map((x) => x.q)
  const missing = before.filter((q) => !qs.includes(q))
  // Changed on purpose (landing round 14): the questions are widened (tests/home-landing-r14-faq-blog.test.ts), in eight topics with Marketing.
  check("all 27 questions, in eight topics", missing.length === 0 && topics.length === 8, missing)
  check("and Pro has its own", qs.includes("What's included in Pro?"))
  // Changed on purpose (landing round 14): an answer can name "Languages & Currency", so & is escaped as the markup escapes it.
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;")
  check("each question's answer is in the page's first HTML (the closed ones too)", all.every((x) => html.includes(esc(x.q)) && html.includes(esc(x.a))))
}

console.log("\nThe answers are the code's numbers")
{
  const text = all.map((x) => x.a).join(" ")
  const fee = (id: string) => getFeeDescription(id).replace(" per sale", "")
  check("the three fees, from the fee table", text.includes(`${fee("free")} on Free, ${fee("growth")} on Grow and ${fee("pro")} on Pro`))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("Grow at $14 and Pro at $99", /Grow is \$14 a month/.test(text) && /Pro is \$99 a month/.test(text))
  const g = siteLimits("growth"), p = siteLimits("pro"), f = siteLimits("free")
  check("websites and pages from the site limits", text.includes(`${g.maxSites} websites of ${g.maxPages} pages`) && text.includes(`${p.maxSites} websites of ${p.maxPages} pages`) && text.includes(`${f.maxSites} on Free, ${g.maxSites} on Grow and ${p.maxSites} on Pro`))
  check("storage from the storage plans", [PLAN_LIMITS.free, PLAN_LIMITS.growth, PLAN_LIMITS.pro].every((l) => text.includes(formatBytes(l.storageQuotaBytes))))
  check("payouts arrive as the Payouts page says (1 to 3 business days)", text.includes("1 to 3 business days") && !/2 business days|within 24 hours|thousands of buyers/i.test(text))
  const sell = all.find((x) => x.id === "what-can-i-sell")?.a ?? ""
  check("paid calls and sessions are sold, as bookings on a OnePage or a website, paid through a product's checkout (lib/bookings, lib/forms/booking-payment.ts)", /paid calls and sessions/.test(sell) && /booking form/.test(sell) && /OnePage or your website/.test(sell) && /checkout/.test(sell) && /Google Calendar/.test(sell))
  check("no answer says bookings are missing", !/no booking|bookings are not|not offer bookings|no call scheduling|Calendly/i.test(text))
  check("one account no longer means one store", !/each account supports one store/i.test(text))
  check("no old plan names, no memberships, no banned words, no em dash", !BANNED.test(all.map((x) => `${x.q} ${x.a}`).join(" ") + topics.map((t) => t.title + t.label).join(" ")))
  check("nor in the page around them", !BANNED.test(html.replace(/<style[\s\S]*?<\/style>/g, "")))
}

console.log("\nAddresses")
{
  const ids = [...topics.map((t) => t.id), ...all.map((x) => x.id)]
  check("every topic and question has its own address, in plain words", new Set(ids).size === ids.length && ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)))
  check("each question is drawn at its address, its button naming its answer", all.every((x) => html.includes(`id="${x.id}"`) && html.includes(`aria-controls="${x.id}-a"`)))
  const src = code(CLIENT)
  check("a page loaded at an address opens that question and brings it into view, and so does a change of address", /if \(location\.hash\) goTo\(location\.hash, false\)/.test(src) && /addEventListener\("hashchange"/.test(src) && /scrollIntoView\(\{ block: "start"/.test(src))
  check("opening a question writes its address; closing it takes it off", /history\.replaceState\(history\.state, "", `#\$\{id\}`\)/.test(src) && /location\.pathname \+ location\.search/.test(src))
  check("a question the search hides is shown again before it is scrolled to", /el\.closest\("\[hidden\]"\)/.test(src) && /pendingRef\.current = \{ id, smooth \}/.test(src))
}

console.log("\nTopics and search")
{
  const src = code(CLIENT)
  check("the topic list is a nav of links to each topic", /<nav className="fq-nav"/.test(src) && topics.every((t) => html.includes(`href="#${t.id}"`)))
  check("sticky under the header at the measured height, on a phone and beside the questions", /\.fq-nav\{position:sticky;top:var\(--fq-top\)/.test(css) && /\.fq-nav\{top:calc\(var\(--fq-top\) \+ 40px\)/.test(css))
  check("the header is measured once and shared as --fq-top, found again when the real header replaces its placeholder", /setProperty\("--fq-top"/.test(src) && /new MutationObserver/.test(src) && /new ResizeObserver\(set\)/.test(src))
  check("the scroll margins read the same number", /scroll-margin-top:calc\(var\(--fq-top\) \+ var\(--fq-chips\)/.test(css))
  check("on a phone the chips scroll inside their own row, never the page", /\.fq-nav ol\{display:flex;[^}]*overflow-x:auto/.test(css) && /row\.scrollTo\(/.test(src))
  check("the topic being read is found by an IntersectionObserver band, not a scroll listener", /rootMargin: "-30% 0px -66% 0px"/.test(src) && !/addEventListener\("scroll"/.test(src))
  check("search: every word in the question or its answer, accents folded, the words marked", /words\.every\(\(w\) => all\.includes\(w\)\)/.test(src) && /normalize\("NFD"\)/.test(src) && /<mark key=/.test(src))
  check("search is a labelled field in a search landmark, Escape clears it, / goes to it", /role="search"/.test(src) && /htmlFor="fq-q"/.test(src) && /e\.key === "Escape"/.test(src) && /e\.key !== "\/"/.test(src))
  check("a count is read out, and nothing found says so with a way out", /role="status" aria-live="polite"/.test(src) && /Nothing here mentions/.test(src) && /clear the search/.test(src))
}

console.log("\nMotion")
{
  check("the answer opens by its grid row, 0fr to 1fr, nothing measured", /\.fq-a\{display:grid;grid-template-rows:0fr;transition:grid-template-rows/.test(css) && /\.fq-item\[data-open\] \.fq-a\{grid-template-rows:1fr\}/.test(css) && !/scrollHeight|maxHeight/.test(code(CLIENT)))
  const props = [...css.matchAll(/transition:([^;}]+)/g)].flatMap((m) => m[1].replace(/\([^)]*\)/g, "").split(",").map((s) => s.trim().split(/\s+/)[0]))
  const allowed = new Set(["opacity", "transform", "grid-template-rows", "background-color", "border-color", "color", "none!important"])
  check("everything else moves by transform and opacity (colours aside)", props.every((p) => allowed.has(p)), props.filter((p) => !allowed.has(p)))
  check("keyframes move transform and opacity only", [...css.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].every((m) => !/(?:^|[{;])\s*(?!opacity|transform)[a-z-]+:/.test(m[1].replace(/from|to/g, ""))))
  check("reduced motion turns all of it off", /@media \(prefers-reduced-motion:reduce\)\{\s*\.fq \*,\.fq \*::before,\.fq \*::after\{transition:none!important;animation:none!important\}/.test(css))
  check("a topic rises once as it comes on screen, and only below the screen at load", /\.fq-group\[data-wait\]\{opacity:0;transform:translate3d\(0,20px,0\)\}/.test(css) && /getBoundingClientRect\(\)\.top > window\.innerHeight/.test(code(CLIENT)))
  check("the dot field is the home page's own, which rests off screen", /import \{ DotField \} from "@\/components\/marketing\/home\/dot-field"/.test(read(CLIENT)) && /<DotField fade="edges" scatter \/>/.test(read(CLIENT)))
}

console.log("\nThe page")
{
  const page = code(PAGE)
  // Changed on purpose (landing round 14): the questions are built with the platform switches (communities, physical, Explore).
  check("the server reads the questions and hands them to the client", /<FaqPageClient topics=\{faqTopics\(flags\)\} supportEmail=\{SUPPORT_EMAIL\} helpUrl=\{publicHelpUrl\(\)\} \/>/.test(page))
  check("breadcrumbs kept, still no FAQPage (round 45)", /storelibBreadcrumbJsonLd\(\[\{ name: "FAQ", path: "\/faq" \}\]\)/.test(page) && !/FAQPage/.test(page))
  check("one h1, a heading for each topic", (html.match(/<h1/g) ?? []).length === 1 && topics.every((t) => html.includes(`id="${t.id}-h"`)))
  check("the end gives the support address and the Help Center", html.includes(`mailto:${SUPPORT_EMAIL}`) && /Email support/.test(html) && /Help Center/.test(html))
  check("the description names the three plans", /Free, Grow and Pro/.test(page))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 12 entries", /"tests\/home-landing-r12-perf\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r13-faq\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
