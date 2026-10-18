/**
 * ===========================================================================
 *  ROUND Y2: AN INTEGRATION'S BAR CARRIES BACK, AND THE CARDS' COVERS FILL
 * ===========================================================================
 * Pinned from source here; measured in headless Chromium by
 * scripts/check-integrations-y2.mjs (timing, the swap, layout shift, the
 * cover's fill over time, horizontal scroll at 390 and 1280).
 *
 *   npx tsx tests/integrations-y2.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const detail = read("components/app/settings/integration-detail.tsx")
const dir = read("components/app/settings/integrations-directory.tsx")

console.log("\nThe bar and its way back\n")
check("there is a bar wherever the page has a Back to integrations (Integrations and Settings), or an action to follow", /const barOn = !!onBack \|\| pinnable/.test(detail) && /\{barOn \? \(/.test(detail))
check("one IntersectionObserver for the Back link's mark and the header's actions, set in one update", (detail.match(/new IntersectionObserver\(/g) ?? []).length === 1 && /io\.observe\(act\)/.test(detail) && /if \(mark\) io\.observe\(mark\)/.test(detail) && /setState\(\(s\) => \(s\.bar === bar && s\.action === action \? s : \{ bar, action \}\)\)/.test(detail))
check("  no scroll handler drives it", !/addEventListener\("scroll", [^)]*setState/.test(detail))
check("the mark sits 64px under the link's foot, so the bar comes as the link's last pixel leaves the top", /style=\{\{ top: `calc\(100% \+ \$\{PIN_ROOM - 1\}px\)` \}\} data-integration-back-mark=""/.test(detail))
check("the bar's back arrow is a button named Back to integrations, at its left", /aria-label=\{tt\("Back to integrations"\)\}[\s\S]{0,400}data-integration-pin-back=""/.test(detail) && detail.indexOf("data-integration-pin-back") < detail.indexOf("<Mark item={item} size={32} />"))
check("the link and the bar trade places on the same flag and the same 200ms curve", /barShown \? "opacity-0" : "opacity-100"/.test(detail) && /const pinned = onBack \? barShown : actionOut/.test(detail) && /transition-\[background-color,color,opacity\] duration-200 ease-\[cubic-bezier\(0\.2,0,0,1\)\]/.test(detail) && /transition-\[opacity,translate\] duration-200 ease-\[cubic-bezier\(0\.2,0,0,1\)\]/.test(detail))
check("the bar's action keeps its room while the header's is in view, so the name never changes width", /data-integration-pin-action-slot=\{actionOut \? "shown" : "hidden"\}/.test(detail) && /inert=\{!actionOut\}/.test(detail))
check("reduced motion: no transition on the bar, its action or the link", (detail.match(/motion-reduce:transition-none/g) ?? []).length >= 3)
check("installed: the bar's action is Settings, as the header's", /const barAction = notifyOnly \|\| !!verb \? "primary" : plan \|\| installed \? "settings" : null/.test(detail))

console.log("\nThe cards' covers\n")
check("each card's band has the integration's own colour, the same as its page's banner", /<EntryBody color=\{bannerColor\(e\.item\)\}/.test(dir) && /<EntryBody color=\{tileColor\(e\.id\) \?\? "#64748b"\}/.test(dir))
check("the fill is one layer's opacity and scale, from the logo outward", /origin-\[42px_44px\] scale-\[0\.82\] opacity-0 transition-\[opacity,scale\]/.test(dir) && /group-hover:scale-100 group-hover:opacity-100 group-hover:duration-\[380ms\]/.test(dir) && /data-integration-cover-fill=""/.test(dir))
check("  out in 300ms, in in 380ms, on a soft in and out curve; none with reduced motion", /duration-300 ease-\[cubic-bezier\(0\.4,0,0\.2,1\)\]/.test(dir) && /group-hover:duration-\[380ms\][^"]*motion-reduce:transition-none/.test(dir))
check("  keyboard focus fills it too", /group-focus-visible:opacity-100/.test(dir))
check("  the band clips it, so it never spills into the card", /h-\[46px\] overflow-hidden border-b/.test(dir))
check("  never purple and never a loud colour: the wash is a mix of at most 34%", /strength === "rest" \? \[16, 6\] : \[34, 14\]/.test(dir))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
