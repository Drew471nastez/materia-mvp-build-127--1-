/**
 * ===========================================================================
 *  THE ANTI-SLOP P0 RULES A SINGLE SECTION ANSWERS FOR (round O, O3)
 * ===========================================================================
 * Every AI-written section goes through the anti-AI-slop filter before it is
 * kept: the website agent's files (lib/ai-builder/agent/validate.ts, through
 * compile-feedback.ts checkSectionSource, strict), the page assistant's code
 * edits (the same call, strict) and the section writer (write-section.ts).
 *
 * Only the rules one file can be fairly judged on alone, from the full engine
 * (lib/ai-builder/slop.ts):
 *
 *   FACTS (held even on a lenient pass, like a key Storelib does not read):
 *     placeholder-copy   filler and instructions to the creator in visible text
 *     fake-proof         invented numbers, ratings, logos and quotes
 *   DEFAULTS (let through on a lenient pass, after two send-backs):
 *     indigo-accent, trust-gradient, emoji-icons, left-border-card
 *
 * Page-level rules (the cliché combination, the skeleton, the warning budget)
 * need the whole site and run at the agent's finish. Only what this edit
 * brought is held: a finding the file's earlier version had is not this
 * edit's fault. A look the creator asked for in their own words is allowed.
 *
 * Pure.
 */
import { evaluateSlop, type SlopFinding } from "@/lib/ai-builder/slop"
import type { QualityFinding } from "@/lib/storelib-ai/quality"

const FACTS = new Set<SlopFinding["rule"]>(["placeholder-copy", "fake-proof"])
const DEFAULTS = new Set<SlopFinding["rule"]>(["indigo-accent", "trust-gradient", "emoji-icons", "left-border-card"])

/** What the creator's words supply as facts: numbers they typed, and quotes, reviews or logos they mention. */
export function factsFromBrief(brief: string | undefined): { numbers: string[]; quotes: boolean; reviews: boolean; logos: boolean } | undefined {
  if (!brief) return undefined
  return {
    numbers: [...brief.matchAll(/\d[\d,.]*/g)].map((m) => m[0].replace(/[.,]$/, "")),
    quotes: /["“”]|\btestimonials?\b|\bquotes?\b|\breviews?\b/i.test(brief),
    reviews: /\breviews?\b|\bratings?\b|\bstars?\b/i.test(brief),
    logos: /\blogos?\b|\bclients?\b|\bpress\b|\bfeatured in\b/i.test(brief),
  }
}

function p0(path: string, source: string, brief: string | undefined): SlopFinding[] {
  const facts = factsFromBrief(brief)
  return evaluateSlop({ sources: [{ path, content: source }], ...(brief !== undefined ? { brief } : {}), ...(facts ? { facts } : {}) }).findings.filter((f) => f.severity === "error" && (FACTS.has(f.rule) || DEFAULTS.has(f.rule)))
}

/** The anti-slop P0 findings this version of the file brings, as quality findings for checkSectionSource. */
export function sectionSlopFindings(path: string, source: string, before: string | null, opts: { brief?: string; lenient?: boolean } = {}): QualityFinding[] {
  if (!/^sections\//.test(path)) return []
  let found: SlopFinding[]
  try {
    found = p0(path, source, opts.brief)
  } catch {
    return []
  }
  if (opts.lenient) found = found.filter((f) => FACTS.has(f.rule))
  if (!found.length) return []
  const had = new Set(before ? p0(path, before, opts.brief).map((f) => f.rule) : [])
  return found
    .filter((f) => !had.has(f.rule))
    .map((f) => ({ id: `slop-${f.rule}`, severity: "error" as const, message: `Anti-slop (${f.rule}): ${f.message} ${f.fix}` }))
}
