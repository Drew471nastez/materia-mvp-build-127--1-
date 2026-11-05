/**
 * ===========================================================================
 *  THE KEYBOARD CLAMPS A SCROLL CONTAINER, NOT EVERY PAGE ON THE SITE
 * ===========================================================================
 * Reported: tap the search on /explore and the footer appears immediately
 * under the field, jammed against the keyboard, with the products gone.
 *
 * KeyboardGuard adds `keyboard-open` to <html> and sets `--vvh` to the height
 * still visible above the keyboard. A rule then read:
 *
 *     html.keyboard-open main,
 *     html.keyboard-open .app-content-scroll { height: var(--vvh) !important }
 *
 * `main` with no scope is EVERY <main> on the site.
 *
 * It is right for a fixed-height scroller. The /app shell and the library are
 * a viewport-tall box with the page scrolling inside it, and while the
 * keyboard is up that box has to shrink or it extends into the blank area
 * behind the keyboard and rubber-bands.
 *
 * It is destructive for a page that scrolls the DOCUMENT. Reproduced on
 * production by applying exactly what KeyboardGuard applies:
 *
 *                   main height    footer top
 *     normal            10676         10741
 *     keyboard open       420           485
 *
 * The marketing layout is a flex column — header, <main class="flex-1">,
 * footer — so clamping main pulled the footer up under the search field with
 * ten thousand pixels of products overflowing invisibly behind it.
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
const css = read("app/globals.css")

function main() {
  console.log("\nThe keyboard clamps a scroll container, not every page")

  /* ---------------------------------------------------------------------
     NOTHING CLAMPS A BARE `main`
     --------------------------------------------------------------------- */
  console.log("\n  no keyboard rule names an unscoped element")

  /*
    Every `html.keyboard-open` selector has to name WHICH container it means.
    A bare element selector under that class reaches the marketing tree, the
    checkout, a creator's page and a published site — all of which scroll the
    document and none of which can survive being clamped to the visual
    viewport.
  */
  const rules = css.match(/html\.keyboard-open [^{]+\{/g) ?? []
  check("there are keyboard rules to check", rules.length > 0, `${rules.length} found`)
  const unscoped: string[] = []
  for (const r of rules) {
    for (const sel of r.replace("{", "").split(",")) {
      const tail = sel.trim().replace(/^html\.keyboard-open\s*/, "").trim()
      /* `body` is the one bare element that is legitimate: zeroing its
         safe-area padding is correct on every surface. */
      if (!tail || tail === "body") continue
      if (/^[a-z]+$/.test(tail)) unscoped.push(sel.trim())
    }
  }
  check(
    "no rule clamps a bare element selector",
    unscoped.length === 0,
    unscoped.join(" | ") + " — a bare `main` reaches every document-scrolled page",
  )

  /* ---------------------------------------------------------------------
     THE HEIGHT CLAMP NAMES ITS TWO CONTAINERS
     --------------------------------------------------------------------- */
  console.log("\n  the height clamp names what it means")

  const clamp = css.slice(
    css.indexOf('html.keyboard-open [data-page="library"] main,'),
    css.indexOf("}", css.indexOf('html.keyboard-open [data-page="library"] main,')) + 1,
  )
  check("it still clamps the /app shell's scroller", /html\.keyboard-open \.app-content-scroll/.test(clamp))
  check("and the library's main, which is one too", /\[data-page="library"\] main/.test(clamp))
  check("to the visible height above the keyboard", /height: var\(--vvh, 100svh\) !important/.test(clamp))
  check(
    "and nothing else",
    !/^html\.keyboard-open main,/m.test(css),
    "a bare `main` is every page on the site",
  )

  /* ---------------------------------------------------------------------
     THE MARKETING TREE IS A DOCUMENT-SCROLLED FLEX COLUMN
     --------------------------------------------------------------------- */
  console.log("\n  which is why the marketing tree must not be clamped")

  /*
    This is the shape that turns a clamp into the reported bug: the footer is
    a SIBLING of main in a flex column, so main's height is what holds it
    down the page. Shrink main and the footer comes up to meet it.
  */
  const layout = read("app/(storelib)/(marketing)/layout.tsx")
  check("header, main and footer are one flex column", /flex min-h-svh flex-col/.test(layout))
  check("main takes the remaining space", /<main className="flex-1/.test(layout))
  check("and the footer follows it as a sibling", layout.indexOf("<main") < layout.indexOf("ConditionalFooter />"))
  check(
    "the footer is in flow rather than pinned",
    !/position:\s*(fixed|sticky)/.test(read("components/marketing/footer.tsx")),
    "a pinned footer would be a different bug with the same picture",
  )

  /* And the guard that sets all this is still global, which is correct —
     the variable is useful everywhere; only the clamp was not. */
  check(
    "KeyboardGuard is still mounted once, at the root",
    (read("app/(storelib)/layout.tsx").match(/<KeyboardGuard \/>/g) ?? []).length === 1,
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
