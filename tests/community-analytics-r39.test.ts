/**
 * ===========================================================================
 *  ROUND 39: THE ADMIN'S TABS LIGHT AT ONCE, AND A COMMUNITY'S REPORTS
 * ===========================================================================
 * The owner: "when I click between Overview, Page, Posts ... it is not
 * smooth at all. Make sure it's smooth: click, clean, no exaggerated
 * animations, no bumps", and "Add more important stuff to the analytics,
 * ensure the modals and tabs are similar to the /app Analytics page".
 *
 *   THE ROW      no pill glides between tabs any more; the tab pressed is
 *                lit in a render of its own, painted before its section is
 *                drawn (components/community/creator/community-shell.tsx)
 *   THE DATES    the chart's dates are measured on a canvas and drawn as
 *                plain text: recharts' hidden span forced a layout per word,
 *                540ms on the first open of Analytics in the admin
 *   THE REPORTS  a grid of /app report cards under the chart, each with its
 *                switcher; the switcher is one pill that slides; View all is
 *                the /app dialog with a search
 *   BY PLAN      Revenue by plan from the rows: each tier by its name, net
 *                of refunds, with who pays for it at the period's end, and
 *                the period before's net
 *
 * What moves on screen is measured by scripts/check-community-admin-
 * round39.mjs and scripts/check-community-analytics-round39.mjs.
 *
 * Run with:  npx tsx --conditions=react-server tests/community-analytics-r39.test.ts
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { loadCommunityReport } from "@/lib/communities/server/analytics-report"
import { boundsOf, compareBounds, type RangeValue } from "@/lib/date-range/range"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const CID = "c0000000-0000-4000-8000-000000000039"
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const NOW = Date.parse("2026-10-28T10:00:00.000Z")
const TZ = "Europe/Bucharest"
const at = (iso: string) => new Date(Date.parse(iso)).toISOString()

/* Two tiers and a product made for the community; a week (Oct 19 to 25) and the week before. */
function seed() {
  const membership = (n: number, product: string, extra: Record<string, unknown> = {}) => ({ id: `ms${n}`, buyer_id: U(n), product_id: product, status: "active", billing_interval: "month", amount_cents: 1900, currency: "eur", created_at: at("2026-09-01T00:00:00Z"), started_at: at("2026-09-01T00:00:00Z"), canceled_at: null, ended_at: null, trial_end: null, ...extra })
  return {
    communities: [{ id: CID, owner_user_id: U(1), creator_id: null, created_at: at("2025-06-01T00:00:00Z") }],
    community_members: [{ id: "m1", community_id: CID, user_id: U(1), status: "active", role: "owner", source: "owner", joined_at: at("2026-01-01T00:00:00Z") }],
    community_tiers: [
      { community_id: CID, product_id: "prodM", billing: "recurring", kind: "paid", name: "Members" },
      { community_id: CID, product_id: "prodL", billing: "one_time", kind: "paid", name: "Lifetime" },
    ],
    products: [{ id: "prodD", community_id: CID, type: "digital", title: "Prompt deck" }],
    memberships: [
      membership(2, "prodM"), // paying all along
      membership(3, "prodM"), // paying all along
      membership(4, "prodM", { status: "canceled", canceled_at: at("2026-10-21T12:00:00Z"), ended_at: at("2026-10-21T12:00:00Z") }), // gone inside the week
    ],
    orders: [
      { id: "o1", product_id: "prodM", status: "completed", amount_cents: 1900, refund_amount_cents: null, refunded_at: null, currency: "eur", created_at: at("2026-10-20T12:00:00Z") },
      { id: "o2", product_id: "prodM", status: "refunded", amount_cents: 1900, refund_amount_cents: 1900, refunded_at: at("2026-10-22T12:00:00Z"), currency: "eur", created_at: at("2026-10-21T12:00:00Z") }, // all of it back: nothing
      { id: "o3", product_id: "prodL", status: "refunded", amount_cents: 29900, refund_amount_cents: 9900, refunded_at: at("2026-10-23T12:00:00Z"), currency: "eur", created_at: at("2026-10-22T12:00:00Z") }, // 200 kept
      { id: "o4", product_id: "prodL", status: "completed", amount_cents: 29900, refund_amount_cents: null, refunded_at: null, currency: "eur", created_at: at("2026-10-14T12:00:00Z") }, // the week before
      { id: "o5", product_id: "prodD", status: "completed", amount_cents: 500, refund_amount_cents: null, refunded_at: null, currency: "eur", created_at: at("2026-10-24T12:00:00Z") },
    ],
  }
}

const WEEK: RangeValue = { start: "2026-10-19", end: "2026-10-25", preset: "custom" }

