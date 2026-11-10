/**
 * ===========================================================================
 *  MOTION TIER AND LAYOUT STORY (round O): O6's STUB OF O5's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O5 owns motion tiers (quiet / balanced /
 * expressive as an editable site setting), the motion primitives of spec 5.2
 * and the layout grammar and industry site stories of spec 6. The round O
 * brief names `motionForPrompt` and `layoutStoryFor`; it does not fix their
 * module, so this stub sits here. When O5 merges, point the two imports in
 * lib/ai-builder/agent/design-brief.ts at O5's module and delete this file.
 *
 * Both take the CreativeBrief (lib/storelib-ai/direction) and return text for
 * the job's brief, or "" when there is nothing specific to say.
 */
import type { CreativeBrief, MotionTier } from "@/lib/storelib-ai/direction"

const TIER_TEXT: Record<MotionTier, string> = {
  quiet: "quiet: state changes only (hover, focus, open and close), no entrance animation",
  balanced: "balanced: one entrance per section at most (a short fade or rise), one signature interaction",
  expressive: "expressive: one signature motion carried through the site (a masked line reveal, a sticky image story), scroll-linked where it helps reading, never scroll hijacking",
}

/** STUB: the motion tier for this brief, as one line. Balanced when the creator said nothing. */
export function motionForPrompt(brief: CreativeBrief): string {
  const tier: MotionTier = brief.motion ?? "balanced"
  return `Motion tier ${TIER_TEXT[tier]}. Everything stands still under prefers-reduced-motion and nothing hides content until it animates.`
}

/** STUB: an industry site story. Empty until O5's library lands. */
export function layoutStoryFor(_brief: CreativeBrief): string {
  return ""
}
