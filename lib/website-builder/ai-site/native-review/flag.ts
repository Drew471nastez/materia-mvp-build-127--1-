/**
 * Whether a classic (native sections) job is looked at and refined after it is built (round R, R3), behind the
 * same switch as R2's native engine: AI_NATIVE_ENGINE. On unless it says off ("0", "false", "off"), the way R2
 * ships it; AI_NATIVE_REVIEW=0 turns the review alone off. The review also needs a browser and the site's own
 * address to draw the draft at (./server.ts); without them nothing is reviewed and the job says so.
 */
const OFF = /^(0|false|off|no)$/i

export function nativeReviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (OFF.test((env.AI_NATIVE_ENGINE ?? "").trim())) return false
  if (OFF.test((env.AI_NATIVE_REVIEW ?? "").trim())) return false
  return true
}
