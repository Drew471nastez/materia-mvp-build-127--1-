/**
 * ===========================================================================
 *  THE DESIGN BRAIN, AS THE NATIVE ENGINE READS IT (round R, R1's name)
 * ===========================================================================
 * STUB, written by R2 so the native engine (lib/website-builder/ai-site/
 * native) can be coded against R1's shared name before R1 is merged. It has
 * R1's exact signature: `designBrainFor(brief)` returning a compact,
 * versioned prompt block and structured hints. R1's real implementation
 * (Loupe-style techniques, patterns, recipes and standards with ranking)
 * replaces this file whole on merge; the native engine reads the hints
 * defensively (native/brain.ts readBrainHints), so a richer shape still works.
 *
 * What the stub does, deterministically: O2's chosen direction gives the
 * tokens and the type pairing; the brief's story gives the section strategy.
 */
import { chooseDirection, type CreativeBrief } from "@/lib/storelib-ai/direction"

export interface DesignBrainHints {
  recipeId: string
  tokens: Record<string, string | number>
  typePairing: { display: string; body: string }
  spacing: "airy" | "balanced" | "dense"
  /** Section roles in order, home first: "hero", "proof", "offer", "story", "gallery", "faq", "cta"... */
  sectionStrategy: string[]
  motionTier: "quiet" | "balanced" | "expressive"
  imageDirection: string
}

export interface DesignBrain {
  version: string
  /** Compact prompt text, safe to put in any system prompt. */
  block: string
  hints: DesignBrainHints
}

export const DESIGN_BRAIN_STUB_VERSION = "brain-stub-r2.1"

const STRATEGIES: [RegExp, string[]][] = [
  [/fitness|coach|trainer|gym|sport|yoga/, ["hero", "offer", "process", "proof", "story", "faq", "cta"]],
  [/cloth|fashion|apparel|wear|brand|shop|store/, ["hero", "products", "collections", "story", "gallery", "newsletter", "cta"]],
  [/photo|portfolio|artist|gallery|film/, ["hero", "gallery", "story", "process", "contact", "cta"]],
  [/skin|beauty|spa|cosmetic|care/, ["hero", "products", "benefits", "process", "faq", "newsletter", "cta"]],
  [/architect|interior|studio|design/, ["hero", "gallery", "story", "process", "team", "cta"]],
  [/consult|agency|advis|lawyer|account|finance/, ["hero", "offer", "process", "story", "faq", "cta"]],
]

export function designBrainFor(brief: CreativeBrief): DesignBrain {
  const choice = chooseDirection(brief, [], { seed: brief.prompt.toLowerCase() })
  const words = `${brief.business.kind} ${brief.business.label} ${brief.story} ${brief.prompt}`.toLowerCase()
  const strategy = STRATEGIES.find(([re]) => re.test(words))?.[1] ?? ["hero", "offer", "story", "proof", "faq", "cta"]
  const p = choice.palette
  const hints: DesignBrainHints = {
    recipeId: `${choice.primary.id}:${brief.story}`,
    tokens: { background: p.background, surface: p.surface, text: p.text, muted: p.muted, accent: p.accent, accentText: p.accentText, border: p.border, radius: choice.radius },
    typePairing: { display: choice.fonts.display, body: choice.fonts.body },
    spacing: brief.density,
    sectionStrategy: strategy,
    motionTier: brief.motion,
    imageDirection: choice.primary.imagery,
  }
  const block = [
    `DESIGN BRAIN (${DESIGN_BRAIN_STUB_VERSION}, recipe ${hints.recipeId})`,
    `- Direction: ${choice.primary.name}. ${choice.primary.thesis}`,
    `- Type: ${hints.typePairing.display} for display, ${hints.typePairing.body} for text.`,
    `- Palette (${p.mode}): background ${p.background}, surface ${p.surface}, text ${p.text}, accent ${p.accent}.`,
    `- Spacing ${hints.spacing}, motion ${hints.motionTier}.`,
    `- Section strategy: ${strategy.join(" > ")}.`,
    `- Imagery: ${hints.imageDirection}.`,
  ].join("\n")
  return { version: DESIGN_BRAIN_STUB_VERSION, block, hints }
}
