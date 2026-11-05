/**
 * ===========================================================================
 *  HEADER, PAGE, FOOTER: SECTION GROUPS, ONE HEADER, AND A THEME THAT TRAVELS
 * ===========================================================================
 * The owner's report (screenshot 76): after importing a theme the sidebar
 * showed the built-in "Header" in the Header group and an AI written
 * header named after the site in the Page group, and the site drew two. What
 * Shopify's section groups do instead, run rather than read:
 *
 *   lib/storelib-theme/section-groups.ts   where a section may go, one header
 *   lib/website-builder/universal-chrome.ts the groups on every page
 *   lib/website-builder/theme-pages.ts      the header once in a package
 *   lib/storelib-theme/package.ts           a header section file is kept
 *   components/.../ThemePage.tsx            the Header group drawn first
 *   components/.../sections-list.tsx        the sidebar's three groups
 *   lib/website-builder/library-limit.ts    an import goes first
 *
 * The fixture is the owner's own export of the Luca site (tests/fixtures/
 * luca-theme, a trimmed copy: its home and about pages and the sections they
 * use), with the header section file the screenshot shows added to it.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  groupOf,
  kindLookup,
  kindOf,
  placeSection,
  repairChrome,
  sectionGroupsFor,
  splitGroups,
  toggleShown,
  visibleOfKind,
  type KindOfType,
} from "@/lib/storelib-theme/section-groups"
import { buildPackage, readPackage } from "@/lib/storelib-theme"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { applyUniversalChrome, chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { FOOTER_GROUP_PATH, HEADER_GROUP_PATH, packageFilesFromPages, pagesFromPackageFiles } from "@/lib/website-builder/theme-pages"
import { sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { sortOrderBefore } from "@/lib/website-builder/library-limit"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 400)})` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
/** Equal as data: the same keys and values at every depth, whatever order the keys were written in. */
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

const FIXTURE = "tests/fixtures/luca-theme"

/** The fixture's files, as a package holds them. */
function fixtureFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name
      if (name.isDirectory()) walk(join(dir, name.name), rel)
      else files[rel] = read(join(dir, name.name))
    }
  }
  walk(FIXTURE, "")
  return files
}

/** A header written as a section file, as an AI writes one: a real, compiling file named for the site and then Header, as the screenshot shows. */
function lucaHeaderFile(kind?: "header"): string {
  const src = DEFAULT_THEME_SOURCES["sections/cta_simple.storelib"]
  return src
    .replace(/"type":\s*"cta_simple"/, `"type": "luca_header"${kind ? `, "kind": "${kind}"` : ""}`)
    .replace(/"name":\s*"[^"]*"/, `"name": "Luca — Header"`)
}

const visibleHeaders = (list: SectionInstance[], kinds: KindOfType) =>
  list.filter((s) => !s.hidden && groupOf(s) === "header" && (s.type === "header" || kinds(s.type) === "header"))

