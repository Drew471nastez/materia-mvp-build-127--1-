/**
 * ROUND Z7: /app POLISH
 *
 *   orders source   a direct visit adds nothing: "Website", not "Website ·
 *                   Direct"; a real sub-source stays ("Website · Instagram")
 *   new product     Paid community is never a New product answer; an old
 *                   ?type=community link still lands in the community setup
 *   sidebar         a parent's pill and its children are not glued; the
 *                   scrollbar is a 4px overlay thumb, at most 72px long,
 *                   clear at rest, faded in on hover and out on leave
 *   integrations    the cover's specks: soft radial dots, transform and
 *                   opacity only, the drift paused unless hovered, none with
 *                   reduced motion; one card for both surfaces
 *   shipping        Everywhere else has a globe tile; a save of a zone, rate,
 *                   package or location says so in a toast, a failed one too
 *
 * Measured in a browser by scripts/check-app-sidebar-z7.mjs,
 * scripts/check-integrations-y2.mjs (P) and scripts/check-shipping-settings.mjs.
 *
 * Run: npx tsx tests/app-polish-z7.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { originFrom, originFromKey, sourceDetailText, sourceText } from "@/lib/orders/order-source"
import { kindFromParam, kindHref, kindOptions } from "@/app/(storelib)/app/products/new/product-kinds"
import { THUMB_MAX, THUMB_MIN, TRACK_INSET, thumbGeometry } from "@/components/app/sidebar-scroll-thumb"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe orders source")
check("a website order from a direct visit reads Website", sourceText("website", { surface: "website", from: "direct" }) === "Website")
check("one from Instagram keeps it", sourceText("website", { surface: "website", from: "instagram" }) === "Website · from Instagram")
check("the export's detail column has no Direct", sourceDetailText("website", { surface: "website", site: "a.storelib.com", from: "direct" }) === "a.storelib.com")
check("originFrom and its key skip direct", originFrom({ from: "direct" }) === null && originFromKey({ from: "direct" }) === null && originFromKey({ from: "google" }) === "google")
const list = read("app/(storelib)/app/orders/orders-list.tsx")
check("the list's Source cell reads the same key", /originFromKey\(order\.sourceDetail\)/.test(list) && !/order\.sourceDetail\?\.from \?/.test(list))

console.log("\nNew product")
check("no switch offers a paid community", [false, true].every((physical) => !kindOptions(physical).some((o) => o.kind === "community")))
check("an old ?type=community link still opens the community setup", kindFromParam("community") === "community" && kindHref("community") === "/app/community/new")

console.log("\nThe sidebar")
const nav = read("components/app/sidebar-desktop-nav.tsx")
const css = read("app/globals.css")
check("4px under the parent's pill, 3px between children, 6px after", /data-nav-children="" className="ml-\[24px\] mt-\[4px\] space-y-\[3px\] border-l border-neutral-200 pb-\[6px\] pl-\[10px\]"/.test(nav))
check("the platform's bar is hidden on the nav, no gutter kept", /\.sidebar-nav \{\s*overscroll-behavior: contain;\s*scrollbar-width: none;\s*\}/.test(css) && /\.sidebar-nav::-webkit-scrollbar \{\s*display: none;/.test(css) && !/\.sidebar-nav \{[^}]*scrollbar-gutter/.test(css))
check("the thumb fades in quicker than it fades out, opacity only", /\[data-nav-thumb\] \{[^}]*transition: opacity 420ms/.test(css) && /\[data-nav-scroll-frame\]:hover > \[data-nav-thumb\]\[data-scrollable\][\s\S]*?transition-duration: 180ms/.test(css))
const short = thumbGeometry(400, 30000, 0)!
const long = thumbGeometry(400, 430, 30)!
check("the thumb is never shorter than THUMB_MIN", short.height === THUMB_MIN && short.y === TRACK_INSET, short)
check("nor longer than THUMB_MAX, however little overflows", long.height === THUMB_MAX && Math.abs(long.y - (400 - TRACK_INSET - THUMB_MAX)) < 0.01, long)
check("and there is none when nothing overflows", thumbGeometry(400, 400, 0) === null && thumbGeometry(400, 401, 0) === null)

console.log("\nIntegration cards")
const dir = read("components/app/settings/integrations-directory.tsx")
/* Changed on purpose (round AR): the specks read as bubbles; one dispersed mesh gradient replaces them. */
check("one dispersed mesh of overlapping soft gradients, no specks", /data-integration-mesh=""/.test(dir) && (dir.match(/radial-gradient\(\d+% \d+% at \d+% \d+%/g) ?? []).length >= 4 && !/data-integration-speck/.test(dir))
check("it moves by opacity and transform only", /\.int-mesh \{[\s\S]*?transition-property: opacity, transform;/.test(css) && /@keyframes int-mesh-drift \{/.test(css))
check("the drift only runs while the card is hovered", /\.group:hover > \[data-integration-cover\] > \.int-mesh,[\s\S]*?animation: int-mesh-drift/.test(css) && !/(^|\n)\.int-mesh \{[^}]*animation:/.test(css))
check("no blur filter, and none at all with reduced motion", !/\.int-mesh[^{]*\{[^}]*filter/.test(css) && /@media \(prefers-reduced-motion: reduce\) \{\s*\.int-mesh \{\s*display: none;/.test(css))

console.log("\nShipping")
const ship = read("components/physical/shipping-settings.tsx")
const ui = read("components/physical/ui.tsx")
check("Everywhere else draws a globe tile in the list and the summary, not a grey box", (ship.match(/<WorldFlag className="ring-2 ring-white" \/>/g) ?? []).length === 2 && !/rounded-\[3px\] bg-\[#f1f2f4\]/.test(ship))
check("a save says so in a toast; a failed one too, with its words kept under the form", /if \(done\) toast\(\{ title: done \}\)/.test(ui) && /toast\(\{ title: tt\("Not saved"\), description: problem, variant: "destructive" \}\)/.test(ui) && /setError\(problem\)/.test(ui))
for (const what of ["Zone", "Rate", "Package", "Location"]) check(`${what}: saved or added`, new RegExp(`initial \\? tt\\("${what} saved"\\) : tt\\("${what} added"\\)`).test(ship))
check("no second Saved word in the rows", !/SavedMark|useSavedFlash/.test(ship))
check("on a phone a rate's row opens it and its pencil goes", /data-rate-edit=""/.test(ship) && /"w-9 px-0 max-sm:hidden"/.test(ship))
check("a card's description runs the full width under its action on a phone", /data-card-head=""/.test(ui) && /col-span-2 mt-0\.5 min-w-0 sm:col-span-1/.test(ui))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
