/**
 * ===========================================================================
 *  START WITH AI: ONE CHECK BEFORE IT SAYS "DONE"
 * ===========================================================================
 * The generated site is checked once, with the checks the chat agent already
 * trusts, and only the sections they flag are written again:
 *
 *   DETERMINISTIC  lib/website-builder/agent/review.ts reviewSections on every
 *                  page: text that does not read on its colours, preset demo
 *                  copy left in, empty headings and items, repeated items,
 *                  banned words. Plus a scan for anything that looks like a
 *                  price the store does not have.
 *   VISUAL         lib/website-builder/agent/visual-check.ts on the home
 *                  page, drawn in headless Chromium at desktop, tablet and
 *                  phone widths: overflow, collapsed or clipped sections,
 *                  collisions, broken pictures.
 *
 * Findings a writer can fix (copy, length, emptiness) go back to that one
 * section's writer with the finding attached. What is still wrong after that
 * is reported, and the job ends "partial", never a "complete" it is not.
 */
import { reviewSections, type Finding } from "../agent/review"
import type { ThemeState } from "../agent/operations"
import type { SchemaMap } from "../agent/schemas"
import type { VisualFinding } from "../agent/visual-check"
import { allowedFacts, type FillContext } from "./fill"
import type { PlacedSection, SiteState } from "./apply"

export interface SiteFinding extends Finding {
  page: string
  kind: "review" | "facts" | "visual"
}

const PRICE = /(?:[$€£¥]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|gbp)\b)/gi
const norm = (s: string) => s.toLowerCase().replace(/[^\d.]/g, "").replace(/\.0+$/, "").replace(/\.$/, "")

function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value.replace(/<[^>]*>/g, " "))
  else if (Array.isArray(value)) value.forEach((v) => texts(v, out))
  else if (value && typeof value === "object") Object.values(value).forEach((v) => texts(v, out))
  return out
}

/** Every check that needs no browser, on every page. Pure. */
export function deterministicFindings(site: SiteState, placed: PlacedSection[], written: Record<string, string[]>, ctx: FillContext, schemas?: SchemaMap): SiteFinding[] {
  const out: SiteFinding[] = []
  const facts = allowedFacts(ctx)
  for (const [page, sections] of Object.entries(site.pages)) {
    const ids = placed.filter((p) => p.page === page && sections.some((s) => s.id === p.id)).map((p) => p.id)
    if (!ids.length) continue
    const state: ThemeState = { sections, settings: site.settings }
    const writtenBlocks: Record<string, string[]> = {}
    for (const id of ids) writtenBlocks[id] = (sections.find((s) => s.id === id)?.blocks ?? []).map((b) => b.id)
    for (const f of reviewSections({ state, schemas, touched: ids, added: ids, written, writtenBlocks })) out.push({ ...f, page, kind: "review" })
    for (const id of ids) {
      const section = sections.find((s) => s.id === id)
      if (!section) continue
      const all = texts([section.settings, (section.blocks ?? []).map((b) => b.settings)]).join(" ")
      for (const m of all.match(PRICE) ?? []) {
        if (!facts.prices.has(norm(m))) {
          out.push({ sectionId: id, page, kind: "facts", message: `It names a price (${m.trim()}) the store does not have. Remove it.` })
          break
        }
      }
    }
  }
  return out
}

/** The visual faults that are the section's own (a layout broken by its words), as findings. */
export function visualFindings(found: VisualFinding[] | null, page = "home"): SiteFinding[] {
  if (!found) return []
  return found
    .filter((f) => f.kind !== "tiny-text")
    .map((f) => ({ sectionId: f.sectionId, page, kind: "visual" as const, message: `Drawn at ${f.width || "every"}px wide: ${f.message}. Shorten or restructure the words so it fits.` }))
}

/** Findings a section's writer can fix by writing it again. Contrast is the palette's, not the writer's. */
export function rewritable(f: SiteFinding): boolean {
  if (f.kind === "facts" || f.kind === "visual") return true
  return !/contrast|reads? at|:1\b/i.test(f.message)
}