async function main() {
  const builtInKinds = kindLookup(DEFAULT_THEME_SOURCES, SECTION_SCHEMAS as never)

  console.log("\nWhere each section may go")
  const groupsOf = (type: string) => sectionGroupsFor(SECTION_SCHEMAS[type] as never, { type, kind: builtInKinds(type) })
  check("the header is the Header group's, the footer the Footer group's", same(groupsOf("header"), ["header"]) && same(groupsOf("footer"), ["footer"]))
  /* Changed on purpose (round BB): an announcement bar goes where it was added, the Header group first. */
  check("an announcement bar goes in the Header group or on a page, the Header group first", same(groupsOf("announcement_banner"), ["header", "template"]), groupsOf("announcement_banner"))
  check("and so does the library's Announcement / Promo", same(groupsOf("promo_announcement"), ["header", "template"]), groupsOf("promo_announcement"))
  check("a marquee may go on a page or in either group, a page first", same(groupsOf("scrolling_text"), ["template", "header", "footer"]))
  check("a newsletter on a page or above the footer", same(groupsOf("newsletter"), ["template", "footer"]))
  check("back to top, the phone tab bar and a popup go in the Overlay group only", ["back_to_top", "mobile_bottom_bar", "popup"].every((t) => same(groupsOf(t), ["overlay"])))
  const pageOnly = ADDABLE_SECTIONS.filter((t) => !["announcement_banner", "promo_announcement", "back_to_top", "mobile_bottom_bar", "popup"].includes(t)).filter((t) => groupsOf(t)[0] !== "template")
  check("every other built-in section goes on a page first", pageOnly.length === 0, pageOnly)
  const kinds = ADDABLE_SECTIONS.filter((t) => builtInKinds(t) !== null)
  check("and none of them is a header or a footer", kinds.length === 0, kinds)
  check("Shopify's enabled_on groups keeps a section in its group", same(sectionGroupsFor({ name: "Bar", enabled_on: { groups: ["header"] } }), ["header"]))
  check("enabled_on naming the template group allows a page too", same(sectionGroupsFor({ name: "Bar", enabled_on: { groups: ["footer", "template"] } }), ["footer", "template"]))
  check("the schema's own rule is the one read (schema/normalise.ts, sectionGroupsOf)", /sectionGroupsOf\(s\)/.test(read("lib/storelib-theme/section-groups.ts")))
  check("disabled_on header and footer keeps it on pages", same(sectionGroupsFor({ name: "Grid", disabled_on: { groups: ["header", "footer"] } }), ["template"]))
  check("kind header is the header", same(sectionGroupsFor({ name: "Brand", kind: "header" }), ["header"]))
  check("a category of announcement is inferred, and may go on a page too", same(sectionGroupsFor({ name: "Notice", category: "announcement" }), ["header", "template"]))
  check("a coded announcement bar may go on a page too", same(sectionGroupsFor({ name: "Announcement bar" }), ["header", "template"]))
  check("a section kept in the Header group by enabled_on stays there", same(sectionGroupsFor({ name: "Announcement bar", enabled_on: { groups: ["header"] } }), ["header"]))
  check("\"Luca — Header\" is a header by its name", kindOf({ name: "Luca — Header" }) === "header")
  check("\"Luca — Hero + proof bar\" is not", kindOf({ name: "Luca — Hero + proof bar" }) === null)
  check("a group alone is a place, not a kind: an announcement bar is not the header", kindOf({ name: "Promo", enabled_on: { groups: ["header"] } }) === null)
  check("kind wins over a name", kindOf({ name: "Header strip", kind: "section" }) === null)

  console.log("\nAdding one puts it where it belongs")
  const header: SectionInstance = { id: "h", type: "header", name: "Header", settings: { logo_text: "Luca" }, blocks: [{ id: "n1", type: "nav_link", settings: { label: "Home", url: "/" } }] }
  const footer: SectionInstance = { id: "f", type: "footer", name: "Footer", settings: { tagline: "x" } }
  const hero: SectionInstance = { id: "hero", type: "hero", name: "Hero", settings: {} }
  const faq: SectionInstance = { id: "faq", type: "faq", name: "FAQ", settings: {} }
  const page = [header, hero, faq, footer]
  const ann: SectionInstance = { id: "ann", type: "announcement_banner", name: "Announcement Banner", settings: { heading: "Sale" } }
  const onPage = placeSection(page, ann, { groups: groupsOf("announcement_banner"), group: "template", at: 1, kindOfType: builtInKinds })
  check("an announcement bar added between two page sections stays on the page", onPage.group === "template" && onPage.sections.find((s) => s.id === "ann")?.group !== "header")
  check("  in the gap it was added to", same(onPage.sections.map((s) => s.id), ["h", "hero", "ann", "faq", "f"]), onPage.sections.map((s) => s.id))
  const fromPage = placeSection(page, ann, { groups: groupsOf("announcement_banner"), group: "header", kindOfType: builtInKinds })
  check("an announcement bar added from the Header group lands in the Header group", fromPage.group === "header" && fromPage.sections.find((s) => s.id === "ann")?.group === "header")
  check("above the header, the page untouched", same(fromPage.sections.map((s) => s.id), ["ann", "h", "hero", "faq", "f"]), fromPage.sections.map((s) => s.id))
  const atGap = placeSection(page, { ...faq, id: "faq2" }, { groups: groupsOf("faq"), group: "template", at: 1, kindOfType: builtInKinds })
  check("a page section still lands in the gap it was added to", same(atGap.sections.map((s) => s.id), ["h", "hero", "faq2", "faq", "f"]), atGap.sections.map((s) => s.id))
  const news = placeSection(page, { id: "nl", type: "newsletter", name: "Newsletter", settings: {} }, { groups: groupsOf("newsletter"), group: "footer", kindOfType: builtInKinds })
  check("a newsletter added from the Footer group goes above the footer", same(news.sections.map((s) => s.id), ["h", "hero", "faq", "nl", "f"]) && news.sections[3].group === "footer")

  const codedKinds: KindOfType = (t) => (t === "luca_header" ? "header" : builtInKinds(t))
  const coded: SectionInstance = { id: "lh", type: "luca_header", name: "Luca — Header", settings: { heading: "Luca" } }
  check("a header chosen while one is drawn asks first: there is one to replace", visibleOfKind(page, "header", codedKinds)?.id === "h")
  const replaced = placeSection(fromPage.sections, coded, { groups: ["header"], kind: "header", group: "template", kindOfType: codedKinds })
  check("a header of kind header replaces the header, from wherever it was added", replaced.group === "header" && same(replaced.replaced, ["h"]))
  check("in its place, under the announcement bar", same(replaced.sections.map((s) => s.id), ["ann", "lh", "h", "hero", "faq", "f"]), replaced.sections.map((s) => s.id))
  check("one header drawn", visibleHeaders(replaced.sections, codedKinds).map((s) => s.id).join() === "lh")
  const old = replaced.sections.find((s) => s.id === "h")!
  check("the old one is hidden with every setting and block kept", old.hidden === true && same(old.settings, header.settings) && same(old.blocks, header.blocks))
  const back = toggleShown(replaced.sections, "h", codedKinds)
  check("showing the old one hides the new one: still one header", visibleHeaders(back, codedKinds).map((s) => s.id).join() === "h" && back.find((s) => s.id === "lh")?.hidden === true)
  const hidePlain = toggleShown(back, "ann", codedKinds)
  check("hiding an announcement bar touches nothing else", hidePlain.find((s) => s.id === "ann")?.hidden === true && visibleHeaders(hidePlain, codedKinds).length === 1)

  console.log("\nA saved site with two headers is opened with one, and nothing is lost")
  /* The Luca site as it was saved: the built-in header, and the AI's header on the page under it. */
  const saved: SectionInstance[] = [header, coded, hero, faq, footer]
  const fixed = repairChrome(saved, codedKinds)
  check("it changed", fixed.changed)
  check("the coded header moved from the Page group into the Header group", same(fixed.moved, ["lh"]) && groupOf(fixed.sections.find((s) => s.id === "lh")!) === "header")
  check("the creator's own header is kept, because their work is in it", fixed.kept.header === "lh" && same(fixed.hidden, ["h"]))
  check("one header is drawn", visibleHeaders(fixed.sections, codedKinds).length === 1)
  const keptBuiltIn = fixed.sections.find((s) => s.id === "h")!
  check("the built-in header is still there, hidden, settings and blocks intact", keptBuiltIn.hidden === true && same(keptBuiltIn.settings, header.settings) && same(keptBuiltIn.blocks, header.blocks))
  check("no section was removed", fixed.sections.length === saved.length && saved.every((s) => fixed.sections.some((x) => x.id === s.id)))
  check("and the page sections keep their order", same(splitGroups(fixed.sections).template.map((s) => s.id), ["hero", "faq"]))
  check("running it again changes nothing", repairChrome(fixed.sections, codedKinds).changed === false)
  const emptyCoded = repairChrome([header, { ...coded, settings: {} }, hero, footer], codedKinds)
  check("a coded header with nothing in it loses to the built-in", emptyCoded.kept.header === "h" && same(emptyCoded.hidden, ["lh"]))
  const twoBuiltIn = repairChrome([header, { ...header, id: "h2" }, hero, footer, { ...footer, id: "f2" }], codedKinds)
  check("two built-in headers and two footers: the first of each is drawn", twoBuiltIn.kept.header === "h" && twoBuiltIn.kept.footer === "f" && same(twoBuiltIn.hidden.sort(), ["f2", "h2"]))
  const deliberate = repairChrome([{ ...header, hidden: true }, hero, footer], codedKinds)
  check("a header hidden on purpose stays hidden and is not 'repaired'", deliberate.changed === false)

  const about: SectionInstance[] = [{ ...header, id: "stale", settings: { logo_text: "Old" } }, { id: "split", type: "split_content", name: "Split", settings: {} }, footer]
  const site = applyUniversalChrome({ home: saved, about }, "home", codedKinds)
  check("the published site draws home's Header group on every page", same(site.about.map((s) => s.id), ["h", "lh", "split", "f"]), site.about.map((s) => s.id))
  check("with one header drawn there too", visibleHeaders(site.about, codedKinds).map((s) => s.id).join() === "lh")
  check("the published site applies the repair with the site's own files", /applyUniversalChrome\(pages, "home", kindLookup\(sources/.test(read("lib/website-builder/published-site.ts")))
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor repairs an open page once its files are known, and saves it", /const fixed = repairChrome\(sections, kindOfType\)/.test(editor) && /setIsDirty\(true\)/.test(editor.slice(editor.indexOf("const fixed = repairChrome"), editor.indexOf("const fixed = repairChrome") + 400)))
  check("the editor no longer puts the built-in header back on a page that has sections", /const empty = loaded\.length === 0/.test(editor) && !/if \(!loaded\.some\(s => s\.type === "header"\)\)/.test(editor))

  console.log("\nThe page draws the Header group first, one header")
  const drawn: string[] = []
  renderToStaticMarkup(createElement(ThemePage, {
    theme: {},
    sections: [...fixed.sections.slice(0, 2), ann, ...fixed.sections.slice(2)].map((s) => (s.id === "ann" ? { ...s, group: "header" as const } : s)),
    renderSection: (s: SectionInstance, role: string) => {
      if (!s.hidden) drawn.push(`${role}:${s.id}`)
      return null
    },
  }))
  check("announcement bar and header as chrome above the page, footer below", same(drawn, ["header:lh", "header:ann", "body:hero", "body:faq", "footer:f"]), drawn)

  console.log("\nThe owner's theme, imported: never two headers")
  const files = fixtureFiles()
  check("the fixture is the export's shape", "theme.json" in files && "templates/home.json" in files && "config/settings.json" in files && Object.keys(files).some((p) => p.startsWith("sections/ld_")))
  const home = JSON.parse(files["templates/home.json"])
  /* What the screenshot shows: the AI's header at the top of the page, under the built-in one. */
  home.sections["luca_header-1"] = { type: "luca_header", name: "Luca — Header", settings: { heading: "Luca Dragoste" } }
  home.order.splice(1, 0, "luca_header-1")
  const pkgFiles = { ...files, "templates/home.json": JSON.stringify(home), "sections/luca_header.storelib": lucaHeaderFile() }
  delete (pkgFiles as Record<string, string>)["theme.json"]
  const theme = JSON.parse(files["theme.json"])
  const bytes = await buildPackage({ theme, files: pkgFiles, assets: {} })
  const pkg = await readPackage(bytes, { knownTypes: Object.keys(SECTION_SCHEMAS) })
  check("the package is read", pkg.ok === true, pkg.ok === false ? pkg.errors.slice(0, 3) : undefined)
  if (pkg.ok === true) {
    check("its header section file is kept, not left out", "sections/luca_header.storelib" in pkg.value.files)
    const kindsOfPkg = kindLookup(pkg.value.files, SECTION_SCHEMAS as never)
    check("and read as a header, by its name", kindsOfPkg("luca_header") === "header")
    const pages = pagesFromPackageFiles(pkg.value.files, kindsOfPkg)
    for (const p of pages) {
      const drawnHeaders = visibleHeaders(p.sections, kindsOfPkg)
      check(`${p.page_key}: one header drawn`, drawnHeaders.length === 1, drawnHeaders.map((s) => s.id))
      check(`${p.page_key}: one footer drawn`, p.sections.filter((s) => !s.hidden && groupOf(s) === "footer").length === 1)
    }
    const homePage = pages.find((p) => p.page_key === "home")!.sections
    check("on home the coded header is the header, in the Header group", homePage.find((s) => s.id === "luca_header-1")?.group === "header" && !homePage.find((s) => s.id === "luca_header-1")?.hidden)
    const builtIn = homePage.find((s) => s.id === "header-ld")
    check("the built-in header-ld is kept, hidden, with every setting it had", !!builtIn && builtIn.hidden === true && same(builtIn.settings, JSON.parse(files["templates/home.json"]).sections["header-ld"].settings))
    const aboutPage = pages.find((p) => p.page_key === "about")!.sections
    check("about draws home's header, not its stale header-wave", !aboutPage.some((s) => s.id === "header-wave") && aboutPage.some((s) => s.id === "luca_header-1"))
    check("and keeps its own section", aboutPage.some((s) => s.type === "split_content"))
    const pageGroup = splitGroups(homePage).template.map((s) => s.type)
    check("the Page group holds the page's sections only", !pageGroup.includes("luca_header") && !pageGroup.includes("header") && pageGroup[0] === "ld_mode_bar", pageGroup)
  }

  const asFileName = await buildPackage({ theme, files: { ...pkgFiles, "sections/header.storelib": lucaHeaderFile() }, assets: {} })
  const named = await readPackage(asFileName, { knownTypes: Object.keys(SECTION_SCHEMAS) })
  check("a file that takes the built-in header's own name is still left out, with a reason", named.ok === true && !("sections/header.storelib" in named.value.files) && (named.warnings ?? []).some((w) => /takes the built-in header's own name/.test(w.message)))

  /* Two files that both say "kind": "header", both used on home: a package an AI wrote twice over. */
  const twoKinds = JSON.parse(JSON.stringify(home))
  twoKinds.sections["second_header-1"] = { type: "second_header", name: "Second header", settings: { heading: "Two" } }
  twoKinds.order.splice(2, 0, "second_header-1")
  const secondFile = lucaHeaderFile("header").replace(/"type": "luca_header"/, `"type": "second_header"`).replace(/"name":\s*"Luca — Header"/, `"name": "Second header"`)
  const twoBytes = await buildPackage({ theme, files: { ...pkgFiles, "templates/home.json": JSON.stringify(twoKinds), "sections/luca_header.storelib": lucaHeaderFile("header"), "sections/second_header.storelib": secondFile }, assets: {} })
  const two = await readPackage(twoBytes, { knownTypes: Object.keys(SECTION_SCHEMAS) })
  check("a package with two declared headers is read, not refused", two.ok === true, two.ok === false ? two.errors.slice(0, 2) : undefined)
  if (two.ok === true) {
    const k2 = kindLookup(two.value.files, SECTION_SCHEMAS as never)
    const home2 = pagesFromPackageFiles(two.value.files, k2).find((p) => p.page_key === "home")!.sections
    const drawn2 = visibleHeaders(home2, k2).map((s) => s.id)
    check("and draws one header: the first of the creator's own", same(drawn2, ["luca_header-1"]), drawn2)
    check("the second and the built-in are kept, hidden", home2.find((s) => s.id === "second_header-1")?.hidden === true && home2.find((s) => s.id === "header-ld")?.hidden === true)
  }

  console.log("\nExport: the header and footer as the creator has them, and the menus")
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Writing", url: "/#samples", links: [{ title: "Samples", url: "/#samples" }] }] }, footer: { title: "Footer", links: [{ title: "Privacy", url: "/privacy-policy" }] } }
  const settings = sanitizeThemeSettings({ ...JSON.parse(files["config/settings.json"]), menus })
  check("the menus survive the settings' cleaning, as an import cleans them", same(settings.menus, menus))
  const sitePages = [
    { page_key: "home", sections: [ann, ...fixed.sections].map((s) => (s.id === "ann" ? { ...s, group: "header" as const } : s)) },
    { page_key: "about", sections: about },
  ]
  const exported = packageFilesFromPages(sitePages)
  const headerGroup = JSON.parse(exported[HEADER_GROUP_PATH])
  check("sections/header-group.json holds the Header group, in order", same(headerGroup.order, ["ann", "h", "lh"]) && headerGroup.type === "header", headerGroup.order)
  check("the built-in header in it has its settings and blocks", same(headerGroup.sections.h.settings, header.settings) && headerGroup.sections.h.block_order?.[0] === "n1" && headerGroup.sections.h.hidden === true)
  check("the coded header in it is the one drawn", headerGroup.sections.lh.type === "luca_header" && !headerGroup.sections.lh.hidden)
  check("sections/footer-group.json holds the footer", same(JSON.parse(exported[FOOTER_GROUP_PATH]).order, ["f"]))
  const homeTemplate = JSON.parse(exported["templates/home.json"])
  check("templates hold only their page's sections", same(homeTemplate.order, ["hero", "faq"]) && same(JSON.parse(exported["templates/about.json"]).order, ["split"]))
  check("so an AI editing the package finds one header, not one per page", Object.entries(exported).filter(([p, t]) => p.startsWith("templates/") && /"type": "header"/.test(t)).length === 0)
  const exportRoute = read("app/api/website-builder/themes/[installId]/export/route.ts")
  check("the export route writes the pages this way, from the draft the creator has", /packageFilesFromPages\(pagesToPackage\)/.test(exportRoute) && /draft_sections \?\? p\.sections/.test(exportRoute))
  check("and its settings, menus included, as config/settings.json", /files\["config\/settings\.json"\] = JSON\.stringify\(rewriteMediaUrls\(settings/.test(exportRoute))

  console.log("\nExport then import gives back the same site")
  const original = applyUniversalChrome(Object.fromEntries(sitePages.map((p) => [p.page_key, p.sections])), "home", codedKinds)
  const roundFiles = { ...pkgFiles, "config/settings.json": JSON.stringify(settings, null, 2) + "\n", ...packageFilesFromPages(Object.entries(original).map(([page_key, sections]) => ({ page_key, sections }))) }
  /* The fixture's own templates are replaced by the site's two pages. */
  for (const p of Object.keys(roundFiles)) if (p.startsWith("templates/") && !["templates/home.json", "templates/about.json"].includes(p)) delete (roundFiles as Record<string, string>)[p]
  const roundBytes = await buildPackage({ theme, files: roundFiles, assets: {} })
  const back2 = await readPackage(roundBytes, { knownTypes: Object.keys(SECTION_SCHEMAS) })
  check("the exported package reads", back2.ok === true, back2.ok === false ? back2.errors.slice(0, 3) : undefined)
  if (back2.ok === true) {
    const kindsBack = kindLookup(back2.value.files, SECTION_SCHEMAS as never)
    const again = Object.fromEntries(pagesFromPackageFiles(back2.value.files, kindsBack).map((p) => [p.page_key, sanitizeSections(p.sections)]))
    for (const key of Object.keys(original)) {
      check(`${key}: every section, setting, block, group and hidden flag comes back`, same(again[key], sanitizeSections(original[key])), { want: original[key].map((s) => s.id), got: (again[key] ?? []).map((s) => s.id) })
    }
    check("the menus come back", same(JSON.parse(back2.value.files["config/settings.json"]).menus, menus))
    const twice = packageFilesFromPages(Object.entries(again).map(([page_key, sections]) => ({ page_key, sections })))
    const firstTime = packageFilesFromPages(Object.entries(original).map(([page_key, sections]) => ({ page_key, sections: sanitizeSections(sections) })))
    const differing = Object.keys(firstTime).filter((p) => twice[p] !== firstTime[p])
    check("and exporting it again writes the same files, byte for byte", differing.length === 0 && Object.keys(twice).length === Object.keys(firstTime).length, differing)
  }
  const importRoute = read("app/api/website-builder/themes/import/route.ts")
  check("the import route builds its pages this way", /pagesFromPackageFiles\(pkg\.files, packageKinds\)/.test(importRoute))

  console.log("\nThe sidebar: Header, Page, Footer")
  const noop = () => {}
  const sidebar = renderToStaticMarkup(createElement(SectionsList, {
    sections: sitePages[0].sections,
    nameOf: (s: SectionInstance) => s.name,
    selectedId: null,
    kindOfType: codedKinds,
    onSelect: noop, onToggleHide: noop, onDuplicate: noop, onRemove: noop, onMove: noop, onAdd: noop,
    dnd: { onReorder: noop },
  }))
  const headerHtml = sidebar.slice(sidebar.indexOf('data-section-group="header"'), sidebar.indexOf('data-section-group="template"'))
  const pageHtml = sidebar.slice(sidebar.indexOf('data-section-group="template"'), sidebar.indexOf('data-section-group="footer"'))
  check("the announcement bar and both headers are in the Header group", /data-section-row="ann"/.test(headerHtml) && /data-section-row="lh"/.test(headerHtml) && /data-section-row="h"/.test(headerHtml))
  check("nothing of the header's is in the Page group", !/data-section-row="(ann|lh|h)"/.test(pageHtml))
  check("the coded header wears the header's badge, so it reads as the header", (headerHtml.match(/lucide-panel-top/g) ?? []).length === 2, (headerHtml.match(/lucide-panel-top/g) ?? []).length)
  check("Add section in each of the three groups", (sidebar.match(/data-add-section=""/g) ?? []).length === 3)
  check("the header can be deleted, from its menu", /aria-label="More for Luca — Header"/.test(headerHtml))

  console.log("\nThe library: an import goes first")
  check("the place before the first is one less", sortOrderBefore(0) === -1 && sortOrderBefore(-3) === -4)
  check("an empty library starts at 0", sortOrderBefore(null) === 0)
  check("the import route asks for the first place, both formats", (importRoute.match(/await firstSortOrder\(admin, creator\.id\)/g) ?? []).length === 2 && !/nextSortOrder/.test(importRoute))
  check("Add and Duplicate still go last", /nextSortOrder/.test(read("app/api/website-builder/themes/add/route.ts")) && /nextSortOrder/.test(read("app/api/website-builder/themes/[installId]/duplicate/route.ts")))
  const client = read("app/(storelib)/app/website-builder/website-builder-client.tsx")
  const firstRow = client.indexOf('incoming.kind === "import" && (')
  check("the page draws the incoming import above the library's rows", firstRow !== -1 && firstRow < client.indexOf("{library.map((i) => {"))
  check("and scrolls to it and rings it when it lands", /scrollToRow\(row, "center"\)/.test(client) && /setRinged\(/.test(client))

  /* ── universal chrome keeps its old shape for the callers that only want the header ── */
  const c = chromeOf(sitePages[0].sections)
  check("chromeOf names the built-in header and the whole group", c.header?.id === "h" && same(c.headerGroup?.map((s) => s.id), ["ann", "h", "lh"]))
  check("a page with no site chrome keeps its own", same(withUniversalChrome(about, {}).map((s) => s.id), ["stale", "split", "f"]))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
