import "server-only"

/**
 * L6's design knowledge, wired for the engine. Server only: the library
 * embeds every entry (index.generated.ts, ~266 KB) and must never reach a
 * client bundle, so only the engine's server modules import this file.
 */
import { capabilitiesFromSite, runSearchKnowledge, suggestDirections, type Direction, type KnowledgeCapability } from "@/lib/storelib-ai/library"
import { searchReferences } from "@/lib/storelib-ai/references"
import { evaluateSlop, slopIssues } from "../slop"
import { themeSettingsToTokens } from "../tokens"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import type { DesignTokens } from "../types"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { KnowledgeSearch, ReferenceSource, SlopEvaluator } from "./ports"
import type { VisualConcept } from "./concept"

export { SEARCH_KNOWLEDGE_TOOL } from "@/lib/storelib-ai/library"

/** The capability words L6's retrieval filters on (capabilitiesFromSite), from what the store really has. */
function capabilityWords(c: RuntimeCapabilities | null): KnowledgeCapability[] {
  if (!c) return []
  const productTypes: Record<string, number> = {}
  for (const p of c.products) productTypes[p.kind || "product"] = (productTypes[p.kind || "product"] ?? 0) + 1
  return capabilitiesFromSite({ productTypes, communities: c.communities, forms: { published: c.forms.length, bookings: c.forms.filter((f) => f.kind === "booking").length }, blog: c.blog })
}

/** search_knowledge bound to the job: the industry, the concept's styles, the store's capabilities. */
export function libraryKnowledge(ctx: { industry?: string; concept?: () => VisualConcept | undefined; caps?: () => RuntimeCapabilities | null | undefined }): KnowledgeSearch {
  return async (q) => {
    const styles = ctx.concept?.()?.styles
    const capabilities = capabilityWords(ctx.caps?.() ?? null)
    /* Round BB: the platform's working rules only; the look and structure come from the owner's library (AI source bank). */
    const r = runSearchKnowledge({ query: q.query, kinds: q.kinds, limit: q.limit }, { bankOnly: true, industry: q.industry ?? ctx.industry, styles, ...(capabilities.length ? { capabilities } : {}) })
    return r.entries
  }
}

/**
 * L6's anti slop evaluator over the job's files, relative to its concept and the store's real facts.
 * Round O: with the creator's own words (only they can ask for the editorial serif or purple look), the
 * Theme settings' tokens a visitor really sees, the pages as drawn and home's section order.
 */
export const librarySlop: SlopEvaluator = async ({ files, concept, capabilities, brief, settings, rendered, sections, baseline }) => {
  const c = capabilities
  const facts = c ? { numbers: [String(c.products.length), ...(c.reviews.count ? [String(c.reviews.count), ...(c.reviews.average !== null ? [c.reviews.average.toFixed(1)] : [])] : [])].filter((n) => n !== "0"), reviews: c.reviews.count > 0, quotes: false, logos: false } : undefined
  /*
    The tokens a visitor sees. Fonts only when the heading face is one with character: set_tokens already refuses a
    default display face unless the creator asked for it, so an Inter heading here is the platform's own default
    (the reader's fallback), not a choice to judge; an editorial serif heading is, for the cliché combination.
  */
  const read = settings ? themeSettingsToTokens(settings) : undefined
  const heading = typeof settings?.font_heading === "string" ? settings.font_heading.trim() : ""
  const tokens: Partial<DesignTokens> | undefined = read ? { colors: read.colors, ...(heading && !isSlopDisplayFont(heading) ? { fonts: read.fonts } : {}) } : undefined
  return slopIssues(
    {
      sources: files.map((f) => ({ path: f.path, content: f.text })),
      ...(facts ? { facts } : {}),
      ...(typeof brief === "string" ? { brief } : {}),
      ...(tokens ? { tokens } : {}),
      ...(rendered?.length ? { rendered } : {}),
      ...(sections?.length ? { sections } : {}),
    },
    (concept as VisualConcept | null) ?? null,
    baseline?.length ? { baseline } : {},
  )
}

/**
 * Round 56: the P1 rules a starting template already trips as shipped (its own files, tokens and home order), so a
 * site that starts from it is held to what it added. Never an error rule: P0 is never excused.
 */
export function templateSlopBaseline(template: { files: Record<string, string>; tokens?: Partial<DesignTokens>; pages?: { key: string; sections: { type: string }[] }[] }): string[] {
  const report = evaluateSlop({ sources: Object.entries(template.files).map(([path, content]) => ({ path, content })), ...(template.tokens ? { tokens: template.tokens } : {}), sections: (template.pages?.find((p) => p.key === "home")?.sections ?? []).map((s) => ({ type: s.type })) })
  return [...new Set(report.findings.filter((f) => f.severity === "warn").map((f) => f.rule))]
}

/** Starting directions for the plan phase: distinct, suited to the industry first. */
export function directionsFor(industry: string | undefined, seed: string): Direction[] {
  return suggestDirections(industry, { count: 3, seed })
}

/** O1's references without the database: the built in library (Storelib's patterns, open-source notes), no pictures. */
export const libraryReferences: ReferenceSource = {
  search: async ({ query, industry, limit }) => searchReferences({ text: query, industry }, { limit: limit ?? 4, builtIns: false }),
  images: async () => [],
}
