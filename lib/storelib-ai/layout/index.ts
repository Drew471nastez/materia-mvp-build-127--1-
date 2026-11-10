/**
 * ===========================================================================
 *  SITE STORIES (round O): O6's STUB OF O5's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O5 owns lib/storelib-ai/layout (grammar.ts,
 * stories.ts, brief.ts). When O5's branch merges, take its files whole and
 * delete this stub. `motionAndLayoutBrief(brief)` is O5's one function for
 * a planning prompt (the business's site story plus the motion rules for the
 * feel it suggests); the stub says only the motion part, because it has no
 * story library.
 */
import { motionForPrompt, motionTierFor } from "../motion"

/** What a brief can say. Matches O2's CreativeBrief loosely. */
export interface StoryBrief {
  prompt?: string
  category?: string | null
  businessType?: string | null
  objective?: string | null
  primaryAction?: string | null
}

/** STUB of O5's motionAndLayoutBrief. */
export function motionAndLayoutBrief(brief: StoryBrief): string {
  return motionForPrompt(motionTierFor([brief.prompt, brief.businessType].filter(Boolean).join(" ")))
}
