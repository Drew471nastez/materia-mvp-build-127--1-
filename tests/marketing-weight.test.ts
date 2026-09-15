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

const marketingPages = walk("app/(marketing)").filter((f) => /[/\\]page\.tsx$/.test(f))
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
 *   /wishlist      signed-in only
 *   /blog/explore/categories/<category>
 *
 * They have the same gap and it is worth closing; drawing their skeletons
 * blind is how you ship a flash of the wrong page. Delete a line here when
 * one gets a real one.
 */
const KNOWN_GAPS = new Set([
  "app/(marketing)/l/[slug]",
  "app/(marketing)/wishlist",
  "app/(marketing)/blog/explore/categories/[category]",
])
for (const page of dynamicPages) {
  const dir = dirname(page).replace(/\\/g, "/")
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
  existsSync("app/(marketing)/[sellername]/layout.tsx"),
  "otherwise a dark creator page flashes a white skeleton on every visit",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
