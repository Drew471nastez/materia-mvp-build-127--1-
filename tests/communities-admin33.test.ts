/**
 * ===========================================================================
 *  COMMUNITIES ROUND 33: THE ADMIN'S SHELL, ITS SETTINGS, ONE SAVE BAR
 * ===========================================================================
 * The owner, round 33:
 *
 *   CARDS      "the • Published text looks wrong": the /app badge; a card
 *              with no cover is a gradient from the logo's own colours
 *              (lib/communities/cover-gradient.ts), from the name without
 *              one, never flat grey
 *   HEADER     the way back as /app draws it, the state a badge, no member
 *              count under the name
 *   PAGE       the community's page is edited in its own section, the tab
 *              after Overview; Settings keeps what runs the community, and
 *              every address that pointed at the page still opens it
 *   SAVEBAR    one bar for a form and an editor page, fixed to the screen,
 *              the section keeping room under its last card for it
 *   TABS       the bar with the name scrolls away, the row of tabs stays
 *
 *   The measured proof is scripts/check-community-admin-round33.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { SETTINGS_TABS, adminSectionOf, nextSteps, pageTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import { coverGradient, hslOf, nameCoverGradient, namePalette, paletteFromPixels, rgbOf } from "@/lib/communities/cover-gradient"

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

/** An icon of 24 by 24 pixels: `share` of it in `a`, the rest in `b` (RGBA). */
function icon(a: [number, number, number], b: [number, number, number], share = 0.7, alpha = 255): Uint8ClampedArray {
  const n = 24 * 24
  const px = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const c = i < n * share ? a : b
    px.set([c[0], c[1], c[2], alpha], i * 4)
  }
  return px
}
const hueOf = (hex: string) => hslOf(rgbOf(hex) ?? [0, 0, 0])[0]
const gap = (x: number, y: number) => {
  const d = Math.abs(x - y) % 360
  return d > 180 ? 360 - d : d
}

