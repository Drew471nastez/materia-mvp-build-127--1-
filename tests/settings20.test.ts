/**
 * Settings, round 20 (the owner's settings video and "sometimes when I'm AFK
 * the settings sheet blocks, I have to refresh the page; double closing,
 * reloads, duplicates").
 *
 *   A SECTION    a press in the column while scrolled glides up to the new
 *                section's top: swapped at once, drawn just above its top,
 *                the browser's smooth scroll the rest; the column and the
 *                title come into place with it
 *   ONE SHEET    a link from Settings to Settings is a section switch, not a
 *                navigation (no second history entry, no page load, no second
 *                sheet)
 *   NEVER STUCK  a close that did not take hides the sheet and lets presses
 *                through, goes on back past a second Settings entry, puts the
 *                address on the page under, and only then brings the sheet
 *                back working; a sheet shown again on the same mount starts
 *                fresh
 *
 * Measured in Chromium by scripts/check-settings20.mjs (before: 11 failed;
 * after: all good). These hold the decisions and the code that carries them.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { inSheetSettingsLink, SETTINGS_PATH, SETTINGS_TAB_EVENT } from "../lib/settings/sheet-links"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sheet = read("components/app/settings-sheet.tsx")
const form = read("components/app/settings-form-new.tsx")

console.log("\nA link from Settings to Settings is a section, not a navigation\n")
{
  const here = "https://storelib.com/app/settings?tab=store"
  check("to another section: that section", JSON.stringify(inSheetSettingsLink("/app/settings?tab=locations", here)) === JSON.stringify({ tab: "locations", section: null }))
  check("an older ?tab=shipping&section= address keeps its section", JSON.stringify(inSheetSettingsLink("/app/settings?tab=shipping&section=taxes", here)) === JSON.stringify({ tab: "shipping", section: "taxes" }))
  check("to Settings with no section: kept in place, nothing named", JSON.stringify(inSheetSettingsLink("/app/settings", here)) === JSON.stringify({ tab: null, section: null }))
  check("a trailing slash is the same page", inSheetSettingsLink("/app/settings/?tab=domains", here)?.tab === "domains")
  check("a whole address of ours counts", inSheetSettingsLink("https://storelib.com/app/settings?tab=taxes", here)?.tab === "taxes")
  check("another page of ours is a navigation as usual", inSheetSettingsLink("/app/settings/billing/upgrade", here) === null && inSheetSettingsLink("/app/orders", here) === null)
  check("another site is never caught", inSheetSettingsLink("https://example.com/app/settings?tab=taxes", here) === null)
  check("from anywhere but Settings nothing is caught", inSheetSettingsLink("/app/settings?tab=taxes", "https://storelib.com/app/orders") === null)
  check("a broken address is left alone", inSheetSettingsLink("http://[", here) === null)
  check("one address for Settings, one event name", SETTINGS_PATH === "/app/settings" && SETTINGS_TAB_EVENT === "storelib:settings-tab")
  check("the sheet stops it on the document, in the capture phase, before a Link or the browser follows it", /document\.addEventListener\("click", onClick, true\)/.test(sheet) && /const ask = inSheetSettingsLink\(a\.href, window\.location\.href\)/.test(sheet) && /e\.preventDefault\(\)\n      e\.stopPropagation\(\)/.test(sheet))
  check("the form switches to the section named, as a press in its column does", /window\.addEventListener\(SETTINGS_TAB_EVENT, onAsk\)/.test(form) && /if \(allowedRef\.current\(to\)\) tabChangeRef\.current\(to\)/.test(form))
}

console.log("\nA close that did not take never leaves the page blocked\n")
{
  check("slid away, it is hidden and lets every press through", /gone && "pointer-events-none invisible"/.test(sheet) && /aria-hidden=\{gone \|\| undefined\}/.test(sheet))
  check("and the page under is no longer held", /if \(!here \|\| gone\) return\n    const html = document\.documentElement/.test(sheet) && /\}, \[here, overlay, gone\]\)/.test(sheet))
  check("it is hidden when the Back starts, not only once it lands", /const back = \(\) => \{\n          setGone\(true\)\n          watch\(\)/.test(sheet))
  check("a Back that lands on Settings again goes on back, a few times at most", /const MAX_HOPS = 3/.test(sheet) && /if \(!alive\.current \|\| window\.location\.pathname !== SETTINGS_PATH \|\| hops >= MAX_HOPS\) return stop\(\)/.test(sheet) && /hops\+\+\n              window\.history\.back\(\)/.test(sheet))
  check("a back already on its way is waited out, not swallowed", /if \(backInFlight\(\) && waited\+\+ < 8\) \{\n            window\.setTimeout\(back, BACK_HOLD_MS\)/.test(sheet))
  check("the back watch's fallback is the page under the sheet, not always the dashboard", /pageUnderSettingsSheet\(SETTINGS_PATH\) \?\? "\/app"/.test(sheet) && /backThen\(\(\) => \{\n            stop\(\)\n            router\.replace\(under\(\)\)/.test(sheet))
  check("still up on Settings after STUCK_MS: the address goes to the page under, then the sheet comes back working", /const STUCK_MS = 2500/.test(sheet) && /router\.replace\(pageUnderSettingsSheet\(SETTINGS_PATH\) \?\? "\/app"\)\n          stuck\.current = window\.setTimeout\(\(\) => \{\n            if \(alive\.current && hereRef\.current && window\.location\.pathname === SETTINGS_PATH\) restore\(\)/.test(sheet))
  check("opened on its own, a close whose navigation never came makes the close work again", /if \(!overlay\) return restore\(\)/.test(sheet) && /watch\(\)\n        \/\* Back to where it was opened from/.test(sheet))
  check("putting it back cancels what the close left filled in and takes presses again", /el\?\.getAnimations\?\.\(\)\.forEach\(\(a\) => a\.cancel\(\)\)/.test(sheet) && /leaving\.current = false\n    setGone\(false\)/.test(sheet))
  check("shown again on the same mount (the slot keeps it), it starts fresh", /if \(here\) \{\n      window\.clearTimeout\(stuck\.current\)\n      leaving\.current = false\n      setGone\(false\)\n    \}/.test(sheet))
  check("a timer of a sheet that has gone does nothing", /alive\.current = false\n      window\.clearTimeout\(stuck\.current\)/.test(sheet))
  check("the old fallback straight to the dashboard is gone", !/backThen\(\(\) => router\.replace\("\/app"\)\)/.test(sheet))
}

console.log("\nA section pressed while scrolled glides up to its top\n")
{
  check("drawn at most GLIDE_FROM_PX above its top, or where the column is still held", /const GLIDE_FROM_PX = 200/.test(form) && /target \+ Math\.max\(GLIDE_FROM_PX, Math\.ceil\(columnHeld\)\)/.test(form))
  check("then the browser's own smooth scroll, on the compositor", /scroller\.scrollTop = start/.test(form) && /if \(!still\) scroller\.scrollTo\(\{ top: target, behavior: "smooth" \}\)/.test(form))
  check("close to the top, and with less motion asked for, simply at the top", /const SNAP_PX = 8/.test(form) && /from - target <= SNAP_PX/.test(form) && /prefers-reduced-motion: reduce/.test(form))
  check("no height lost while the next section comes: the open one's height is held from the press until the scroll is read", /if \(formRef\.current\) formRef\.current\.style\.minHeight = `\$\{formRef\.current\.offsetHeight\}px`/.test(form) && /const from = scroller\?\.scrollTop \?\? 0\n/.test(form))
  check("the row is held tall enough for the column and for the glide's start, then let go", /box\.style\.minHeight = `\$\{Math\.max\(column!\.offsetHeight, scroller\.clientHeight\) \+ start - target\}px`/.test(form) && /if \(scroller\.scrollTop <= target \+ 1\) release\(\)/.test(form) && /glideHold\.current\?\.\(\)/.test(form))
  check("a column pushed up at the very end of a long section eases back, never in one frame", /const by = was - column!\.getBoundingClientRect\(\)\.top/.test(form) && /column!\.animate\(\[\{ transform: `translateY\(\$\{by\}px\)` \}/.test(form))
  check("the section still swaps on the press (no glide first, no old section riding up)", /if \(urls\.every\(\(u\) => peekGet\(u\) !== null\)\) show\(\)/.test(form) && !/glideScrollTop/.test(form))
  check("Plan waits for its own answer like any section's data, at most DATA_WAIT_MS", /if \(activeTab === "billing" && !billingData && !billingError\) \{\n      const t = window\.setTimeout\(show, DATA_WAIT_MS\)/.test(form) && /\}, \[activeTab, physicalCommerce, !!billingData, billingError\]\)/.test(form))
  check("the columns are found by their own mark, not a layout class", /data-settings-columns=""/.test(form) && /closest\("\[data-settings-columns\]"\)/.test(form))
}

console.log("\nCopy\n")
{
  /* In the words a person or a reader of the code sees: the comments and the strings, not CSS property names. */
  const banned = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form(s|ed|ing)?"].join("|")})\\b`, "i")
  const dash = new RegExp(String.fromCharCode(0x2014))
  for (const p of ["lib/settings/sheet-links.ts", "tests/settings20.test.ts", "scripts/check-settings20.mjs", "scripts/render-settings20.tsx"]) {
    const comments = (read(p).match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? []).join("\n")
    check(`${p}: no em dash, and none of the banned words in what it says`, !dash.test(read(p)) && !banned.test(comments))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
