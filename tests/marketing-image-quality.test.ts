/**
 * ===========================================================================
 *  ENOUGH PIXELS FOR THE SCREEN THE PICTURE IS PAINTED ON
 * ===========================================================================
 * Reported of the laptop carousel on the home page: the images are bad
 * quality. That is arithmetic rather than opinion, and the arithmetic was in
 * the source the whole time.
 *
 * The frame is `max-w-[800px]`, so on a desktop the picture is drawn 800 CSS
 * px wide — 1600 device pixels on a 2x screen. It was asking for 828, from an
 * original that is 2718px wide. Just over half the resolution the screen can
 * show, which is exactly what soft looks like. Measured on the running app
 * with scripts/check-marketing-image-quality.mjs:
 *
 *     drawn 800   needs 1600   file 828    0.52x   ->   file 1920   1.20x
 *
 * TWO THINGS WERE WRONG AND ONE OF THEM WAS A LIE ABOUT THE FILES.
 *
 *   `sizes` said 600px for a frame that is 800.
 *   `srcSet` described a file 828px wide as "600w". A `w` descriptor is the
 *   width of the FILE, and a browser choosing between candidates by numbers
 *   neither of them is cannot land anywhere sensible.
 *
 * `optimizedSrcSet` exists so the descriptors cannot drift from the files
 * again: it emits both from the same number.
 *
 * AND A PRELOAD THAT COST DOUBLE. A detached Image() fetched `w=1080` while
 * the <img> rendered `w=828` — two files for each of three slides, six
 * downloads for three pictures — to set a flag the <img>'s own onLoad already
 * sets.
 *
 * ── A CORRECTION, BECAUSE THE FIRST MEASUREMENT WAS WRONG ──────────────────
 * The probe first divided by `img.naturalWidth` and reported fifteen soft
 * images on this page. It was wrong about nearly all of them. For an <img>
 * with srcset w-descriptors and sizes, the spec makes naturalWidth the
 * DENSITY-CORRECTED intrinsic size — a 1920px file in an 800px slot reports
 * 800, the layout size, however large the file. Only the laptop carousel and
 * one hero card were ever real. The file's width is read from the `w` of the
 * URL the browser chose now, and naturalWidth is used only where there is no
 * srcset and it is the honest answer.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const manage = read("components/marketing/manage-section.tsx")
  const helper = read("lib/images/optimized-url.ts")
  const hero = read("components/marketing/hero.tsx")
  const video = read("components/marketing/hero-video.tsx")
  const probe = read("scripts/check-marketing-image-quality.mjs")

  console.log("\nThe descriptors come from the same number as the files")

  check(
    "there is one place that builds a srcSet",
    /export function optimizedSrcSet\(src: string, widths: number\[\], quality: number = PORTRAIT_QUALITY\): string/.test(helper),
  )
  check(
    "and the descriptor is the width it asked the optimizer for",
    /&w=\$\{w\}&q=\$\{quality\} \$\{w\}w`/.test(helper),
    "the two cannot drift apart if they are the same variable",
  )
  check(
    "a width the optimizer will not serve is dropped, not shipped",
    /\.filter\(\(w\) => NEXT_IMAGE_WIDTHS\.includes\(w\)\)/.test(helper),
    "anything else is a 400 rather than a picture",
  )

  console.log("\nThe laptop carousel asks for what it paints")

  check("it uses the shared builder", /srcSet=\{optimizedSrcSet\(url, \[640, 828, 1080, 1920, 2048\], 75\)\}/.test(manage))
  check(
    "sizes describes the frame it is actually in",
    /sizes="\(max-width: 848px\) calc\(100vw - 48px\), 800px"/.test(manage),
    "it said 600px for a max-w-[800px] frame",
  )
  check("nothing hand-builds a srcSet here any more", !/ 360w,/.test(manage) && !/ 600w`/.test(manage))
  check(
    "and the duplicate preload is gone",
    !/img\.src = getOptimized/.test(manage) && /THE PRELOAD IS GONE, AND IT WAS COSTING DOUBLE/.test(manage),
    "it fetched a different width than the <img> rendered: six downloads for three pictures",
  )

  console.log("\nThe cinematic hero never preloads the old screenshots")
  check("only a lightweight local poster is high priority", /fetchPriority="high"/.test(video) && /preload="none"/.test(video) && !/HeroCarousel|HERO_BACKDROP/.test(hero))

  console.log("\nAnd the probe measures the file, not the layout")

  check(
    "it reads the width from the URL the browser chose",
    /const fileWidth = asked \? Number\(asked\) : \(img\.srcset \? null : img\.naturalWidth\)/.test(probe),
  )
  check(
    "and says why naturalWidth cannot be used",
    /naturalWidth IS NOT THE FILE'S WIDTH/.test(probe),
    "it is density-corrected, and reported the layout size for every optimized image",
  )
  check(
    "a third-party file is reported, not failed over",
    /it is served from another CDN as uploaded, so only a bigger file fixes it/.test(probe),
    "the Stripe logo is 76px at source and no resize helps",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