function main() {
  const shell = code("components/community/creator/community-shell.tsx")
  const parts = code("components/community/creator/parts.tsx")
  const settings = code("components/community/creator/settings-section.tsx")
  const list = code("components/community/creator/community-list.tsx")
  const overview = code("components/community/creator/overview.tsx")
  const fill = code("components/community/cover-fill.tsx")

  console.log("\nCARDS")
  check("the state is the /app StatusBadge, with the product editor's dot", /<StatusBadge tone=\{STATE_TONE\[state\]\}/.test(parts) && /export function CommunityStatusBadge/.test(parts) && /<CommunityStatusBadge state=\{state\} \/>/.test(list) && !/STATE_DOT\[state\]\)\} \/>\s*\{STATE_WORD/.test(list))
  check("no cover: the gradient, never the grey field alone", /<CoverFill name=\{r\.name\} iconUrl=\{r\.logoUrl\} \/>/.test(list) && /data-card-cover=\{src \? "picture" : "gradient"\}/.test(list))
  check("no logo either: the letter on the name's gradient", /backgroundImage: nameCoverGradient\(r\.name\)/.test(list))
  check("Edit opens the Page section; a copy opens on its page", /* Changed on purpose (communities round trip): through the list's way in (./list-return). */ /onClick: \(\) => onOpen\(`\$\{base\}\/page`\) \}/.test(list) && /router\.push\(`\/app\/community\/\$\{res\.data\.slug \|\| res\.data\.id\}\/page`\)/.test(list))
  const teal = paletteFromPixels(icon([15, 118, 110], [245, 158, 11]))
  check("an icon's palette starts with its main colour", !!teal && gap(hueOf(teal[0]), 175) < 12, teal)
  check("two colours far apart (teal and amber) do not blend through mud: the second is the first's neighbour", !!teal && gap(hueOf(teal[0]), hueOf(teal[1])) <= 40, teal)
  const warm = paletteFromPixels(icon([220, 60, 40], [240, 150, 30]))
  check("two neighbours (red and orange) are both kept", !!warm && gap(hueOf(warm[1]), 32) < 14, warm)
  const blue = paletteFromPixels(icon([29, 78, 216], [255, 255, 255]))
  check("a blue icon's neighbour turns away from violet", !!blue && (hueOf(blue[1]) < 248 || hueOf(blue[1]) > 300), blue)
  check("a black, white or grey icon has no palette (the name's gradient stays)", paletteFromPixels(icon([0, 0, 0], [255, 255, 255])) === null && paletteFromPixels(icon([128, 128, 128], [200, 200, 200])) === null)
  check("see-through pixels are not counted", paletteFromPixels(icon([200, 30, 30], [30, 200, 30], 1, 0)) === null)
  check("a name always gets the same gradient", nameCoverGradient("Book Circle") === nameCoverGradient("Book Circle") && nameCoverGradient("Book Circle") !== nameCoverGradient("Trail Runners"))
  const names = ["A", "Book Circle", "Morning Pages", "Trail Runners Cluj", "Salajany", "Club", "Écoles", "書道", "Writers", "Runners", "Painters", "Cooks", "Gardeners", "Coders"]
  check("no name gradient is a violet wash", names.every((n) => namePalette(n).every((h) => { const x = hueOf(h); return x < 255 || x > 300 })), names.map((n) => namePalette(n).map((h) => Math.round(hueOf(h)))))
  check("the gradient is CSS layers with both colours", /^radial-gradient\(.*linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/.test(coverGradient(["#0f766e", "#155e75"])))
  check("the icon is read once: memory, then localStorage, then a 24px canvas", /cachedIconPalette\(iconUrl\)/.test(fill) && /sampleIconPalette\(iconUrl, optimizedImageUrl\(iconUrl, 24\)\)/.test(read("components/community/cover-fill.tsx")) && /STORE_KEY = "storelib:cover-palette:v1"/.test(read("lib/communities/cover-gradient.ts")))
  check("Explore's card uses the same ground (not on a storefront)", /<CoverFill name=\{card\.name\} iconUrl=\{card\.logoUrl\}>/.test(code("components/explore/community-card.tsx")))

  console.log("\nHEADER")
  check("the way back is /app's: iconButton, 36px, the arrow at 20px", /className=\{cn\(iconButton, "-ml-1\.5 h-9 w-9 shrink-0 hover:bg-\[#eceef1\] active:bg-\[#e4e6ea\]"\)\}/.test(shell) && /<ArrowLeft aria-hidden className="h-5 w-5" \/>/.test(shell))
  check("the state is a badge beside the name, under it when there is no room", /<CommunityStatusBadge state=\{communityState\(head\)\} \/>/.test(shell) && /flex min-w-0 flex-wrap items-center/.test(shell))
  check("no member count under the name", !/StateLine/.test(shell) && !/n: head\.memberCount \}\)\}<\/span>/.test(shell))

  console.log("\nPAGE")
  check("Page is the tab after Overview, for whoever manages settings", /\{ id: "overview", label: "Overview", href: base \},\s*can\.manage_settings \? \{ id: "page", label: "Page", href: `\$\{base\}\/page` \} : null,/.test(shell))
  check("the address /page is the Page section", adminSectionOf("/app/community/club/page") === "page" && adminSectionOf("/app/community/club/settings") === "settings")
  check("Settings has no page panel; its first panel is Access and prices", !SETTINGS_TABS.includes("page" as never) && SETTINGS_TABS[0] === "access" && settingsTabOf(undefined) === "access")
  check("every panel that was there is still there", ["access", "address", "discovery", "features", "advanced", "roles", "policies", "gamification", "notifications"].every((t) => (SETTINGS_TABS as readonly string[]).includes(t)))
  check("old addresses for the page open the Page section", ["page", "general", "about", "gallery", "faq", "links", "benefits"].every(pageTabAsked) && !pageTabAsked("access") && !pageTabAsked(undefined) && /if \(pageTabAsked\(query\.tab\)\) redirect\(`\/app\/community\/\$\{ctx\.community\.slug\}\/page`\)/.test(code("app/app/community/[id]/settings/page.tsx")))
  check("Settings no longer edits the page: no name, logo, cover, gallery, what members get, questions or links", !/function PageSettings/.test(settings) && !/<PicturePick/.test(settings) && !/<CoverField/.test(settings) && !/<GalleryEditor/.test(settings) && !/addLabel="Add a question"/.test(settings))
  check("the setup step and the shortcut open the Page section", nextSteps({ paid: false, paymentsReady: true, published: true, members: 5, invites: 1, posts: 2, courses: 0, events: 0, customized: false, rules: 1, classroomEnabled: false, eventsEnabled: false }, "/b").find((s) => s.id === "customize")?.href === "/b/page" && /href: `\$\{base\}\/page`, label: "Edit the page"/.test(overview))
  check("groups read: Community, Members, You; Roles is Roles and permissions", /label: "Roles and permissions"/.test(settings) && /\{ id: "community", label: "Community" \}/.test(settings) && /\{ id: "people", label: "Members" \}/.test(settings))
  /* Changed on purpose (round 26): the row of tabs is 52px from 768px, so the column sits at 72px. */
  check("the settings column sits under the row of tabs only", /sticky top-\[72px\] hidden lg:block/.test(settings))

  console.log("\nSAVEBAR")
  check("fixed to the screen, above the pill and the home indicator, clear of the rail", /fixed inset-x-0 bottom-\[max\(calc\(var\(--app-nav-top,0px\)\+10px\),calc\(env\(safe-area-inset-bottom\)\+10px\)\)\]/.test(parts) && /md:left-\[var\(--app-rail-w,240px\)\]/.test(parts))
  check("52px, 560px at most, never a glass panel", /flex h-\[52px\] w-full min-w-0 max-w-\[560px\]/.test(parts) && !/backdrop-blur/.test(parts.slice(parts.indexOf("export function EditorFoot"))))
  check("an editor page's bar: always up, its state as a badge, Back while nothing changed, Cancel once something did", /const up = editor \|\| dirty/.test(parts) && /const leaving = editor && !!onLeave && !dirty && !busy/.test(parts) && /data-foot-leave=""/.test(parts) && /<StatusBadge tone=\{status\.tone\}/.test(parts))
  check("the section keeps room for each bar that is up", /export function useFootsUp\(\)/.test(parts) && /export const FOOT_ROOM_PX = FOOT_STEP_PX \+ 24/.test(parts) && /"--foot-room": `\$\{foots \* FOOT_ROOM_PX\}px`/.test(shell) && /pb-\[calc\(7rem\+var\(--foot-room\)\)\]/.test(shell))
  check("a bar in a section the shell hides stops counting (its box goes to nothing)", /new ResizeObserver\(\(\) => setFootUp\(id, upRef\.current && el\.getClientRects\(\)\.length > 0\)\)/.test(parts))

  console.log("\nTABS")
  check("the bar scrolls away, the row of tabs stays at the top", /data-community-header="" className="bg-\[#f8f9fa\]"/.test(shell) && /data-community-tabs-bar="" className="orders-bar sticky top-0 z-10 bg-\[#f8f9fa\]"/.test(shell))
  check("a press while scrolled keeps the row where it was", /const floor = Math\.min\(paneTop\.current, barHeight\(el\)\)/.test(shell) && /el\.scrollTop = Math\.max\(scrolls\.current\.get\(shown\) \?\? 0, floor\)/.test(shell) && /mx-auto min-h-full/.test(shell))

  console.log("\nCOPY")
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of ["components/community/creator/community-shell.tsx", "components/community/creator/parts.tsx", "components/community/creator/settings-section.tsx", "components/community/creator/overview.tsx", "components/community/creator/community-list.tsx", "components/community/cover-fill.tsx", "lib/communities/cover-gradient.ts"]) {
    const src = read(f)
    check(`${f}: no AI words, no em dash`, !banned.test(src) && !src.includes(String.fromCharCode(0x2014)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
