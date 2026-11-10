/**
 * ===========================================================================
 *  MOTION TIERS (round O): O6's STUB OF O5's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O5 owns lib/storelib-ai/motion (tiers quiet /
 * balanced / expressive as an editable site setting, the motion primitives
 * of spec 5.2) and lib/storelib-ai/layout (layout grammar, industry site
 * stories, motionAndLayoutBrief). When O5's branch merges, take its files
 * whole and delete this stub. The names and parameters are O5's, read from
 * its branch.
 */

export const MOTION_TIERS = ["quiet", "balanced", "expressive"] as const
export type MotionTier = (typeof MOTION_TIERS)[number]
export const DEFAULT_MOTION_TIER: MotionTier = "balanced"

const DESCRIBE: Record<MotionTier, string> = {
  quiet: "state changes only (hover, focus, open and close), no entrance animation",
  balanced: "one entrance per section at most, a short fade or rise, and one signature interaction",
  expressive: "one signature motion carried through the site (a masked line reveal, a sticky image story), scroll-linked where it helps reading",
}

/** STUB of O5's motionTierFor: the creator's words, else balanced. */
export function motionTierFor(text: string): MotionTier {
  const t = text ?? ""
  if (/\b(no|without|minimal|less) (motion|animations?)\b|\bstatic\b/i.test(t)) return "quiet"
  if (/\b(smooth|scroll moments?|expressive|cinematic|immersive|lots of motion|animated)\b/i.test(t)) return "expressive"
  return DEFAULT_MOTION_TIER
}

/** STUB of O5's motionForPrompt. */
export function motionForPrompt(tier: MotionTier = DEFAULT_MOTION_TIER): string {
  return `MOTION (this site's feel: ${tier})
- ${DESCRIBE[tier]}.
- Transform and opacity only, native scrolling always (no scroll hijacking, no content hidden until it animates), and everything still under prefers-reduced-motion.`
}
