/**
 * ===========================================================================
 *  THE LOGO GOES HOME, FROM EVERY PAGE
 * ===========================================================================
 * Reported as "if I click on the logo text or logo image in the header, it
 * does not redirect me to anything, it should redirect me to the home", and
 * the same for Home in the mobile menu.
 *
 * The cause was one missing dependency. `handleEditorNavigate` is held in a
 * useCallback that the whole memoized canvas hangs off, so it is kept
 * deliberately stable; it read which page was open, and the page was not in
 * its dependency list. So it kept the page from the render that built it,
 * which is the editor's first render, which is home. "/" was then answered
 * "you are already there" from every page for the rest of the session, while
 * /about and /products kept working because no other address reads the page.
 *
 * A missing dependency is invisible in a source-shaped test and invisible in
 * a browser unless somebody navigates twice. So the decision is a pure
 * function now, and this asks it for "/" from every page there is. It cannot
 * be answered "you are already there" unless home really is open, because
 * the page is an argument and there is nowhere for a stale one to hide.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveEditorHref, type EditorNavContext } from "../lib/website-builder/editor-navigation"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const base: EditorNavContext = {
  currentPage: "home",
  inspectorEnabled: false,
  fromNav: true,
  shopPath: "/products",
  customPageKeys: ["lookbook", "stockists"],
}
const at = (currentPage: string, over: Partial<EditorNavContext> = {}) =>
  (href: string) => resolveEditorHref(href, { ...base, currentPage, ...over })

function main() {
  console.log("\n  the logo goes home from wherever you are")

  /* Every page the builder can have open. The bug answered "top" for all of
     them, because it thought home was open on all of them. */
  for (const page of ["products", "search", "about", "contact", "product", "lookbook"]) {
    const d = at(page)("/")
    check(`from ${page}, "/" opens home`, d.kind === "page" && d.key === "home", JSON.stringify(d))
  }

  console.log("\n  and going home while home is open goes to the top of it")

  /* Not "nothing". Reloading the page already showing would only throw the
     scroll away, but doing nothing at all is what reads as a broken logo. */
  check('from home, "/" is the top of the page', at("home")("/").kind === "top")
  check("an empty path is the same thing", at("home")("").kind === "ignore")
  check('"/" from home is never a missing page', at("home")("/").kind !== "missing")

  console.log("\n  the shapes a home link is actually written in")

  for (const href of ["/", "/?ref=logo", "/#top"]) {
    const d = at("about")(href)
    check(`${JSON.stringify(href)} from about opens home`, d.kind === "page" && d.key === "home", JSON.stringify(d))
  }
  /* A lone "#" is not a link to anywhere and must not offer to create a page
     called "". */
  check('"#" does nothing', at("about")("#").kind === "ignore")

  console.log("\n  the rest of the site still routes")

  check("/about", (() => { const d = at("home")("/about"); return d.kind === "page" && d.key === "about" })())
  check("/about/ with the trailing slash", (() => { const d = at("home")("/about/"); return d.kind === "page" && d.key === "about" })())
  check("/contact", (() => { const d = at("home")("/contact"); return d.kind === "page" && d.key === "contact" })())
  check("the shop", (() => { const d = at("home")("/products"); return d.kind === "page" && d.key === "products" })())
  check("the search page", (() => { const d = at("home")("/search"); return d.kind === "page" && d.key === "search" })())
  check("the search page with a query on it",
    (() => { const d = at("home")("/search?q=tec"); return d.kind === "page" && d.key === "search" })())
  check("a product", (() => { const d = at("home")("/products/blue-mug"); return d.kind === "product" && d.slug === "blue-mug" })())
  check("a product with a query after it",
    (() => { const d = at("home")("/products/blue-mug?variant=2"); return d.kind === "product" && d.slug === "blue-mug" })())
  check("a page the creator made",
    (() => { const d = at("home")("/lookbook"); return d.kind === "page" && d.key === "lookbook" })())
  check("a page nobody has made says so, by name",
    (() => { const d = at("home")("/wholesale"); return d.kind === "missing" && d.path === "/wholesale" })())
  check("an address without its leading slash is still an address",
    (() => { const d = at("home")("about"); return d.kind === "page" && d.key === "about" })())

  console.log("\n  and the editor is never taken out of the builder")

  check("an http link", at("home")("https://example.com").kind === "ignore")
  check("a protocol relative link", at("home")("//example.com").kind === "ignore")
  check("a mail link", at("home")("mailto:hi@example.com").kind === "ignore")
  check("a telephone link", at("home")("tel:+40700000000").kind === "ignore")
  check("a placeholder somebody has not filled in",
    at("home")("javascript:void(0)").kind === "ignore")

  console.log("\n  an anchor is a place on this page")

  check("#reviews scrolls, it does not change the page",
    (() => { const d = at("about")("#reviews"); return d.kind === "anchor" && d.id === "reviews" })())

  console.log("\n  with the inspector on, a tap selects unless it IS the navigation")

  check("a link in a hero only selects",
    at("about", { inspectorEnabled: true, fromNav: false })("/").kind === "ignore")
  check("the header's logo still goes home",
    (() => {
      const d = at("about", { inspectorEnabled: true, fromNav: true })("/")
      return d.kind === "page" && d.key === "home"
    })())

  console.log("\n  and the editor reads the page at the moment of the click")

  const editor = readFileSync(join(process.cwd(), "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  /*
    THE ACTUAL BUG, PINNED. The callback must not read `currentPage`,
    `handlePageChange` or `handleSelectProductPage` out of the render that
    built it: it is stable on purpose, so anything it closes over is frozen.
    Refs, assigned in render, the way the undo stack already does it.
  */
  check("the page open now is read through a ref",
    /currentPageRef\.current = currentPage/.test(editor) && /currentPage: currentPageRef\.current/.test(editor))
  check("and so are the two page handlers it calls",
    /pageChangeRef\.current = handlePageChange/.test(editor)
      && /selectProductRef\.current = handleSelectProductPage/.test(editor))
  check("so the callback closes over nothing at all",
    /const handleEditorNavigate = useCallback\([\s\S]{0,4000}?\n  \}, \[\]\)/.test(editor))
  check("and where a link goes is decided by the function this file tests",
    /resolveEditorHref\(href, \{/.test(editor)
      && /from "@\/lib\/website-builder\/editor-navigation"/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
