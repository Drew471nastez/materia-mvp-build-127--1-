/**
 * ===========================================================================
 *  THE STORELIB DEVELOPER HUB SAYS WHAT IS TRUE, AND KEEPS SAYING IT
 * ===========================================================================
 * Documentation rots in a particular way: nobody changes it, and the thing it
 * describes moves. The first survey for this hub found docs/theme already
 * wrong in two places. So each promise the hub makes is checked here against
 * the code that keeps it:
 *
 *   the bundle is the markdown      the generated module is what the emitter
 *                                   would write from content/developers
 *   the reference is the engine     every filter, capability and limit the
 *                                   engine has is described, and nothing else
 *   the examples work               each one compiles with no warnings and
 *                                   passes the checks AI output must pass
 *   the links go somewhere          every /developers link lands on a page,
 *                                   and every #anchor on a heading
 *   the scripts claim is current    the hub says section scripts do not run;
 *                                   the moment something runs them, this
 *                                   fails and says what to update
 *   it can be found                 reserved from usernames, in the sitemap,
 *                                   in llms.txt, with a header and a footer
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { developerDocsModule } from "../scripts/emit-developer-docs"
import { DEVELOPER_DOCS, DEVELOPER_EXAMPLES } from "@/lib/developers/content.generated"
import { CAPABILITY_DOCS, DIRECTIVE_NAMES, FILTER_DOCS, LIMIT_DOCS, expandAll } from "@/lib/developers/directives"
import { highlight } from "@/lib/developers/highlight"
import { llmsTxt } from "@/lib/developers/llms"
import { parseMarkdown, titleOf, type DocNode } from "@/lib/developers/markdown"
import { DEV_PAGES, devPath } from "@/lib/developers/pages"
import { hubText, pageText } from "@/lib/developers/render-text"
import { RESERVED_ROOT_SEGMENTS } from "@/lib/routes/reserved-segments"
import { compileSection } from "@/lib/storelib-theme"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"
import { FILTER_NAMES, FOREIGN_SYNTAX, FORBIDDEN_MARKUP } from "@/lib/storelib-theme/storelib/template"
import { LIMITS } from "@/lib/storelib-theme/types"
import { ALL_TOPICS, CORE_FORMAT, checkSectionQuality, qualityErrors, writeSectionRules } from "@/lib/storelib-ai"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

/** Every piece of prose on a page, without code, which is where copy rules apply. */
function prose(nodes: DocNode[]): string {
  const out: string[] = []
  for (const n of nodes) {
    if (n.kind === "paragraph" || n.kind === "quote" || n.kind === "heading") out.push(n.text)
    if (n.kind === "list") out.push(...n.items)
    if (n.kind === "table") out.push(...n.head, ...n.rows.flat())
    if (n.kind === "details") out.push(n.summary, prose(n.children))
  }
  return out.join("\n").replace(/`[^`]*`/g, " ")
}

function main() {
  console.log("\nThe bundle is the markdown")

  check("lib/developers/content.generated.ts is what scripts/emit-developer-docs.ts would write",
    read("lib/developers/content.generated.ts") === developerDocsModule(),
    "edit content/developers, then regenerate; the pages read the bundle, never the files")

  const onDisk = readdirSync(join(process.cwd(), "content/developers")).filter((f) => f.endsWith(".md")).map((f) => (f === "index.md" ? "" : f.slice(0, -3)))
  check("every page in the list has words, and every file of words is in the list",
    same(onDisk, DEV_PAGES.map((p) => p.slug)),
    `files: ${onDisk.join(", ")}`)

  for (const p of DEV_PAGES) {
    const nodes = parseMarkdown(DEVELOPER_DOCS[p.slug] ?? "")
    check(`${devPath(p.slug)} is headed with its own title`, titleOf(nodes) === p.title, `${titleOf(nodes)} vs ${p.title}`)
  }

  console.log("\nThe reference tables are the engine, and every name in it is described")

  check("every filter the template language has is described, and no filter it does not have",
    same(Object.keys(FILTER_DOCS), [...FILTER_NAMES]),
    "a filter added to template.ts needs a line in FILTER_DOCS")
  check("every capability is described", same(Object.keys(CAPABILITY_DOCS), [...CAPABILITIES]))
  check("every limit is described", same(Object.keys(LIMIT_DOCS), Object.keys(LIMITS)))

  let unknown = 0
  let broken = 0
  for (const p of DEV_PAGES) {
    const nodes = parseMarkdown(DEVELOPER_DOCS[p.slug] ?? "")
    for (const n of nodes) if (n.kind === "directive" && !(DIRECTIVE_NAMES as readonly string[]).includes(n.name)) unknown++
    const text = pageText(p.slug)
    if (/Unknown directive|Missing example/.test(text)) broken++
  }
  check("every generated table a page asks for exists", unknown === 0, `${unknown} unknown`)
  check("and every one of them filled in", broken === 0, `${broken} pages with an empty one`)

  const refusals = pageText("sections")
  check("the list of what the compiler refuses is the compiler's own",
    FORBIDDEN_MARKUP.every(([, m]) => refusals.toLowerCase().includes(m.trim().toLowerCase().replace(/[.;]$/, "").slice(0, 40)))
      && FOREIGN_SYNTAX.length > 0 && /`v-if`/.test(refusals))

  console.log("\nThe examples are sections that work")

  const exampleFiles = readdirSync(join(process.cwd(), "content/developers/examples")).filter((f) => f.endsWith(".storelib"))
  check("there are examples, and the examples page shows every one",
    exampleFiles.length >= 6 && exampleFiles.every((f) => (DEVELOPER_DOCS.examples ?? "").includes(`@[example:${f.replace(/\.storelib$/, "")}]`)))
  for (const [type, src] of Object.entries(DEVELOPER_EXAMPLES)) {
    const r = compileSection(src, { file: `sections/${type}.storelib`, expectType: type } as never)
    const warnings = r.ok ? ((r as { warnings?: unknown[] }).warnings ?? []) : []
    check(`${type} compiles, with no warnings`,
      r.ok === true && warnings.length === 0,
      r.ok === false ? r.errors.map((e) => `${e.line}: ${e.message}`).join(" | ") : `${warnings.length} warnings`)
    check(`${type} passes the checks the builder applies to AI-written sections`,
      qualityErrors(checkSectionQuality(src)).length === 0)
    check(`${type} is highlighted without changing a character`,
      highlight(src, "storelib").map((t) => t.text).join("") === src,
      "the Copy button copies the source; the highlighter must not be what differs")
  }

  console.log("\nEvery link lands, and every anchor lands on a heading")

  const anchors = new Map<string, Set<string>>()
  for (const p of DEV_PAGES) {
    const ids = new Set<string>()
    for (const n of parseMarkdown(DEVELOPER_DOCS[p.slug] ?? "")) if (n.kind === "heading") ids.add(n.id)
    anchors.set(devPath(p.slug), ids)
  }
  const dead: string[] = []
  for (const p of DEV_PAGES) {
    for (const m of (DEVELOPER_DOCS[p.slug] ?? "").matchAll(/\]\((\/developers[^)#\s]*)(#[^)\s]+)?\)/g)) {
      const path = m[1].replace(/\/$/, "")
      const ids = anchors.get(path)
      if (!ids) dead.push(`${devPath(p.slug)} → ${path}`)
      else if (m[2] && !ids.has(m[2].slice(1))) dead.push(`${devPath(p.slug)} → ${path}${m[2]}`)
    }
  }
  check("no link on any page goes nowhere", dead.length === 0, dead.join(", "))

  console.log("\nIt is written the way Storelib writes")

  const slop = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transformative|game[- ]changer|revolutioni[sz]e)\b/i
  for (const p of DEV_PAGES) {
    const words = prose(expandAll(parseMarkdown(DEVELOPER_DOCS[p.slug] ?? "")))
    check(`${devPath(p.slug)} has no em or en dashes`, !/[—–]/.test(pageText(p.slug)))
    const hit = words.match(slop)
    check(`${devPath(p.slug)} has none of the words the house rules ban`, !hit, hit?.[0])
  }

  console.log("\nThe AI page shows exactly what the builder's AI is told")

  check("the brief on /developers/ai is writeSectionRules(), not a copy of it",
    /case "ai-brief":[\s\S]{0,300}writeSectionRules\(\)/.test(read("lib/developers/directives.ts"))
      && pageText("ai").includes(writeSectionRules().slice(0, 400)))
  check("and every other topic the AI can be given is listed after it",
    ALL_TOPICS.filter((t) => !writeSectionRules().includes(t.text)).every((t) => pageText("ai").includes(t.text.slice(0, 120))))
  check("the AI is taught that an email box collects for the creator",
    ALL_TOPICS.some((t) => t.id === "forms" && /data-storelib-form="subscribe"/.test(t.text))
      && writeSectionRules().includes('data-storelib-form="subscribe"'),
    "every new section the builder's AI writes carries this rule")
  check("and how to embed a player, which the old reference never said",
    ALL_TOPICS.some((t) => t.id === "embed" && /\| embed/.test(t.text) && /"embed"/.test(t.text)))

  console.log("\nThe claim that section scripts do not run is still true")

  /*
    THIS IS THE ONE THAT MUST FAIL ON PURPOSE ONE DAY. The hub, the AI's brief
    and the compiler's own error messages all say section scripts are checked
    and not run, because StorelibSection draws the html and the css and
    nothing else. When the sandbox ships and something starts executing
    `script`, this fails, and the message says everything that has to change
    with it.
  */
  const host = read("components/website-builder/sections/StorelibSection.tsx")
  check("nothing on the page executes a section's script",
    !/out\.script|\.script\b.*(new Function|eval|createElement\(["']script)/.test(host) && !/new Function|<script/.test(host.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")),
    "section scripts run now: update the script topic in lib/storelib-ai/knowledge.ts, NO_SCRIPT_YET in template.ts, content/developers/javascript.md, ai.md, and this check")
  check("and everything that says so, says so",
    /NOT RUN on the page yet/.test(CORE_FORMAT)
      && ALL_TOPICS.some((t) => t.id === "script" && /DOES NOT RUN ON THE PAGE YET/.test(t.text))
      && /Section scripts are not run yet/.test(read("lib/storelib-theme/storelib/template.ts"))
      && /## Status: scripts are checked, not run/.test(DEVELOPER_DOCS.javascript ?? ""))
  check("the compiler no longer tells anyone to write a click handler in a script block",
    !FOREIGN_SYNTAX.some(([, m]) => /receives the section's own root/.test(m))
      && !FORBIDDEN_MARKUP.some(([, m]) => /put behaviour in the section's own <script> block/.test(m)))

  console.log("\nIt can be found, by people and by agents")

  check("developers, llms.txt and llms-full.txt are not usernames anyone can take",
    ["developers", "llms.txt", "llms-full.txt"].every((w) => RESERVED_ROOT_SEGMENTS.includes(w)),
    "a creator called developers would have their page shadowed for ever")
  check("every page is in the sitemap, from the same list",
    /DEV_PAGES\.map\(\(p\) => \(\{\s*\n\s*url: `\$\{BASE\}\$\{devPath\(p\.slug\)\}`/.test(read("app/sitemap.ts")))
  const map = llmsTxt()
  check("llms.txt opens with a title and a one-paragraph summary, as the format asks",
    /^# Storelib Developer Hub\n\n> /.test(map))
  check("and lists every page, with its description",
    DEV_PAGES.every((p) => map.includes(`](https://storelib.com${devPath(p.slug)}): ${p.description}`)))
  check("and points at the full text", /https:\/\/storelib\.com\/llms-full\.txt/.test(map))
  const full = hubText()
  check("llms-full.txt carries every page", DEV_PAGES.every((p) => full.includes(`# ${p.title}`)))
  check("with every link made absolute, since a file has no page to resolve against",
    !/\]\(\/developers/.test(full))
  check("the site header is drawn on the hub", /p\.startsWith\("\/developers"\)/.test(read("components/marketing/conditional-header.tsx")),
    "the header only shows on paths in its list; without this the hub had none")
  check("and the footer", /pathname\.startsWith\("\/developers"\)/.test(read("components/marketing/conditional-footer.tsx")))
  check("with the blog's header, not the marketplace search strip laid over the page on a phone",
    /isDevelopersRoute = pathname === "\/developers" \|\| pathname\.startsWith\("\/developers\/"\)/.test(read("components/platform/platform-header-client.tsx"))
      && /!isFaqRoute && !isDevelopersRoute && !isSellerOrProductPage/.test(read("components/platform/platform-header-client.tsx")))
  check("and a link to it in every page's footer", /<Link href="\/developers"/.test(read("components/marketing/footer.tsx")))

  const hub = read("components/developers/hub-page.tsx")
  check("each page has its own title, description and canonical address",
    /title: \{ absolute: title \}/.test(hub) && /alternates: \{ canonical: path \}/.test(hub))
  check("and structured data saying what it is and where it sits",
    /"@type": "TechArticle"/.test(hub) && /"@type": "BreadcrumbList"/.test(hub)
      && /JSON\.stringify\(data\)\.replace\(\/<\/g, "\\\\u003c"\)/.test(hub),
    "`<` escaped so nothing in the data can close the script element")
  check("the side columns stick below the site header, not behind it",
    (hub.match(/sticky top-\[92px\]/g) ?? []).length === 2)
  check("a page the hub does not have is a 404, not a creator's page",
    /export const dynamicParams = false/.test(read("app/(marketing)/developers/[slug]/page.tsx")))
  check("and no page of it renders markdown as HTML",
    !/dangerouslySetInnerHTML/.test(read("components/developers/doc-content.tsx"))
      && !/dangerouslySetInnerHTML/.test(read("components/developers/inline.tsx"))
      && !/dangerouslySetInnerHTML/.test(read("components/developers/code-block.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