async function main() {
  console.log("\nRevenue by plan")
  const t = seed()
  const db = { from: fakeDb(t as never).from, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }
  const b = boundsOf(WEEK, TZ, NOW)
  const r = await loadCommunityReport(db as never, t.communities[0] as never, { start: b.start, end: Math.max(b.end, b.start + 1), compare: compareBounds(WEEK, { mode: "previous_period" }, TZ, NOW), timeZone: TZ } as never, NOW)
  const plans = r.money?.byPlan ?? null
  check("each tier by its own name, the product made for it by its title, most money first", same(plans?.map((p) => p.label), ["Lifetime", "Members", "Prompt deck"]), plans)
  check("Lifetime: 299 less the 99 given back; the week before, one sold whole", same(plans?.find((p) => p.key === "prodL"), { key: "prodL", label: "Lifetime", cents: 20000, paying: 0, previous: 29900 }), plans?.find((p) => p.key === "prodL"))
  check("Members: 19 (the order given back in full is nothing), two paying at the end, the one who cancelled is not", same(plans?.find((p) => p.key === "prodM"), { key: "prodM", label: "Members", cents: 1900, paying: 2, previous: 0 }), plans?.find((p) => p.key === "prodM"))
  check("the plans add up to the memberships line of By source", (plans ?? []).reduce((s, p) => s + p.cents, 0) === r.money?.bySource.find((x) => x.key === "memberships")?.cents, { plans: plans?.map((p) => p.cents), bySource: r.money?.bySource })

  console.log("\nthe row of tabs")
  const shell = code("components/community/creator/community-shell.tsx")
  check("no pill glides: nothing animates the lit tab's ground, and the round 37 glide is gone", !/TAB_PILL_MS|pillWas|pill\.animate\(/.test(shell))
  check("the lit tab's ground is still its own box, in the server's markup", /\{on \? <span aria-hidden data-tab-pill=""/.test(shell))
  check("a held section: the tab pressed is lit in a render of its own, and the section shown after the paint", /setPressed\(id\)\s+afterPaint\(\(\) => \{/.test(shell) && /shown=\{pressed \?\? lit\}/.test(shell) && /function afterPaint\(fn: \(\) => void\)/.test(shell))
  check("a later press wins: a press superseded before the paint does nothing", /if \(pressedRef\.current !== id\) return/.test(shell) && /pressedRef\.current = null\s+setPressed\(null\)/.test(shell))

  console.log("\nthe chart's dates")
  const chart = code("components/app/analytics-chart.tsx")
  check("measured on a canvas, never in a hidden span: no preserveStartEnd and no recharts <Text> for the dates", !/preserveStartEnd/.test(chart) && /tick=\{<DateTick widest=\{widest\} plotLeft=\{plotLeft\} \/>\}/.test(chart) && /interval=\{0\}/.test(chart) && /measureText/.test(chart))

  console.log("\nthe switcher and View all (/app's, shared)")
  const reports = code("app/app/analytics/analytics-reports.tsx")
  check("one pill per switcher, sliding by translate and width", /data-segment-pill=""[\s\S]{0,200}transition-\[translate,width\]/.test(reports) && /translate: `\$\{thumb\.x\}px 0`/.test(reports) && !/scale-\[0\.92\] opacity-0/.test(reports))
  check("View all: the dialog with every row, and a search from nine rows", /const SEARCH_FROM = 9/.test(reports) && /<AllRows open=\{all\}/.test(reports) && /data-all-search=""/.test(reports) && /Nothing matches “\{query\}”\./.test(reports))
  check("a row can open what it is (a community's post)", /r\.href \? \(\s*<a href=\{r\.href\} target="_blank"/.test(reports))

  console.log("\nthe community's reports")
  const section = code("components/community/creator/analytics-section.tsx")
  const order = [...section.matchAll(/card: "([a-z]+)"/g)].map((m) => m[1])
  check("in /app's grid: Visitors, Joins, Revenue, Retention, Active members, Why members left, Top posts, Top members, Event attendance, Program progress", same(order, ["visitors", "joins", "revenue", "retention", "active", "left", "posts", "contributors", "events", "programs"]), order)
  check("the grid is /app Analytics' grid", /<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-reports=/.test(section))
  check("Visitors: Source, Site, Country, Device, with a mark, a flag and a device", /list\("source", tt\("Source"\)[\s\S]{0,120}\{ icon: "source" \}/.test(section) && /list\("referrer", tt\("Site"\)/.test(section) && /list\("country", tt\("Country"\)[\s\S]{0,140}\{ flag: true \}/.test(section) && /list\("device", tt\("Device"\)[\s\S]{0,140}\{ icon: "device" \}/.test(section))
  check("which cards there are follows the community, so the grid is the same before and after the answer", /if \(r \? m !== null : head\.access === "paid"\)/.test(section) && /if \(head\.eventsEnabled\)/.test(section) && /if \(head\.classroomEnabled && detail\)/.test(section))
  check("a failed read is said beside the period, in the row's height, never above the chart", /data-analytics-controls=""[\s\S]{0,400}data-analytics-failed=""/.test(section) && !/<Notice>/.test(section))
  check("the community's own sources wear a mark: Your Storelib pages, the Storelib app", /storelib: glyph\("link"\)/.test(raw("components/analytics/source-icon.tsx")) && /app: glyph\("mobile"\)/.test(raw("components/analytics/source-icon.tsx")))
  check("dark: a glyph's body and face turned round, so Search is not a white dot", /\[data-glyph\] \[fill="#1a1a2e"\][^{]*\{\s*fill: #ececee;/.test(raw("app/theme-dark.css")) && /"data-glyph": name/.test(raw("components/analytics/source-icon.tsx")))

  console.log("\nwords")
  const langs = ["es", "fr", "de", "pt-BR", "it", "pl"]
  for (const key of ["Revenue by plan", "Event attendance", "Program progress", "Retention", "Top members", "Nothing matches “{query}”."]) {
    check(`"${key}" in every language`, langs.every((l) => raw(`lib/i18n/catalog/${l}.ts`).includes(`${JSON.stringify(key)}:`)))
  }
  for (const f of ["components/community/creator/analytics-section.tsx", "components/community/creator/community-shell.tsx", "app/app/analytics/analytics-reports.tsx", "components/app/analytics-chart.tsx", "lib/communities/server/analytics-report.ts", "scripts/check-community-admin-round39.mjs", "scripts/check-community-analytics-round39.mjs"]) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text.replace(/\btransform(?=[\s:,"'`)\]}.]|$)/gi, "")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
