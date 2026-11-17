/**
 * HOME, LANDING ROUND 12, HOW IT WORKS (track 6).
 *
 * The owner, after round 11: the pictures in this section did not match the
 * rest of the page. "Smooth, clean, non AI looking", full width, straight on
 * the section with no box around them, and a better heading:
 *   - Understand your business: Storelib's own /app dashboard, drawn as it is
 *     (the dark header, the rail, the greeting, the four figures, the chart),
 *     its visitors, revenue, orders and conversion filling in and ticking up,
 *     every number consistent with the others.
 *   - Take tips: a real tip on a creator page, an amount picked, paid, thanked.
 *   - Use your own domain: the owner's reference, a store's front page with a
 *     big address field over it, www.<name>.com (the ending in blue) typing in
 *     and a green check; a different store's photographs, no coffee.
 *   - The domain caption stays true to the code.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  HowItWorks, HOW_CARDS, HOW_DASH, HOW_DASH_TEXT, HOW_DAY_DOLLARS, HOW_DOMAIN, HOW_HEADING, HOW_IT_WORKS_STYLES,
  HOW_PRODUCTS, HOW_RAIL, HOW_TICKS, HOW_TIP, HOW_WEEK, TIP_AMOUNTS, howChange, howConversion,
} from "@/components/marketing/home/how-it-works"
import { DOMAIN_PURPOSES, cleanHostname, hostnameProblem, servingHost } from "@/lib/custom-domains/hostname"
import { siteGate, siteLimits } from "@/lib/sites/plan"
import { tipDefaultAmounts } from "@/lib/onepage/tips"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const FILE = "components/marketing/home/how-it-works.tsx"
const src = read(FILE)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
/* The odometers draw thirty numerals a digit; the figure a reader sees is the cell the column stands on. */
const shown = how.replace(/<span class="cmh-odo-col" style="[^"]*" data-pos="(\d+)">(?:<span>\d<\/span>)+<\/span>/g, (_, p) => String(+p % 10))
const seen = shown.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'")
const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
const kfBodies = [...css.matchAll(/@keyframes ([\w-]+)\{([\s\S]*?\})\}/g)].map((m) => [m[1], m[2]] as const)
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => ["transform", "opacity"].includes(x[1]))
const tr = read("lib/i18n/translations.ts")
const en = (key: string) => (tr.match(new RegExp(`"${key.replace(/\./g, "\\.")}": "([^"]+)"`)) ?? [])[1]

