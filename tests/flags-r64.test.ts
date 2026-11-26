/**
 * ===========================================================================
 *  ROUND 64 (k1): COUNTRY FLAGS ARE REAL ARTWORK, THE SAME ON EVERY SYSTEM
 * ===========================================================================
 * The country (and currency) selector drew each flag as an emoji written as
 * text inside a data: SVG. In the theme's 18px circle it sat off centre and
 * covered about 83% of it (measured in Chromium, scripts/check-flags-r64.mjs),
 * cut differently per flag and per system, and Chrome on Windows and Linux
 * drew it as two letters. Now:
 *
 *   1. `country | image_url` (lib/storelib-theme/compat/objects.ts flagImage)
 *      is the flag's own file, public/flags/<CODE>.svg (country-flag-icons,
 *      MIT, already in the repo for Analytics and the settings picker): a
 *      static file the proxy never sees, so it can never draw a page. A code
 *      with no file is a plain tile drawn in the page.
 *   2. Every theme gets it, because the theme reads it through Liquid: the
 *      country list's JSON carries the address and the button's image_tag
 *      writes it, no srcset. first-load.ts still finds flags (lazy, closed
 *      lists skipped), and the largest-picture hint never picks one.
 *   3. Materia's own script asks for a row's flag only when the row is in
 *      the list's view (the browser's lazy loading reached about 90 rows
 *      down a desktop list): 16 to 17 flags, 11 to 15KB, when it opens.
 *   4. Storelib's own pages that showed an emoji flag (an order's Country,
 *      the admin console) draw the same files.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { flagImage, localizationObject } from "@/lib/storelib-theme/compat/objects"
import { FLAG_BLANK, FLAG_PATH, FLAG_SRC_PREFIX, isFlagSrc, readierFirstLoad } from "@/lib/storelib-theme/compat/first-load"
import { withLcpHint } from "@/lib/storelib-theme/compat/lcp-hint"
import { Ctx, renderString } from "@/lib/storelib-theme/compat/runtime"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { FLAG_CODES } from "@/lib/account/flag-sprite"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const SAMPLE = ["US", "GB", "RO", "FR", "JP", "BR", "CA", "DE"]
/** A regional indicator letter, the emoji flag's building block. */
const EMOJI_FLAG = /[\u{1F1E6}-\u{1F1FF}]/u

