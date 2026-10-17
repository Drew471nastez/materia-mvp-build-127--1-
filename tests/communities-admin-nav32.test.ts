/**
 * ===========================================================================
 *  COMMUNITIES ROUND 32: MOVING BETWEEN THE SECTIONS OF A COMMUNITY
 * ===========================================================================
 * The owner: "the navigation between Overview, Posts, Spaces, Learn,
 * Calendar, Members, Moderation, Analytics, Settings takes too much".
 *
 *   SERVER   the gate is two rounds of reads for the owner and three for
 *            staff, not the member side's question; the reads that waited on
 *            each other for no reason go at once; every section page sends
 *            its frame first and its reads under a Suspense boundary
 *   SHELL    every section is read ahead as the shell mounts; a press on one
 *            never opened shows its frame on that frame; a section drawn
 *            again keeps what it shows until its new reads are in; no top
 *            bar for a switch inside the shell
 *   FRAME    the frame's card heads are the section heads' own boxes
 *   WIDTH    the shell's column is /app's widest list column
 *
 *   The numbers: scripts/measure-community-admin-server.mjs (reads and
 *   rounds per section) and scripts/check-community-admin-nav32.mjs (the
 *   press, frame by frame, round 31 against round 32).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"

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
/** The body of one function in a source file, up to the next top level declaration. */
function fn(src: string, name: string): string {
  const at = src.search(new RegExp(`(export )?(async )?function ${name}\\b|export const ${name} =`))
  if (at < 0) return ""
  const rest = src.slice(at + 1)
  const next = rest.search(/\n(export |async function |function |const [A-Z_]+ = )/)
  return next < 0 ? src.slice(at) : src.slice(at, at + 1 + next)
}

