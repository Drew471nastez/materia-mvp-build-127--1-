/**
 * ===========================================================================
 *  WAVE 10: ANALYTICS KEEPS ITS SHAPE WHATEVER IS CHOSEN
 * ===========================================================================
 * The owner: "The order of the tabs and the showing of the tabs and position
 * should not be different when I switch analytics from OnePage to All, to
 * Communities, to Digital products."
 *
 *   SLOTS     which cards keep a place is decided by what the seller sells
 *             and has (lib/analytics/sections slotsFor), never by the place
 *             or the type chosen; a kept card with nothing for the choice
 *             says why in one line (slotNote)
 *   FIGURES   four figures in four fixed places for every type: the store's
 *             Visitors, Revenue, Orders, Conversion and the communities'
 *             Visits, Payments received, New members, Join rate; the place
 *             chosen is kept across a switch
 *   CARDS     Downloads, Refunds, Shipping, Clicks between pages, the
 *             Subscribers tabs and the Communities cards no longer come and
 *             go with the filter; the community switcher sits under the
 *             figures, never above them
 *   SMOOTH    the communities' answers are kept between views and read ahead
 *
 * Measured in a browser by the screenshot probe of this wave
 * (scripts/render-analytics-page.tsx ?communities=2): the same 20 cards and
 * the same tab row at the same y for All, OnePage, Digital and Physical, at
 * 1280 and 390, with no blank frame during a switch.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COMMUNITY_METRICS, STORE_METRICS, metricSlot, profileOf, slotNote, slotsFor } from "../lib/analytics/sections"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nSlots follow the seller, not the filter\n")
{
  const both = profileOf({ products: [{ type: "digital" }, { type: "physical" }], onePageId: "op", websites: [{ published: true }], communities: 2 })
  const all = slotsFor(both, { productKind: null })
  check("a seller of both kinds with a website and communities keeps every slot", all.shipping && all.downloads && all.refunds && all.communities && all.siteClicks, all)
  check("  the same slots whatever place or type: slotsFor takes no place and no type", slotsFor.length === 2 && JSON.stringify(slotsFor(both, { productKind: null })) === JSON.stringify(all))
  const digitalOnly = slotsFor(profileOf({ products: [{ type: "digital" }], onePageId: null, websites: [], communities: 0 }), { productKind: null })
  check("a seller of downloads has no Shipping, Communities or Clicks between pages slot", !digitalOnly.shipping && digitalOnly.downloads && !digitalOnly.communities && !digitalOnly.siteClicks, digitalOnly)
  const oneProduct = slotsFor(both, { productKind: "physical" })
  check("one physical product chosen: Shipping kept, Downloads not (a different question)", oneProduct.shipping && !oneProduct.downloads)
}

console.log("\nA kept card says why it is empty\n")
{
  check("Shipping under Digital", /don't ship/.test(slotNote("shipping", { property: "all", mode: "digital" }) ?? ""))
  check("  and nothing under All or Physical", slotNote("shipping", { property: "all", mode: "all" }) === null && slotNote("shipping", { property: "onepage", mode: "physical" }) === null)
  check("Downloads under Physical", /digital products/.test(slotNote("downloads", { property: "all", mode: "physical" }) ?? ""))
  check("Communities under OnePage, or under Physical", !!slotNote("communities", { property: "onepage", mode: "all" }) && !!slotNote("communities", { property: "all", mode: "physical" }) && slotNote("communities", { property: "all", mode: "digital" }) === null)
  check("Clicks between pages on the OnePage and the creator page, not on a website", !!slotNote("siteClicks", { property: "onepage", mode: "all" }) && !!slotNote("siteClicks", { property: "creator_page", mode: "all" }) && slotNote("siteClicks", { property: "website:w1", mode: "all" }) === null)
  check("every note is a translated sentence (tt)", (read("lib/analytics/sections.ts").match(/\btt\("/g) ?? []).length >= 5)
}

console.log("\nFour figures in four places\n")
{
  check("the store's four and the communities' four, the same length", STORE_METRICS.length === 4 && COMMUNITY_METRICS.length === 4)
  check("  audience, money, how many, rate: Visitors↔Visits, Revenue↔Payments, Orders↔New members, Conversion↔Join rate", JSON.stringify(COMMUNITY_METRICS) === JSON.stringify(["visits", "revenue", "joined", "joinRate"]) && JSON.stringify(STORE_METRICS) === JSON.stringify(["views", "revenue", "orders", "conversion"]))
  check("the place chosen is kept: Revenue is place 1, unknown is 0", metricSlot(STORE_METRICS, "revenue") === 1 && metricSlot(STORE_METRICS, "nope") === 0)
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
  check("  the page hands its place to the communities' row and takes it back", /slot=\{metricSlot\(tabOrder, chartMetricFilter\)\} onSlot=\{\(i\) => setChartMetricFilter\(tabOrder\[i\] \?\? tabOrder\[0\]\)\}/.test(client))
  const reports = read("app/(storelib)/app/analytics/community-reports.tsx")
  check("the communities' row is four columns from md, like the page's, never six", /md:grid md:grid-cols-4/.test(reports) && !/lg:grid-cols-6/.test(reports) && /COMMUNITY_METRICS\.map\(\(k\) => byKey\[k\]\)/.test(reports))
  check("  Visits and Join rate open their reports", /case "metric:visits":/.test(reports) && /case "metric:joinRate":/.test(reports))
  check("  MRR and members now are kept under the figures", /tt\("MRR now \{amount\}"/.test(reports) && /tt\("\{n\} members now"/.test(reports))
  check("the switcher between communities is under the figures, never above them", /<Overview [^\n]*\/>\n\s*\{switcher\}/.test(reports))
}

console.log("\nCards that no longer come and go\n")
{
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
  const grid = read("app/(storelib)/app/analytics/analytics-reports.tsx")
  const commerce = read("app/(storelib)/app/analytics/commerce-reports.tsx")
  const reports = read("app/(storelib)/app/analytics/community-reports.tsx")
  check("Downloads and Refunds for every type the seller has, not for Digital and Physical alone", /if \(slots\.downloads\) wanted\.push\("downloads"\)/.test(client) && !/standingView === "digital" \? \["downloads", "refunds"\]/.test(client))
  check("  Downloads under Physical draws its note in its own card", /standingNotes\[id\] \? <Empty>\{standingNotes\[id\]\}<\/Empty>/.test(grid))
  check("Shipping kept for a store that ships, its note over its own shape (no height change)", /keepShipping=\{slots\.shipping\}/.test(client) && /const shippingCard = keepShipping \|\| \(shipping && !!b\)/.test(commerce) && /noShipping && "invisible"/.test(commerce))
  check("Clicks between pages kept for a seller with a website", /siteClicks=\{slots\.siteClicks \? \{ note: slotNote\("siteClicks"/.test(client) && /\{siteClicks \|\| \(r\?\.siteClicks && !onePage\) \? \(/.test(grid))
  check("Subscribers has its Page and Source tabs for every place", /tabs=\{<Tabs label=\{tt\("Subscribers"\)\}/.test(grid) && /const signupsByPage = signupTab === "property"/.test(grid))
  check("the Communities cards stay under the rest for every place and type, with a note where they do not apply", /extra=\{slots\.communities \? <CommunityReports [^\n]*note=\{slotNote\("communities"/.test(client) && /note \? <ReportEmpty>\{note\}<\/ReportEmpty>/.test(reports))
  check("Communities on their own: money first, then growth, joins, activity, spaces, posts, each community", /<RevenueCard [^\n]*\/>\n\s*<GrowthCard [^\n]*\/>\n\s*<JoinsCard [^\n]*\/>\n\s*<ActivityCard [^\n]*\/>\n\s*<SpacesCard [^\n]*\/>\n\s*<PostsCard [^\n]*\/>\n\s*<CommunitiesCard/.test(reports))
  check("  Community revenue is there even when no community sells, with one line", /tt\("No paid plans in your communities yet\."\)/.test(reports))
}

console.log("\nNo flash between views\n")
{
  const reports = read("app/(storelib)/app/analytics/community-reports.tsx")
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
  check("the communities' answers are kept by community and question, and drawn in the first frame", /const kept = new Map<string, CommunityReport>\(\)/.test(reports) && /useState<Answers>\(\(\) => keptAnswers\(communities, ask\)\)/.test(reports))
  check("  a pointer resting on Communities reads them ahead", /if \(v === "communities"\) return prefetchCommunityAnswers\(communities, safeSpan, against, timeZone\)/.test(client))
  check("  the minute's refresh still asks again", /const fresh = asked\.current !== null && asked\.current\.ask === ask && asked\.current\.refresh !== refresh/.test(reports))
  check("the type picker keeps its one order: All types, Digital, Physical, Communities", /if \(profile\.digital \|\| profile\.membership\) out\.push\(\{ value: "digital"[\s\S]{0,200}out\.push\(\{ value: "physical"[\s\S]{0,200}out\.push\(\{ value: "communities"/.test(client))
  check("the probe can draw a seller with communities", /\?communities=2/.test(read("scripts/render-analytics-page.tsx")) && /communities=\{COMMUNITIES\}/.test(read("scripts/render-analytics-page.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
