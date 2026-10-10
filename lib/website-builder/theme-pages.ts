/**
 * ===========================================================================
 *  A SITE'S PAGES IN A THEME PACKAGE, AND BACK, WITH ONE HEADER
 * ===========================================================================
 * A package keeps the header and the footer the way Shopify's themes do:
 * once, in `sections/header-group.json` and `sections/footer-group.json`,
 * and every `templates/<page>.json` holds only that page's own sections.
 *
 * Every page row in the database carries its own copy of the header and
 * footer, and the site draws home's on every page (universal-chrome.ts). An
 * export that wrote each row's copy into each template handed an AI editing
 * the package ten headers, one of them current, and it edited whichever it
 * found first. Now there is one, exactly as the creator has it: the built-in
 * header with all its settings and blocks, or the header section file they
 * wrote, with any announcement bar above it and any header hidden because
 * another replaced it.
 *
 *   EXPORT   home's Header and Footer groups go in the group files; each
 *            template gets its page's own sections.
 *   IMPORT   every page is the Header group, its template, the Footer group.
 *            A package without group files (an older export, or one an AI
 *            wrote) is read as it was written and then held to one header:
 *            home's chrome on every page, a header section file on a page
 *            moved into the Header group, and the second of two headers
 *            hidden, never dropped (lib/storelib-theme/section-groups.ts).
 *
 * Export then import gives back the pages the site draws, section for
 * section, setting for setting (tests/section-groups.test.ts).
 *
 * Pure: the export and import routes call it, and so does the test.
 */
import { sectionsFromTemplate, templateFromSections } from "@/lib/storelib-theme/package"
import { inGroup, repairChrome, splitGroups, type KindOfType } from "@/lib/storelib-theme/section-groups"
import type { Template } from "@/lib/storelib-theme/types"
import { applyUniversalChrome } from "./universal-chrome"
import type { SectionInstance } from "./types"

export const HEADER_GROUP_PATH = "sections/header-group.json"
export const FOOTER_GROUP_PATH = "sections/footer-group.json"
/* What floats over every page: a popup, a bar fixed to the bottom of a phone (section-groups.ts). */
export const OVERLAY_GROUP_PATH = "sections/overlay-group.json"

const PAGE_KEY = /^[A-Za-z0-9_.\-]+$/

export interface PageRow {
  page_key: string
  sections: unknown
}

type Section = SectionInstance & Record<string, unknown>

/** A group file: Shopify's shape, a template with a name and the group it is. */
interface GroupFile extends Template {
  type: "header" | "footer" | "overlay"
  name: string
}

function groupFile(kind: "header" | "footer" | "overlay", list: Section[]): string {
  /* The group is the file's, so the sections in it do not repeat it. */
  const t = templateFromSections(list.map((s) => inGroup(s, "template") as Section) as never)
  const file: GroupFile = { type: kind, name: kind === "header" ? "Header group" : kind === "footer" ? "Footer group" : "Overlay group", sections: t.sections, order: t.order }
  return JSON.stringify(file, null, 2) + "\n"
}

/**
 * The package's page files: one template per page, its own sections only,
 * and the two group files from home. A site without a home page keeps each
 * page's chrome in its template, as before, since there is no one header to
 * name.
 */
export function packageFilesFromPages(pages: PageRow[], homeKey = "home"): Record<string, string> {
  const files: Record<string, string> = {}
  const home = pages.find((p) => p.page_key === homeKey)
  const homeList = Array.isArray(home?.sections) ? (home!.sections as Section[]) : null
  const chrome = homeList ? splitGroups(homeList) : null
  if (chrome) {
    files[HEADER_GROUP_PATH] = groupFile("header", chrome.header)
    files[FOOTER_GROUP_PATH] = groupFile("footer", chrome.footer)
    if (chrome.overlay.length) files[OVERLAY_GROUP_PATH] = groupFile("overlay", chrome.overlay)
  }
  for (const page of pages) {
    if (!PAGE_KEY.test(page.page_key)) continue
    const list = Array.isArray(page.sections) ? (page.sections as Section[]) : []
    const own = chrome ? splitGroups(list).template : list
    files[`templates/${page.page_key}.json`] = JSON.stringify(templateFromSections(own as never), null, 2) + "\n"
  }
  return files
}

function readGroup(text: string | undefined, kind: "header" | "footer" | "overlay"): Section[] | null {
  if (typeof text !== "string") return null
  try {
    const t = JSON.parse(text) as Template
    if (!t || typeof t !== "object" || typeof t.sections !== "object") return null
    return (sectionsFromTemplate(t) as Section[]).map((s) => inGroup(s, kind))
  } catch {
    return null
  }
}

/**
 * Every page of a package, as rows: the Header group, the page, the Footer
 * group, held to one header and one footer. `kindOfType` says which of the
 * package's section types are a header or a footer (section-groups.ts,
 * kindLookup over the package's own files).
 */
export function pagesFromPackageFiles(files: Record<string, string>, kindOfType?: KindOfType, homeKey = "home"): { page_key: string; sections: SectionInstance[] }[] {
  const headerGroup = readGroup(files[HEADER_GROUP_PATH], "header")
  const footerGroup = readGroup(files[FOOTER_GROUP_PATH], "footer")
  const overlayGroup = readGroup(files[OVERLAY_GROUP_PATH], "overlay")
  const pages: Record<string, SectionInstance[]> = {}
  for (const [path, text] of Object.entries(files)) {
    const m = path.match(/^templates\/([A-Za-z0-9_.\-]+)\.json$/)
    if (!m) continue
    let list: Section[] = []
    try {
      list = sectionsFromTemplate(JSON.parse(text) as Template) as Section[]
    } catch {
      list = []
    }
    /*
      A template that also carries a header or footer (an AI added one, or
      the package is older than its group files) keeps it, inside the group
      it belongs to: the repair below then draws one and hides the rest.
    */
    const own = splitGroups(list)
    const header = headerGroup ? [...headerGroup, ...own.header.filter((s) => !headerGroup.some((h) => h.id === s.id))] : own.header
    const footer = footerGroup ? [...own.footer.filter((s) => !footerGroup.some((f) => f.id === s.id)), ...footerGroup] : own.footer
    const overlay = overlayGroup ? [...own.overlay.filter((s) => !overlayGroup.some((o) => o.id === s.id)), ...overlayGroup] : own.overlay
    pages[m[1]] = repairChrome([...header, ...own.template, ...footer, ...overlay], kindOfType).sections
  }
  const dressed = applyUniversalChrome(pages, homeKey, kindOfType)
  return Object.entries(dressed).map(([page_key, sections]) => ({ page_key, sections }))
}
