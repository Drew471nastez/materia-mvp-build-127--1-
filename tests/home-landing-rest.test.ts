/**
 * ===========================================================================
 *  HOME, LANDING ROUND: EARNINGS, THE APP, PRICING AND YOUR AI TOOLS
 * ===========================================================================
 * What the owner asked of these four, held in place:
 *
 *   See what you could earn   keep it, add one cinematic flash photograph
 *                             (real, local, small), not taller or wider than
 *                             it needs, and no small print under it.
 *   Run your business ...     a much shorter line under the heading.
 *   Pricing                   no purple checks; plain lines a seller
 *                             understands ("what is 1 GB of file storage?"),
 *                             each still true to the plan tables; the same
 *                             names and prices; /pricing still draws them.
 *   Your AI tools work here   a white section with one dark card: the marks,
 *                             a heading, one line true to what a connection
 *                             does, a button to the page that explains it, and
 *                             a terminal that runs on the compositor, only on
 *                             screen, finished and still under reduced motion.
 *                             Right after the integrations, lazily loaded.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AiToolsSection, AI_TOOLS_SCRIPT, AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { EarningsCalculator, EARNINGS_STYLES } from "@/components/marketing/home/earnings-calculator"
import { AppAnywhere } from "@/components/marketing/home/app-anywhere"
import { publicPlanLines } from "@/components/marketing/pricing-lines"
import { OFFERED_PLANS, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID } from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"
import { PROJECT_TOOLS, TOOLS } from "@/lib/agent-access/mcp"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ")
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b/i

console.log("\n── See what you could earn ──")
{
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  const css = EARNINGS_STYLES.map((s) => s.css).join("\n")
  const src = read("components/marketing/home/earnings-calculator.tsx")
  check("still the calculator, with its heading and its default month", html.includes("See what your work could earn.") && html.includes("$2,850") && (html.match(/type="range"/g) ?? []).length === 2)
  check("one photograph, local, lazy, async, sized, with srcset and sizes", /<div class="cme-photo"><img src="\/home\/earnings\/night-flash-tee-640\.webp" srcSet="[^"]*960w" sizes="[^"]+" width="960" height="1448" alt="[^"]+" loading="lazy" decoding="async"\/>/.test(html.replace(/srcset/g, "srcSet")))
  const dir = join(root, "public/home/earnings")
  const files = ["night-flash-tee-640.webp", "night-flash-tee-960.webp"]
  check("its two sizes exist, each under 120 KB", files.every((f) => existsSync(join(dir, f)) && statSync(join(dir, f)).size < 120_000), files.map((f) => (existsSync(join(dir, f)) ? statSync(join(dir, f)).size : "missing")))
  check("nothing hotlinked", !/https?:\/\/[^"'`\s]*\.(png|jpe?g|webp|avif)/i.test(src) && !/images\.unsplash\.com/.test(src))
  check("the small print under the result is gone", !/cme-fine|not a forecast|A month is 30 days\.|Production costs are typical/.test(html))
  check("not wider: three columns only from 1280px, the photo the narrowest", /@media \(min-width:1280px\)\{\s*\.cme-card\{grid-template-columns:minmax\(0,\.64fr\) minmax\(0,1\.1fr\) minmax\(0,\.95fr\)\}/.test(css))
  check("not much taller: the photo is a short band under 1280px, at most 300px on a phone", /\.cme-photo\{grid-column:1\/-1;position:relative;height:clamp\(240px,30vw,320px\)/.test(css) && /\.cme-photo\{height:auto;aspect-ratio:16\/10;max-height:300px\}/.test(css))
  check("corners a pixel tighter", /\.cme-inputs\{[^}]*border-radius:clamp\(21px,2\.4vw,31px\)/.test(css) && /\.cme-out\{[^}]*border-radius:clamp\(21px,2\.4vw,31px\)/.test(css) && !/clamp\(22px,2\.4vw,32px\)/.test(css))
  check("no fans", !/\bfans?\b/i.test(text(html)))
}

console.log("\n── Run your business from anywhere ──")
{
  const html = renderToStaticMarkup(createElement(AppAnywhere))
  const line = html.match(/<p class="mt-5[^"]*">([^<]+)<\/p>/)?.[1]?.trim() ?? ""
  check("the line under the heading is short and plain", line === "Your sales, orders and visitors on your phone, wherever you are." && line.split(/\s+/).length <= 12, line)
  check("the old long line is gone", !/step away from the desk/.test(html))
}

console.log("\n── Pricing ──")
{
  const lines = publicPlanLines()
  const all = Object.values(lines).flatMap((l) => [...l.features, ...l.excluded])
  check("the same names and prices", OFFERED_PLANS.map((p) => `${p.name} ${p.price}`).join(", ") === "Free $0, Pro $29, Scale $99")
  check("no technical rules on the public cards (no GB, no pages each, no counts of AI edits)", !all.some((l) => /\bGB\b|\bMB\b|pages each|\d+\s*AI edits|file storage/i.test(l)), all)
  check("no banned words or em dashes", !all.some((l) => BANNED.test(l) || l.includes("—")))

  /* Every line that depends on a plan is the plan's own, read from its table. */
  const free = siteLimits("free")
  const pro = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const scale = siteLimits(SCALE_CHECKOUT_PLAN_ID)
  check("each fee is the fee table's", lines.free.features.includes(getFeeDescription("free")) && lines[PRO_CHECKOUT_PLAN_ID].features.includes(`Lower fee: ${getFeeDescription(PRO_CHECKOUT_PLAN_ID)}`) && lines[SCALE_CHECKOUT_PLAN_ID].features.includes(`Lowest fee: ${getFeeDescription(SCALE_CHECKOUT_PLAN_ID)}`))
  const rate = (s: string) => Number(/([\d.]+)%/.exec(s)?.[1])
  check("lower and lowest are so", rate(getFeeDescription(PRO_CHECKOUT_PLAN_ID)) < rate(getFeeDescription("free")) && rate(getFeeDescription(SCALE_CHECKOUT_PLAN_ID)) < rate(getFeeDescription(PRO_CHECKOUT_PLAN_ID)))
  check("Free's websites are its own number", lines.free.features.includes(`Your creator page and ${free.maxSites} websites`))
  check("Free claims no domain and shows it greyed; Pro claims one only because it has it", !lines.free.features.includes("Your own domain") && lines.free.excluded.join() === (free.customDomain ? "" : "Your own domain") && lines[PRO_CHECKOUT_PLAN_ID].features.includes("Your own domain") === pro.customDomain)
  check("no branding only where the plan removes it", lines[PRO_CHECKOUT_PLAN_ID].features.includes("No Storelib branding") === pro.removeBranding && !lines.free.features.includes("No Storelib branding"))
  check("website counts are the tables'", lines[PRO_CHECKOUT_PLAN_ID].features.includes(`Up to ${pro.maxSites} websites`) && lines[SCALE_CHECKOUT_PLAN_ID].features.includes(`Up to ${scale.maxSites} websites`))
  check("more and most AI edits are so", (!lines[PRO_CHECKOUT_PLAN_ID].features.includes("More AI edits each month") || pro.aiEditsPerMonth > free.aiEditsPerMonth) && (!lines[SCALE_CHECKOUT_PLAN_ID].features.includes("The most AI edits each month") || (scale.aiEditsPerMonth > pro.aiEditsPerMonth && scale.aiEditsPerMonth >= Math.max(free.aiEditsPerMonth, pro.aiEditsPerMonth))))
  check("the most room for files is so", !lines[SCALE_CHECKOUT_PLAN_ID].features.includes("The most room for your files") || Object.values(PLAN_LIMITS).every((l) => l.storageQuotaBytes <= PLAN_LIMITS[SCALE_CHECKOUT_PLAN_ID].storageQuotaBytes))

  /* The lines every plan has, each tied to the code that provides it (as tests/pricing-plans.test.ts ties the app's). */
  const exists = (f: string) => existsSync(join(root, f))
  const products = read("app/(storelib)/app/products/new/product-editor.tsx")
  const shared: Record<string, boolean> = {
    "Sell unlimited digital products and courses": /"digital" \| "course"/.test(products) && !/maxProducts|max_products|productLimit/.test(read("lib/billing/plans.ts") + read("lib/storage/plans.ts")),
    "Get paid straight to your bank": /stripe_account_id/.test(read("lib/checkout/fulfil-payment.ts")) && exists("app/(storelib)/app/payouts/payouts-client.tsx"),
    "Email your customers": exists("app/(storelib)/app/emails/page.tsx") && exists("app/api/email/send/route.ts"),
    "See your sales and visitors": exists("app/(storelib)/app/analytics/page.tsx"),
    "Verified badge on your page": /const userHasPro = userPlan === "growth" \|\| userPlan === "pro"/.test(read("components/onepage/onepage-editor.tsx")),
    "Everything in Free": true,
    "Everything in Pro": true,
  }
  const fromTables = (l: string) => /% \+ \$0\.25 per sale$/.test(l) || /^Your creator page and \d+ websites$/.test(l) || /^Up to \d+ websites$/.test(l) || ["Your own domain", "No Storelib branding", "More AI edits each month", "The most AI edits each month", "The most room for your files"].includes(l)
  for (const l of all) check(`"${l}" is from a table or backed by the code`, fromTables(l) || shared[l] === true)
  check("nothing the old cards were warned off (custom code, Shopify, API, priority, physical)", !all.some((l) => /custom code|shopify|api|priority|white.?label|physical/i.test(l)))

  const section = read("components/marketing/pricing-section.tsx")
  const cards = read("components/billing/plan-cards.tsx")
  check("the public cards (home and /pricing) get these lines and the quiet tick; onboarding keeps its own", /lines=\{PUBLIC_LINES\} tick="ink"/.test(section) && /<PlanCards compact actions=\{actions\} \/>/.test(section))
  check("the quiet tick is one thin stroke in grey, no plan colour, no circle", /function InkTick\(\)/.test(cards) && /text-\[#3f3f46\]/.test(cards) && /strokeWidth=\{1\.6\}/.test(cards) && !/rounded-full[^"]*data-plan-tick/.test(cards))
  check("every other surface draws the plan's lines and checks as before", /\(lines\?\.features \?\? plan\.features\)/.test(cards) && /tick = "plan"/.test(cards))
  check("/pricing still renders the section", /<PricingSection\b/.test(read("app/(storelib)/(marketing)/pricing/pricing-client.tsx")))
}

console.log("\n── Your AI tools work here too ──")
{
  const html = renderToStaticMarkup(createElement(AiToolsSection))
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("\n")
  const src = read("components/marketing/home/ai-tools-section.tsx")
  check("its heading", /aria-label="Your AI tools work here too"/.test(html) && /<h2 id="ait-title"/.test(html))
  check("four marks: Claude, ChatGPT and Codex, Cursor, GitHub Copilot, as inline SVG", (html.match(/<li title="[^"]+"><svg viewBox="0 0 24 24"/g) ?? []).length === 4 && /title="Claude"/.test(html) && /title="Cursor"/.test(html))
  check("Claude keeps its own orange", /fill="#D97757"/.test(html))
  const lede = html.match(/<p class="ait-lede">([^<]+)<\/p>/)?.[1] ?? ""
  check("one line, true to a connection: drafts, and the creator publishes", /Claude Code, Codex or Cursor/.test(lede) && /draft/.test(lede) && /publish/.test(lede), lede)
  const docs = read("content/developers/ai.md")
  check("the button goes to the page that explains connecting an agent", /href="\/developers\/ai#connect-an-agent-directly"/.test(html) && /^## Connect an agent directly$/m.test(docs) && /It cannot publish/.test(docs))
  const tools = new Set<string>([...TOOLS, ...PROJECT_TOOLS].map((t) => t.name))
  const calls = AI_TOOLS_SCRIPT.filter((l) => l.kind === "call").map((l) => l.text.replace(/\(.*$/, ""))
  check("every tool the terminal calls is a real Storelib MCP tool", calls.length >= 6 && calls.every((c) => tools.has(c)), calls.filter((c) => !tools.has(c)))
  check("it builds a page, adds sections, sets the theme, checks and previews", ["storelib_create_page", "storelib_create_section", "storelib_create_safe_patch", "storelib_update_styles", "storelib_run_tests", "storelib_run_preview"].every((c) => calls.includes(c)))
  check("it never claims the agent published (an agent cannot)", !AI_TOOLS_SCRIPT.some((l) => /published|publishing|storelib_publish/i.test(l.text)) && /draft/.test(AI_TOOLS_SCRIPT[AI_TOOLS_SCRIPT.length - 2].text))
  check("every line is in the markup from the start, so the box never changes size", (html.match(/class="ait-line /g) ?? []).length === AI_TOOLS_SCRIPT.length)
  const frames = [...css.matchAll(/@keyframes ait-[\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1])
  check("keyframes move transform and opacity only", frames.length >= AI_TOOLS_SCRIPT.length && frames.every((f) => !/(width|height|top|left|margin|padding|filter|clip|background)\s*:/.test(f)))
  check("paused until on screen, and the tab visible", /animation-play-state:paused/.test(css) && /\.ait-term\[data-live\] \.ait-line,\.ait-term\[data-live\] \.ait-cover,\.ait-term\[data-live\] \.ait-caret\{animation-play-state:running\}/.test(css) && /new IntersectionObserver/.test(src) && /visibilitychange/.test(src) && /document\.hidden/.test(src))
  check("reduced motion shows the finished terminal, still", /@media \(prefers-reduced-motion:reduce\)\{\s*\.ait-line\{animation:none!important;opacity:1;transform:none\}\s*\.ait-cover\{display:none\}/.test(css))
  check("no scroll listener, no per-frame state", !/addEventListener\("scroll"|requestAnimationFrame|useState/.test(src))
  check("not loud: no backdrop blur, no glow, the card a quiet dark with a deep purple corner", !/backdrop-filter|filter:\s*blur|radial-gradient/.test(css) && /\.ait-card\{[^}]*linear-gradient\(125deg,#0d0c10 0%,#100e16 46%,#1b1430 100%\)/.test(css))
  check("the corners a pixel tighter than the page's 32px", /\.ait-card\{[^}]*border-radius:clamp\(21px,2\.4vw,31px\)/.test(css))
  check("words: no em dash, banned word or fans", !/—/.test(text(html) + AI_TOOLS_SCRIPT.map((l) => l.text).join(" ")) && !BANNED.test(text(html)) && !/\bfans?\b/i.test(text(html)))

  const page = read("app/(storelib)/(marketing)/page.tsx")
  const lazy = read("components/marketing/home/lazy-sections.tsx")
  check("placed right after the integrations, before the earnings", page.indexOf("<LazyIntegrationsSection />") > 0 && page.indexOf("<LazyIntegrationsSection />") < page.indexOf("<LazyAiToolsSection />") && page.indexOf("<LazyAiToolsSection />") < page.indexOf("<LazyEarningsCalculator />"))
  check("lazily loaded, with its stylesheet and a measured box", /export const LazyAiToolsSection = lazySection\(\(\) => import\("\.\/ai-tools-section"\)\.then\(\(m\) => m\.AiToolsSection\), \{\s*name: "ai-tools",[\s\S]*?minHeight: "max\(calc\(923px \+ 2vw - clamp\(0px, \(100vw - 1023px\) \* 100000, 100000px\)\), min\(19\.7vw \+ 496px, 782px\)\)",\s*styles: \(\) => import\("\.\/ai-tools-section"\)\.then\(\(m\) => m\.AI_TOOLS_STYLES\),/.test(lazy))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
