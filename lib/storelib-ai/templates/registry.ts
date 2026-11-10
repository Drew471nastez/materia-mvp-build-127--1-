/**
 * ===========================================================================
 *  THE TEMPLATE GALLERY: EVERY SITE TEMPLATE, IN ONE LIST
 * ===========================================================================
 * P2a's six and P2b's six (round P). Order matters only as the last tie
 * break in chooseTemplate. A template is registered by importing it here;
 * tests/ai-templates-p2a.test.ts holds every registered one to the same
 * bar (compiles, validates, renders at 1440 and 390, filled blocks, no
 * slop P0), so a new one is checked the moment it is listed.
 *
 * Pure. Browser safe, but large: import it on the server (the agent) and in
 * tests, not in a page bundle.
 */
import type { SiteTemplate, TemplateSummary } from "./types"
import { pressure } from "./sites/pressure"
import { dialIn } from "./sites/dial-in"
import { offCut } from "./sites/off-cut"
import { calibre } from "./sites/calibre"
import { lowEnd } from "./sites/low-end"
import { stillWater } from "./sites/still-water"

/** P2a's templates. */
const P2A: SiteTemplate[] = [pressure, dialIn, offCut, calibre, lowEnd, stillWater]

/** P2b's templates: import each and list it here. */
const P2B: SiteTemplate[] = []

export const SITE_TEMPLATES: readonly SiteTemplate[] = [...P2A, ...P2B]

export function templateById(id: string): SiteTemplate | undefined {
  return SITE_TEMPLATES.find((t) => t.id === id)
}

/** What the gallery (and the agent's list_templates) shows of a template. */
export function templateSummary(t: SiteTemplate): TemplateSummary {
  const own = (sections: SiteTemplate["pages"][number]["sections"]) => sections.filter((x) => x.group !== "header" && x.group !== "footer")
  return {
    id: t.id,
    name: t.name,
    summary: t.summary,
    industries: t.industries,
    stories: t.stories,
    styles: t.styles,
    directionIds: t.directionIds,
    keywords: t.keywords,
    motion: t.motion,
    signature: t.design.signature,
    pages: t.pages.map((p) => ({ key: p.key, title: p.title, sections: own(p.sections).map((x) => x.name) })),
    imageSlots: t.imageSlots.length,
    fonts: t.tokens.fonts,
    palette: { mode: isDark(t.tokens.colors.background) ? "dark" : "light", background: t.tokens.colors.background, text: t.tokens.colors.text, accent: t.tokens.colors.accent },
  }
}

/** Every template's summary: the gallery, exportable as JSON (P2b and the admin read the same list). */
export function templateCatalog(): TemplateSummary[] {
  return SITE_TEMPLATES.map(templateSummary)
}

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}
