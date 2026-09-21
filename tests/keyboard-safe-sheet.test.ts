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

import { keyboardInset, sheetAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"

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
  check("from the tested function", /const inset = keyboardInset\(window\.innerHeight, top, h\)/.test(vars))
  check("and clears it on unmount", /removeProperty\("--kb-inset"\)/.test(vars))
  check(
    "the pre-paint bootstrap sets it too",
    /--kb-inset/.test(read("app/layout.tsx")),
    "otherwise the first frame of a sheet is positioned against a variable that does not exist yet",
  )

  console.log("\nNo sheet in the one-page editor pins itself to the bottom of the wrong viewport")

  const files = walk("components/onepage")
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

  console.log("\nAnd the sheets that were reported use the helper")

  for (const [file, count] of [
    ["components/onepage/tabs/links-tab.tsx", 5],
    ["components/onepage/tabs/products-tab.tsx", 1],
    ["components/onepage/onepage-editor.tsx", 2],
  ] as const) {
    const src = read(file)
    const used = (src.match(/\.\.\.sheetAboveKeyboard\(/g) ?? []).length
    check(
      `${file.split("/").slice(-1)[0]}: all ${count} sheets`,
      used === count,
      `${used} of ${count}`,
    )
    check(`${file.split("/").slice(-1)[0]}: imports it`, src.includes('from "@/lib/ui/keyboard-safe-sheet"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
