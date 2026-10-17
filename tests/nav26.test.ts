/**
 * ===========================================================================
 *  ROUND 26 (W2): THE COMMUNITY ADMIN'S ROW OF TABS AND ITS OVERVIEW
 * ===========================================================================
 * The owner's asks 2 and 3, and the admin half of 11:
 *
 *   ROW       stuck under /app's header, the pill in the middle of a 52px
 *             row at every width; the settings column 20px under it
 *   HOVER     nothing about a tab changes size when it is pointed at,
 *             pressed or chosen: only its ground, its ink and its ring;
 *             no mask over the row (a layer redrawn on every hover), the
 *             fades only on a side with more to scroll to; no room to
 *             scroll the strip up and down, no Back gesture at its end
 *   REVEAL    the tab you are on, half under a fade, glides to the middle
 *             of the row, at once on the first paint and with reduced motion
 *   OVERVIEW  four figures at most, none twice, each counted by the server;
 *             the money only for a community that sells and a person who
 *             may price it; no chart, no selector, no link card; events and
 *             why people left only when there is something to show; the
 *             frame draws as many figures in the same boxes
 *   LOOK      /app is never dark (lib/appearance): the admin keeps its one
 *             light look whatever the person chose for Storelib's pages
 *
 * scripts/check-community-admin-nav26.mjs measures all of it in Chromium at
 * 1440, 820 and 390 (touch, 4x CPU).
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { TABS_FADE_PX, nextSteps, overviewFigures, tabRevealLeft, tabsMore } from "@/components/community/creator/logic"
import { allowedActions } from "@/lib/communities/permissions"
import { APPEARANCE_BOOT, THEMED_PREFIXES } from "@/lib/appearance/site-appearance"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)
const read = (p: string) => readFileSync(p, "utf8")

const figures = { members: 1284, active30d: 702, new30d: 232, paidMembers: 1201, mrrCents: 2_183_400, currency: "usd", cancellations30d: 18, posts7d: 540, comments7d: 1650 }

function main() {
  const shell = code("components/community/creator/community-shell.tsx")
  const tabs = shell.slice(shell.indexOf("export function CommunityTabs"), shell.indexOf("export function CommunityShell"))
  const settings = code("components/community/creator/settings-section.tsx")
  const overview = code("components/community/creator/overview.tsx")
  const frame = code("components/community/creator/section-frame.tsx")
  const page = code("app/app/community/[id]/page.tsx")

  console.log("\nROW")
  check("the row is the pane's sticky top: the pane starts under /app's header at every width", /data-community-tabs-bar="" className="orders-bar sticky top-0 z-10 bg-\[#f8f9fa\]"/.test(shell) && /orders-pane h-full overflow-y-auto/.test(shell))
  check("8px above the 36px pill from 768px, 6px above a phone's 40px one", /mx-auto pt-1\.5 md:pt-2/.test(shell) && /inline-flex h-9 [^"]*max-md:h-10/.test(tabs))
  check("and the same under it, so the pill sits in the middle of a 52px row", /pb-1\.5 scrollbar-hide md:gap-0\.5 md:pb-2/.test(tabs) && 6 + 40 + 6 === 52 && 8 + 36 + 8 === 52)
  check("the settings column sits 20px under that row (52 + 20)", /sticky top-\[72px\] hidden lg:block/.test(settings) && !/top-\[68px\]/.test(settings))

  console.log("\nHOVER")
  const tabClass = /className=\{cn\(\s*"(inline-flex h-9[^"]*)",\s*on\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)",/.exec(tabs)
  check("the tab's classes are read", !!tabClass)
  if (tabClass) {
    const [, base, on, off] = tabClass
    const sizing = /(^|\s)([a-z:-]*:)?(font-|text-\[\d|p[xytrbl]?-|m[xytrbl]?-|h-|w-|border|scale|translate|gap-|leading-|tracking-|ring-)/
    check("the one you are on changes no size, only its ground, ink and shadow", !on.split(/\s+/).some((c) => sizing.test(c)), on)
    check("pointing and pressing change no size either", !off.split(/\s+/).some((c) => sizing.test(c)), off)
    check("one weight, one size, one height for every tab", /font-medium/.test(base) && /text-\[14px\]/.test(base) && !/font-semibold|font-bold/.test(on + off))
    check("only colours and the shadow move, over 100ms", /transition-\[background-color,color,box-shadow\] duration-100/.test(base))
  }
  check("no mask over the row (a layer drawn again on every hover)", !/mask-image/.test(tabs))
  check("the fades are strips of the row's grey, shown only on a side with more", /data-tabs-fade="left"[^>]*group-data-more-left\/tabs:opacity-100/.test(tabs) && /data-tabs-fade="right"[^>]*group-data-more-right\/tabs:opacity-100/.test(tabs) && /pointer-events-none absolute inset-y-0/.test(tabs))
  check("they follow the scroll and the width", /addEventListener\("scroll", mark, \{ passive: true \}\)/.test(tabs) && /new ResizeObserver\(mark\)/.test(tabs))
  check("a row that fits has no fade", JSON.stringify(tabsMore(0, 900, 900)) === JSON.stringify({ left: false, right: false }))
  check("at its start only the right one, at its end only the left one", tabsMore(0, 390, 900).right && !tabsMore(0, 390, 900).left && tabsMore(510, 390, 900).left && !tabsMore(510, 390, 900).right)
  check("the strip cannot scroll up and down, and a swipe at its end stays in it", /overflow-x-auto overflow-y-hidden overscroll-x-contain/.test(tabs))
  check("no scrollbar on the strip", /scrollbar-hide/.test(tabs))

  console.log("\nREVEAL")
  const row = { left: 0, width: 390 }
  check("a tab clear of both fades leaves the row where it is", tabRevealLeft(row, { left: 100, width: 80 }, { left: 0, client: 390, width: 900 }) === null)
  check("one half under the right fade is brought to the middle", tabRevealLeft(row, { left: 350, width: 80 }, { left: 0, client: 390, width: 900 }) === 195)
  check("never past the ends of the row", tabRevealLeft(row, { left: -60, width: 80 }, { left: 20, client: 390, width: 900 }) === 0 && tabRevealLeft(row, { left: 370, width: 80 }, { left: 500, client: 390, width: 900 }) === 510)
  check("under a fade counts as out of view", tabRevealLeft(row, { left: TABS_FADE_PX - 1, width: 80 }, { left: 40, client: 390, width: 900 }) !== null)
  check("it glides after a press, at once on the first paint and with reduced motion", /const still = first \|\| window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(tabs) && /behavior: still \? "auto" : "smooth"/.test(tabs))
  check("the tabs stay links in a labelled nav, the one you are on said so", /<nav ref=\{nav\} aria-label="Community sections"/.test(tabs) && /aria-current=\{on \? "page" : undefined\}/.test(tabs) && /focus-visible:shadow-\[inset_0_0_0_2px/.test(tabs))

  console.log("\nOVERVIEW")
  const owner = { slug: "club", can: allowedActions("owner") }
  const moderator = { slug: "club", can: allowedActions("moderator") }
  const sells = overviewFigures(owner, { figures, sells: true })
  const free = overviewFigures(owner, { figures, sells: false })
  const mod = overviewFigures(moderator, { figures, sells: true })
  const labels = (x: { label: string }[]) => x.map((f) => f.label)
  check("a community that sells: Members, Active, Paid members, Monthly revenue", JSON.stringify(labels(sells)) === JSON.stringify(["Members", "Active, 30 days", "Paid members", "Monthly revenue"]), labels(sells))
  check("a free one: Members, Active, Posts this week", JSON.stringify(labels(free)) === JSON.stringify(["Members", "Active, 30 days", "Posts this week"]), labels(free))
  check("no money for somebody who may not price it", !labels(mod).includes("Monthly revenue") && !labels(mod).includes("Paid members"), labels(mod))
  check("never more than four, never one twice", [sells, free, mod].every((x) => x.length <= 4 && new Set(labels(x)).size === x.length))
  check("who joined and who cancelled are the lines under their counts, not cells", sells[0].foot === "+232 in 30 days" && sells[2].foot === "18 cancellations in 30 days" && !labels(sells).some((l) => /New, 30 days|Cancellations|Per paid member/.test(l)))
  check("the revenue is the server's, as money", sells[3].value === "$21,834" && sells[3].foot === "From active memberships")
  check("nothing joined, nothing cancelled: no line rather than a zero", overviewFigures(owner, { figures: { ...figures, new30d: 0, cancellations30d: 0 }, sells: true }).every((f, i) => i === 1 || i === 3 || f.foot === undefined))
  check("a figure opens its screen only for a role that may", sells[0].href === "/app/community/club/members" && sells[3].href === "/app/community/club/analytics" && mod[2].href === "/app/community/club/feed")
  check("the Overview draws what overviewFigures says, nothing derived beside it", /const figures = overviewFigures\(head, data\)/.test(overview) && !/Per paid member|mrrCents \/ f\.paidMembers|Math\.random|sample/i.test(overview))
  check("no chart, no selector, no link card", !/Chart|<select|SelectField|PickButton|CopyAddress|data-overview-share/.test(overview))
  check("Copy link is a shortcut once there is a page to share; View page stays in the header", /const shareable = head\.status === "published" && !head\.suspended/.test(overview) && /data-overview-copy/.test(overview) && /data-community-view="">[\s\S]{0,120}View page/.test(shell))
  check("waiting, setup and events only when they have something", /\{waiting\.length \?/.test(overview) && /data\.steps\.length > 0 \?/.test(overview) && /head\.eventsEnabled && \(data\.upcoming\.length > 0 \|\| unsellable\)/.test(overview))
  check("why people left only once somebody said", /left && left\.total > 0 \?/.test(page))
  check("rows on a phone, two by two up to 1024px, one row after", /grid grid-cols-1 gap-px bg-\[#eef0f2\]", figureColumns\(figures\.length\)/.test(overview) && /n >= 4 \? "sm:grid-cols-2 lg:grid-cols-4"/.test(overview))
  check("the phone's row: the name and its line on the left, the number on the right", /grid-cols-\[minmax\(0,1fr\)_auto\][^"]*sm:grid-cols-1/.test(overview) && /col-start-2 row-span-2 row-start-1[^"]*text-right/.test(overview))
  check("every line of a figure has its own height, so the frame's boxes are the figure's", /leading-5[^"]*sm:leading-\[18px\]/.test(overview) && /block h-4 truncate text-\[12px\] leading-4/.test(overview) && /block h-4 text-\[12px\] leading-4/.test(frame))
  check("the frame draws as many figures in the same columns", /function FiguresFrame\(\{ n \}/.test(frame) && /figureColumns\(n\)/.test(frame) && /<FiguresFrame n=\{facts\.figures \?\? 4\} \/>/.test(frame) && /figures: head\.access === "paid" && head\.can\.manage_pricing === true \? 4 : 3/.test(shell) && /facts=\{\{ figures: ctx\.community\.access === "paid" \? 4 : 3 \}\}/.test(page))
  check("the setup list is still the server's", nextSteps({ paid: false, paymentsReady: true, published: true, members: 5, invites: 1, posts: 0, courses: 0, events: 0, customized: true, rules: 1, classroomEnabled: false, eventsEnabled: false }, "/b").some((s) => s.id === "welcome"))

  console.log("\nFRAME AND STATE")
  check("the Page frame draws the editor's side panel from 1280px, as the editor does", /xl:grid xl:grid-cols-\[minmax\(0,1fr\)_380px\][^"]*" data-frame-page=""/.test(frame) && /<PanelFrame rows=\{5\} className="hidden xl:block" \/>/.test(frame))
  check("a community being deleted says when, and that Settings keeps it, before the archived line", /\) : deleting \? \(/.test(shell) && shell.indexOf(") : deleting ? (") < shell.indexOf(") : head.archived ? (") && /Deleting on [^\n]*Members can read it until then\. Keep it from Settings\.[^\n]*shortDate\(deleting\.deleteAt\)|Deleting on [^\n]*shortDate\(deleting\.deleteAt\)[^\n]*Keep it from Settings\./.test(shell))

  console.log("\nMEMBERS")
  const kit = code("components/community/creator/ui-kit.tsx")
  const members = code("components/community/creator/members-section.tsx")
  check("the Members card is a container and chooses table or rows by its own width", /export const LIST_BOX = "@container\/list"/.test(kit) && /data-members-table=""\s*className=\{LIST_BOX\}/.test(members))
  check("the table from an 860px card, the rows below it", /WIDE_TABLE = "hidden w-full table-fixed[^"]*@min-\[860px\]\/list:table"/.test(kit) && /WIDE_LIST = "divide-y[^"]*@min-\[860px\]\/list:hidden"/.test(kit) && /<table className=\{WIDE_TABLE\}/.test(members) && /<ul className=\{WIDE_LIST\} data-members-list="">/.test(members))
  check("860px leaves the Member column 200px in every view (536px and 14% fixed; 364px and 34%; 264px and 44%)", 860 - 536 - 0.14 * 860 >= 200 && 860 - 364 - 0.34 * 860 >= 200 && 860 - 264 - 0.44 * 860 >= 200)
  check("the search and the filters share a row only from a 720px card", /flex w-full min-w-0 flex-col @min-\[720px\]\/list:flex-row/.test(members) && !/md:flex-row|max-md:hidden|md:hidden/.test(members.slice(members.indexOf("const toolbar"), members.indexOf("const bulkBar"))))
  check("the other lists keep the screen's switch", /export const TABLE = "hidden w-full table-fixed border-separate border-spacing-0 md:table"/.test(kit))

  console.log("\nLOOK")
  check("/app is not one of the pages that follow the person's look", !THEMED_PREFIXES.some((p) => "/app/community/club".startsWith(p)) && /\/explore/.test(APPEARANCE_BOOT))
  check("the dark look's generator leaves the dashboard out", /"app\/app"/.test(read("scripts/gen-theme-dark.mjs")))

  console.log("\nCOPY")
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of ["components/community/creator/community-shell.tsx", "components/community/creator/overview.tsx", "components/community/creator/section-frame.tsx", "components/community/creator/logic.ts", "scripts/check-community-admin-nav26.mjs", "scripts/render-community-admin-nav26.tsx"]) {
    const src = read(f)
    check(`${f}: no AI words, no em dash`, !banned.test(src) && !src.includes(String.fromCharCode(0x2014)))
  }
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    check(`${lang}: the new lines are translated`, cat.includes('"+{n} in 30 days":') && cat.includes('"{n, plural, one {# cancellation} other {# cancellations}} in 30 days":') && cat.includes('"Deleting on {date}. Members can read it until then. Keep it from Settings.":'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
