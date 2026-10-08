/**
 * ===========================================================================
 *  COMMUNITIES ROUND 11: THE FRAME
 * ===========================================================================
 *   CHIPS     the chosen chip is drawn by itself and the list follows two
 *             frames later in one go (a second tap cancels the handover);
 *             everything under the chips is one memoised block; a chip is
 *             touch-action: manipulation, a little deeper, and never scales
 *   BELL      the community bell's phone sheet is at least half the screen
 *   MENU      the "..." menu is the essentials: Invite people, Saved posts,
 *             Profile, Settings, Dashboard for a seller, Log out; the
 *             Storelib header keeps its full menu
 *   SPINNER   continuous, linear, on a box the compositor turns
 *   PLACES    About in the same columns and bar; the scrollbar's room kept
 *   ICONS     the places' icons drawn on one grid, one stroke
 *   EMPTY     the classroom, the calendar and the members with nothing in
 *             them: the community's empty card, an action for staff
 *   PULL      iOS's spokes in the pull's own room: inside the gap at every
 *             gap, one by one up to eight at the line
 *
 *   The frame by frame proof is scripts/check-community-frame11.mjs.
 *
 * Run with:  npm run test:push
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode, readSource } from "./_source"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { SPINNER_SPOKES, SPIN_MS } from "@/components/community/member/place-spinner"
import { PULL_TO_REFRESH, SPOKES_HOLD, SPOKES_MARGIN, SPOKES_SIZE, spokesAt } from "@/hooks/use-pull-to-refresh"
import type { TabKey } from "@/components/community/member/nav"

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

async function main() {
  console.log("\nCHIPS: the chip first, the list on the next frame")
  {
    const feed = code("components/community/member/feed.tsx")
    check("the chips follow `target`, the list follows its own state (`list`)", /const \[list, setList\] = useState\(\{ id: targetId, sort \}\)/.test(feed) && /active=\{chipSpace\?\.slug \?\? null\}/.test(feed))
    check("the list takes the new value two animation frames later, drawn in one go", /requestAnimationFrame\(\(\) => \{\s*second = requestAnimationFrame\(\(\) => flushSync\(\(\) => setList\(next\)\)\)/.test(feed))
    check("a newer tap cancels the handover of an older one", /cancelAnimationFrame\(first\)\s*cancelAnimationFrame\(second\)/.test(feed))
    check("round 15: no fade on a switch; only a list that takes the spinner's place comes up from nothing", !/OUT_MS|outAnim/.test(feed) && /if \(!fromSpinner \|\| !el/.test(feed))
    check("a space has its own address on every device, and the list still switches here", /window\.history\.pushState\(null, "", href\)/.test(feed) && /setPicked\(\{ target: next, from: href \}\)/.test(feed) && !/spaceKeepsAddress/.test(feed))
    check("everything under the chips is one memoised block", /const FeedBody = memo\(/.test(feed) && /<FeedBody/.test(feed))
    check("the composer and the posts follow the list (round 16: never the chip's own render)", /viewKey\(communityId, listTarget, listSort\)/.test(feed) && /fixedSpaceId: space\.id/.test(feed) && /const asked = readView\(key\)/.test(feed))
    check("a switched list draws a phone's screenful first", /const SWAP_CARDS = 4/.test(feed) && /i < firstCards \|\| whole/.test(feed))
    const chips = code("components/community/member/space-chips.tsx")
    check("a chip is touch-action: manipulation (no double tap to zoom swallowing a quick second tap)", /const CHIP =\s*[`"][^`"]*touch-manipulation/.test(chips))
    check("a chip never scales on press, and its hover is not a hover:border class (those lose their easing on touch)", !/scale-/.test(chips) && !/hover:border/.test(chips))
    check("a little more depth: a two pixel soft shadow at rest, sunk when pressed", /shadow-\[0_1px_2px_rgba\(16,24,40,0\.07\)/.test(chips) && /data-\[pressed\]:shadow-\[inset_/.test(chips))
    const ui = code("components/community/member/ui.ts")
    check("the tabs, the buttons and the pills are touch-action: manipulation and never scale", /group\/tab[^"]*touch-manipulation/.test(ui) && !/active:scale/.test(ui))
  }

  console.log("\nBELL and MENU")
  {
    const bell = code("components/notifications/notification-bell.tsx")
    check("the bell's sheet takes a least height, its list given that minus the sheet's own parts", /sheetMin\?: string/.test(bell) && /minHeight: `calc\(\$\{sheetMin\} - \$\{SHEET_CHROME_PX\}px\)`/.test(bell))
    check("the community's bell asks for half the screen", /<NotificationBell className=\{BELL\} sheetMin="50dvh"( tabBadge)? \/>/.test(code("components/community/member/top-bar.tsx")))
    const header = code("components/platform/platform-header-client.tsx")
    check("the account menu and sheet take a short community list", (header.match(/rows === "community"/g) ?? []).length >= 3 && /export type AccountRows = "storelib" \| "community"/.test(header))
    const short = header.split('rows === "community" ? (')[1]?.split(") : ")[0] ?? ""
    check("the community's list is Profile, Settings and Dashboard for a seller, nothing else", /item="profile"|data-account-item="profile"/.test(short) && /settings/.test(short) && /dashboard/.test(short) && !/help|discover|language|start-creating/.test(short))
    const menu = code("components/community/member/account-menu.tsx")
    check("the community's menu asks for it, on a computer and a phone, and keeps the sheet built", (menu.match(/rows="community"/g) ?? []).length === 2 && /keepMounted/.test(menu) && !/LanguageModal/.test(menu))
    check("Storelib's own header still opens the full menu", /<DesktopAccountMenu[\s\S]*?\/>/.test(header) && !/rows="community"/.test(header))
  }

  console.log("\nSPINNER and PLACES")
  {
    const spinner = code("components/community/member/place-spinner.tsx")
    /* Round 12: the turn is the app spinner's (.activity-spinner in app/globals.css: one linear turn a second on its own box). */
    check("the spinner turns continuously and linearly on a box of its own, not a spoke at a time on the svg", /<ActivitySpinner size=\{size\}/.test(spinner) && /\.activity-spinner \{\s*display: block;\s*animation: activity-spin 1000ms linear infinite;/.test(readSource("app/globals.css")) && SPIN_MS === 1000)
    check("eight spokes, each fainter than the one before", SPINNER_SPOKES.length === 8 && SPINNER_SPOKES.every((l, i) => i === 0 || l.opacity < SPINNER_SPOKES[i - 1].opacity))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the frame keeps the scrollbar's room on every page", /html\{scrollbar-gutter:stable\}/.test(frame) && /<style>\{GUTTER \+ PLACE_KEYFRAMES\}<\/style>/.test(frame))
    check("About sits in the same columns under the same bar (no narrower frame, no tabs on a computer)", !/tabsOnDesktop=\{about\}/.test(frame) && /lg:\[--community-top:65px\]/.test(frame) && !/lg:\[--community-top:105px\]/.test(frame) && /about \? "lg:col-start-2 xl:col-span-2"/.test(frame) && /lg:col-start-1 lg:row-start-1 lg:block \$\{LAND\}/.test(frame))
    check("entering from outside, the side columns come in by opacity; the middle never fades (round 19: no flash on the first post)", /const LAND = "motion-safe:animate-\[fade-in_/.test(frame) && /\$\{landing \? LAND : ""\}/.test(frame) && !/LAND_LATE/.test(frame))
  }

  console.log("\nICONS")
  {
    const places: TabKey[] = ["home", "classroom", "events", "members", "leaderboard", "about"]
    const off = places.map((p) => renderToStaticMarkup(createElement(PlaceIcon, { place: p })))
    const on = places.map((p) => renderToStaticMarkup(createElement(PlaceIcon, { place: p, on: true })))
    check("every place has an icon on the 24px grid", off.every((m) => /viewBox="0 0 24 24"/.test(m) && /<path/.test(m)))
    check("one stroke for all of them, round ends and joins", off.every((m) => !/stroke-width="(?!1\.75")/.test(m) && /stroke-linecap="round"/.test(m) && /stroke-linejoin="round"/.test(m)))
    check("the open place is the same drawing, a touch heavier with a soft fill", on.every((m, i) => /stroke-width="2"/.test(m) && /fill-opacity="0\.13"/.test(m) && (m.match(/stroke-width/g) ?? []).length === (off[i].match(/stroke-width/g) ?? []).length))
    const wall = code("components/community/member/wall.tsx")
    check("the places list draws them, on quiet grey tiles (no tinted hues)", /<PlaceIcon place=\{e\.key\} on=\{on\}/.test(wall) && !/home-smile|square-academic-cap|users-group-rounded|info-circle/.test(wall) && !/bg-\[#fcefee\]|bg-\[#eaf1fb\]/.test(wall))
  }

  console.log("\nEMPTY")
  {
    const classroom = code("components/community/classroom/classroom-library.tsx")
    check("an empty classroom is not 'No courses yet' but the community's empty card", !/No courses yet/.test(classroom) && /<PlaceEmpty/.test(classroom) && /Nothing in the classroom yet/.test(classroom))
    check("its staff get Add a course", /action=\{manageHref \? \{ href: manageHref, label: "Add a course" \} : null\}/.test(classroom) && /manage_classroom/.test(code("app/(marketing)/community/[slug]/(member)/classroom/page.tsx")))
    const events = code("components/community/events/events-page.tsx")
    check("the calendar is called Calendar, its views Upcoming, Past and Month", />\s*Calendar\s*<\/h1>/.test(events) && /\["calendar", "Month"\]/.test(events))
    check("its waits are the community's spinner and its empty views the empty card, Schedule an event for staff", !/Loader2|border-dashed/.test(events) && /<PlaceEmpty/.test(events) && /label: "Schedule an event"/.test(events) && /eventHrefFor\(open\.community, open\.viewer\)/.test(code("app/(marketing)/community/[slug]/(member)/events/page.tsx")))
    const members = code("components/community/member/members.tsx")
    check("members: a squared search with its own spinner, a segmented filter, the list easing in, no dimming", /rounded-xl/.test(members) && /data-member-search-busy/.test(members) && /role="group" aria-label="Who to show"/.test(members) && /el\.animate\(\[\{ opacity: 0\.4 \}, \{ opacity: 1 \}\]/.test(members) && !/opacity-60/.test(members))
    const empty = code("components/community/member/place-empty.tsx")
    check("the empty card is a white card with the place's icon, no dashes", /<PlaceIcon place=\{place\}/.test(empty) && !/dashed/.test(empty))
  }

  console.log("\nPULL")
  {
    let inside = true
    let worst = 0
    for (let gap = 0; gap <= 140; gap += 0.5) {
      const a = spokesAt(gap)
      if (a.scale <= 0) continue
      const half = (SPOKES_SIZE * a.scale) / 2
      const top = gap / 2 - half
      const bottom = gap / 2 + half
      if (top < SPOKES_MARGIN - 0.01 || bottom > gap - SPOKES_MARGIN + 0.01) inside = false
      worst = Math.max(worst, bottom - gap)
    }
    check("at every gap the spinner's box is inside the gap, a margin clear of the content", inside, { worst })
    const counts = [0, 12, 20, 30, 40, PULL_TO_REFRESH.threshold, 90].map((g) => Math.floor(spokesAt(g).shown))
    check("the spokes come in one by one with the pull, all eight at the line", counts[0] === 0 && counts[1] === 0 && counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts[5] === 8 && counts[6] === 8, counts)
    check("the room held while refreshing fits the whole spinner and its margins", SPOKES_HOLD >= SPOKES_SIZE + 2 * SPOKES_MARGIN && spokesAt(SPOKES_HOLD).scale === 1)
    const ptr = code("components/ui/pull-to-refresh.tsx")
    check("the shared component draws the spokes and holds their room", /<PullSpokes ref=\{indicatorRef\} \/>/.test(ptr) && /refreshHold: SPOKES_HOLD/.test(ptr) && !/PullToRefreshIndicator/.test(ptr))
    const hook = code("hooks/use-pull-to-refresh.ts")
    check("the /app home keeps its ring: the hook paints whichever indicator is drawn", /if \(spokesDrawn\(\)\) paintSpokes\(offset, false\)\s*else paintRing\(ringAt\(offset\)\)/.test(hook) && /p\.spokes \? SPOKES_SPIN : "ptr-spin/.test(hook))
  }

  console.log("\nHOUSE RULES")
  {
    const mine = [
      "components/community/member/feed.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/place-icons.tsx",
      "components/community/member/place-empty.tsx",
      "components/community/member/place-spinner.tsx",
      "components/community/member/shell-frame.tsx",
      "components/community/member/members.tsx",
      "components/community/member/account-menu.tsx",
      "components/community/classroom/classroom-library.tsx",
      "components/community/events/events-page.tsx",
      "scripts/check-community-frame11.mjs",
    ]
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    const offenders = mine.filter((f) => banned.test(readSource(f)))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
    const client = ["components/community/member/feed.tsx", "components/community/member/place-icons.tsx", "components/community/member/place-empty.tsx", "components/ui/pull-to-refresh.tsx", "components/community/events/events-page.tsx", "components/community/member/members.tsx"]
    check("the browser's parts import no server code", client.every((f) => !/server-only|next\/headers|lib\/communities\/server/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
