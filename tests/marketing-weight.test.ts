/**
 * ===========================================================================
 *  TWO WAYS A PAGE ENDS UP SLOW, BOTH OF THEM INVISIBLE IN THE SOURCE
 * ===========================================================================
 *
 * 1. A RESIZE THAT IS NOT A RESIZE.
 *
 *    `/storage/v1/object/public/…?width=500&quality=55` looks like a resized
 *    image and is the original file. That endpoint serves what was stored and
 *    ignores every parameter; only `/render/image/` reads them, and that one
 *    is metered, exhausted here, and fails the build (no-image-transforms).
 *
 *    So the parameters are worse than useless: they are a note in the source
 *    saying the job is done. The home page carried seven of them and shipped
 *    2.70 MB of originals to a phone. Through `/_next/image` the same
 *    seventeen pictures measure 0.28 MB.
 *
 * 2. A DYNAMIC ROUTE WITH NO LOADING BOUNDARY.
 *
 *    `loading.tsx` is not decoration; it is the Suspense boundary that lets
 *    the router commit something at the moment of the press. Without one, a
 *    client navigation into a force-dynamic route shows the page you are
 *    LEAVING for the whole server round trip. Measured on the creator page:
 *    1.5 seconds in which a tap appeared to do nothing at all.
 *
 *    Every dynamic route under (marketing) had one except the two that serve
 *    `storelib.com/<handle>` and `storelib.com/<handle>/<slug>` — which is to
 *    say, except the creator page and the product page.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"

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

const SKIP = new Set(["node_modules", ".next", "dist", "out", ".git"])
function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

const FILES = [...walk("app"), ...walk("components")]

console.log("\nA parameter that does nothing is not an optimisation\n")

/**
 * The object endpoint with a sizing parameter on it. `render/image` is
 * already a build failure elsewhere, so anything matched here is the silent
 * version: the full-size original, dressed as a thumbnail.
 */
