/**
 * ===========================================================================
 *  WHAT THE DRAFT'S DATA SAYS FOR CERTAIN, BEFORE ANY BROWSER (round R, R3)
 * ===========================================================================
 * Two of Loupe's composition checks need no picture at all, only the page's
 * sections in order:
 *
 *   repetition   the same section type three times in a row: one component
 *                stamped down the page is the "identical cards" look the
 *                anti-slop rules name (Loupe's reviewer: "same component
 *                family over and over")
 *   rhythm       the space above and below the sections clustering into more
 *                than three values (Loupe's rubric, rhythm: "section gaps
 *                cluster into <=3 repeated values")
 *
 * And the links the site can be judged against (render-check's linkProblem):
 * its pages, and what every Storelib website answers.
 *
 * Pure.
 */
import type { Defect } from "@/lib/ai-builder/visual-critic/types"
import type { KnownLinks } from "@/lib/ai-builder/visual-critic/measure"
import { pagePath } from "../../site-pages"
import { POLICY_PAGES } from "../../policy-pages"
import type { SiteState } from "../apply"
import type { SectionInstance } from "../../types"

const isChrome = (s: SectionInstance) => s.type === "header" || s.type === "footer" || !!s.group

/** The page's own sections, in order, without the header, the footer or anything hidden. */
export function bodySections(sections: SectionInstance[]): SectionInstance[] {
  return sections.filter((s) => !isChrome(s) && !s.hidden)
}

/** Runs of one section type, three or more long. */
export function repeatedRuns(sections: SectionInstance[]): { type: string; ids: string[] }[] {
  const body = bodySections(sections)
  const runs: { type: string; ids: string[] }[] = []
  let i = 0
  while (i < body.length) {
    let j = i
    while (j + 1 < body.length && body[j + 1].type === body[i].type) j++
    if (j - i + 1 >= 3) runs.push({ type: body[i].type, ids: body.slice(i, j + 1).map((s) => s.id) })
    i = j + 1
  }
  return runs
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

/** The vertical padding values the page's sections set, by how many use each. */
export function paddingValues(sections: SectionInstance[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const s of bodySections(sections)) {
    for (const key of ["padding_top", "padding_bottom"]) {
      const v = num(s.settings?.[key])
      if (v === null) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  return counts
}

/** Most distinct section paddings before the spacing has no rhythm. */
export const RHYTHM_MAX_VALUES = 3

export function structuralDefects(site: SiteState, pages: string[], names?: (type: string) => string): Defect[] {
  const out: Defect[] = []
  const name = names ?? ((t: string) => t.replace(/_/g, " "))
  for (const page of pages) {
    const sections = site.pages[page] ?? []
    for (const run of repeatedRuns(sections)) {
      out.push({
        page,
        sectionId: run.ids[2],
        sectionType: run.type,
        severity: "medium",
        kind: "repetition",
        viewport: "both",
        what: `${run.ids.length} ${name(run.type)} sections in a row.`,
        why: "The same component stamped down the page reads as a template, and the page loses its pace.",
        fix: "Move one of them further down, or give the middle one a different layout.",
        gate: false,
        source: "measure",
      })
    }
    const pads = paddingValues(sections)
    if (pads.size > RHYTHM_MAX_VALUES) {
      out.push({
        page,
        severity: "low",
        kind: "rhythm",
        viewport: "both",
        what: `The sections use ${pads.size} different paddings (${[...pads.keys()].sort((a, b) => a - b).join(", ")}px).`,
        why: "Spacing with no repeated values reads as no decision, and the page has no rhythm.",
        fix: `Use two or three spacing values: snap each section's padding to the page's most common ones.`,
        gate: false,
        source: "measure",
      })
    }
  }
  return out
}

/** The site's pages and the store's own addresses, as the link check reads them. */
export function knownLinks(site: SiteState, extra: { productSlugs?: string[]; collectionHandles?: string[]; products?: string[] } = {}): KnownLinks {
  const pages = new Set<string>()
  const paths = new Set<string>()
  /* Every site has its policy pages: they are ensured whenever the site is opened (ensure-policy-pages.ts). */
  for (const key of [...Object.keys(site.pages), ...POLICY_PAGES.map((p) => p.key)]) {
    pages.add(key)
    paths.add(pagePath(key))
  }
  return {
    pages,
    productSlugs: new Set(extra.productSlugs ?? []),
    collectionHandles: new Set((extra.collectionHandles ?? []).map((h) => h.toLowerCase())),
    communitySlugs: new Set(),
    forms: new Set(),
    products: new Set(extra.products ?? []),
    extra: paths,
  }
}
