/**
 * ===========================================================================
 *  V12: NO :has() ON THE ROOT, SO ONE INSERTION RESTYLES WHAT IT TOUCHES
 * ===========================================================================
 * Measured in the real editor (scripts/check-editor-perf.mjs, "insert one
 * node", and every :has() rule of the stylesheet tried alone): two rules,
 * `html:has([data-account-settings])` and `html:has([data-page="account"])`,
 * were the whole cost. A :has() whose subject is <html> or <body> is asked
 * again on every insertion and removal anywhere, and Chromium restyled 1,227
 * of the editor's 2,200 elements for each, 35 to 45ms. Every other :has() in
 * the stylesheet, tried alone, left the same insertion at 275 elements, the
 * same as none at all: a :has() on <html> that is NOT the subject (`html:has(X)
 * [data-app-nav-pill]`) restyles only the elements after it.
 *
 * So this holds: no stylesheet of the app has a :has() whose subject is the
 * root or <body>, no class on <html> or <body> carries a has-[…] variant, and
 * the two rules are classes that the elements they asked about set.
 *
 * Run with:  npx tsx tests/editor-css-v.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

const root = process.cwd()

function cssFiles(dir: string, out: string[] = []): string[] {
  let names: string[] = []
  try {
    names = readdirSync(join(root, dir))
  } catch {
    return out
  }
  for (const n of names) {
    if (n === "node_modules" || n.startsWith(".")) continue
    const rel = `${dir}/${n}`
    const st = statSync(join(root, rel))
    if (st.isDirectory()) cssFiles(rel, out)
    else if (n.endsWith(".css")) out.push(rel)
  }
  return out
}

/** Every selector in a stylesheet, comments and at-rule preludes left out, split at its top level commas. */
export function selectorsOf(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: string[] = []
  const re = /([^{};]+)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bare))) {
    const prelude = m[1].trim()
    if (!prelude || prelude.startsWith("@")) continue
    let depth = 0
    let cur = ""
    for (const ch of prelude) {
      if (ch === "(" || ch === "[") depth++
      if (ch === ")" || ch === "]") depth--
      if (ch === "," && depth === 0) {
        out.push(cur.trim())
        cur = ""
      } else cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
  }
  return out
}

/** The last compound of a selector: what it styles. Combinators inside :has(), :is(), :not() and [ ] are not counted. */
export function subjectOf(selector: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (depth === 0 && (ch === " " || ch === ">" || ch === "+" || ch === "~")) start = i + 1
  }
  return selector.slice(start).trim()
}

/** A :has() that makes <html>, :root or <body> the element it styles. */
export function rootHas(selector: string): boolean {
  const subject = subjectOf(selector.replace(/\s+/g, " "))
  return /^(html|:root|body)\b[^ ]*:has\(/.test(subject)
}

section("The rule the test reads selectors with")
{
  check("a :has() on <html> that is the subject is found", rootHas('html:has([data-page="account"])') && rootHas("html.capacitor:has(.x)::before") && rootHas("body:has(.x)") && rootHas(":root:has(.x)"))
  check("a :has() on <html> before the element it styles is not", !rootHas('html:has([data-app-bottom-bar="visible"]) [data-app-nav-pill]') && !rootHas('html.capacitor:has([data-page="auth"]) body'))
  check("a :has() on any other element is not", !rootHas(":where([data-section]:has([aria-expanded=\"true\"]))") && !rootHas(".app-content-scroll:has(> .page-scroll)"))
  check("selectors are split at the top level only", selectorsOf("a:is(b, c), d { x: 1 } @media (x) { e { y: 2 } }").join("|") === "a:is(b, c)|d|e")
}

section("No :has() whose subject is the root, in any stylesheet of the app")
{
  const files = ["app", "components", "lib", "styles", "themes"].flatMap((d) => cssFiles(d))
  check("app/globals.css is among the stylesheets read", files.includes("app/globals.css"), files)
  const all = files.flatMap((f) => selectorsOf(readFileSync(join(root, f), "utf8")))
  check("the scan reads the :has() rules that are there (the pill's, a section's menu)",
    all.includes('html:has([data-app-bottom-bar="visible"]) [data-app-nav-pill]') && all.some((s) => s.startsWith(":where([data-section]:has(")))
  const offenders: string[] = []
  for (const f of files) {
    for (const s of selectorsOf(readFileSync(join(root, f), "utf8"))) if (s.includes(":has(") && rootHas(s)) offenders.push(`${f}: ${s.replace(/\s+/g, " ").slice(0, 140)}`)
  }
  check("none: each one restyled half the editor on every insertion", offenders.length === 0, offenders)

  const layout = readCode("app/layout.tsx")
  const htmlTag = /<html[^>]*>/.exec(layout)?.[0] ?? ""
  const bodyTag = /<body[^>]*>/.exec(layout)?.[0] ?? ""
  check("the root layout's <html> and <body> carry no has-[…] variant", !!htmlTag && !!bodyTag && !/\bhas-|:has\(/.test(htmlTag + bodyTag), { htmlTag, bodyTag })
}

section("The account pages keep their width by class")
{
  const css = readSource("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
  check("the gutter is held by the two classes", /html\.with-account-settings,\s*html\.with-page-account \{\s*scrollbar-gutter: stable;/.test(css))
  check("and so is the scrollbar where there is no gutter", /@supports not \(scrollbar-gutter: stable\) \{\s*@media \(pointer: fine\) \{\s*html\.with-account-settings,\s*html\.with-page-account \{\s*overflow-y: scroll;/.test(css))
  check("the :has() rules they replace are gone", !/html:has\(\[data-account-settings\]\)/.test(css) && !/html:has\(\[data-page="account"\]\)/.test(css))

  const layout = readCode("app/account/layout.tsx")
  check("the account layout sets its class from the element the rule asked about, from its first paint",
    /import \{ HtmlClass \} from "@\/components\/platform\/html-class"/.test(layout) &&
      /data-page="account">\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<HtmlClass name="with-page-account" \/>/.test(readSource("app/account/layout.tsx")))
  const settings = readSource("components/account/account-settings.tsx")
  check("the settings set theirs from their own root, wherever they are drawn (the page and the layer over the profile)",
    /import \{ HtmlClass \} from "@\/components\/platform\/html-class"/.test(settings) &&
      /data-account-settings=""[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<HtmlClass name="with-account-settings" \/>/.test(settings))
  const htmlClass = readCode("components/platform/html-class.tsx")
  check("the class is added in a layout effect, taken off with the last holder, and printed for the server's HTML",
    /useLayoutEffect\(\(\) => \{[\s\S]*document\.documentElement\.classList\.add\(name\)/.test(htmlClass) && /document\.documentElement\.classList\.remove\(name\)/.test(htmlClass) && /<HtmlClassScript name=\{name\} \/>/.test(htmlClass))
}

section("The measurement")
{
  const probe = readSource("scripts/check-editor-perf.mjs")
  check("the editor probe measures one node added and taken away, and how many elements the style pass after it restyled",
    /insert one node/.test(probe) && /host\.appendChild\(d\)/.test(probe) && /e\.name === "UpdateLayoutTree"/.test(probe) && /elementsMedian/.test(probe))
  check("and can be run against another stylesheet to compare", /process\.env\.STYLESHEET/.test(probe))
}

function section(name: string) {
  console.log(`\n${name}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
