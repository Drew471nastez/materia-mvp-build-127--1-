/**
 * ===========================================================================
 *  ROUND R8: A COMMUNITY AND THE EMAIL EDITOR ON A PHONE
 * ===========================================================================
 * Held from their inputs and, where the rule is about how a file is written,
 * from its source. The geometry is measured in a browser by
 * scripts/check-community-mobile-r8.mjs and scripts/check-emails-mobile-r8.mjs.
 *
 *   COMMENT     a web view resized for the keyboard (the plugin's own
 *               "native" resize) is never lifted by a keyboard height on top:
 *               the owner's r2-community-comment-keyboard.webp, the box 84px
 *               from the top of a 464px tall page
 *   COMPOSER    the feed behind New post is not shortened for the sheet's
 *               keyboard; the sheet's fields are its own; the sheet's room is
 *               not a keyboard height when the web view made room itself
 *   SEARCH      the phone's search screen is drawn over an opened post and is
 *               a layer that covers the tab bar
 *   LEAVE       a layer's class on <html> goes once its element has gone
 *               (New email left `has-phone-page-layer`, the /app header hidden)
 *   SEGMENT     New segment on a phone is a bottom sheet on the keyboard with
 *               Done, 16px fields and 44px rows
 *   BUTTON      a button on a phone is edited in a bottom sheet
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RESIZED_MIN_PX, boxFootOnScreen, keyboardPlan, webViewResized, type KeyboardFacts } from "@/components/community/member/keyboard-plan"
import { openLayer, resetLayers } from "@/lib/ui/layers"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

async function main() {
  console.log("\nCOMMENT: the box on the keys when the web view resizes itself (390x844, keyboard 380)")
  {
    /* The owner's picture: the plugin said 380 and the web view became 464 tall. */
    const resized: KeyboardFacts = { layoutH: 464, innerH: 464, vvTop: 0, vvH: 464, typing: true, native: 380, table: null, published: 0, fullH: 844 }
    const before = { ...resized, fullH: undefined }
    const old = keyboardPlan("ios-app-plugin", before)
    check("without the full height (as before this round) the plugin's 380 is added on top: the box 84px from the top", old.source === "native" && boxFootOnScreen(old, { layoutH: 464, vvTop: 0, tabs: 56 }) === 84, old)
    const plan = keyboardPlan("ios-app-plugin", resized)
    check("with it, the web view made the room: nothing added, the box on the keys (464)", plan.source === "visual" && plan.foot === 0 && boxFootOnScreen(plan, { layoutH: 464, vvTop: 0, tabs: 56 }) === 464, plan)
    check("and the web view's scroll is not held for it", plan.holdScroll === false && plan.atFocus === false, plan)
    /* The next focus in the same visit: the web view is still full height for a moment; known to resize, the box is not lifted. */
    const next = keyboardPlan("ios-app-plugin", { ...resized, layoutH: 844, innerH: 844, vvH: 844, resizes: true })
    check("seen once in the visit, the next focus is not lifted for the frames before the web view shrinks", next.source === "visual" && next.foot === 0, next)
    /* The app without the plugin, a web view that resized: the table is not used either. */
    const table = keyboardPlan("ios-app", { ...resized, native: 0, table: 380 })
    check("the app without the plugin, resized: the table's 380 is not added either", table.source === "visual" && table.foot === 0, table)
    /* Nothing changes where the web view keeps its size. */
    const kept = keyboardPlan("ios-app-plugin", { ...resized, layoutH: 844, innerH: 844, vvH: 844, fullH: 844 })
    check("a web view that keeps its size (resize: none) still sits the box on the plugin's height", kept.source === "native" && kept.foot === 380 && boxFootOnScreen(kept, { layoutH: 844, vvTop: 0, tabs: 56 }) === 464, kept)
    const pan = keyboardPlan("ios-app-plugin", { ...resized, layoutH: 844, innerH: 844, vvH: 844, vvTop: 62, fullH: 844 })
    check("and a pan is still taken off it once", pan.foot === 318 && boxFootOnScreen(pan, { layoutH: 844, vvTop: 62, tabs: 56 }) === 464, pan)
    const safari = keyboardPlan("ios-safari", { layoutH: 844, innerH: 464, vvTop: 120, vvH: 464, typing: true, native: 0, table: null, published: 0, fullH: 844 })
    check("iPhone Safari is as it was: the visible part, the pan in it", safari.source === "visual" && boxFootOnScreen(safari, { layoutH: 844, vvTop: 120, tabs: 56 }) === 464, safari)
    check("a toolbar is not a resize; a keyboard is", !webViewResized({ layoutH: 844 - 80, fullH: 844 }) && webViewResized({ layoutH: 464, fullH: 844 }) && RESIZED_MIN_PX === 120)
    const vb = code("components/community/member/visible-box.ts")
    check("the hook keeps the full height per width and remembers a resize for the visit", /export function noteFixedBox\(layoutH: number\)/.test(vb) && /if \(keys && fullBox\.h - layoutH > RESIZED_MIN_PX\) resizedOnce = true/.test(vb) && /fullH: box\.fullH,\s*resizes: box\.resizes,/.test(vb))
    check("and reads the keyboard again after it has risen", /window\.setTimeout\(\(\) => run\(\), 320\)/.test(vb) && /window\.setTimeout\(\(\) => run\(\), 700\)/.test(vb))
    /* Round 25: the readout reads the sheet's own numbers, the room it asked for and the room it made. */
    check("the readout says it", /room asked \$\{/.test(read("components/community/member/post-fullscreen.tsx")) && /room under \$\{sheet \? getComputedStyle\(sheet\)\.paddingBottom/.test(read("components/community/member/post-fullscreen.tsx")))
  }

  console.log("\nCOMPOSER: New post's sheet and the feed behind it")
  {
    const vb = code("components/community/member/visible-box.ts")
    check("the sheet's room is no keyboard height once the web view made room itself", /if \(box\.resizes \|\| webViewResized\(\{ layoutH, fullH: box\.fullH \}\)\) return null/.test(vb))
    const cp = code("components/community/member/composer.tsx")
    check("the community's frame is marked while the sheet is up, and unmarked after", /shell\?\.setAttribute\("data-sheet-over", ""\)/.test(cp) && /shell\?\.removeAttribute\("data-sheet-over"\)/.test(cp))
    check("the sheet's fields are its own (KeyboardGuard does not centre them)", /data-composer="sheet"[\s\S]{0,400}data-keyboard-own=""/.test(cp))
    const css = read("app/globals.css")
    check("keyboard-open does not shorten the frame under the sheet (the feed's scroll was thrown to the top)", /html\.keyboard-open \[data-community-shell\]:not\(\[data-post-over\]\):not\(\[data-sheet-over\]\) \{/.test(css) && /html\.keyboard-open \[data-community-shell\]:not\(\[data-post-over\]\):not\(\[data-sheet-over\]\) \[data-community-body\]/.test(css))
  }

  console.log("\nSEARCH: over an opened post")
  {
    const s = code("components/community/member/search.tsx")
    const z = Number(/export const SEARCH_SCREEN_Z = (\d+)/.exec(s)?.[1] ?? 0)
    /* Round 25: the post is the builder's sheet at POST_SHEET_Z. */
    const post = Number(/export const POST_SHEET_Z = (\d+)/.exec(code("components/community/member/post-fullscreen.tsx"))?.[1] ?? 0)
    const lifted = Number(/html\[data-tabs-over\] \[data-buyer-tab-bar\] \{\s*z-index: (\d+);/.exec(read("app/globals.css"))?.[1] ?? 0)
    check("the screen is drawn over the post and the tab bar lifted over it", z > post && z > lifted && post === 130, { z, post, lifted })
    check("under the composer's leave dialog and the picture viewer", z < 150 && z < 160, z)
    check("it is a search layer (it covers the tab bar, which goes back under it)", /useLayer\("search", mounted && open, screenRef\)/.test(s) && /ref=\{screenRef\}/.test(s) && /data-layer-kind="search"/.test(s) && /style=\{\{ zIndex: SEARCH_SCREEN_Z \}\}/.test(s))
  }

  console.log("\nLEAVE: a layer's class goes with its element")
  {
    /* A document just big enough for lib/ui/layers.ts: <html>'s classes and attributes, and whether the layer's element is still there. */
    const classes = new Set<string>()
    let standing = false
    const g = globalThis as unknown as { document?: unknown }
    const had = g.document
    g.document = {
      documentElement: {
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) },
        toggleAttribute: () => {},
      },
      querySelector: (q: string) => (standing && q.includes('"phone-page"') ? {} : null),
      querySelectorAll: () => [],
    }
    resetLayers()
    standing = true
    const release = openLayer("phone-page", () => ({ isConnected: standing }) as unknown as Element)
    const open = classes.has("has-phone-page-layer")
    /* React runs the cleanup while the element is still in the document, and takes the element out in the same commit. */
    release()
    const inCleanup = classes.has("has-phone-page-layer")
    standing = false
    await Promise.resolve()
    const afterCommit = classes.has("has-phone-page-layer")
    check("open: the class is on", open)
    check("in the cleanup the element still stands for it (React removes it after)", inCleanup)
    check("once the commit is over the class is gone (the /app header is painted again)", !afterCommit)
    resetLayers()
    g.document = had
    check("the release asks again in a microtask", /if \(hasDom\(\)\) queueMicrotask\(publish\)/.test(code("lib/ui/layers.ts")))
  }

  console.log("\nSEGMENT: New segment on a phone")
  {
    const s = code("components/email/compose/segment-editor.tsx")
    check("a phone gets the app's bottom sheet on the keyboard, a computer keeps the dialog", /if \(phone\) \{[\s\S]*<BottomSheet[\s\S]*aboveKeyboard[\s\S]*<\/BottomSheet>/.test(s) && /<Modal\s/.test(s))
    check("Done puts the keyboard away and leaves the sheet open; a tap away from a field does too", /data-segment-done=""/.test(s) && /onClick=\{putKeyboardAway\}/.test(s) && /closest\("input, select, textarea, label, button"\)\) putKeyboardAway\(\)/.test(s))
    check("the name's return key says done and puts it away", /enterKeyHint="done"/.test(s) && /if \(phone && e\.key === "Enter"\)/.test(s))
    check("16px fields on a phone (iOS zooms into anything smaller), 44px product rows", /\[&_input:not\(\[type=checkbox\]\)\]:text-\[16px\] \[&_select\]:text-\[16px\]/.test(s) && /phone && "min-h-11 text-\[15px\]"/.test(s))
    check("nothing takes the caret while the sheet rises", /autoFocus=\{!phone\}/.test(s))
    check("Save keeps its rule: off until a name, and a product when one must be picked", /disabled=\{busy \|\| !name\.trim\(\) \|\| noProducts\}/.test(s))
  }

  console.log("\nBUTTON: a button on a phone")
  {
    const e = code("components/email/compose/block-editor.tsx")
    const p = code("components/email/compose/panels.tsx")
    check("its settings are a bottom sheet on a phone (on the keyboard), under the block on a computer", /<BottomSheet\s+isOpen=\{!!sheetButton\}[\s\S]*aboveKeyboard/.test(e) && /phone \? null : <ButtonPanel/.test(e))
    check("its words are a field of the sheet, and the button is not a field on a phone", /\{sheet \? \(\s*<Field label="Button text"/.test(p) && /readOnly=\{phone\}/.test(e))
    check("Done closes it, and the block's moves are in it", /data-button-sheet-done=""/.test(e) && /actionsFor\(sheetButton\.id\)\.map/.test(e))
    check("a button added on a phone does not take the caret on the canvas (its sheet opens)", /if \(made\.type === "button" && !phone\)/.test(e))
    check("the colours are a thumb's size in the sheet", /large=\{sheet\}/.test(p) && /\[&_button\]:h-10/.test(code("components/email/compose/ui.tsx")))
  }

  console.log("\nCOPY: this round's files")
  {
    const files = [
      "components/community/member/keyboard-plan.ts",
      "components/community/member/visible-box.ts",
      "components/community/member/search.tsx",
      "components/community/member/composer.tsx",
      "components/email/compose/segment-editor.tsx",
      "components/email/compose/block-editor.tsx",
      "components/email/compose/panels.tsx",
      "lib/ui/layers.ts",
      "scripts/check-community-mobile-r8.mjs",
      "scripts/render-community-mobile-r8.tsx",
      "scripts/check-emails-mobile-r8.mjs",
      "scripts/render-emails-mobile-r8.tsx",
    ]
    /* Spelled in pieces, so this file does not hold them itself. */
    const banned = new RegExp(["\\u2014", "un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
    const bad = files.filter((f) => banned.test(read(f)))
    check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  }
}

void main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
