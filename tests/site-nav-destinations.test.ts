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

  /* Contact left the list: every website answers /contact now, with the
     generated page when the creator made none (lib/website-builder/
     account-pages), so a stock Contact link goes somewhere and stays. */
  check(
    "the repair knows about the header's About link as well as the footer's, and keeps Contact",
    /\["\/about", "about"\]/.test(links) && !/\["\/contact", "contact"\]/.test(links) && /"contact"/.test(read("lib/website-builder/account-pages.ts")),
  )
  check(
    "a creator's own page keeps its link",
    /if \(stockLabel && !pageKeys\.has\(key\) && norm\(s\.label\) === stockLabel\)/.test(links),
    "the removal needs the page to be missing AND the label untouched",
  )
  check("and /shop is still a rename rather than a removal", /RENAMED = new Map<string, string>\(\[\["\/shop", SHOP_PATH\]\]\)/.test(links))

  console.log("\nAnd the repair reaches a site that was published before it existed")

  check(
    "a published site's sections go through it on the way out",
    /const linked = pageWithLiveLinks\(stored, new Set\(Object\.keys\(site\.pages\)\)\)/.test(published) &&
      /await dressPage\(site, linked,/.test(published),
    "it used to run only where the editor loaded the theme and wrote the repair back",
  )
  /**
   * AND OUTSIDE THE CACHE. The first version ran inside `siteByName`, which
   * `unstable_cache` holds for an hour across deployments: the fix shipped,
   * the live site kept serving /shop and /about, and it was a cached copy
   * made before the fix existed. Measured after the deploy was READY.
   */
  const cached = published.indexOf("unstable_cache(\n    () => siteByName")
  const repair = published.indexOf("pageWithLiveLinks(stored")
  check(
    "the repair is not inside the hour-long cached lookup",
    repair > 0 && (cached < 0 || repair > cached),
    "a cached entry survives a deploy, so a repair inside it ships and does nothing",
  )
  check(
    "and it runs before the sections are drawn",
    repair < published.indexOf("renderWithSources(site.sources, sections"),
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

  console.log("\nAnd nothing covers the bottom of the menu")

  /**
   * Measured on a live published site: the Search row's own topmost element
   * at its centre was the cookie banner's top bar, and a tap on it left the
   * address at "/". The rows were not dead; the tap never reached them.
   */
  const frame = read("components/website-builder/drawer-frame.ts")
  const banner = read("components/cookie-consent-banner.tsx")
  const bannerZ = Number(banner.match(/fixed bottom-0 left-0 right-0 z-\[(\d+)\]/)?.[1] ?? 0)
  check("the cookie banner still names a z-index this test can read", bannerZ > 0, String(bannerZ))
  const backdropZ = Number(frame.match(/DRAWER_BACKDROP_Z = "z-\[(\d+)\]"/)?.[1] ?? 0)
  const panelZ = Number(frame.match(/DRAWER_PANEL_Z = "z-\[(\d+)\]"/)?.[1] ?? 0)
  check("the drawer sits above it", backdropZ > bannerZ && panelZ > backdropZ, `banner ${bannerZ}, backdrop ${backdropZ}, panel ${panelZ}`)
  /* Twice each in the markup, plus once in the import line. The panel's layer
     a third time: the frame a menu from the top drops inside is fixed, so it is
     a stacking context and has to carry the panel's layer itself. */
  const body = header.split("\n").filter((line) => !line.startsWith("import ")).join("\n")
  check(
    "and both drawers read the same two constants",
    (body.match(/DRAWER_BACKDROP_Z/g) ?? []).length === 2 &&
      (body.match(/DRAWER_PANEL_Z/g) ?? []).length === 3,
    "the nav drawer and the cart drawer are one surface at two edges",
  )
  check(
    "no drawer still carries the old hard-coded z",
    !/z-\[90\] bg-black\/50/.test(header) && !/z-\[95\] flex flex-col/.test(header),
  )

  console.log("\nAnd in the editor the menu says it is the navigation")

  /**
   * The editor refuses an ordinary link while the inspector is on, because a
   * tap on a hero's button is almost always aimed at the hero, and follows a
   * NAVIGATION one. Which it was depended on the section's role, decided
   * outside: the navigating version went only to a section whose type is
   * exactly "header" or "footer". A header that calls itself anything else —
   * a theme's own, a custom one — got the refusing version, and every link
   * in its drawer did nothing at all.
   *
   * The drawer knows what it is. It says so at the call.
   */
  const shared = read("components/website-builder/sections/_shared.tsx")
  check(
    "the prop carries the flag the editor already understands",
    /onEditorNavigate\?: \(href: string, fromNav\?: boolean\) => void/.test(shared),
  )
  check(
    "the drawer's links pass it",
    /onEditorNavigate\(href, true\)/.test(header),
    "without it the editor refuses the link whenever the inspector is on",
  )
  check(
    "so does the logo",
    /onEditorNavigate\("\/", true\)/.test(header),
  )
  check(
    "and both search rows",
    (header.match(/onEditorNavigate\("\/search", true\)/g) ?? []).length === 2,
  )
  /* Every CALL, found the way a person would: a line that invokes it with an
     argument. A type, a prop being passed on, and a bare truthiness test all
     fail that shape and are not calls. */
  const unflagged = header
    .split("\n")
    .filter((line) => /onEditorNavigate\(\s*[^)\s]/.test(line))
    .filter((line) => !line.includes(", true)"))
  check(
    "nothing in the header still navigates without saying what it is",
    unflagged.length === 0,
    unflagged.map((l) => l.trim().slice(0, 60)).join(" | "),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
