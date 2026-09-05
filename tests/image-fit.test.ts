/**
 * ===========================================================================
 *  EVERY MARKETPLACE IMAGE FILLS ITS BOX
 * ===========================================================================
 * `object-cover` on cards, thumbnails, the product gallery and chat photos.
 * The picture fills the frame and the overflow is cropped, which is what
 * Vinted and Depop look like and what a grid of garments has to look like to
 * read as a grid at all: one letterboxed photo among eleven filled ones is a
 * hole in the wall.
 *
 * This has been changed in both directions more than once. `contain` is the
 * defensible answer in the abstract — it never cuts off a sleeve — and it is
 * the wrong one here, because the pipeline already crops to 3:4 at upload time
 * against a focal point the seller chose (lib/images/geometry.ts). On anything
 * uploaded since, cover and contain render the same pixels; on older listings
 * cover fills the frame instead of putting grey bars in the grid.
 *
 * THE ONE EXCEPTION IS THE FULLSCREEN VIEWER, and it is what makes cover safe
 * everywhere else. Tapping a photograph is how you see the part a crop took
 * away — the cuff, the label, the mark the seller mentioned — so that one view
 * is `contain` and the whole frame is always one tap from being whole. Asserted
 * here in the positive, so "make everything cover" cannot quietly take it too.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

console.log("\nMarketplace images fill their box; the viewer keeps them whole\n")

/** Every surface a listing photograph is drawn on, except the viewer. */
const FILLS: Array<[string, string]> = [
  ["the feed card", "components/explore/product-card.tsx"],
  ["the product detail gallery", "components/product/product-detail.tsx"],
  ["a photo sent in a conversation", "components/messages/thread.tsx"],
  ["the inbox listing thumbnail", "components/messages/inbox.tsx"],
  ["the desktop conversation list", "components/messages/desktop-conversation-list.tsx"],
]

for (const [what, path] of FILLS) {
  const src = read(path)
  check(`${what} uses object-cover`, src.includes("object-cover"), `        ${path}`)
  check(
    `${what} has no object-contain`,
    !src.includes("object-contain"),
    `        ${path}\n` +
      `        A contained photo in a filled grid is a hole in the wall. If a\n` +
      `        crop genuinely matters on this surface, the fullscreen viewer is\n` +
      `        already one tap away and already shows the whole frame.`,
  )
}

// ── The exception, asserted so it survives a sweep ──────────────────────────
const viewer = read("components/messages/image-viewer.tsx")
check(
  "the fullscreen viewer keeps the whole photograph",
  viewer.includes("object-contain"),
  "        components/messages/image-viewer.tsx\n" +
    "        This is what makes cover safe everywhere else. Tapping a photo is\n" +
    "        how you see the part the crop took away, and on a phone a portrait\n" +
    "        3:4 photograph in a 9:19.5 viewport loses about a third of its\n" +
    "        WIDTH to cover — you would be looking at a vertical strip of a\n" +
    "        garment with no way to see the rest of it.",
)

// ── The pipeline's ratio, which is why cover is not lossy on new uploads ────
const geometry = read("lib/images/geometry.ts")
check(
  "the upload pipeline crops to the same ratio the cards draw",
  // `THUMB: Size = { … }` — the annotation sits between the name and the value,
  // so anything anchored straight to `=` misses the real declaration and fails
  // on correct code.
  /THUMB(\s*:\s*\w+)?\s*=\s*\{\s*w:\s*810,\s*h:\s*1080\s*\}/.test(geometry),
  "        810×1080 is exactly 3:4. If this and CARD_RATIO in\n" +
    "        lib/images/variants.ts ever disagree, cover starts cropping a\n" +
    "        second time on top of the crop the seller already approved.",
)
const variants = read("lib/images/variants.ts")
check(
  "and the cards declare that same ratio",
  /CARD_RATIO\s*=\s*"3 \/ 4"/.test(variants),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
