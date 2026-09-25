/**
 * ===========================================================================
 *  THE EDITOR'S OWN ROUTES, HELD TO WHAT THEY PROMISE
 * ===========================================================================
 * The builder saves through a handful of routes under
 * app/api/website-builder/themes/[installId]. Each of these checks is a thing
 * one of them used to get wrong: a write whose failure was reported as
 * success, a publish that could leave a creator with no website, a copy of
 * the header that skipped the cleaning every other save goes through.
 *
 * The routes need a signed-in session and a database, so what is checked
 * here is the code itself, the same way tests/published-site.test.ts does.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ROUTES = "app/api/website-builder/themes/[installId]"

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The header and footer copied to every page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const sync = read(`${ROUTES}/sections/sync-global/route.ts`)
    check("cleaned by the same function as the sections route, with the install's own files",
      /const own = await readOwnSectionFields\(supabase, installId, sent\.map\(\(s\) => s\.type\)\)/.test(sync)
        && /const header = sentHeader \? sanitizeSections\(\[sentHeader\], own\)\[0\] : null/.test(sync)
        && /const footer = sentFooter \? sanitizeSections\(\[sentFooter\], own\)\[0\] : null/.test(sync))
    check("held to the same block limit, before anything is read or written",
      /\(s\.blocks\?\.length \?\? 0\) > LIMITS\.blocksPerSection/.test(sync)
        && sync.indexOf("LIMITS.blocksPerSection") < sync.indexOf('.from("store_theme_pages")'))
    check("a page that goes live is cleaned whole, as publishing cleans it",
      /\? \{ sections: sanitizeSections\(merged, pageOwn\), draft_sections: null \}/.test(sync))
    check("a failed read of the other pages is an error, not an empty success",
      /if \(readErr\) return NextResponse\.json\(/.test(sync))
    check("and a write that failed is not reported as a sync",
      /if \(failed > 0\) \{/.test(sync) && /status: 500/.test(sync.slice(sync.indexOf("if (failed > 0) {"))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
