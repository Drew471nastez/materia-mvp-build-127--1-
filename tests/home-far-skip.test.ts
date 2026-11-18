/**
 * Added on purpose (phone performance pass): a built home page section is
 * skipped (content-visibility: auto) only while it is more than four screens
 * away, and drawn again three screens before it arrives, so the ~300 layers
 * of an eighteen screen page are not re-layerized on every frame of a scroll,
 * while nothing is ever switched near the screen (landing round 12's popping).
 * Measured by scripts/check-marketing-mobile-perf.mjs.
 */
import { readFileSync } from "node:fs"
import { FAR_DRAW_AT, FAR_SKIP_AT } from "@/components/marketing/home/far-skip"

let failed = 0
const check = (name: string, ok: boolean) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) failed++
}
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const skip = code("components/marketing/home/far-skip.ts")
const lazy = code("components/marketing/home/lazy-section.tsx")

console.log("\nFar away, not drawn")
check("skipped beyond four screens, drawn again within three (a gap, so nothing flips at one line)", FAR_SKIP_AT === "400% 0px 400% 0px" && FAR_DRAW_AT === "300% 0px 300% 0px")
check("content-visibility: auto, never hidden (accessibility tree, find in page and #links keep it)", /contentVisibility = "auto"/.test(skip) && !/"hidden"/.test(skip))
check("the box keeps the height it was drawn at while skipped", /containIntrinsicSize = `auto \$\{h\}px`/.test(skip))
check("an empty box (hidden at this width) is left alone", /h <= 0\) continue/.test(skip))
check("never a section in the page's first two screens (a jump to the top lands on it drawn)", /TOP_KEPT_SCREENS = 2/.test(skip) && /window\.scrollY < TOP_KEPT_SCREENS \*/.test(skip))
check("only where the browser has content-visibility", /CSS\.supports\("content-visibility", "auto"\)/.test(skip))
check("a built lazy section is skipped only once it is built", /return Section && el \? skipWhenFar\(el\) : undefined/.test(lazy))
check("a server-drawn section is skipped too, never one with a sticky child", /if \(sticky \|\| !el\) return\s+const unhold = holdAbove\(el\)\s+const unskip = skipWhenFar\(el\)/.test(lazy))
check("the server's markup never carries it", !/contentVisibility|content-visibility/.test(lazy))

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall ok")
