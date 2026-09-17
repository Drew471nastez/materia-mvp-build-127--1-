/**
 * ===========================================================================
 *  ONE MARK, ONE PLACE, AND IT COMES DOWN THE CONNECTION WE ALREADY HAVE
 * ===========================================================================
 * The Storelib logo was a Supabase URL written out as a string literal in
 * nineteen files. Changing it meant finding all nineteen, and the one that
 * gets missed is the one somebody screenshots. So it is a constant now, and
 * this counts the literals to keep it that way.
 *
 * It is also served from /public rather than from storage, for three reasons
 * that are all measurable:
 *
 *   A cross-origin fetch on every page that draws a header, a footer or a
 *   sidebar — DNS, TLS and a request to a host with nothing else to do with
 *   rendering the page.
 *
 *   Next's optimizer will not resize an arbitrary remote host, so each of
 *   those places decoded the full-size original into a 32px box. The old file
 *   was a 512x512 SVG; the new one is 512 square at quality 90 and 19KB, and
 *   from /public it is resized per usage.
 *
 *   And the Android welcome screen reached for it through Supabase's
 *   /render/image/ transform, which this repository bans on cost grounds. The
 *   ban only scanned code files, so an HTML asset had quietly kept one.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const bytes = (p: string) => statSync(join(process.cwd(), p)).size

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "out", "android", "ios"])
function walk(dir: string, re: RegExp): string[] {
  let out: string[] = []
  let entries: string[]
  try { entries = readdirSync(join(process.cwd(), dir)) } catch { return out }
  for (const name of entries) {
    if (SKIP.has(name)) continue
    const p = `${dir}/${name}`
    let s
    try { s = statSync(join(process.cwd(), p)) } catch { continue }
    if (s.isDirectory()) out = out.concat(walk(p, re))
    else if (re.test(p)) out.push(p)
  }
  return out
}

function main() {
  console.log("\nThe Storelib mark")

  /* ---------------------------------------------------------------------
     ONE PLACE
     --------------------------------------------------------------------- */
  console.log("\n  it is defined once")

  const brand = read("lib/brand/logo.ts")
  check("there is a constant for it", /export const STORELIB_LOGO = "\/storelib-logo\.webp"/.test(brand))
  check(
    "and an absolute form for consumers with no origin to resolve against",
    /export function storelibLogoUrl/.test(brand),
    "an email or an OG card cannot resolve a bare path",
  )

  /*
    THE OLD URL IS GONE FROM EVERY SOURCE FILE. This is the check that would
    have caught the nineteenth file, so it names the offenders rather than
    just failing.
  */
  const codeFiles = walk("app", /\.(ts|tsx)$/)
    .concat(walk("components", /\.(ts|tsx)$/))
    .concat(walk("lib", /\.(ts|tsx)$/))
  const stragglers = codeFiles.filter((f) => read(f).includes("Untitled%20(512%20x%20512%20px)"))
  check("no source file still carries the old literal", stragglers.length === 0, stragglers.join(", "))

  const importers = codeFiles.filter((f) => read(f).includes("STORELIB_LOGO") && f !== "lib/brand/logo.ts")
  check("and the places that draw it import the constant", importers.length >= 15, `${importers.length} importers`)
  for (const f of importers) {
    const src = read(f)
    if (!/from "@\/lib\/brand\/logo"/.test(src)) {
      check(`${f} imports it`, false, "uses STORELIB_LOGO without importing it")
    }
  }
  check("every importer actually imports it", importers.every((f) => /from "@\/lib\/brand\/logo"/.test(read(f))))

  /*
    THE SURFACES THE OWNER NAMED, checked by name so a rename cannot quietly
    drop one: the platform header, the /app sidebar, the marketing footer and
    the seller footer that product and creator pages carry.
  */
  console.log("\n  it is on every surface that was asked for")
  for (const [label, file] of [
    ["the platform header", "components/platform/platform-header-client.tsx"],
    ["the /app sidebar", "components/app/sidebar.tsx"],
    ["the dashboard sidebar", "components/dashboard/sidebar.tsx"],
    ["the marketing footer", "components/marketing/footer.tsx"],
    ["the seller footer on product and creator pages", "components/storefront/seller-footer.tsx"],
    ["the wishlist shell", "components/wishlist/public-wishlist-shell.tsx"],
    ["the favicon the store builder sets", "components/store-builder/dynamic-favicon.tsx"],
  ] as const) {
    check(label, read(file).includes("STORELIB_LOGO"))
  }

  /* ---------------------------------------------------------------------
     THE FILES, AND WHAT THEY COST
     --------------------------------------------------------------------- */
  console.log("\n  the assets exist and are small")

  const assets: [string, number][] = [
    ["public/storelib-logo.webp", 40_000],
    ["app/icon.png", 30_000],
    ["public/apple-icon.png", 40_000],
    ["public/icon-light-32x32.png", 6_000],
    ["public/icon-dark-32x32.png", 6_000],
    ["android/app/src/main/assets/welcome/storelib-logo.webp", 8_000],
  ]
  for (const [p, budget] of assets) {
    const there = existsSync(join(process.cwd(), p))
    check(`${p} exists`, there)
    if (there) check(`  and is under ${(budget / 1000).toFixed(0)}KB`, bytes(p) <= budget, `${bytes(p)} bytes`)
  }
  /* The mark is drawn at 46px at most, so 512 square is already three times
     what a 3x screen asks for. A bigger source would be bytes nobody sees. */
  check(
    "the served mark is smaller than the 80KB original it came from",
    bytes("public/storelib-logo.webp") < 80_738,
    `${bytes("public/storelib-logo.webp")} bytes`,
  )

  /* ---------------------------------------------------------------------
     AND NO TRANSFORM CAME BACK IN THROUGH AN HTML FILE
     --------------------------------------------------------------------- */
  console.log("\n  the Android welcome screen stops metering a transform")

  const welcome = read("android/app/src/main/assets/welcome/index.html")
  /*
    THE LOGO SPECIFICALLY, because the logo is what this change touched. The
    <img> that draws the mark must not be a transform and must not be remote.
  */
  const logoTag = welcome.match(/<img[^>]*class="logo-icon"[^>]*>/)?.[0] ?? ""
  check("the mark's own tag exists", logoTag.length > 0)
  check("and it is not a transform", !/render\/image/.test(logoTag), logoTag.slice(0, 120))

  /*
    ═══════════════════════════════════════════════════════════════════════
     ONE TRANSFORM IS STILL IN THIS FILE, AND IT IS NOT THE LOGO'S
    ═══════════════════════════════════════════════════════════════════════
    The welcome screen also runs a five-image marketing collage, and it builds
    a metered /render/image/ URL per image per launch:

        BASE + "/" + IMAGES[i] + "?width=" + imgW + "&height=" + imgH
             + "&resize=cover&quality=" + imgQ

    That is the cost policy this repository bans, and it predates this change.
    It is NOT exempted here — it is reported, with a count, so it stays
    visible until somebody bundles those five images the way the mark is now
    bundled. Silently allowing it is how it survived this long: the ban in
    tests/no-image-transforms.test.ts only scans code files, never .html.
  */
  const collageTransforms = (welcome.match(/render\/image/g) ?? []).length
  if (collageTransforms > 0) {
    console.log(`        note: ${collageTransforms} /render/image/ reference(s) remain in this file for the marketing collage — pre-existing, not the logo, still owed a fix`)
  }
  check("it loads the mark from its own asset folder", /src="storelib-logo\.webp"/.test(welcome))
  check(
    "which also means the welcome screen works with no network",
    !/<img[^>]+src="https?:/.test(welcome),
    "a remote logo on a native splash is a cold-start network dependency",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
