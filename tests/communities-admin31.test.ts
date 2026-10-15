/**
 * ===========================================================================
 *  COMMUNITIES ROUND 31: THE ADMIN SHELL, ITS SETTINGS AND ITS GALLERY
 * ===========================================================================
 *   SWITCH     which press shows a section at once, which asks the router;
 *              when a held section is read again; a one time ask restarts
 *              it; every section page hands its content to the shell
 *   HEADER     the state is a line under the name, View page is in a menu
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
  check("a held section moves the address with pushState, the router is not asked", /window\.history\.pushState\(null, "", tab\.href\)/.test(shell) && /if \(move === "fetch"\) return\s+e\.preventDefault\(\)/.test(shell))
  check("sections are kept as blocks not displayed, not under <Activity> (their effects stay)", /data-section-kept="" hidden=\{active !== id\}/.test(shell) && !/<Activity/.test(shell))
  check("the router drawing a held section again updates it in place", /if \(keptRef\.current\.includes\(id\)\) held\(\)/.test(shell))
  check("Back and Forward follow the address", /window\.addEventListener\("popstate", onPop\)/.test(shell) && /show\(id, \{ traversal: true \}\)/.test(shell))
  check("the sections not opened are read ahead, never on Save-Data or 2G", /readAheadAllowed\(connectionFacts\(\)\)/.test(shell) && /prefetchAppPage\(router, t\.href\)/.test(shell))
  check("the arrival starts from 55%, never an empty frame", /SECTION_ARRIVE_FROM = 0\.55/.test(shell) && /prefers-reduced-motion: reduce/.test(shell))
  check("the stage places no scroll and plays no landing between sections of one community", /if \(sameStageFrame\(from, pathname\)\) return\s+\/\*/.test(code("components/app/app-stage.tsx")) || code("components/app/app-stage.tsx").indexOf("if (sameStageFrame(from, pathname)) return") < code("components/app/app-stage.tsx").indexOf("const saved = traversal ? recalledScroll(key) : null"))
  const pages: [string, string][] = [
    ["app/app/community/[id]/page.tsx", "overview"],
    ["app/app/community/[id]/feed/page.tsx", "feed"],
    ["app/app/community/[id]/spaces/page.tsx", "spaces"],
    ["app/app/community/[id]/learn/page.tsx", "classroom"],
    ["app/app/community/[id]/events/page.tsx", "events"],
    ["app/app/community/[id]/members/page.tsx", "members"],
    ["app/app/community/[id]/moderation/page.tsx", "moderation"],
    ["app/app/community/[id]/analytics/page.tsx", "analytics"],
    ["app/app/community/[id]/settings/page.tsx", "settings"],
  ]
  for (const [f, id] of pages) check(`${f} hands its content to the shell as ${id}`, new RegExp(`<SectionSeed id="${id}"`).test(code(f)))

  console.log("\nHEADER")
  check("the state is a line under the name, not a badge beside it", /function StateLine/.test(shell) && /<StateLine head=\{head\} \/>/.test(shell) && !/<StatusBadge/.test(shell))
  check("on a phone View page is in the menu; from 640px a button", /className=\{cn\(buttonSecondary, "max-sm:hidden"\)\} data-community-view=""/.test(shell) && /label: "View page"/.test(shell) && /<span className="sm:hidden">\s*<ResponsiveActionMenu/.test(shell))
  check("the back arrow is the app's (ArrowLeft in a 36px square, 40px on a phone)", /<ArrowLeft aria-hidden className="h-5 w-5" \/>/.test(shell))
  check("the feed's tab is Posts", /label: "Posts"/.test(shell) && !/label: "Feed"/.test(shell))

  console.log("\nSETTINGS")
  check("an address with no tab is not an ask", !settingsTabAsked(undefined) && !settingsTabAsked("") && !settingsTabAsked("  ") && settingsTabAsked("access"))
  check("old tab names still land", settingsTabOf("general") === "page" && settingsTabOf("gamification") === "gamification")
  const settings = code("components/community/creator/settings-section.tsx")
  check("the settings page tells the section whether a panel was asked for", /asked=\{settingsTabAsked\(query\.tab\)\}/.test(code("app/app/community/[id]/settings/page.tsx")))
  check("a phone opens on the list of panels, a row each with what it holds", /useState<"list" \| "panel">\(asked \? "panel" : "list"\)/.test(settings) && /data-settings-row=\{t\.value\}/.test(settings) && /<ChevronRight/.test(settings))
  check("a row pushes a history entry so Back returns to the list", /window\.history\.pushState\(\{ \[PANEL_ENTRY\]: true \}/.test(settings) && /return window\.history\.back\(\)/.test(settings))
  check("no pill and sheet to pick a panel any more", !/data-settings-picker/.test(settings) && !/ResponsiveActionMenu/.test(settings))
  check("names a business reads: Points and levels, Publish and archive", /label: "Points and levels"/.test(settings) && /label: "Publish and archive"/.test(settings))
  const raw = read("components/community/creator/settings-section.tsx")
  check("the custom domain panel has its place in Page, after the address", raw.indexOf("{/* round31: domain panel */}") > raw.indexOf('<EditorCard title={tt("Address")}') && raw.indexOf('<EditorCard title={tt("Address")}') > 0)

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
  check("fixed above the navigation pill on a phone, 16px off the bottom from 768px, clear of the rail", /fixed inset-x-0 bottom-\[calc\(var\(--app-nav-top,0px\)\+10px\)\]/.test(parts) && /md:bottom-\[max\(16px,env\(safe-area-inset-bottom\)\)\]/.test(parts) && /md:left-\[var\(--app-rail-w,240px\)\]/.test(parts))
  check("up only with a change (or a save underway, or its check after)", /const up = dirty \|\| busy \|\| !!busyText \|\| !!error \|\| phase !== "idle"/.test(parts))
  check("two bars up at once stand one above the other", /FOOT_STEP_PX/.test(parts) && /getClientRects\(\)\.length > 0/.test(parts))

  console.log("\nGALLERY")
  const editor = code("components/community/creator/gallery-editor.tsx")
  const tiles = code("components/community/creator/gallery-tiles.tsx")
  check("the product editor's hold to drag: mouse 4px, finger 300ms, keyboard", /useHoldToDragSensors\(\)/.test(editor) && /from "@\/app\/app\/products\/new\/hold-to-drag"/.test(editor))
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
