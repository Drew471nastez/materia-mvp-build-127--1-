/**
 * ===========================================================================
 *  COMMUNITIES ROUND 31: THE ADMIN SHELL, ITS SETTINGS AND ITS GALLERY
 * ===========================================================================
 *   SWITCH     which press shows a section at once, which asks the router;
 *              when a held section is read again; a one time ask restarts
 *              it; every section page hands its content to the shell
 *   HEADER     the state is a badge beside the name (round 33), View page is in a menu
 *              on a phone, Posts is the feed's name
 *   SETTINGS   a phone opens on the list of panels unless the address names
 *              one; the column from 1024px; the names a business reads
 *   CONTROLS   no browser select, checkbox or trash icon in these screens
 *   SAVEBAR    the /app Settings bar: fixed, above the pill, only with a change
 *   GALLERY    hold to drag (mouse, finger, keyboard) and a menu per tile
 *
 *   The frame by frame proof is scripts/check-community-admin-round31.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { SECTION_FRESH_MS, adminSectionOf, sectionMove, sectionRestarts, sectionStale, settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"

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

function main() {
  console.log("SWITCH: the rules")
  const B = "/app/community/clay"
  const pairs: [string, string][] = [
    [B, "overview"],
    [`${B}/`, "overview"],
    [`${B}?created=1`, "overview"],
    [`${B}/feed?compose=s1`, "feed"],
    [`${B}/spaces`, "spaces"],
    [`${B}/learn`, "classroom"],
    [`${B}/classroom`, "classroom"],
    [`${B}/events?new=1`, "events"],
    [`${B}/members`, "members"],
    [`${B}/moderation?tab=audit`, "moderation"],
    [`${B}/analytics`, "analytics"],
    [`${B}/settings?tab=access`, "settings"],
    [`${B}/gamification`, "settings"],
    [`${B}/nonsense`, "overview"],
  ]
  for (const [path, want] of pairs) check(`${path} is ${want}`, adminSectionOf(path) === want, adminSectionOf(path))
  check("the section showing: nothing happens", sectionMove("members", { active: "members", routed: null, held: true }) === "stay")
  check("a section held: shown at once", sectionMove("members", { active: "overview", routed: "overview", held: true }) === "show")
  check("the router's own page: shown at once", sectionMove("members", { active: "overview", routed: "members", held: false }) === "show")
  check("never opened: the router brings it", sectionMove("analytics", { active: "overview", routed: "overview", held: false }) === "fetch")
  const now = 1_000_000
  check("held a moment ago: not read again", !sectionStale({ at: now - 5_000, stale: false }, now))
  check("held over a minute: read again behind it", sectionStale({ at: now - SECTION_FRESH_MS - 1, stale: false }, now))
  check("marked stale by a save elsewhere: read again", sectionStale({ at: now, stale: true }, now))
  check("nothing held: nothing to read again", !sectionStale(null, now))
  check("a new one time ask restarts the section", sectionRestarts("", "new") && sectionRestarts("compose:a", "compose:b"))
  check("drawn again with no ask (a refresh after a save) keeps it", !sectionRestarts("new", "") && !sectionRestarts("", "") && !sectionRestarts("invite", "invite"))

  const shell = code("components/community/creator/community-shell.tsx")
  /* Changed on purpose (round 32): a section never opened shows its frame on the press (show(id)) while the link goes on to the router. */
  check("a held section moves the address with pushState, the router is not asked", /window\.history\.pushState\(null, "", tab\.href\)/.test(shell) && /if \(move === "fetch"\) \{\s+fetching\.current = \{ id, at: Date\.now\(\) \}\s+show\(id\)\s+return\s+\}\s+e\.preventDefault\(\)/.test(shell))
  /* Changed on purpose (round 32): hidden by the section on screen (`shown`: the one pressed, or the one a link inside a section is opening). */
  check("sections are kept as blocks not displayed, not under <Activity> (their effects stay)", /data-section-kept="" hidden=\{shown !== id\}/.test(shell) && !/<Activity/.test(shell))
  /* Changed on purpose (round 32): drawn again in a transition, so a section streamed under Suspense keeps what it shows until its new reads are in. */
  check("the router drawing a held section again updates it in place", /if \(keptRef\.current\.includes\(id\)\) React\.startTransition\(draw\)/.test(shell))
  check("Back and Forward follow the address", /window\.addEventListener\("popstate", onPop\)/.test(shell) && /show\(id, \{ traversal: true \}\)/.test(shell))
  check("the sections not opened are read ahead, never on Save-Data or 2G", /readAheadAllowed\(connectionFacts\(\)\)/.test(shell) && /prefetchAppPage\(router, t\.href\)/.test(shell))
  check("the arrival starts from 55%, never an empty frame", /SECTION_ARRIVE_FROM = 0\.55/.test(shell) && /prefers-reduced-motion: reduce/.test(shell))
  const stage = code("components/app/app-stage.tsx")
  const skip = stage.indexOf("if (sameStageFrame(from, pathname)) return")
  check("the stage places no scroll and plays no landing between sections of one community", skip > 0 && skip < stage.indexOf("const saved = traversal ? recalledScroll(key) : null"))
  const pages: [string, string][] = [
    ["app/(storelib)/app/community/[id]/page.tsx", "overview"],
    ["app/(storelib)/app/community/[id]/feed/page.tsx", "feed"],
    ["app/(storelib)/app/community/[id]/spaces/page.tsx", "spaces"],
    ["app/(storelib)/app/community/[id]/learn/page.tsx", "classroom"],
    ["app/(storelib)/app/community/[id]/events/page.tsx", "events"],
    ["app/(storelib)/app/community/[id]/members/page.tsx", "members"],
    ["app/(storelib)/app/community/[id]/moderation/page.tsx", "moderation"],
    ["app/(storelib)/app/community/[id]/analytics/page.tsx", "analytics"],
    ["app/(storelib)/app/community/[id]/settings/page.tsx", "settings"],
  ]
  for (const [f, id] of pages) check(`${f} hands its content to the shell as ${id}`, new RegExp(`<SectionSeed id="${id}"`).test(code(f)))

  console.log("\nHEADER")
  /* Changed on purpose (round 33, the owner: "Published must be a badge, not text", and no member count under the name): the /app badge beside the name, under it when the row has no room. */
  check("the state is the /app badge beside the name, no member count under it", !/function StateLine/.test(shell) && /<CommunityStatusBadge state=\{communityState\(head\)\} \/>/.test(shell) && !/# members\}\}", \{ n: head\.memberCount \}\)/.test(shell))
  check("on a phone View page is in the menu; from 640px a button", /className=\{cn\(buttonSecondary, "max-sm:hidden"\)\} data-community-view=""/.test(shell) && /label: "View page"/.test(shell) && /<span className="sm:hidden">\s*<ResponsiveActionMenu/.test(shell))
  check("the back arrow is the app's (ArrowLeft in a 36px square, 40px on a phone)", /<ArrowLeft aria-hidden className="h-5 w-5" \/>/.test(shell))
  check("the feed's tab is Posts", /label: "Posts"/.test(shell) && !/label: "Feed"/.test(shell))

  console.log("\nSETTINGS")
  check("an address with no tab is not an ask", !settingsTabAsked(undefined) && !settingsTabAsked("") && !settingsTabAsked("  ") && settingsTabAsked("access"))
  /* Changed on purpose (round 33): the page is a section of its own; ?tab=general and ?tab=page are sent there by the settings page (pageTabAsked) and fall back to the first panel here. */
  check("old tab names still land", settingsTabOf("general") === "access" && settingsTabOf("gamification") === "gamification")
  const settings = code("components/community/creator/settings-section.tsx")
  check("the settings page tells the section whether a panel was asked for", /asked=\{settingsTabAsked\(query\.tab\)\}/.test(code("app/(storelib)/app/community/[id]/settings/page.tsx")))
  check("a phone opens on the list of panels, a row each with what it holds", /useState<"list" \| "panel">\(asked \? "panel" : "list"\)/.test(settings) && /data-settings-row=\{t\.value\}/.test(settings) && /<ChevronRight/.test(settings))
  check("a row pushes a history entry so Back returns to the list", /window\.history\.pushState\(\{ \[PANEL_ENTRY\]: true \}/.test(settings) && /return window\.history\.back\(\)/.test(settings))
  check("no pill and sheet to pick a panel any more", !/data-settings-picker/.test(settings) && !/ResponsiveActionMenu/.test(settings))
  check("names a business reads: Points and levels, Publish and archive", /label: "Points and levels"/.test(settings) && /label: "Publish and archive"/.test(settings))
  const raw = read("components/community/creator/settings-section.tsx")
  /* Changed on purpose (round 31 merge): the marker became the panel itself. */
  /* Changed on purpose (round 32): the address and the domain are a panel of their own (Address and domain), the domain under the Storelib address. */
  check("the custom domain panel has its place in Address and domain, after the address", raw.indexOf("<CommunityDomainPanel communityId={head.id} />") > raw.indexOf('<EditorCard title={tt("Storelib address")}') && raw.indexOf('<EditorCard title={tt("Storelib address")}') > raw.indexOf("function AddressSettings") && raw.indexOf("function AddressSettings") > 0)

  console.log("\nCONTROLS")
  const mine = ["settings-section", "access-editor", "members-section", "moderation-section", "gamification-panel", "gallery-editor", "gallery-tiles", "parts"].map((f) => `components/community/creator/${f}.tsx`)
  for (const f of mine) {
    const src = code(f)
    check(`${f}: no browser select, no checkbox, no trash icon`, !/<select\b/.test(src) && !/type="checkbox"/.test(src) && !/Trash2/.test(src))
  }
  const parts = code("components/community/creator/parts.tsx")
  check("the pick field is the Products pick list (dropdown, or a sheet on a phone)", /export function SelectField/.test(parts) && /<PickSheet/.test(parts))
  check("the box to tick is drawn here, with role checkbox", /export function CheckRow/.test(parts) && /role="checkbox"/.test(parts))
  check("buttons have the app's depth", /primaryDepth/.test(parts) && /secondaryDepth/.test(parts))

  console.log("\nSAVEBAR")
  check("fixed above the navigation pill on a phone, 16px off the bottom from 768px, clear of the rail", /fixed inset-x-0 bottom-\[max\(calc\(var\(--app-nav-top,0px\)\+10px\),calc\(env\(safe-area-inset-bottom\)\+10px\)\)\]/.test(parts) && /md:bottom-\[max\(16px,env\(safe-area-inset-bottom\)\)\]/.test(parts) && /md:left-\[var\(--app-rail-w,240px\)\]/.test(parts))
  /* Changed on purpose (round 33): an editor page's bar (a status given) is always up, with the state and Back; a form's is up only with a change, as before. */
  check("up only with a change (or a save underway, or its check after)", /const up = editor \|\| dirty \|\| busy \|\| !!busyText \|\| !!error \|\| phase !== "idle"/.test(parts) && /const editor = !!status/.test(parts))
  check("two bars up at once stand one above the other", /FOOT_STEP_PX/.test(parts) && /getClientRects\(\)\.length > 0/.test(parts))

  console.log("\nGALLERY")
  const editor = code("components/community/creator/gallery-editor.tsx")
  const tiles = code("components/community/creator/gallery-tiles.tsx")
  check("the product editor's hold to drag: mouse 4px, finger 300ms, keyboard", /useHoldToDragSensors\(\)/.test(editor) && /from "@\/app\/\(storelib\)\/app\/products\/new\/hold-to-drag"/.test(editor))
  check("the whole tile is the handle, the menu its own button over it", /setActivatorNodeRef/.test(tiles) && /\{\.\.\.listeners\}/.test(tiles) && /data-tile-menu=""/.test(tiles))
  check("files dropped on the gallery go up", /takeFiles\(Array\.from\(e\.dataTransfer\.files\)\)/.test(editor))
  check("the cover: one frame, one menu to change it, a remove", /data-cover-frame=""/.test(editor) && /\{has \? "Change cover" : "Add a cover"\}/.test(editor) && /label="Remove the cover"/.test(editor))

  console.log("\nCOPY")
  const copy = [...mine, "components/community/creator/community-shell.tsx", "components/community/creator/logic.ts", "scripts/check-community-admin-round31.mjs", "scripts/render-community-admin-round31.tsx"]
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of copy) {
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
