/**
 * Explore's covers on a slow connection or a small phone (lib/images/lean.ts):
 * a blurred 32px preview first, and 1x files when the device asks for less.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { leanImages, leanSizes, previewUrl } from "../lib/images/lean"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe sizes a slow phone asks for\n")
{
  const sizes = "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
  const lean = leanSizes(sizes, 3)
  check("every length is divided by the pixel ratio", lean === "(max-width: 640px) 33.3vw, (max-width: 768px) 16.7vw, (max-width: 1024px) 11vw, 8.3vw", lean)
  check("and the media conditions are left alone", lean.includes("(max-width: 640px)") && lean.includes("(max-width: 1024px)"))
  check("pixel lengths too", leanSizes("(max-width: 639px) 100vw, 440px", 2) === "(max-width: 639px) 50vw, 220px")
  check("a 1x screen gets what it asked for", leanSizes(sizes, 1) === sizes)
  check("on the server nothing is lean", leanImages() === false)
}

console.log("\nThe preview\n")
{
  const url = previewUrl("https://storelib.com/media/product-images/a b.png")
  check("a 32px copy through the optimizer", url === "/_next/image?url=https%3A%2F%2Fstorelib.com%2Fmedia%2Fproduct-images%2Fa%20b.png&w=32&q=75", url)
  check("never for an address that is not https", previewUrl("http://x.test/a.png") === null && previewUrl("") === null)
  const card = read("components/explore/product-card.tsx")
  /* Changed on purpose (the owner: "cleaner and calmer", no blur-up, no repeated fade on media already loaded). The card no longer draws the blurred preview; previewUrl stays a pure helper. */
  check("the card draws no blurred copy under its cover", !/blur-\[10px\]/.test(card) && !/previewUrl/.test(card))
  check("a cover already drawn or complete is shown at once; a new one comes up over 150ms", /drawnCovers\.has\(coverSrc\) \? "drawn" : "wait"/.test(card) && /img\?\.complete && img\.naturalWidth > 0/.test(card) && /cover === "in" \? "500ms, 150ms" : "500ms, 0s"/.test(card) && /setCover\(\(c\) => \(c === "wait" \? "in" : c\)\)/.test(card))
  check("off screen covers load at low priority", /fetchPriority=\{priority \? undefined : "low"\}/.test(card))
  check("and a cover already on its way is never asked for again", /if \(priority \|\| !leanImages\(\) \|\| img\?\.currentSrc\) return/.test(card))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