function main() {
  console.log("SERVER")
  const creator = code("lib/communities/server/creator.ts")
  const gate = fn(creator, "staffContext")
  check("the page gate no longer asks the member side's viewerContext", gate.length > 0 && !/viewerContext\(/.test(gate) && !/viewerContext\(/.test(fn(creator, "creatorCommunityPage")))
  check("round 1: the creator row and the community at once", /const \[creator, community\] = await Promise\.all\(\[creatorRead, loadCommunity\(db, key\)\]\)/.test(gate))
  check("staff, round 2: their member row and the owner's choices at once", /await Promise\.all\(\[memberOf\(db, community\.id, userId\), rolePermissionsOf\(db, community\.id\)\]\)/.test(gate))
  check("a member, or a row that is not active, is not staff", /if \(row\?\.status !== "active" \|\| !row\.role \|\| row\.role === "member"\) return null/.test(gate))
  check("the owner's own row is still made again if lost, beside the section's reads", /void keepOwnerRow\(db, community\.id, userId\)/.test(gate) && /grantMembership\(db, \{ communityId, userId, source: "owner", role: "owner", status: "active" \}\)/.test(fn(creator, "keepOwnerRow")))
  check("routes still decide with viewerContext (requireCreatorCommunity)", /const viewer = await viewerContext\(db, community, ctx\.userId\)/.test(code("lib/communities/server/context.ts")))
  const overview = fn(creator, "loadOverview")
  check("the overview: the products that sell it are not a round before the figures", !/await recurringProductIds/.test(overview) && /recurringRead\.then\(\(recurring\) => monthlyRevenue\(db, recurring\)\)/.test(overview))
  check("the overview: the unsellable events are counted with the figures, not after", /ctx\.paymentsReady \? Promise\.resolve\(0\) : pricedEventCount\(db, c\.id\),\s*\]\)/.test(overview) && !/await pricedEventCount/.test(overview))
  check("events: the ticket setup is read beside the events", /await Promise\.all\(\[eventReadColumns\(db\), ticketsReady\(db\), eventTicketSetup\(db, communityId\)\]\)/.test(fn(creator, "loadEvents")) && !/tickets: await/.test(fn(creator, "loadEvents")))
  check("spaces: a chat's messages are counted beside the posts, one round", !/const messages = await/.test(fn(creator, "loadSpaces")))
  const learn = code("lib/communities/server/learn-builder.ts")
  check("Learn: whether payouts take payments is asked beside the programs", /await Promise\.all\(\[loadLearnBuilder\(/.test(learn) && !/await checkoutReadyForCreator/.test(learn))

  const pages: [string, string, string][] = [
    ["app/app/community/[id]/page.tsx", "overview", "overviewReads"],
    ["app/app/community/[id]/feed/page.tsx", "feed", "feedReads"],
    ["app/app/community/[id]/spaces/page.tsx", "spaces", "spacesReads"],
    ["app/app/community/[id]/learn/page.tsx", "classroom", "learnReads"],
    ["app/app/community/[id]/events/page.tsx", "events", "eventsReads"],
    ["app/app/community/[id]/members/page.tsx", "members", "membersReads"],
    ["app/app/community/[id]/moderation/page.tsx", "moderation", "moderationReads"],
    ["app/app/community/[id]/analytics/page.tsx", "analytics", "analyticsReads"],
    ["app/app/community/[id]/settings/page.tsx", "settings", "settingsReads"],
  ]
  const reads = code("lib/communities/server/admin-sections.ts")
  for (const [f, id, r] of pages) {
    const src = code(f)
    const page = fn(src, "Community\\w+Page")
    check(`${f}: the gate, then the frame, then the reads under Suspense`, new RegExp(`<SectionSeed id="${id}"[^>]*>\\s*<Suspense fallback=\\{<SectionFrame id="${id}"`).test(page) && new RegExp(`await ${r}\\(ctx`).test(src) && !/await (communityHead|load\w+|list\w+)\(/.test(page))
    check(`${f}: its reads are in admin-sections.ts`, new RegExp(`export async function ${r}\\(`).test(reads))
  }
  check("nothing a section reads waits on its head: the head is in each section's one Promise.all", (reads.match(/Promise\.all\(\[\s*communityHead\(ctx\)/g) ?? []).length >= 6)

  console.log("\nSHELL")
  const shell = code("components/community/creator/community-shell.tsx")
  check("every section is read ahead on the frame after the shell's first paint, not when the browser is idle", /window\.requestAnimationFrame\(\(\) => \{\s*timer = window\.setTimeout\(/.test(shell) && !/requestIdleCallback/.test(shell) && !/Math\.floor\(i \/ 2\) \* 600/.test(shell))
  check("still never on Save-Data or 2G", /readAheadAllowed\(connectionFacts\(\)\)/.test(shell))
  check("a pointer, a finger or the keyboard on a tab brings it to the front", /onMouseEnter=\{\(\) => onWarm\?\.\(t\)\}/.test(shell) && /onTouchStart=\{\(\) => onWarm\?\.\(t\)\}/.test(shell) && /onFocus=\{\(\) => onWarm\?\.\(t\)\}/.test(shell))
  check("a press on a section never opened shows it (its frame) at once and lets the router bring it", /if \(move === "fetch"\) \{\s+fetching\.current = \{ id, at: Date\.now\(\) \}\s+show\(id\)\s+return\s+\}/.test(shell))
  check("the frame is drawn for a section on screen that the shell does not hold, never before the first commit", /const framed = settled && !kept\.includes\(shown\) \? shown : null/.test(shell) && /<SectionFrame id=\{framed\} facts=\{frameFacts\(head, shownSearch\)\} \/>/.test(shell))
  check("a section drawn again is drawn in a transition, from committed state", /if \(keptRef\.current\.includes\(id\)\) React\.startTransition\(draw\)/.test(shell) && /const h = drawn\.get\(id\)/.test(shell))
  check("the router is not asked again while it is bringing the section pressed", /if \(\(f && f\.id === id && Date\.now\(\) - f\.at < 10_000\) \|\| pendingId === id\) return/.test(shell))
  check("a section read ahead over a minute ago is read again once shown", /staleArrival\.current = id/.test(shell))
  check("the tabs no longer start the app's bar themselves", !/startNavigationLoading/.test(shell))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("no top bar for a move between sections of one community", /if \(nav\.href && sameStageFrame\(window\.location\.pathname, nav\.href\)\) return/.test(bar))

  console.log("\nFRAME")
  const frame = code("components/community/creator/section-frame.tsx")
  const parts = code("components/community/creator/parts.tsx")
  const listHead = /<div data-list-head="" className="([^"]+)"/.exec(parts)?.[1]
  const toolbar = /<div data-toolbar="" className="([^"]+)"/.exec(parts)?.[1]
  check("the frame's card head is ListCard's head, class for class", !!listHead && frame.includes(`const HEAD = "${listHead}"`), listHead)
  check("and its toolbar is ListCard's toolbar", !!toolbar && frame.includes(`const TOOLBAR = "${toolbar}"`), toolbar)
  check("the shapes wait 200ms before they show (components/ui/shimmer)", /from "@\/components\/ui\/shimmer"/.test(frame) && /<ShimmerRows/.test(frame))
  check("a frame for every section", ["overview", "feed", "spaces", "classroom", "events", "members", "moderation", "analytics", "settings"].every((id) => frame.includes(`case "${id}":`)))
  check("the server's frame for Posts and Settings is told what the shell's is", /facts=\{\{ composer \}\}/.test(code("app/app/community/[id]/feed/page.tsx")) && /facts=\{\{ settingsList: !settingsTabAsked\(query\.tab\) \}\}/.test(code("app/app/community/[id]/settings/page.tsx")))

  console.log("\nWIDTH")
  check("the column is Products': 1200px, 1323px from 1024px, in the app's gutter", /const SHELL_WIDTH = "max-w-\[1200px\] lg:max-w-\[1323px\]"/.test(shell) && /const SHELL_GUTTER = "app-gutter"/.test(shell) &&/const PAGE_WIDTH = "max-w-\[1200px\] lg:max-w-\[1323px\]"/.test(code("app/app/products/products-client.tsx")))
  /* Changed on purpose (round 33): the bar and the row of tabs are two boxes now (the bar scrolls away, the row stays), so three share the column. */
  check("the bar, the tabs and the section share it", (shell.match(/SHELL_GUTTER, SHELL_WIDTH/g) ?? []).length === 3 && !/SECTION_WIDTH/.test(shell))
  /* Changed on purpose (round 26, tests/nav26.test.ts): no mask; a fade over an end only while there is more to scroll to that side, at any width. */
  check("a row of tabs that does not fit fades at its end and scrolls", /group-data-more-right\/tabs:opacity-100/.test(shell) && !/mask-image/.test(shell.slice(shell.indexOf("export function CommunityTabs"))))

  console.log("\nCOPY")
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of [
    "components/community/creator/community-shell.tsx",
    "components/community/creator/section-frame.tsx",
    "lib/communities/server/admin-sections.ts",
    "lib/communities/server/creator.ts",
    "lib/communities/server/learn-builder.ts",
    "scripts/check-community-admin-nav32.mjs",
    "scripts/render-community-admin-nav32.tsx",
    "scripts/measure-community-admin-server.ts",
    "scripts/measure-community-admin-server.mjs",
    ...pages.map((p) => p[0]),
  ]) {
    const src = read(f)
    check(`${f}: no em dash, no banned word`, !src.includes("—") && !banned.test(src), (src.match(banned) ?? [])[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
