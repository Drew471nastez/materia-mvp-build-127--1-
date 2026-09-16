/**
 * ===========================================================================
 *  A TRANSITION HAS TO NAME THE PROPERTY THAT ACTUALLY MOVES
 * ===========================================================================
 * Tailwind v4 does not build movement out of `transform`. `translate-y-full`
 * and `scale-95` emit the STANDALONE properties:
 *
 *     .translate-y-full { --tw-translate-y: 100%; translate: var(..) var(..) }
 *     .scale-105        { --tw-scale-x: 105%; …;  scale:     var(..) var(..) }
 *
 * `translate` and `scale` are animatable in their own right and are NOT part
 * of `transform`. So `transition-[opacity,transform]` on an element that moves
 * with `translate-y-*` animates the opacity and nothing else: the element
 * jumps to its final position and fades.
 *
 * That is not theoretical. The sticky add-to-cart bar was written with
 * `transition-all`, which animated the movement by including everything.
 * Naming `transform` instead — to stop it animating a box-shadow, which is a
 * real improvement — silently removed the slide, and the bar started
 * appearing in place with a fade. Measured on the live page:
 *
 *     transition-property: opacity, transform
 *     transform: none
 *
 * A sweep of the repository found FOURTEEN places doing this, in the sheets,
 * the header pills, the wishlist button, the theme cards and both sticky
 * bars. Every one of them was animating nothing.
 *
 * WHAT THIS CHECKS. Any `transition-[…]` that names `transform` while the
 * markup around it moves with `translate-*` or `scale-*`. It does not object
 * to `transform` on its own — `transform-gpu` and hand-written
 * `transform: translateZ(0)` are still legitimate — only to a transition that
 * claims to animate something the element does not use.
 *
 * Run with:  npm run test:push
 */
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

console.log("\nA transition names the property that moves\n")

const files = execSync("git ls-files 'components/**/*.tsx' 'app/**/*.tsx'", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)

/** Utilities that compile to the standalone `translate` / `scale` properties. */
const MOVES_WITH_TRANSLATE = /(?<![\w-])-?translate-[xy]-/
const MOVES_WITH_SCALE = /(?<![\w-])scale-(?:x-|y-)?[[\d]/

const offenders: string[] = []
for (const file of files) {
  /* git ls-files reads the index, which can name a file that is gone. */
  if (!existsSync(file)) continue
  const src = readFileSync(file, "utf8")
  for (const m of src.matchAll(/transition-\[([^\]]*)\]/g)) {
    const props = m[1]
    if (!props.split(",").includes("transform")) continue
    /* The same className string, near enough: a window either side. */
    const around = src.slice(Math.max(0, m.index! - 400), m.index! + m[0].length + 400)
    const translate = MOVES_WITH_TRANSLATE.test(around)
    const scale = MOVES_WITH_SCALE.test(around)
    if (!translate && !scale) continue
    const line = src.slice(0, m.index).split("\n").length
    const wants = [translate && "translate", scale && "scale"].filter(Boolean).join(" and ")
    offenders.push(`${file}:${line} — transition-[${props}] but it moves with ${wants}`)
  }
}

check(
  "no transition animates `transform` on something that moves with translate or scale",
  offenders.length === 0,
  offenders.length
    ? `${offenders.length} place${offenders.length > 1 ? "s" : ""}:\n        ${offenders.join("\n        ")}`
    : undefined,
)

/** The bar this was found on, by name, because it is the one that was reported twice. */
{
  /* With the prose taken out: the note in that file explaining why
     `transition-all` was replaced contains the words `transition-all`. */
  const sticky = stripComments(readFileSync("components/store-builder/sticky-add-to-cart.tsx", "utf8"))
  const lists = [...sticky.matchAll(/transition-\[([^\]]*)\]/g)].map((m) => m[1])
  check(
    "the sticky add-to-cart animates its slide",
    lists.length === 2 && lists.every((l) => l.split(",").includes("translate")),
    `found ${JSON.stringify(lists)}`,
  )
  check(
    "and still does not animate its shadow",
    !/transition-all/.test(sticky),
    "a shadow cannot be composited, so animating it repaints a full-width bar every frame",
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
