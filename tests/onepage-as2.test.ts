/**
 * Round AS (track 2): the OnePage's corner buttons and its legal sheets.
 *
 *   - Share and Subscribe sit clear of the editor phone's rounded screen
 *     (concentric with its curve, from the radius the phone itself draws)
 *     and of a notch or status bar (env(safe-area-inset-*)), never by
 *     reading the device
 *   - Terms, Privacy and Cookies are tabs of one sheet of fixed height: the
 *     thumb slides, the text fades through and is put back to its top before
 *     it is painted
 *   - Cookies are the visitor's choices, saved as pressed, not written in
 *     the editor's preview
 *   - Report is a form with checks and a thanks in the same place, sent to
 *     the team with the page's address; the preview answers it itself
 *   - Esc, Back and Tab: the sheets close on Back and keep Tab inside
 *
 * scripts/check-onepage-as2.mjs measures them at 390 (touch) and 1440.
 *
 *   npx tsx tests/onepage-as2.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { contactProblems, reasonLabel, reportMessage, reportProblems, REPORT_KINDS, CONTACT_REASONS } from "@/lib/help/contact"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe corner buttons\n")
{
  const css = read("app/globals.css")
  const live = read("components/onepage/public-onepage.tsx")
  const frame = read("components/onepage/live-preview.tsx")
  const doc = read("components/onepage/preview-document.tsx")
  check("Subscribe and Share carry the corner mark, with no fixed top or side classes of their own", /data-onepage-corner="right"/.test(live) && /data-onepage-corner="left"/.test(live) && !/fixed top-4 right-4/.test(live) && !/fixed top-4 left-4/.test(live))
  check("the edge is the larger of 16px and the screen's radius less half the button", /--onepage-corner-edge: max\(16px, calc\(var\(--onepage-screen-radius, 0px\) - 20px\)\)/.test(css))
  /* Changed on purpose (round AT): the top inset is the page's own --op-safe-top (env on a phone, 0 inside the editor's frame). */
  check("a notch or status bar pushes them in through the safe area, on every side they touch", /top: max\(var\(--onepage-corner-edge\), calc\(var\(--op-safe-top, 0px\) \+ 8px\)\)/.test(css) && /--op-safe-top: env\(safe-area-inset-top, 0px\)/.test(css) && /env\(safe-area-inset-left, 0px\)/.test(css) && /env\(safe-area-inset-right, 0px\)/.test(css))
  /* Wave 15, the owner: Share and the bell sat too close to the avatar under a Classic header. */
  check("a classic header starts 20px below the buttons' foot, read from the same edge (40px buttons, 44px from 640px)", /:root \{\n  --onepage-classic-top: calc\(max\(var\(--onepage-corner-edge\), calc\(var\(--op-safe-top, 0px\) \+ 8px\)\) \+ 40px \+ 20px\);/.test(css) && /--onepage-classic-top: calc\(max\(var\(--onepage-corner-edge\), calc\(var\(--op-safe-top, 0px\) \+ 8px\)\) \+ 44px \+ 20px\);/.test(css) && /:root, \[data-onepage-corner\] \{\n  --onepage-corner-edge: max\(16px/.test(css))
  check("  whatever the alignment, whenever Share or the bell is drawn", /const clearOfShare = \(top: string\) => \(top === "50px" && cornerButtonsShown \? "var\(--onepage-classic-top, 76px\)" : top\)/.test(live) && /const cornerButtonsShown = safeSettings\.share_enabled !== false \|\| \(safeSettings\.subscribe_enabled !== false && !!seller_id\)/.test(live) && !/headerAlignOf\(safeTheme\) === "left" && safeSettings\.share_enabled/.test(live))
  check("nothing reads the device to place them", !/userAgent/.test(css.slice(css.indexOf("[data-onepage-corner]"))))
  check("the phone draws its screen with one radius and hands the same number to the frame", /export const PHONE_SCREEN_RADIUS = 34/.test(frame) && /borderRadius: PHONE_SCREEN_RADIUS/.test(frame) && /corner=\{PHONE_SCREEN_RADIUS\}/.test(frame))
  check("  in the page's own pixels (it is drawn smaller)", /&corner=\$\{Math\.round\(\(corner \/ scale\) \* 10\) \/ 10\}/.test(frame))
  check("the preview sets it before its first paint, and only a sane number", /useLayoutEffect\(\(\) => \{\s*const corner = Number\(new URLSearchParams\(window\.location\.search\)\.get\("corner"\)\)/.test(doc) && /corner > 0 && corner < 200/.test(doc))
  const R = 34 / (287 / 390)
  const edge = Math.max(16, R - 20)
  /* The dot: 10px, 2px out of the button's top right corner. Its far edge from the curve's centre must stay inside the curve. */
  const dotCentre = edge + 20 - 17
  const far = Math.SQRT2 * (R - dotCentre) + 5
  check("the dot clears the curve with room for its glow (>= 8px)", R - far >= 8, { R, edge, gap: R - far })
}

console.log("\nTerms, Privacy and Cookies: one sheet, three tabs\n")
{
  const links = read("components/onepage/onepage-legal-links.tsx")
  check("three tabs, Cookies among them", /\{ id: "terms", label: "Terms" \}/.test(links) && /\{ id: "privacy", label: "Privacy" \}/.test(links) && /\{ id: "cookies", label: "Cookies" \}/.test(links))
  check("a reading sheet of fixed height, so a switch moves no edge", /width=\{720\} tall>/.test(links) && !/scrollKey=\{kind\}/.test(links))
  check("one thumb slides under the tabs (translate and width), placed before it first shows", /t\.style\.translate = `\$\{el\.offsetLeft\}px 0`/.test(links) && /t\.style\.width = `\$\{el\.offsetWidth\}px`/.test(links) && /useLayoutEffect\(place, \[place\]\)/.test(links))
  check("the text fades out, is swapped, then fades in", /setFading\(true\)/.test(links) && /setShown\(t\)/.test(links) && /opacity: fading \? 0 : 1/.test(links))
  check("  and goes back to its top before it is painted", /useLayoutEffect\(\(\) => \{\s*const scroller = body\.current\?\.closest/.test(links))
  check("  without motion when the visitor asked for less", /prefers-reduced-motion: reduce/.test(links))
  check("the policy's own cookie button shows the Cookies tab, not a second dialog", /closest\("\[data-cookie-choices\]"\)/.test(links) && /data-cookie-choices=""/.test(read("components/legal/cookie-table.tsx")))
  check("Back closes either sheet, and a close by other means steps off its entry", /useBackCloses\(open, close\)/.test(links) && /useBackCloses\(reportOpen, closeReport\)/.test(links) && /backThen\(strip, 500\)/.test(links) && /isOnePagePreview\(\)\) return/.test(links))
  const dialog = read("components/onepage/onepage-dialog.tsx")
  check("Tab stays inside the phone's sheet as it does in the card", /useTabTrap\(open && phone === true && !centered, inner\)/.test(dialog) && /closest<HTMLElement>\("\[data-sheet-panel\]"\)/.test(dialog))
  check("  and skips what is out of the order (a hidden pane, an unseen field)", (dialog.match(/el\.tabIndex >= 0/g) ?? []).length >= 2)
  check("the card's scroll goes back before the paint", /useLayoutEffect\(\(\) => \{\s*if \(scrollRef\.current\) scrollRef\.current\.scrollTop = 0/.test(dialog))
}

console.log("\nCookie choices\n")
{
  const panels = read("components/onepage/onepage-legal-panels.tsx")
  check("each optional kind has a switch that saves as it is pressed", /OPTIONAL\.map/.test(panels) && /role="switch"/.test(panels) && /writeConsent\(\{ version: CONSENT_VERSION, \.\.\.next/.test(panels))
  check("Reject all and Accept all, the same size", /onClick=\{\(\) => all\(false\)\} className="h-11/.test(panels) && /onClick=\{\(\) => all\(true\)\} className="h-11/.test(panels))
  check("nothing is written in the editor's preview", /preview\.current = isOnePagePreview\(\)/.test(panels) && /if \(preview\.current\) return/.test(panels))
  check("a choice made elsewhere shows here", /onConsentChange\(\(c\) => setChoices\(fromConsent\(c\)\)\)/.test(panels))
}

console.log("\nReport\n")
{
  const good = { kind: "scam", email: "ana@example.com", details: "The checkout asks for a card on another site." }
  check("a complete report passes", Object.keys(reportProblems(good)).length === 0)
  const bad = reportProblems({ kind: "", email: "nope", details: "bad" })
  check("each field says what is wrong", !!bad.kind && !!bad.email && !!bad.details, bad)
  check("five kinds, the last Something else", REPORT_KINDS.length === 5 && REPORT_KINDS[4].id === "other")
  check("what it sends passes the route's own check", contactProblems({ reason: "report", email: good.email, message: reportMessage(good.kind, "ten chars!"), link: "https://storelib.com/ana" }) === null)
  check("  as Report a page, which the Help Center's list does not offer", reasonLabel("report") === "Report a page" && !CONTACT_REASONS.some((r) => (r.id as string) === "report"))
  check("  an unknown reason is still refused", contactProblems({ reason: "nope", email: good.email, message: "x".repeat(30) })?.reason !== undefined)
  const panels = read("components/onepage/onepage-legal-panels.tsx")
  check("sent to the team with the page's address", /fetch\("\/api\/help\/contact"/.test(panels) && /reason: REPORT_REASON\.id/.test(panels) && /link: window\.location\.href\.slice\(0, 500\)/.test(panels))
  check("the form and the thanks share one place, so the sheet keeps its height", /gridArea: "1 \/ 1"/.test(panels) && /Thanks, we have it/.test(panels))
  check("the first wrong field takes the focus, each with its note", /\.find\(\(f\) => wrong\[f\]\)/.test(panels) && /aria-invalid=\{problems\.email/.test(panels) && /aria-describedby=\{problems\.details/.test(panels))
  check("a field nobody sees catches bots", /name="company" tabIndex=\{-1\}/.test(panels))
  check("the editor's preview answers the report itself", /purchases\\\/\|help\\\/contact\)/.test(read("components/onepage/preview-document.tsx")))
  check("the reader, the choices and the form come in one idle fetch", /Promise\.all\(\[import\("@\/components\/legal\/legal-reader"\), import\("\.\/onepage-legal-panels"\)\]\)/.test(read("components/onepage/onepage-legal-links.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
