/**
 * ===========================================================================
 *  ROUND BB: AN ANNOUNCEMENT BAR STAYS WHERE IT WAS ADDED, THE WISHLIST PAGE
 *  SHOWS WHAT WAS SAVED
 * ===========================================================================
 * An announcement bar added among a page's sections was moved into the
 * Header group. It stays on the page now; one added from the Header group
 * still goes there.
 *
 * andrewrullz.storelib.com/wishlist showed nothing with two products saved:
 * an imported theme's /wishlist framed Storelib's page, which tried to draw
 * the theme's own stored wishlist sections it cannot draw. A theme with its
 * own wishlist page shows that page now, and its cards are shown by id or by
 * handle (the theme's hearts kept handles, its page compared ids).
 *
 * Run with:  npx tsx tests/round-bb.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sectionGroupsFor, placeSection } from "../lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nAn announcement bar goes where it was added\n")
{
  const groups = sectionGroupsFor(SECTION_SCHEMAS.announcement_banner as never, { type: "announcement_banner", kind: null })
  check("the built-in bar may go in the Header group or on a page, the Header group first", groups.join() === "header,template", groups)
  const page = [
    { id: "h", type: "header", name: "Header", settings: {} },
    { id: "hero", type: "hero", name: "Hero", settings: {} },
    { id: "f", type: "footer", name: "Footer", settings: {} },
  ]
  const kinds = (t: string) => (t === "header" ? "header" : t === "footer" ? "footer" : null)
  const bar = { id: "a", type: "announcement_banner", name: "Announcement", settings: {} }
  const onPage = placeSection(page as never, bar as never, { groups, group: "template", at: 1, kindOfType: kinds as never })
  check("added among the page's sections it stays on the page", onPage.group === "template", onPage.group)
  const inHeader = placeSection(page as never, bar as never, { groups, group: "header", kindOfType: kinds as never })
  check("added from the Header group it goes in the Header group", inHeader.group === "header", inHeader.group)
  check("a coded section named Announcement bar may go on a page too", sectionGroupsFor({ name: "Announcement bar" }).join() === "header,template")
  check("a schema that says enabled_on header only is kept there", sectionGroupsFor({ name: "Announcement bar", enabled_on: { groups: ["header"] } }).join() === "header")
}

console.log("\nThe wishlist page of an imported theme\n")
{
  const site = code("lib/storelib-theme/compat/site.ts")
  check("/wishlist draws the theme's own wishlist page when it has one", /if \(path === "\/wishlist"\) \{\s*\n\s*if \(site\.pages\.wishlist\) \{\s*\n\s*const own = at\("wishlist"/.test(site))
  check("  and Storelib's page in the theme's header and footer when it has none", /if \(own\) return own\s*\n\s*\}\s*\n\s*return accountShell\(site, req, path\)/.test(site))
  check("  the old early frame is gone", !/if \(path === "\/wishlist"\) return accountShell/.test(site))
  const account = code("app/(site)/w/[username]/render-account.tsx")
  check("the framed page never draws the theme's stored sections (only the theme can)", /stored && stored\.length > 0 && !imported \? stored : /.test(account))
  check("  and has no second language and currency bar under the theme's header", /language: imported \? undefined : language/.test(account))
  const shims = code("lib/storelib-theme/compat/shims.ts")
  check("the theme's wishlist cards are shown by id or by handle", /var reveal=function\(\)\{var lists=document\.querySelectorAll\("\[data-wishlist-local\]"\)/.test(shims) && /data-product-handle/.test(shims))
  check("  on load, on back/forward and on every change", /window\.addEventListener\("pageshow",reveal\)/.test(shims) && /materia:wishlist-change/.test(shims))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