console.log("\n1. The heading and the layout")
check("a new heading, specific and short, in section 3's two tones", HOW_HEADING.lead === "See every sale as it happens." && HOW_HEADING.rest === "Add tips and your own domain." && /<h2 id="cmh-title" class="cmh-h">See every sale as it happens\. <span class="cmh-h-mute">Add tips and your own domain\.<\/span><\/h2>/.test(how))
// Changed on purpose (landing round 13): the owner asked for round 11's structure again (narrow, wide, narrow grey stages with captions) with these pictures inside; pinned in tests/home-landing-r13-lower.test.ts.
check("the dashboard leads on a row of its own below 1100px, tips and the domain share the next", HOW_CARDS.map((c) => `${c.key}:${c.wide}`).join() === "tips:false,business:true,domain:false" && /@media\(min-width:640px\) and \(max-width:1099px\)\{\s*\.cmh-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*\}\s*\.cmh-wide\{grid-column:1\/-1;order:-1\}/.test(css) && /\.cmh-grid\{display:grid;grid-template-columns:minmax\(0,1fr\);/.test(css))
// Changed on purpose (landing round 14): the owner asked for the pictures to cover their cards, the cards an extremely subtle depth (tests/home-landing-r14-lower.test.ts).
check("a white card round each picture, a faint depth", /data-ground=/.test(how) && /background:#fff/.test(rule(".cmh-stage")) && /box-shadow/.test(rule(".cmh-stage")))
check("the domain caption is kept word for word, and true: Grow connects a domain, Free does not", HOW_CARDS.find((c) => c.key === "domain")!.line === "On Grow, point a domain you own at your site. HTTPS is set up for you." && siteLimits("growth").customDomain && !siteLimits("free").customDomain && siteGate("free", "customDomain") === "Connecting your own domain is available on Grow." && /awaiting_ssl|ssl/.test(read("app/api/domains/verify/route.ts")))
check("each caption a title and one short line", HOW_CARDS.every((c) => c.line.split(" ").length <= 16 && text.includes(c.title) && text.includes(c.line)))

console.log("\n2. Understand your business: the app's own dashboard")
check("the header as the app draws it: #131316, 58px, the search, the logo and Storelib", /background:#131316/.test(rule(".cmh-db-top")) && /height:58px/.test(rule(".cmh-db-top")) && read("components/app/sidebar.tsx").includes("h-[58px] bg-[#131316]") && text.includes("Search orders, customers, products") && read("components/app/app-search.tsx").includes('tt("Search orders, customers, products")') && /class="cmh-db-tools">.*<b>Storelib<\/b>/.test(how))
check("the rail: the app's rows in the app's order and words, 240px, 38px rows, the row you are on #e8e8e8", HOW_RAIL.map((r) => r.label).join() === [en("nav.dashboard"), en("nav.products"), en("nav.analytics"), en("nav.sales"), en("nav.creatorPage"), en("nav.websiteBuilder"), en("nav.onepage"), "Contacts", en("nav.emails"), "Integrations", en("nav.payouts")].join() && /width:240px/.test(rule(".cmh-db-rail")) && /height:38px/.test(rule(".cmh-db-row")) && /background:#e8e8e8;color:#202020;font-weight:575/.test(rule(".cmh-db-row[data-on]")) && read("components/app/sidebar-desktop-nav.tsx").includes('const ACTIVE_BG = "#e8e8e8"'))
check("the greeting, the period, the live count and the subtitle in the app's words", text.includes("Good morning, Ines") /* Changed on purpose (landing round 14): Ines Duarte in place of Ruben Linde. */ && text.includes("Last 7 days") && text.includes(en("dashboard.subtitle")!.replace(/&#x27;/g, "'")) && seen.includes(`${HOW_DASH.live} live`) && en("time.last7Days") === "Last 7 days")
check("the four figures with the app's labels and feet, the chosen one on #f9fafb with its grey line", [en("dashboard.visitors"), en("dashboard.revenue"), en("dashboard.orders"), en("dashboard.conversionRate"), en("dashboard.ordersPerVisitor")].every((w) => text.includes(w!)) && text.includes(`page views`) && text.includes("all time") && /background:#f9fafb/.test(rule(".cmh-db-tab[data-on]")) && /background:#d1d5db/.test(rule(".cmh-db-tab[data-on]::after")) && read("components/app/metric-tab.tsx").includes('METRIC_TAB_LINE = "#d1d5db"'))
check("the card is the visual language's card: white, 16px, a 60% hairline, a whisper of shadow", /background:#fff;border-radius:16px;border:1px solid rgba\(229,231,235,\.6\);box-shadow:0 1px 3px rgba\(0,0,0,\.04\)/.test(rule(".cmh-db-card")))
check("the chart as the app draws it: 2px #8b5cf6 over a 15% to 0 fill, dashed #f3f4f6 lines, 11px #9ca3af labels, the end dot ringed in white", /stroke="#8b5cf6" stroke-width="2"/.test(how) && /stop-opacity="0.15"/.test(how) && /border-top:1px dashed #f3f4f6/.test(rule(".cmh-db-grid")) && /font-size:11px;line-height:14px;color:#9ca3af/.test(rule(".cmh-db-grid small")) && /box-shadow:0 0 0 2px #fff/.test(rule(".cmh-db-dot")))

console.log("\n3. The numbers agree with each other")
const orders = HOW_WEEK.reduce((a, [l, t]) => a + l + t, 0)
const revenue = HOW_WEEK.reduce((a, [l, t]) => a + l * 29 + t * 32, 0)
check("revenue is the week's orders at their prices ($29 pack, $32 tee): 24 orders, $720", HOW_PRODUCTS.map((p) => p.priceCents).join() === "2900,3200" && orders === 24 && revenue === 720 && HOW_DASH.orders === orders && HOW_DASH.revenue === revenue && HOW_DAY_DOLLARS.reduce((a, b) => a + b, 0) === revenue)
/* Changed on purpose (landing round 15): a whole percent, as dashboard-client writes it (Math.round). */
check("conversion is orders over visitors: 24 / 846 = 3%", HOW_DASH_TEXT.conversion === `${Math.round((orders / HOW_DASH.visitors) * 100)}%` && HOW_DASH_TEXT.conversion === "3%")
/* Changed on purpose (landing round 15): conversion a whole percent. */
check("drawn as the figures say: 846, $720, 24, 3%", seen.includes("846") && seen.includes("$720") && seen.includes("3%") && /Orders24/.test(seen.replace(/\s/g, "")))
check("each change is against the week before, as the app rounds it: 14%, 18%, 20%, 5%", howChange(846, 742) === 14 && howChange(720, 610) === 18 && howChange(24, 20) === 20 && howChange(howConversion(24, 846), howConversion(20, 742)) === 5 && ["14%", "18%", "20%", "5%"].every((p) => text.includes(p)))
let v = HOW_DASH.visitors, o = HOW_DASH.orders, r = HOW_DASH.revenue
const convs: number[] = []
for (const s of HOW_TICKS) { v += s.visitors; if (s.order) { o++; r += s.order === "luts" ? 29 : 32 } convs.push(howConversion(o, v)) }
check("what ticks in stays consistent and never needs another digit (visitors and revenue under 1,000, conversion one decimal under 10%)", v < 1000 && r < 1000 && o < 100 && convs.every((c) => c > 1 && c < 10) && r === HOW_DASH.revenue + HOW_TICKS.filter((t) => t.order === "luts").length * 29 + HOW_TICKS.filter((t) => t.order === "tee").length * 32)
check("the figures roll as odometers: a column of numerals moved by transform, tabular figures", /transition-property:transform/.test(rule(".cmh-odo-col")) && /font-variant-numeric:tabular-nums/.test(rule(".cmh-odo")) && /overflow:hidden/.test(rule(".cmh-odo-d")) && /col\.style\.transform = `translate3d\(0,\$\{\(-pos \* 100\) \/ ODO_CELLS\}%,0\)`/.test(code))
check("they fill the first time the card is seen and tick only while it is live", /card\.hasAttribute\("data-seen"\)/.test(code) && /!card\.hasAttribute\("data-commerce-live"\)/.test(code) && /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(code))
check("the line draws in by two opposed transforms, never a dash offset", /@keyframes cmh-db-wipe\{from\{transform:translate3d\(-100%,0,0\)\}to\{transform:translate3d\(0,0,0\)\}\}/.test(css) && /@keyframes cmh-db-unwipe\{from\{transform:translate3d\(100%,0,0\)\}/.test(css) && !/dashoffset/.test(css))

console.log("\n4. Take tips: picked, paid, thanked")
check("the tip block's own amounts and words", TIP_AMOUNTS.join() === tipDefaultAmounts("usd").map((c) => `$${c / 100}`).join() && ["Leave a tip", "$3", "$5", "$10", "Other", "Tip $3", "Tip $5", HOW_TIP.thanks].every((w) => text.includes(w)) && read("components/onepage/tip-block.tsx").includes('tt("Thank you for the {amount} tip."') && read("components/onepage/tip-block.tsx").includes('tt("Tip {amount}"'))
// Changed on purpose (landing round 14): the owner disliked Ruben Linde and his cover; Ines Duarte, a landscape filmmaker.
/* Changed on purpose (landing round 15): her cover is drawn in reds (the owner disliked the photograph). */
// Changed on purpose (landing round 16): the owner asked for a better cover photograph (ines-cover-600/1000.webp), not the drawing.
check("on her creator page: her cover, her face, her name", how.includes(`src="/home/how/ines-cover-1000.webp"`) && !how.includes(`data-cover="red"`) && how.includes(`src="/home/how/ines-avatar.webp"`) && text.includes("Ines Duarte") && !/Ruben|Linde/.test(text))
check("the checkout sheet rises and goes by a transform, the page dims by an opacity", /* Changed on purpose (landing round 15): the sheet rests below by its height and its shadow's reach. */ /@keyframes cmh-tp-sheet\{[^@]*translate3d\(0,calc\(100% \+ 3em\),0\)/.test(css) && onlyCompositor(kfBodies.find(([n]) => n === "cmh-tp-scrim")![1]) && text.includes("Pay $5.00") && text.includes("Paid securely through Stripe"))

console.log("\n5. Use your own domain: the owner's reference")
// Changed on purpose (landing round 14): the owner asked for /pricing's domain reel in place of the store and its typed address (tests/home-landing-r14-lower.test.ts holds it).
check("/pricing's domain reel, no store front, no Nordline", how.includes('class="ev-vis pz-d"') && !how.includes("cmh-dm-") && !/coffee|mug|cafino|Nordline/i.test(code + text))
check("the address is how a buyer reaches a bare domain on Storelib, and one Storelib accepts", HOW_DOMAIN.typed === `www.${HOW_DOMAIN.host}` && servingHost(cleanHostname(HOW_DOMAIN.host)) === HOW_DOMAIN.typed && hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && (DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose))

console.log("\n6. Smooth and cheap")
check("every keyframe moves transform and opacity only", kfBodies.length >= 10 /* Changed on purpose (landing round 14): the typed address's keyframes went with it. */ && kfBodies.every(([, b]) => onlyCompositor(b)))
check("every transition is an opacity, or the odometer's transform", [...css.matchAll(/transition:([^;}]+)/g)].every((m) => /^(opacity |none$)/.test(m[1].trim())) && !/transition-property:(?!transform)/.test(css))
// Changed on purpose (landing round 16): the chosen amount is one gliding pill, so the .cmh-tp-on5 overlay is gone from the reduced motion frame.
check("loops paused off screen and in a hidden tab; reduced motion shows the finished frames", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}\s*\.cmh-o\{animation:none!important\}/.test(css) && /\.cmh-tp-l5,\.cmh-tp-thx\{opacity:1\}/.test(css)  && /\.cmh-stage \.ev-loop\{animation:none!important\}/.test(css)) // Changed on purpose (landing round 14): the reel stands still on its first address.
check("the pictures take no pointer and hold nothing to press", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/<(a|button|input|select)\b/.test(how) && !/addEventListener\("click"/.test(code))
/* Changed on purpose (landing round 15): the owner asked for a little more gradient on the domain card's ground; that rule is the one gradient. */
check("no blur, no glass, no CSS gradient", !/blur\(|backdrop-filter|filter:|gradient\(/.test(css.replace(/\.cmh-stage \.pz-d\{background:[^}]*\}/, "")))
// The Storelib logo in the dashboard bar goes through StorelibLogo (next/image, the one path tests/brand-logo.test.ts allows), so it is checked there, not here.
const imgs = [...how.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/data-storelib-logo/.test(t))
check("every picture lazy, decoded off the main thread, sized, a local file that exists", imgs.length >= 3 /* Changed on purpose (landing round 14): the store's four photographs went with it. */ /* Changed on purpose (landing round 15): her cover is drawn (TipCover), not a photograph. */ && imgs.every((i) => /loading="lazy"/.test(i) && /decoding="async"/.test(i) && /width="\d+"/.test(i) && /height="\d+"/.test(i) && existsSync(`public${i.match(/src="([^"]+)"/)![1]}`)))
check("the old pictures and their files are gone", !/cmh-tip-list|cmh-bar|cmh-read|cmh-dm-win|cmh-dm-cut|cmh-lut/.test(how + css) && !existsSync("public/home/how/cap-yellow.webp") && !existsSync("public/home/how/print-lasalle.webp"))

console.log("\nCopy and registration")
check("no em dash, none of the banned words", !/—/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
check("none of the names that must never be on the page", !/Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramics|totes|After Dark|memberships|Mondo Mango|Mara Lind|\bfans?\b|Shopify|Liquid/i.test(text + code))
check("registered after the round 11 suites", /"tests\/home-landing-r11-[\w-]+\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r12-how\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\nhome-landing-r12-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
