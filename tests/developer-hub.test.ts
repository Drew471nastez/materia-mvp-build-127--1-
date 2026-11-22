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
import { CAPABILITY_DOCS, DIRECTIVE_NAMES, FILTER_DOCS, LIMIT_DOCS, THEME_TOKEN_DOCS, expandAll, expandDirective, themeTokenLeaves } from "@/lib/developers/directives"
import { highlight } from "@/lib/developers/highlight"
import { llmsTxt } from "@/lib/developers/llms"
import { parseMarkdown, titleOf, type DocNode } from "@/lib/developers/markdown"
import { DEV_GROUPS, DEV_PAGES, devPagesIn, devPath } from "@/lib/developers/pages"
import { hubText, pageText } from "@/lib/developers/render-text"
import { RESERVED_ROOT_SEGMENTS } from "@/lib/routes/reserved-segments"
import { compileSection } from "@/lib/storelib-theme"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"
import { FILTER_NAMES, FOREIGN_SYNTAX, FORBIDDEN_MARKUP } from "@/lib/storelib-theme/storelib/template"
import { LIMITS } from "@/lib/storelib-theme/types"
import { CONTROL_TYPES } from "@/lib/storelib-theme/controls/registry"
import { CONTROL_DESCRIPTIONS, THEME_SETTING_DOCS, themeSettingGroups, themeSettingIds } from "@/lib/developers/builder-reference"
import { THEME_INSTALL_LIMIT } from "@/lib/website-builder/theme-registry"
import { MAX_SHOP_PRODUCTS } from "@/lib/website-builder/shop-products"
import { IMPORT_MAX_BYTES } from "@/lib/website-builder/theme-import"
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

  console.log("\nSection scripts run, in the sandbox, and everything says so")

  /*
    This used to be the check that had to fail on purpose one day: the claim
    that section scripts do not run. That day was 23 September 2026. What it
    pins now is the opposite claim, and the one thing that makes it safe:
    the script runs in the sandbox frame and never in this document.
  */
  const host = read("components/website-builder/sections/StorelibSection.tsx")
  const hostCode = host.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
  check("the section hands its script to the sandbox",
    /useSectionScript\(/.test(host) && /bundle: script/.test(host))
  check("and never runs it in the page itself",
    !/new Function|\beval\(|createElement\(["']script/.test(hostCode))
  const sandbox = read("components/website-builder/sections/section-sandbox.tsx")
  check("the frame is sandboxed with allow-scripts and nothing else",
    /sandbox="allow-scripts"/.test(sandbox) && !/allow-same-origin/.test(sandbox.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("and everything that describes a script says it runs",
    /runs in a sandbox/.test(CORE_FORMAT)
      && ALL_TOPICS.some((t) => t.id === "script" && /RUNS IN A SANDBOX/.test(t.text))
      && /## Status: scripts run, in a sandbox/.test(DEVELOPER_DOCS.javascript ?? "")
      && !/not run yet|NOT RUN on the page yet|DOES NOT RUN ON THE PAGE YET/.test(
        [CORE_FORMAT, ...ALL_TOPICS.map((t) => t.text), read("lib/storelib-theme/storelib/template.ts"), DEVELOPER_DOCS.ai ?? "", DEVELOPER_DOCS.sections ?? ""].join("\n"),
      ))
  check("and says what it cannot do",
    /Adding or removing elements/.test(DEVELOPER_DOCS.javascript ?? "") && /cannot add or remove elements/.test(ALL_TOPICS.find((t) => t.id === "script")?.text ?? ""))
  check("the compiler names both ways to handle a click, HTML first",
    FOREIGN_SYNTAX.some(([re, m]) => re.test(' @click="x"') && /<details>/.test(m) && /addEventListener/.test(m))
      && FORBIDDEN_MARKUP.some(([re, m]) => re.test(' onclick="x"') && /<script> block/.test(m)))

  console.log("\nIt can be found, by people and by agents")

  check("developers, llms.txt and llms-full.txt are not usernames anyone can take",
    ["developers", "llms.txt", "llms-full.txt"].every((w) => RESERVED_ROOT_SEGMENTS.includes(w)),
    "a creator called developers would have their page shadowed for ever")
  check("every page is in the sitemap, from the same list",
    /DEV_PAGES\.map\(\(p\) => \(\{\s*\n\s*url: `\$\{BASE\}\$\{devPath\(p\.slug\)\}`/.test(read("lib/seo/sitemaps.ts")))
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
      && /!isFaqRoute && !isDevelopersRoute && (!isReadRoute && )?!isSellerOrProductPage/.test(read("components/platform/platform-header-client.tsx")))
  check("and a link to it in every page's footer", /\{ label: "Developers", href: "\/developers" \}/.test(read("components/marketing/footer.tsx")))

  const hub = read("components/developers/hub-page.tsx")
  check("each page has its own title, description and canonical address",
    /title: \{ absolute: title \}/.test(hub) && /alternates: \{ canonical: path \}/.test(hub))
  check("and structured data saying what it is and where it sits",
    /"@type": "TechArticle"/.test(hub) && /"@type": "BreadcrumbList"/.test(hub)
      && /__html: jsonLdScript\(data\)/.test(hub) && /from "@\/lib\/seo\/json-ld"/.test(hub),
    "`<` escaped so nothing in the data can close the script element")
  check("the side columns stick below the site header, not behind it",
    (hub.match(/sticky top-\[92px\]/g) ?? []).length === 2)
  check("a page the hub does not have is a 404, not a creator's page",
    /export const dynamicParams = false/.test(read("app/(storelib)/(marketing)/developers/[slug]/page.tsx")))
  check("and no page of it renders markdown as HTML",
    !/dangerouslySetInnerHTML/.test(read("components/developers/doc-content.tsx"))
      && !/dangerouslySetInnerHTML/.test(read("components/developers/inline.tsx"))
      && !/dangerouslySetInnerHTML/.test(read("components/developers/code-block.tsx")))

  console.log("\nThe builder guide shows every setting")

  const guideSrc = DEVELOPER_DOCS["website-builder"] ?? ""
  check("the guide is a page of the hub", DEV_PAGES.some((p) => p.slug === "website-builder") && guideSrc.length > 4000)
  const described = new Set(Object.keys(THEME_SETTING_DOCS))
  const undescribed = themeSettingIds().filter((id) => !described.has(id))
  check("every theme setting has words for what it does", undescribed.length === 0, undescribed.join(", "))
  const stale = [...described].filter((id) => !themeSettingIds().includes(id))
  check("and none describes a setting that no longer exists", stale.length === 0, stale.join(", "))
  const groupsShown = themeSettingGroups().map((g) => g.id)
  const groupsMissing = groupsShown.filter((g) => !guideSrc.includes(`@[theme-settings:${g}]`))
  check("every group of General Settings is drawn on the guide", groupsMissing.length === 0, groupsMissing.join(", "))
  const guide = expandAll(parseMarkdown(guideSrc))
  const drawn = guide.flatMap((n) => (n.kind === "specimens" ? n.items.map((it) => it.id) : []))
  check("every control type is drawn", CONTROL_TYPES.every((t) => drawn.includes(t)))
  check("every theme setting is drawn", themeSettingIds().every((id) => drawn.includes(id)))
  check("and every built-in colour scheme", guide.some((n) => n.kind === "schemes" && n.schemes.length === 5))
  check("a select's default is drawn as the option it names, not the stored value",
    themeSettingGroups().flatMap((g) => g.items).find((it) => it.id === "popup_shadow")?.value === "Medium")
  check("the drawings are pictures, not controls: hidden from a screen reader and untouchable",
    /aria-hidden="true" className="pointer-events-none select-none/.test(read("components/developers/specimens.tsx"))
      && !/<input|<button|<select/.test(read("components/developers/specimens.tsx")))
  const guideText = pageText("website-builder")
  check("and /llms-full.txt carries the same settings as a table", /\| Default style \(`button_style`\) \| radio/.test(guideText))
  check("the guide's copy has no em dash", !/\u2014/.test(guideSrc))

  console.log("\nThe map of the hub, and the numbers its pages state")

  check("every category has pages", DEV_GROUPS.every((g) => devPagesIn(g).length > 0))
  const front = pageText("")
  const unmapped = DEV_PAGES.filter((p) => p.slug && !front.includes(`[${p.nav}](https://storelib.com${devPath(p.slug)}): ${p.summary}`))
  check("the front page's map lists every page, under its category, with its line",
    unmapped.length === 0 && DEV_GROUPS.every((g) => front.includes(`## ${g}`)),
    unmapped.map((p) => p.slug).join(", "))
  check("and every line is one short line", DEV_PAGES.every((p) => p.summary.length > 0 && p.summary.length <= 80))

  const firstCode = parseMarkdown(DEVELOPER_DOCS[""] ?? "").find((n) => n.kind === "code" && n.lang === "storelib")
  const firstSrc = firstCode && firstCode.kind === "code" ? firstCode.code : ""
  const firstType = firstSrc.match(/"type": "([a-z0-9_]+)"/)?.[1] ?? ""
  const first = compileSection(firstSrc, { file: `sections/${firstType}.storelib`, expectType: firstType } as never)
  check("the section the front page walks through compiles, with no warnings",
    !!firstType && first.ok === true && ((first as { warnings?: unknown[] }).warnings ?? []).length === 0,
    first.ok === false ? first.errors.map((e) => `${e.line}: ${e.message}`).join(" | ") : undefined)
  check("and passes the checks the builder applies to AI-written sections", qualityErrors(checkSectionQuality(firstSrc)).length === 0)

  const tokens = themeTokenLeaves().map(([path]) => path)
  check("every theme value a template can read is described, and nothing else",
    same(Object.keys(THEME_TOKEN_DOCS), tokens),
    `engine: ${tokens.join(", ")}`)
  check("the hub's own words for a control are for controls that exist",
    Object.keys(CONTROL_DESCRIPTIONS).every((t) => (CONTROL_TYPES as readonly string[]).includes(t)))
  const settingIndex = expandDirective("theme-setting-index")[0]
  check("every group of theme settings says what it holds",
    settingIndex?.kind === "table" && settingIndex.rows.every((r) => (r[1] ?? "").trim() !== ""))

  const themes = pageText("themes")
  const publishing = pageText("publishing")
  const sharing = pageText("sharing-themes")
  check("the library holds as many websites as the registry allows",
    THEME_INSTALL_LIMIT === 7 && themes.includes("up to seven websites: **one live and six drafts**")
      && publishing.includes("| Websites in the library | 7: one live and six drafts |") && sharing.includes("It holds seven: one live and six drafts."),
    `the registry allows ${THEME_INSTALL_LIMIT}`)
  const backups = Number(read("lib/website-builder/backups.ts").match(/export const BACKUPS_TO_KEEP = (\d+)/)?.[1])
  check("as many backups are kept as the page says", backups > 0 && publishing.includes(`| Backups kept for each website | The newest ${backups} |`), `${backups}`)
  check("a template reads as many products as the page says",
    publishing.includes(`| Products a template can read | ${MAX_SHOP_PRODUCTS} on the live site |`)
      && pageText("selling").includes(`up to ${MAX_SHOP_PRODUCTS} on the live site`)
      && pageText("pages").includes(`newest ${MAX_SHOP_PRODUCTS} published products`))
  const mb = (n: number) => n / (1024 * 1024)
  check("an import is refused at the sizes the page gives",
    sharing.includes(`The file is a zip, and ${mb(IMPORT_MAX_BYTES)} MB or less.`)
      && sharing.includes(`It holds ${LIMITS.filesPerPackage} files or fewer.`)
      && sharing.includes(`each text file is ${LIMITS.sourceBytes / 1024} KB or less, each asset ${mb(LIMITS.assetBytes)} MB or less, and the whole ${mb(LIMITS.packageBytes * 4)} MB or less`)
      && /const MAX_UNPACKED_BYTES = LIMITS\.packageBytes \* 4/.test(read("lib/storelib-theme/package.ts")))

  const bar = read("components/developers/hub-page.tsx")
  check("a phone gets the page list and the outline in a bar under the header",
    /data-hub-bar/.test(bar) && /data-hub-menu="pages"/.test(bar) && /data-hub-menu="outline"/.test(bar) && /<HubMenus \/>/.test(bar))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
