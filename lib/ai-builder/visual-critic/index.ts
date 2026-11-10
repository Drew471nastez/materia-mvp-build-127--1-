/**
 * The rendered visual critic (round O, O4): the agent SEES its draft and
 * fixes specific defects before it finishes. See ./critic.ts for the round,
 * ./shoot.ts for the browser (JavaScript off), ./measure.ts for the hard
 * gates, ./review.ts for the vision review (spec 11.2), and
 * lib/ai-builder/agent/loop.ts (visualReview) for how the loop bounds it.
 */
export * from "./types"
export { composeDraftDocument, stripScripts, CRITIC_CSP } from "./document"
export { measuredDefects, extendedDefects, mergeDefects, measureScript, LIMITS, type MeasureContext, type KnownLinks } from "./measure"
export { REVIEW_SYSTEM, readReview, reviewMessage, runReview, extractJson, MAX_REVIEW_ATTEMPTS } from "./review"
export { browserAvailable, shootPages, isPublicHost, allowRequest } from "./shoot"
export { createVisualCritic, reviewWorstCaseUsd, MAX_CRITIC_PAGES, type CriticRequest, type VisualCriticRunner, type CriticOptions } from "./critic"
