/**
 * ===========================================================================
 *  A BOTTOM SHEET SITS ON THE KEYBOARD, NOT UNDER IT
 * ===========================================================================
 * Reported from the one-page editor with a picture: a sheet is open to type a
 * social link, and the keyboard covers the field. You cannot see what you are
 * writing.
 *
 * Every sheet in that editor was written the same way, and the way is wrong on
 * a phone:
 *
 *     position: fixed, top: 'auto', bottom: 0, maxHeight: '75vh'
 *
 * A fixed element is laid out against the LAYOUT viewport, and iOS does not
 * shrink that for the keyboard — it shrinks the VISUAL viewport, the part you
 * can see. So `bottom: 0` is the bottom of a screen the keyboard is sitting on
 * top of, and `75vh` is 75% of a height that never changed. The sheet keeps
 * its full size in its original place with its lower half behind the keys.
 *
 * Measured in scripts/check-sheet-keyboard.mjs on a 757px viewport with a
 * 336px keyboard, where everything below 421 is covered:
 *
 *     no keyboard                  sheet 189..757   field ends 741   screen 757
 *     keyboard up                  sheet 105..421   field ends 405   screen 421
 *     keyboard up, with !bottom-0  sheet 441..757   field ends 741   screen 421
 *
 * The third row is what shipped: the field 320px below the bottom of the
 * screen. The second is the fix.
 *
 * AND THERE WAS A SECOND LOCK ON THE DOOR. Every one of these sheets also
 * carried `!bottom-0` in its className. A Tailwind `!important` rule beats an
 * inline style, so the inline `bottom` had been dead all along — and setting
 * it to a variable would have been dead too. Removing that class is half the
 * fix, and the probe keeps a row proving the class still breaks it, so this
 * check can never stop telling the two apart.
 *
 * THE SHAPE OF THE SOLUTION, because the ask was that it never happen again:
 *
 *   1. ViewportVars already publishes the visible viewport on <html>. It now
 *      also publishes `--kb-inset`: what is hidden BELOW the visible area, in
 *      the same coordinates a fixed element is positioned in.
 *   2. `sheetAboveKeyboard()` turns that into the two properties a sheet
 *      needs. A helper rather than a CSS class, because these sheets set
 *      their geometry inline and an inline style beats a class silently.
 *   3. This file fails the build if a fixed bottom sheet appears in the
 *      one-page editor without it, or with `!bottom-0` back on.
 *
 * KeyboardGuard, already mounted at the root, does the rest: it walks up from
 * the focused field to its nearest scrollable ancestor and centres it, which
 * covers the sheet's own inner scroller once the sheet is the right size.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  KEYBOARD_ESTIMATE_DELAY_MS,
  KEYBOARD_FLOOR_FRACTION,
  bottomAboveKeyboard,
  keyboardInsetOrFloor,
  estimatedKeyboardInset,
  keyboardInset,
  keyboardInsetFrom,
  needsKeyboardEstimate,
  sheetAboveKeyboard,
} from "@/lib/ui/keyboard-safe-sheet"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out)
    else if (name.endsWith(".tsx")) out.push(rel)
  }
  return out
}

function main() {
  console.log("\nThe inset is the room the keyboard takes, in fixed-position coordinates")

  check("no keyboard is no inset", keyboardInset(800, 0, 800) === 0)
  check("a 336px keyboard on an 800px screen", keyboardInset(800, 0, 464) === 336)
  check(
    "a page scrolled under the keyboard still measures from the bottom",
    keyboardInset(800, 120, 464) === 216,
    "offsetTop is room the visual viewport has moved down into, not extra keyboard",
  )
  check(
    "a web view that resized itself needs no compensation",
    keyboardInset(464, 0, 464) === 0,
    "a WKWebView with keyboard resizing on shrinks innerHeight too",
  )
  check("and it never goes negative", keyboardInset(400, 0, 800) === 0)

  console.log("\nOne helper, and the probe measures the same strings")

  const style = sheetAboveKeyboard(0.75)
  check("bottom comes off the published inset", style.bottom === "var(--kb-inset, 0px)")
  check("and the height is a fraction of what is visible", style.maxHeight === "calc(var(--vv-h, 100dvh) * 0.75)")
  const probe = read("scripts/check-sheet-keyboard.mjs")
  check(
    "the probe is not measuring some other geometry",
    probe.includes(`const BOTTOM = "${style.bottom}"`) && probe.includes(`const MAX_H = "${style.maxHeight}"`),
    "a probe drifting away from the product is a probe that passes for the wrong reason",
  )
  check(
    "and it keeps a row proving a !important class still breaks it",
    /a `bottom: 0 !important` class did NOT push the field behind the keyboard/.test(probe),
  )

  console.log("\nViewportVars publishes it, from the first frame")

  const vars = read("components/viewport-vars.tsx")
  check("the effect sets it", /root\.style\.setProperty\("--kb-inset", `\$\{inset\}px`\)/.test(vars))
  check(
    "from the tested function, against the fixed box",
    /const measured = measure\(layout\)/.test(vars) && /keyboardInsetFrom\(\{\s*\n\s*layoutHeight: layout,/.test(vars),
  )
  check("and clears it on unmount", /removeProperty\("--kb-inset"\)/.test(vars))
  check(
    "the pre-paint bootstrap sets it too",
    /--kb-inset/.test(read("app/layout.tsx")),
    "otherwise the first frame of a sheet is positioned against a variable that does not exist yet",
  )

  console.log("\nAnd a floor for the platform that reports no keyboard at all")

  /*
    THE SECOND REPORT. Everything above assumes visualViewport mentions the
    keyboard. A WKWebView without the Capacitor keyboard plugin does not: the
    keys are drawn over the web view by the system, innerHeight and
    visualViewport both stay at the full height, and --kb-inset stays 0. The
    build carrying the sheet fix was live for nineteen minutes before the
    second screenshot, and the sheet was still behind the keys, because the
    number it was reading was zero.

    The plugin is a native dependency and an App Store release; this app's web
    layer reaches a phone on the next deploy. So the fix stops needing the
    measurement: a keyboard covers the bottom of the screen and never much
    more than 45% of it. Measured off that screenshot, an iPhone 16 Pro:

        keyboard with its accessory bar   389pt of 874   44.5%
        the sheet's top edge              531pt          60.8%   behind it

    and the standard portrait keyboards run 40.8% to 45.6%. Half the screen
    clears all of them.
  */
  check("the floor is half the screen, which clears every keyboard measured", KEYBOARD_FLOOR_FRACTION === 0.5)
  check("and it is a number of pixels for a given screen", estimatedKeyboardInset(874) === 437)
  check(
    "the deadline is past when a platform that reports has reported",
    KEYBOARD_ESTIMATE_DELAY_MS >= 300 && KEYBOARD_ESTIMATE_DELAY_MS <= 800,
    `${KEYBOARD_ESTIMATE_DELAY_MS}ms`,
  )

  console.log("\nThe box a fixed element is laid out against is read off a fixed element")

  /*
    THE THIRD SCREENSHOT. The floor was live and the sheet had still not
    moved. Every formula took innerHeight to be the fixed box and subtracted
    the visual viewport from it; on iOS innerHeight shrinks for the keyboard
    WITH the visual viewport while the fixed box does not shrink at all. Full
    minus full is zero, shrunk minus shrunk is zero, and a check on
    innerHeight took the shrink for a web view that had resized itself and
    withheld the floor from the one platform that needed it.

    So the box is read off a probe pinned top: 0, bottom: 0, and the keyboard
    is what of that box the visible area does not reach. Each row below is a
    platform's behaviour, written down so the next one cannot be a surprise.
  */
  const fixedBox = 874
  check(
    "Safari and Android Chrome: the visual viewport shrinks, the box does not",
    keyboardInsetFrom({ layoutHeight: fixedBox, innerHeight: 538, vvTop: 0, vvHeight: 538 }) === 336,
  )
  check(
    "iOS reporting only through innerHeight, the visual viewport left at the full height",
    keyboardInsetFrom({ layoutHeight: fixedBox, innerHeight: 538, vvTop: 0, vvHeight: 874 }) === 336,
    "the case every formula read as zero",
  )
  check(
    "a page scrolled under the keyboard still measures to the bottom of the box",
    keyboardInsetFrom({ layoutHeight: fixedBox, innerHeight: 874, vvTop: 120, vvHeight: 418 }) === 336,
  )
  check(
    "a web view that resized itself: the box shrank with everything else, nothing to compensate",
    keyboardInsetFrom({ layoutHeight: 538, innerHeight: 538, vvTop: 0, vvHeight: 538 }) === 0,
  )
  check(
    "a platform that reports nothing at all",
    keyboardInsetFrom({ layoutHeight: fixedBox, innerHeight: 874, vvTop: 0, vvHeight: 874 }) === 0,
    "which is what the floor is for",
  )
  check(
    "a browser toolbar is outside the box and is not a keyboard",
    keyboardInsetFrom({ layoutHeight: 800, innerHeight: 800, vvTop: 0, vvHeight: 800 }) === 0,
  )
  check("and a sub-pixel is not one either", keyboardInsetFrom({ layoutHeight: 874, innerHeight: 873.5, vvTop: 0, vvHeight: 874 }) === 0)
  check(
    "ViewportVars keeps the probe and reads the box off it",
    /probe\.style\.cssText = "position:fixed;top:0;bottom:0;left:0;width:0;/.test(vars)
      && /const layoutHeight = \(\) => Math\.round\(probe\.getBoundingClientRect\(\)\.height\) \|\| window\.innerHeight/.test(vars)
      && /probe\.remove\(\)/.test(vars),
  )

  const phone = { layoutHeightAtFocus: 874, layoutHeightNow: 874, coarsePointer: true, viewportWidth: 402 }
  check("a phone told nothing needs it", needsKeyboardEstimate({ ...phone, measuredInset: 0 }))
  /*
    An inset of 0 means two opposite things, and this is what tells them
    apart. A platform that resized the web view for the keyboard also reports
    0, and is already correct — giving it the floor would throw the sheet half
    a screen up for nothing. The FIXED BOX tells them apart, never innerHeight:
    innerHeight shrinks on iOS for a keyboard the box never moved for.
  */
  check(
    "a platform that resized the web view instead does not",
    !needsKeyboardEstimate({ ...phone, measuredInset: 0, layoutHeightNow: 538 }),
    "the fixed box shrinking IS the keyboard being handled",
  )
  check(
    "a collapsing browser toolbar is not a resize",
    needsKeyboardEstimate({ ...phone, measuredInset: 0, layoutHeightNow: 874 - 60 }),
    "sixty pixels is a toolbar; a keyboard is a quarter of the screen",
  )
  check(
    "and it is decided on the fixed box, not on innerHeight",
    /layoutHeightAtFocus: layoutAtFocus,\s*\n\s*layoutHeightNow: layoutHeight\(\),/.test(vars)
      && !/innerHeightAtFocus/.test(vars),
    "innerHeight shrinking on iOS is the keyboard, not a resize, and reading it as one is the third screenshot",
  )
  check("a platform that did report does not", !needsKeyboardEstimate({ ...phone, measuredInset: 336 }))
  /*
    iOS panned the page down to show the field: the visible area is 486px of
    an 874px box, and nothing is left covered below it. That is a keyboard
    reported, not a platform keeping quiet, and the floor on top of it was
    the white band under Ask Storelib's composer.
  */
  check(
    "nor does one that shrank the visible area and panned, leaving nothing covered",
    !needsKeyboardEstimate({ ...phone, measuredInset: 0, visibleHeightNow: 874 - 388 }) &&
      needsKeyboardEstimate({ ...phone, measuredInset: 0, visibleHeightNow: 874 }) &&
      needsKeyboardEstimate({ ...phone, measuredInset: 0, visibleHeightNow: 874 - 60 }),
  )
  check("and ViewportVars tells it how tall the visible area is", /visibleHeightNow: Math\.round\(vv\?\.height \?\? window\.innerHeight\)/.test(vars))
  check(
    "a desktop browser does not, where a focused field means no keyboard",
    !needsKeyboardEstimate({ ...phone, measuredInset: 0, coarsePointer: false }),
  )
  check(
    "and nor does a tablet, at the width the sheets stop being sheets",
    !needsKeyboardEstimate({ ...phone, measuredInset: 0, viewportWidth: 768 }),
  )

  console.log("\nViewportVars publishes the floor, and drops it the moment a real number arrives")

  check(
    "a real measurement ends the estimate",
    /if \(measured > 0 && estimate\) estimate = 0/.test(vars),
    "a floor that outlived a real reading would be worse than no floor",
  )
  check(
    "and the pair it publishes stays consistent",
    /const standingIn = measured === 0 && estimate > 0/.test(vars)
      && /const inset = standingIn \? estimate : measured/.test(vars)
      && /const h = inset > 0 \? Math\.min\(reported, Math\.max\(0, layout - inset\)\) : reported/.test(vars),
    "--vv-h is the room and --kb-inset is where it starts; one without the other overflows the sheet off the top",
  )
  check(
    "it starts on a focused text field and ends when the field goes",
    /document\.addEventListener\("focusin", onFocusIn/.test(vars)
      && /document\.addEventListener\("focusout", onFocusOut/.test(vars)
      && /estimate = estimatedKeyboardInset\(layoutHeight\(\)\)/.test(vars),
  )
  check(
    "a button or a checkbox is not a text field",
    /TEXT_INPUT\.test\(/.test(vars) && /el\.tagName !== "INPUT"\) return false/.test(vars),
  )
  check(
    "moving between two fields does not drop it for a frame",
    /requestAnimationFrame\(\(\) => \{\s*\n\s*if \(!estimate \|\| takesAKeyboard\(document\.activeElement\)\) return/.test(vars),
  )
  check("both listeners come off on unmount", /removeEventListener\("focusin", onFocusIn\)/.test(vars) && /removeEventListener\("focusout", onFocusOut\)/.test(vars))
  check(
    "and the probe drives it, with a row proving that reporting nothing still hides the field",
    probe.includes(`const FLOOR_FRACTION = ${KEYBOARD_FLOOR_FRACTION}`)
      && /with nothing reported the field was NOT behind the keyboard/.test(probe)
      && /const REAL_KEYBOARD_FRACTION = 0\.445/.test(probe),
  )

  console.log("\nAnd every surface that works the keyboard out reaches the same number")

  /*
    ONE NUMBER, SIX PLACES. The expression
    `innerHeight - visualViewport.offsetTop - visualViewport.height` was
    written out by hand in six components. Every one of them is correct, and
    on the reported phone every one is zero, because that is the platform
    saying nothing. A floor given to one of them fixes one sheet.

    So they all ask the same way: keep your own measurement when the platform
    gave one, take the published floor when it did not. On a platform that
    reports, every one of them behaves exactly as before.
  */
  check("a surface keeps its own measurement when there is one", keyboardInsetOrFloor(336) === 336)
  check(
    "and a sub-pixel is not a keyboard",
    keyboardInsetOrFloor(0.5) === 0,
    "half a pixel of 'keyboard' turns up on every resize, and moving a bar by it is a twitch",
  )

  const rawKeyboardMaths = /innerHeight\s*-\s*[\w!.?]+\.(?:height|offsetTop)\s*-\s*[\w!.?]+\.(?:height|offsetTop)/
  const scanned: string[] = []
  const unshared: string[] = []
  const scan = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) { scan(rel); continue }
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue
      const src = read(rel)
      if (!rawKeyboardMaths.test(src)) continue
      scanned.push(rel)
      if (!src.includes("keyboardInsetOrFloor")) unshared.push(rel)
    }
  }
  scan("components")
  scan("app")
  /* Four: the product form's sheet stopped working the keyboard out itself
     when it became the shared sheet, which reads the published inset, and
     the website builder's sheet reads its keyboard through `visibleKeyboard`
     in sheet-gestures.ts, which keeps the pan as a number of its own. That
     one is pinned by name just below, so it is not lost from this list. */
  check("every file that works out a keyboard height was found", scanned.length >= 4 && !scanned.includes("app/app/products/new/product-editor.tsx"), `${scanned.length} found`)
  /* The builder's sheet takes the published floor through `keyboardFor`
     (sheet-gestures.ts), which refuses a toolbar's worth and a pinch as a
     keyboard: tests/sheet-reserve.test.ts drives it. */
  check(
    "the website builder's sheet reads its keyboard through visibleKeyboard, and the floor only where nothing was reported",
    /visibleKeyboard\(\{ layoutHeight: box/.test(read("components/website-builder/mobile-editor-sheet.tsx")) &&
      /const keyboard = keyboardFor\(seen, readPublishedKeyboardInset\(\)\)/.test(read("components/website-builder/mobile-editor-sheet.tsx")) &&
      /import \{ readPublishedKeyboardInset \} from "@\/lib\/ui\/keyboard-safe-sheet"/.test(read("components/website-builder/mobile-editor-sheet.tsx")),
  )
  check(
    "and every one of them falls back to the published floor",
    unshared.length === 0,
    `${unshared.join(", ")} works the keyboard out alone, so it is zero on a web view that reports nothing`,
  )
  for (const file of [
    ["components/platform/keyboard-guard.tsx", "the keyboard-open class and --vvh, which every /app page is sized by"],
    ["components/app/app-layout-wrapper.tsx", "--keyboard-inset-height"],
    ["app/library/settings/buyer-settings.tsx", "the buyer's settings"],
  ] as const) {
    check(`${file[0].split("/").slice(-1)[0]}: ${file[1]}`, read(file[0]).includes("keyboardInsetOrFloor"))
  }
  /* The product form's own sheet is the shared one now. It measures nothing
     itself: it reads --kb-inset and --vv-h, which ViewportVars publishes from
     the same floored number, when it is asked to sit on the keyboard. */
  check(
    "bottom-sheet.tsx: the product form's sheet sits on the keyboard through the published inset",
    /\.\.\.\(aboveKeyboard \? bottomAboveKeyboard\(\) : \{\}\)/.test(read("components/ui/bottom-sheet.tsx"))
      && /calc\(var\(--vv-h, 100dvh\) - 24px\)/.test(read("components/ui/bottom-sheet.tsx"))
      && /<BottomSheet isOpen=\{isOpen\} onClose=\{onClose\} maxHeight=\{maxHeight \?\? "85dvh"\} aboveKeyboard keepMounted=\{kept\}>/.test(read("app/app/products/new/product-editor.tsx")),
  )
  /* The guard's own height variable has to follow the same number, or the
     class says a keyboard is up and the height says the screen is empty. */
  check(
    "and the guard's --vvh is the room left by that number, not the viewport's own height",
    (() => {
      const src = read("components/platform/keyboard-guard.tsx")
      return /root\.style\.setProperty\("--vvh", `\$\{Math\.round\(visibleHeight\)\}px`\)/.test(src)
        && /const visibleHeight = Math\.max\(0, window\.innerHeight - kbHeight\)/.test(src)
    })(),
  )

  console.log("\nAnd they are told when the floor appears, having been written before it")

  check(
    "ViewportVars announces a change",
    /window\.dispatchEvent\(new CustomEvent\(KEYBOARD_CHANGE_EVENT/.test(vars),
  )
  check(
    "and wakes the listeners that predate it, in the language they were written in",
    /vv\?\.dispatchEvent\(new Event\("resize"\)\)/.test(vars),
    "the floor is published on a timer, and all six listen for a viewport event",
  )
  check(
    "only when something actually changed, so the synthetic resize cannot loop",
    /if \(changed\) \{/.test(vars) && (vars.match(/changed = true/g) ?? []).length === 2,
  )

  console.log("\nThe editor's panel ends at the keyboard too")

  /*
    The sheets were the report; the PANEL is the same fault one layer down.
    It is fixed from the header to the bottom of the screen, and the fields
    typed straight into it — a title, a bio, a link's label — sit in a
    scroller that fills it. Left at bottom: 0, that scroller kept its full
    height under the keyboard, and KeyboardGuard, centring a focused field
    in its scroller, centred it in a box whose lower half was behind the
    keys. The height clamp in globals.css does not reach it: it names
    .app-content-scroll, and a fixed box is not laid out inside that.
  */
  const editor = read("components/onepage/onepage-editor.tsx")
  check("the helper has a form for a box pinned at both ends", bottomAboveKeyboard().bottom === "var(--kb-inset, 0px)")
  check("and the panel uses it", /style=\{\{ zIndex: 30, \.\.\.bottomAboveKeyboard\(\) \}\}/.test(editor))
  check(
    "with no bottom-0 class left to argue with it",
    !/className="flex flex-col bg-gray-50\/50 fixed[^"]*\bbottom-0\b/.test(editor)
      && !/className="flex flex-col bg-gray-50\/50 fixed[^"]*md:bottom-0\b/.test(editor),
    "a class would lose to the inline style, but a class that says the wrong thing is a class somebody will trust",
  )
  check(
    "and the probe drives the panel too, with a row proving a pinned one still fails",
    probe.includes(`const PANEL_BOTTOM = "${bottomAboveKeyboard().bottom}"`)
      && /a panel pinned to the bottom of the screen did NOT put the centred field behind the keyboard/.test(probe),
  )

  console.log("\nKeyboardGuard does not scroll a document that is pinned")

  /*
    Under /app the document is never the scroller: html is overflow: hidden
    and DocumentScrollGuard puts it back to 0 the frame anything moves it.
    KeyboardGuard's fallback for a field with no scrollable ancestor was a
    smooth scrollIntoView of the document, which ignores overflow: hidden —
    so it started a scroll the guard undid every frame for 300ms, twice per
    tap. And the fallback is reached exactly when a sheet's content FITS,
    which is the social-link sheet once it sits on the keyboard.
  */
  const guard = read("components/platform/keyboard-guard.tsx")
  check(
    "the document-level fallback is skipped under the app shell",
    /if \(!scrollContainer\) \{[\s\S]{0,1200}?classList\.contains\("app-layout"\)\) return[\s\S]{0,1200}?scrollIntoView/.test(guard),
    "scrollIntoView on a pinned document is a shudder, not a scroll",
  )
  check("and the scroller walk above it is untouched", /const scrollContainer = findScrollableAncestor\(active\)/.test(guard))

  console.log("\nNo sheet in the editors pins itself to the bottom of the wrong viewport")

  /* The one-page editor was the report; the product form has the same
     sheets, and the other editors are walked so one cannot be added there. */
  const files = [
    ...walk("components/onepage"),
    ...walk("components/website-builder"),
    ...walk("components/store-builder"),
    ...walk("app/app/products/new"),
  ]
  for (const file of files) {
    const src = read(file)

    /*
      The signature of a bottom sheet, which is what separates one from a
      full-bleed background: a background sets top AND bottom to 0, a sheet
      sets top to auto and hangs off the bottom.
    */
    const sheets = src.match(/top: ['"]auto['"],?[\s\S]{0,120}?bottom: 0,/g) ?? []
    check(
      `${file.split("/").slice(-1)[0]}: no sheet pinned to bottom: 0`,
      sheets.length === 0,
      sheets.length ? `${sheets.length} still pinned to the layout viewport` : undefined,
    )

    check(
      `${file.split("/").slice(-1)[0]}: no !important bottom to beat the inline style`,
      !src.includes("!bottom-0"),
    )
  }

  console.log("\nAnd the sheets that were reported sit on the keyboard")

  /*
    The one-page editor's sheets (Add block, the social link typed into, the
    thumbnail, a block's animation and stats, Add product) spread the helper
    into a hand built sheet each. They are the shared sheet on a phone now,
    through components/ui/sheet-dialog.tsx, which asks the shared sheet to
    sit on the keyboard (`aboveKeyboard`, which reads the same --kb-inset and
    --vv-h) and to be at most three quarters of what is visible, the
    fraction they used.
  */
  const sheetDialog = read("components/ui/sheet-dialog.tsx")
  check(
    "sheet-dialog.tsx: the phone sheet is the shared one, on the keyboard, at three quarters of what is visible",
    /<BottomSheet[\s\S]{0,400}aboveKeyboard[\s\S]{0,200}maxHeight=\{SHEET_DIALOG_MAX_HEIGHT\}/.test(sheetDialog) &&
      /SHEET_DIALOG_MAX_HEIGHT = "calc\(var\(--vv-h, 100dvh\) \* 0\.75\)"/.test(sheetDialog),
  )
  /* Links went from 5 to 13 and the Design tab from 0 to 11 when their last centred dialogs (the name and bio, the avatar and video steps, the crops, the image library, the layout questions) became the shared sheet on a phone too. */
  for (const [file, count] of [
    ["components/onepage/tabs/links-tab.tsx", 13],
    ["components/onepage/tabs/design-tab.tsx", 11],
    ["components/onepage/tabs/products-tab.tsx", 1],
  ] as const) {
    const src = read(file)
    const used = (src.match(/<SheetDialog\b/g) ?? []).length
    check(
      `${file.split("/").slice(-1)[0]}: all ${count} sheets`,
      used === count,
      `${used} of ${count}`,
    )
    check(`${file.split("/").slice(-1)[0]}: no hand built sheet left`, !src.includes("sheetAboveKeyboard(") && !/SheetDragY/.test(src))
  }

  /* The OnePage editor's two questions (Save changes?, Upgrade to Pro?) have
     nothing typed into them and are the shared sheet on a phone now, so they
     no longer need the helper; the panel itself still does (above). */
  check("onepage-editor.tsx: its questions are the shared sheet", /<BottomSheet isOpen=\{open\}[^>]*hideFrom="md"/.test(read("components/onepage/onepage-editor.tsx")))

  /* The product form's category picker is typed into. It was a dialog that
     used the helper; it is the shared sheet now, which sits on the keyboard
     through the published inset when asked (aboveKeyboard). The exit dialog
     is the shared sheet too (./confirm-sheet.tsx), with nothing typed into it. */
  const picker = read("app/app/products/new/category-picker.tsx")
  check("category-picker.tsx: the typed-into sheet is the shared one, on the keyboard",
    /<BottomSheet[\s\S]{0,200}aboveKeyboard/.test(picker) && !read("app/app/products/new/product-editor.tsx").includes("sheetAboveKeyboard("))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
