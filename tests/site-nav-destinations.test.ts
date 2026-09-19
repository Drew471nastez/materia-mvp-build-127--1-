/**
 * ===========================================================================
 *  A MENU LINK THAT LANDS ON STORELIB'S 404 IS A MENU LINK THAT DOES NOTHING
 * ===========================================================================
 * Measured on a real published site, andrew-rullz.storelib.com, driving a
 * phone-sized browser: the drawer opened, the links were on top and took the
 * tap, and tapping "Shop" moved the address from / to /shop. The navigation
 * worked. What arrived did not:
 *
 *     /          200   the site
 *     /products  200   the shop
 *     /search    200
 *     /shop      404   Storelib's own not-found page
 *     /about     404   Storelib's own not-found page
 *     /contact   404   Storelib's own not-found page
 *
 * Three of the four links in the shipped nav, and the 404 carries none of the
 * site's chrome — no header, no menu, no logo — so a visitor who follows one
 * is stranded with nothing to click. "The menu links don't work at all", and
 * "clicking the logo doesn't take me home" is the same page: there was no
 * logo on it.
 *
 * Two halves, and this pins both. The FALLBACK nav — what a header with no
 * stored blocks renders — may only name addresses every site answers. The
 * STORED nav is repaired by live-links against the site's real page list, and
 * that repair now runs when a published site is read, not only when the
 * editor happens to load.
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

async function main() {
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  const links = read("lib/website-builder/live-links.ts")
  const published = read("lib/website-builder/published-site.ts")

  console.log("\nThe fallback nav names only addresses that exist")

  const block = header.slice(
    header.indexOf("const DEFAULT_NAV_BLOCKS"),
    header.indexOf("const navBlocks"),
  )
  check("the fallback nav is where the test expects it", block.length > 0)
  for (const dead of ["/shop", "/about", "/contact"]) {
    check(`it does not ship ${dead}`, !block.includes(`"${dead}"`), "measured 404 on a live published site")
  }
  check("it points Shop at the one constant that says where the shop is", /url: SHOP_PATH/.test(block))
  check("and home is still there", /url: "\/"/.test(block))

  console.log("\nThe stored nav is repaired against the site's own pages")

  check(
    "the repair knows about the header's two stock links as well as the footer's",
    /\["\/about", "about"\]/.test(links) && /\["\/contact", "contact"\]/.test(links),
  )
  check(
    "a creator's own page keeps its link",
    /if \(stockLabel && !pageKeys\.has\(key\) && norm\(s\.label\) === stockLabel\)/.test(links),
    "the removal needs the page to be missing AND the label untouched",
  )
  check("and /shop is still a rename rather than a removal", /RENAMED = new Map<string, string>\(\[\["\/shop", SHOP_PATH\]\]\)/.test(links))

  console.log("\nAnd the repair reaches a site that was published before it existed")

  check(
    "a published site's pages go through it on the way out",
    /pageWithLiveLinks\(pages\[key\], pageKeys\)/.test(published),
    "it used to run only where the editor loaded the theme and wrote the repair back",
  )
  check(
    "against the keys the site actually has",
    /const pageKeys = new Set\(Object\.keys\(pages\)\)/.test(published),
  )
  check(
    "after the chrome is unified, so one repair covers every page's copy",
    published.indexOf("applyUniversalChrome") < published.indexOf("pageWithLiveLinks(pages[key]"),
  )

  /* The repair is only safe to run on every read because it cannot drift. */
  const { withLiveLinks } = await import("../lib/website-builder/live-links")
  const stored = {
    id: "h1",
    type: "header",
    blocks: [
      { id: "a", type: "nav_link", settings: { label: "Home", url: "/" } },
      { id: "b", type: "nav_link", settings: { label: "Shop", url: "/shop" } },
      { id: "c", type: "nav_link", settings: { label: "About", url: "/about" } },
      { id: "d", type: "nav_link", settings: { label: "Get in touch", url: "/contact" } },
    ],
  } as never
  const keys = new Set(["home"])
  const once = withLiveLinks(stored, keys)
  const urls = (once.blocks ?? []).map((b) => String((b.settings as Record<string, unknown>).url))
  check("Shop is repointed at the shop", urls.includes("/products"), urls.join(" "))
  check("the stock About link goes", !urls.includes("/about"), urls.join(" "))
  check("a renamed Contact link stays, because somebody chose it", urls.includes("/contact"), urls.join(" "))
  check("running it again changes nothing", JSON.stringify(withLiveLinks(once, keys)) === JSON.stringify(once))

  const withAbout = withLiveLinks(stored, new Set(["home", "about"]))
  check(
    "and an About page that exists keeps its link",
    (withAbout.blocks ?? []).some((b) => String((b.settings as Record<string, unknown>).url) === "/about"),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