const FAKE_RESIZE = /storage\/v1\/object\/public\/[^"'`\s]*[?&](width|height|quality|resize)=/
const offenders = FILES.filter((f) => FAKE_RESIZE.test(stripComments(readFileSync(f, "utf8"))))
check(
  "no sizing parameters on a /storage/v1/object/ URL",
  offenders.length === 0,
  offenders.join("\n        ") + "\n        use optimizedImageUrl(src, displayWidth) — that endpoint ignores them",
)

/**
 * `unoptimized` turns <Image> into a plain <img> pointed at the original. It
 * has one legitimate use, an image the optimizer cannot fetch, and that is
 * what `isOptimizableImage` is for. On the marketing pages it was simply
 * switched off, so two screenshots shipped at full size.
 */
const unoptimized = FILES.filter(
  (f) => f.startsWith("components/marketing") && /\bunoptimized\b/.test(stripComments(readFileSync(f, "utf8"))),
)
check(
  "no <Image unoptimized> on the marketing pages",
  unoptimized.length === 0,
  unoptimized.join("\n        "),
)

console.log("\nEvery dynamic route can show something the moment it is pressed\n")

const marketingPages = walk("app/(storelib)/(marketing)").filter((f) => /[/\\]page\.tsx$/.test(f))
const dynamicPages = marketingPages.filter((f) =>
  /export const dynamic\s*=\s*["']force-dynamic["']/.test(readFileSync(f, "utf8")),
)
check(
  "there are dynamic marketing routes to check",
  dynamicPages.length > 0,
  "if this fails the check below is vacuous",
)
/**
 * THREE ROUTES ARE LISTED RATHER THAN FIXED, and the reason is that a
 * loading.tsx is not free to invent. For a dynamic route it is also the
 * streaming fallback on a cold direct visit, so a skeleton that does not
 * match the page is a visible wrong-shaped flash for every visitor. These
 * three are pages I have not measured and cannot see:
 *
 *   /l/<slug>      a creator's link page, entirely their own layout
 *   /<handle>/links  the same page, at the address it now has
 *   /wishlist      signed-in only
 *   /blog/category/<slug>  (was /blog/explore/categories/<category>, now a 308)
 *
 * They have the same gap and it is worth closing; drawing their skeletons
 * blind is how you ship a flash of the wrong page. Delete a line here when
 * one gets a real one.
 *
 * The second is not a new gap. The OnePage moved from `/l/<slug>` to
 * `/<handle>/links` and the new route renders the page the first one already
 * rendered, so it inherits the reason above rather than adding to it: one
 * page, one missing skeleton, now reachable at two addresses. Whichever one
 * gets a real loading.tsx, both lines go.
 */
const KNOWN_GAPS = new Set([
  "app/(storelib)/(marketing)/l/[slug]",
  "app/(storelib)/(marketing)/[sellername]/links",
  "app/(storelib)/(marketing)/wishlist",
  "app/(storelib)/(marketing)/blog/category/[slug]",
  "app/(storelib)/(marketing)/blog/category/[slug]/page/[page]",
])

/**
 * ===========================================================================
 *  AND ONE ROUTE HAS NONE ON PURPOSE, WHICH IS NOT THE SAME AS NOT YET
 * ===========================================================================
 * The list above is work outstanding. This is a decision, and it is kept
 * apart from that list so nobody "finishes" it by accident.
 *
 * A loading boundary is not a delay you can tune. The router swaps the page
 * for it the instant a navigation starts, so a boundary on the product route
 * meant every press of a product card threw away the grid somebody was
 * reading. Filmed on production, from the tap:
 *
 *     +   9ms   the grid
 *     +  71ms   blank — the route had swapped and the skeleton was still
 *     + 194ms   transparent under its own 200ms deferral
 *     + 256ms   the skeleton fading up
 *     +1188ms   still the skeleton
 *     +1265ms   the product
 *
 * A fifth of a second of nothing, then a second of grey furniture. Without
 * the boundary the router keeps the current page until the next one is ready,
 * and the card that was pressed answers the press itself.
 *
 * WHAT IT COSTS, because it does cost something. A boundary is also the
 * streaming fallback on a cold DIRECT visit — somebody opening a shared link.
 * Without one the server finishes the page before any HTML is sent, so first
 * paint moves later and then arrives complete, rather than arriving early as
 * a grey approximation. That trade is deliberate: one complete paint beats a
 * grey one followed by a real one, and the path being optimised — pressing a
 * card — is the common one.
 *
 * Give the product page a real streaming shell and this can come back.
 */
const DELIBERATELY_NONE = new Map([
  ["app/(storelib)/(marketing)/p/[slug]", "the router keeps the page you are on instead; see the note above"],
  ["app/(storelib)/(marketing)/[sellername]/[productSlug]", "the same page at its nested address"],
  ["app/(storelib)/(marketing)/[sellername]", "a boundary here catches its children too; see the note below"],
])

/**
 * ===========================================================================
 *  WHY THE PARENT HAD TO GO WITH THEM, WHICH I GOT WRONG THE FIRST TIME
 * ===========================================================================
 * Removing the product route's own boundary did NOT stop the grey page. A
 * loading boundary catches every segment BELOW it, so with the child's gone
 * the creator page's boundary took over — and pressing a product then showed
 * the CREATOR page's skeleton: still grey, and now the wrong shape. Filmed on
 * production after that deploy, a skeleton was still up at +1541ms.
 *
 * `app/(storelib)/(marketing)/[sellername]/loading.tsx` argued for its own existence in
 * its header, and the argument was sound when it was written: without one,
 * "the page you were on stays on screen for the whole round trip — measured
 * 1.5 seconds of a press that appeared to do nothing at all."
 *
 * Two things have changed since, and both are measured.
 *
 * THE ROUTE IS NOT 1.5 SECONDS ANY MORE. Sampled against production, the
 * creator page answers in 0.28s to 0.58s, median about 0.34s.
 *
 * AND THE PRESS IS NO LONGER UNANSWERED. Product cards navigate on the client
 * now, and the card dips under the finger the moment it is touched — the
 * picture and the creator's name both. "Appeared to do nothing" was the real
 * complaint in that header, and it is addressed at the press rather than by
 * replacing the page with furniture.
 *
 * It used to be a 3px bar that ran for as long as the navigation took. The
 * owner asked for that out, and it deserved to go: an indicator drawn on a
 * card is drawn on the thing being LEFT, so it holds the eye on something
 * about to be replaced. The dip lands in the same frame as the touch, which
 * is the part that was doing the work, and then it stops.
 */

for (const page of dynamicPages) {
  const dir = dirname(page).replace(/\\/g, "/")
  const why = DELIBERATELY_NONE.get(dir)
  if (why) {
    check(
      `${dir} has no loading boundary, deliberately`,
      !existsSync(join(dir, "loading.tsx")),
      `this route is listed as having none on purpose (${why}), so finding one means the two disagree`,
    )
    continue
  }
  if (KNOWN_GAPS.has(dir)) {
    console.log(`  --    ${dir} has no loading boundary (known, listed in this file)`)
    continue
  }
  check(
    `${dir} has a loading boundary`,
    existsSync(join(dir, "loading.tsx")),
    "without one a press shows the page you are leaving until the server answers",
  )
}

console.log("\nNothing pulls a node out from under React\n")

/**
 * `document.querySelectorAll("link[rel*='icon']").forEach(l => l.remove())`
 * was in two components. It reads as housekeeping and is not: the root
 * layout's icon link is rendered BY REACT, so this detaches a node React is
 * still holding a fiber for. The next deletion of that subtree throws
 *
 *   TypeError: Cannot read properties of null (reading 'removeChild')
 *
 * in the commit phase, and the render in flight never lands. On the live site
 * that was the creator page: the address changed, the product page stayed,
 * every time.
 *
 * A component may remove what it created. The marker attribute is what says
 * which nodes those are.
 */
const BROAD_ICON_REMOVAL = /querySelectorAll\(\s*["'`]link\[rel\*?=['"]?icon/
const iconStompers = FILES.filter((f) => BROAD_ICON_REMOVAL.test(stripComments(readFileSync(f, "utf8"))))
check(
  "no component clears every icon link in the document",
  iconStompers.length === 0,
  iconStompers.join("\n        ") + "\n        remove only the links this component added, by its own data attribute",
)

const faviconWriters = FILES.filter((f) => /rel = "apple-touch-icon"/.test(readFileSync(f, "utf8")))
check(
  "every component that adds an icon link marks its own",
  faviconWriters.length > 0 &&
    faviconWriters.every((f) => /data-storelib-favicon/.test(readFileSync(f, "utf8"))),
  faviconWriters.join("\n        "),
)

console.log("\nThe creator page's skeleton is tinted to the page behind it\n")

check(
  "the bare handle route has the storefront's layout",
  existsSync("app/(storelib)/(marketing)/[sellername]/layout.tsx"),
  "otherwise a dark creator page flashes a white skeleton on every visit",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
