/**
 * The design review's words (round R, R3): its phases while it runs and its status when it is done, as the
 * progress view and the job's summary say them. Plain, short, no promise the review did not keep. Pure.
 */
import type { CriticStatus } from "@/lib/ai-builder/visual-critic/types"

export type ReviewPhase = "checking" | "fixing" | "rechecking" | "reviewing"

export const REVIEW_PHASE_WORDS: Record<ReviewPhase, string> = {
  checking: "Checking the design on a laptop and a phone",
  reviewing: "Looking over the design",
  fixing: "Fixing what the check found",
  rechecking: "Checking the fixes on a phone",
}

/** reviewed / measured only / not visually checked, in the creator's words. */
export const REVIEW_STATUS_WORDS: Record<CriticStatus, string> = {
  reviewed: "Reviewed on a laptop and a phone",
  measured: "Measured on a laptop and a phone, not looked over by the reviewer",
  unverified: "Not visually checked",
}
