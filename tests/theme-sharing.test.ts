/**
 * ===========================================================================
 *  A THEME IS ABOUT TO BECOME SOMETHING STRANGERS SEND EACH OTHER
 * ===========================================================================
 * Today a theme is yours. You build it in your own account, and the HTML in
 * its settings is HTML you typed. Tomorrow a theme is a file one creator
 * hands another, and every one of those settings arrives written by somebody
 * the person installing it has never met.
 *
 * That changes who the victim is. A published store is served from
 * storelib.com, so script in a section's settings runs on the platform's own
 * origin: in front of that creator's customers while they are buying
 * something, and in the creator's own editor while they are signed in.
 * `CustomHtmlSection` carried a comment saying this was "safe because the
 * install is scoped to the creator who authored it", and under sharing both
 * halves of that sentence stop being true.
 *
 * lib/website-builder/sanitize.ts is the allow list and tests/sanitize.test.ts
 * proves it strips what it claims to. This file is the other question: is it
 * actually ON every path a section's settings can travel. There were three
 * it was not.
 *
 *   IMPORT      wrote a package's settings and pages to the database
 *               exactly as the zip supplied them. This is the sharing path.
 *   EDITOR READ handed rows back to the builder canvas untouched, so
 *               anything already stored — imported, duplicated, snapshotted,
 *               edited by hand — reached `dangerouslySetInnerHTML` in a
 *               signed-in session.
 *   THEME       settings were cleaned on save and never on read, and a
 *               theme's own .storelib files may emit any of them through the
 *               template language's `raw` filter.
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
  const imp = read("app/api/website-builder/themes/import/route.ts")
  const sections = read("app/api/website-builder/themes/[installId]/sections/route.ts")
  const published = read("lib/website-builder/published-site.ts")
  const custom = read("components/website-builder/sections/renderers/CustomHtmlSection.tsx")
  const sanitize = read("lib/website-builder/sanitize.ts")

  console.log("\nEvery way a section's settings get INTO the database")

  check("the editor's save cleans them",
    /const sections = sanitizeSections\(raw, own\)/.test(sections),
    "with the install's own section files, so a type the theme does not ship is cleaned by its schema")
  check("a package's pages are cleaned before the row is written",
    /sections: sanitizeSections\(rewriteUrls\(page\.sections, refToUrl\) as SectionInstance\[\], own\)/.test(imp),
    "this is the shared-theme path; the zip is written by somebody else")
  check("and so is a package's settings block",
    /const settings = sanitizeThemeSettings\(\s*\n\s*rewriteUrls\(JSON\.parse\(pkg\.files\["config\/settings\.json"\]/.test(imp))
  check("the older manifest export is cleaned on the same terms",
    /\.map\(p => \(\{ \.\.\.p, sections: repairChrome\(sanitizeSections\(p\.sections as SectionInstance\[\]\), /.test(imp)
      && /const importedSettings = sanitizeThemeSettings\(/.test(imp),
    "a zip from an older build is still a zip from a stranger")

  console.log("\nAnd every way they get back OUT of it")

  /*
    The read side is not belt and braces. A row can be written by a path that
    is not the editor's save — an import, a duplicate, a snapshot, SQL — and
    every one of those ends up in front of somebody through one of these.
  */
  check("the published site cleans its pages",
    /pages\[r\.page_key\] = sanitizeSections\(published(, ownSchemas)?\)/.test(published))
  check("and its theme settings, which a .storelib file may emit through `raw`",
    /const themeSettings = sanitizeThemeSettings\(/.test(published),
    "cleaned on save only means a row that never went through save is not cleaned at all")
  check("the editor's own read cleans what it hands the canvas",
    /const clean = sanitizeSections\(sections \?\? \[\](, lookup)?\)/.test(sections),
    "the canvas renders these with dangerouslySetInnerHTML, in a signed-in session")
  check("including the row it returns alongside them",
    /sections: data\.sections \? sanitizeSections\(data\.sections as SectionInstance\[\](, lookup)?\) : data\.sections/.test(sections)
      && /draft_sections: data\.draft_sections \? sanitizeSections\(data\.draft_sections as SectionInstance\[\](, lookup)?\) : data\.draft_sections/.test(sections),
    "`page: data` carried the same arrays back unfiltered")
  check("and the shop and search pages it generates from a stored home page",
    /sections: sanitizeSections\(generated\)/.test(sections))

  console.log("\nThe renderers say what actually makes them safe")

  check("CustomHtmlSection no longer claims authorship is the protection",
    !/This is safe because the install is\s*\n\/\/ scoped to the creator who authored it/.test(custom)
      && !/scoped to the creator who authored it/.test(custom),
    "that sentence stops being true the day a theme can be installed from somebody else")
  check("and names the allow list instead",
    /sanitize\.ts/.test(custom) && /on save, on import,\s*\n\/\/ and again on every read/.test(custom))

  console.log("\nThe allow list still refuses the things that execute")

  /*
    tests/sanitize.test.ts drives the sanitiser itself. These two are here
    because they are the properties the paragraphs above depend on, and a
    widening of the list should have to fail this file as well as that one.
  */
  check("no script, and nothing left of what was inside it",
    !/"script"/.test((sanitize.match(/allowedTags: \[[\s\S]*?\]/g) ?? []).join(" "))
      && /nonTextTags: \["script", "style"/.test(sanitize))
  check("no style attribute outside an embed's iframe",
    /No `style`\./.test(sanitize))
  check("and only http, https, mailto and tel",
    /allowedSchemes: \["http", "https", "mailto", "tel"\]/.test(sanitize),
    "javascript: in an href is a script tag with extra steps")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