section("1. A country's flag is its own file")
{
  for (const cc of SAMPLE) {
    const src = flagImage(cc)
    const file = join(root, "public", src)
    const svg = existsSync(file) ? readFileSync(file, "utf8") : ""
    check(`${cc}: ${src}, an SVG drawing with no text in it, under 6KB`, src === `/flags/${cc}.svg` && /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 513 342">/.test(svg) && !/<text\b/.test(svg) && statSync(file).size < 6000, src)
  }
  check("lower case is the same flag", flagImage("ro") === "/flags/RO.svg")
  check("a code with no file is a plain tile drawn in the page: no request, no text", flagImage("ZZ") === FLAG_BLANK && flagImage("") === FLAG_BLANK && flagImage("USA") === FLAG_BLANK && !/text/.test(decodeURIComponent(FLAG_BLANK)))
  check("never an emoji", ![...FLAG_CODES].some((cc) => EMOJI_FLAG.test(decodeURIComponent(flagImage(cc)))))
  const missing = [...FLAG_CODES].filter((cc) => !existsSync(join(root, "public/flags", `${cc}.svg`)))
  check(`every code with a flag has its file (${FLAG_CODES.size})`, missing.length === 0, missing)
  check("FLAG_PATH is /flags/", FLAG_PATH === "/flags/")
  const proxy = read("proxy.ts")
  check("the proxy never sees an .svg, so asking for a flag never draws a page", /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|media\/\|theme-previews\/\|\.\*\\\\\.\(\?:svg\|png\|jpg\|jpeg\|gif\|webp\)\$\)\.\*\)"\]/.test(proxy))
  check("and the CDN and the browser keep /flags (a week, a month stale)", /source: '\/flags\/:path\*',\s*headers: \[\s*\{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' \}/.test(read("next.config.mjs")))
  check("the emoji is gone from the compat objects", !/0x1f1e6/i.test(code("lib/storelib-theme/compat/objects.ts")))
}

section("2. Every theme reads it through Liquid")
{
  const localization = localizationObject("GBP", {
    locale: "en",
    defaultLanguage: "en",
    languages: ["en"],
    country: { code: "RO", name: "Romania", currency: "GBP" },
    countries: SAMPLE.map((c) => ({ code: c, name: c === "RO" ? "Romania" : c, currency: "GBP" })).concat([{ code: "ZZ", name: "Nowhere", currency: "GBP" }]),
  } as never)
  const env = { snippet: () => null, filter: compatFilter } as never
  const draw = (src: string) => renderString(src, new Ctx({ localization }, env, { registers: { compat: {} } }))
  const rows = JSON.parse(draw(read("theme-packages/materia/base/snippets/country-options.liquid")).trim()) as string[][]
  check("Materia's country list carries each flag's address", SAMPLE.every((cc) => rows.find((r) => r[0] === cc)?.[4] === `/flags/${cc}.svg`), rows.slice(0, 3))
  check("  and leaves the tile out (drawn in the page), as it did the emoji", rows.find((r) => r[0] === "ZZ")?.[4] === "")
  const button = draw(`{{ localization.country | image_url: width: localization.country.width | image_tag: width: localization.country.width, height: localization.country.height, alt: localization.country.name }}`)
  check("the button's flag (any theme's `country | image_url | image_tag`) is the file, its name as alt, one address and no srcset", /^<img src="\/flags\/RO\.svg" alt="Romania"/.test(button) && !/srcset/.test(button), button)
  check("  sized or not, the same file (an SVG is never sent to the optimizer)", draw(`{{ localization.country | image_url: width: 40 }}`) === "/flags/RO.svg")

  const us = flagImage("US")
  const page = `<html><head></head><body><div id="shopify-section-template--1__main" class="shopify-section"><img src="${us}" alt="United States"><ul><li><img src="${flagImage("FR")}" alt="France"></li></ul></div></body></html>`
  const r = readierFirstLoad(page)
  check("first-load.ts still finds the flags: lazy, and the closed list skipped", r.lazyFlags === 2 && r.countryLists === 1 && r.html.includes(`<img loading="lazy" src="/flags/FR.svg"`), r)
  check("  a page kept from before still has its emoji flags found", isFlagSrc(`${FLAG_SRC_PREFIX}%20x%3D%2216%22`) && isFlagSrc(FLAG_BLANK) && !isFlagSrc("/flags/sprite.svg") && !isFlagSrc("/hero.jpg"))
  check("the largest-picture hint never picks a flag", withLcpHint(`<html><head></head><body><div id="shopify-section-template--1__main" class="shopify-section"><img src="${us}" alt=""></div></body></html>`).src === null)
}

section("3. Materia draws them centred, filling the circle, asked for when seen")
{
  const js = read("theme-packages/materia/base/assets/theme.js")
  const options = js.slice(js.indexOf("ensureOptions(fill = true)"), js.indexOf("setupMobileSheet() {"))
  check("no emoji: the flag is /flags/<CODE>.svg, a tile when the code is odd or the file is missing", !/fromCodePoint|0x1f1a5/i.test(options) && /"\/flags\/" \+ String\(code\)\.toUpperCase\(\) \+ "\.svg"/.test(options) && /img\.addEventListener\("error", \(\) => \{ img\.src = blank; \}, \{once: true\}\)/.test(options))
  check("a row's flag is asked for only when the row is in the list's view (IntersectionObserver), at once without one", /new IntersectionObserver\(/.test(options) && /entry\.target\.src = entry\.target\.dataset\.src/.test(options) && /if \(seen\) \{ img\.dataset\.src = image \|\| flag\(code\); seen\.observe\(img\); \}\s*else img\.src = image \|\| flag\(code\);/.test(options))
  check("  the flag holder is still hidden from screen readers, the name in the row's text and label", /holder\.setAttribute\("aria-hidden", "true"\)/.test(options) && /img\.alt = "";/.test(options) && /a\.setAttribute\("aria-label", `\$\{name\} \(\$\{currency\} \$\{symbol\}\)`\)/.test(options))
  const css = read("theme-packages/materia/base/assets/localization-controls.css")
  check("the circle is 18px in the list and the button alike, the flag clipped to it", /\.localization-flags \{\s*display: inline-flex !important;\s*flex: none;\s*width: 18px !important;\s*height: 18px !important;[\s\S]{0,80}border-radius: 50% !important;\s*overflow: hidden;/.test(css))
  check("  and the flag covers it, centred (object-fit: cover at 100%)", /\.localization-flags img \{\s*display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 50%;/.test(css))
  check("scripts/check-flags-r64.mjs measures it in Chromium at 390 and 1280", /for \(const width of \[390, 1280\]\)/.test(read("scripts/check-flags-r64.mjs")))
}

section("4. Storelib's own pages draw the same files")
{
  const flag = read("components/ui/flag-image.tsx")
  check("FlagImage is /flags/<CODE>.svg for a code with a file, nothing otherwise, hidden from screen readers", /src=\{`\/flags\/\$\{cc\}\.svg`\}/.test(flag) && /if \(!FLAG_CODES\.has\(cc\)\) return null/.test(flag) && /aria-hidden/.test(flag) && /alt=""/.test(flag) && /object-cover/.test(flag))
  for (const f of ["app/(storelib)/app/orders/order-detail.tsx", "app/(storelib)/admin/_console/panel-activity.tsx", "app/(storelib)/admin/_console/panel-live.tsx"]) {
    const src = code(f)
    check(`${f}: FlagImage beside the country's name, no emoji`, /<FlagImage code=/.test(src) && !/countryFlag\(|127397|0x1f1e6/i.test(src))
  }
  check("the settings country picker and checkout's phone field already draw the sprite (unchanged)", /FLAG_SPRITE/.test(read("components/app/settings/country-picker.tsx")) && /FLAG_SPRITE/.test(read("app/(storelib)/checkout/parts/phone-input.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
process.exit(failed ? 1 : 0)
