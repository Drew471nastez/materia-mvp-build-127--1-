/**
 * How much work a request is actually asking for.
 *
 * ---------------------------------------------------------------------------
 *  WHY A FLAT BUDGET WAS THE PROBLEM
 * ---------------------------------------------------------------------------
 * Every run got twelve turns, whether the request was "change this word" or
 * "make the whole site premium and complete". Twelve turns is generous for the
 * first and nowhere near enough for the second — and a model that senses it is
 * running out of room does the rational thing and stops early, which is exactly
 * the "one tiny change and done" behaviour this exists to fix.
 *
 * The budget is a CEILING, never a target. A one-word change still finishes in
 * two turns; it simply is not given room it does not need.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS NOT A MODEL CALL
 * ---------------------------------------------------------------------------
 * Classifying a sentence with a second model call costs a round trip and money
 * before any work starts, and it would be wrong in the same direction the main
 * model is already wrong in — both are optimistic about how little a broad
 * request needs. Reading the sentence is deterministic, free, and auditable.
 */

export type Complexity = "small" | "medium" | "large"

export interface Budget {
  complexity: Complexity
  /** Turns: one model call plus the tools it asks for. */
  maxTurns: number
  /** Whether the agent is required to write a plan before editing. */
  requiresPlan: boolean
  /** The smallest plan that is a credible answer to a request this broad. */
  minSteps: number
}

/**
 * The broad, open-ended asks — the ones that were producing one CSS tweak.
 *
 * These share a shape: they name a QUALITY rather than a change. "Premium",
 * "complete", "better" describe how the finished thing should feel, which
 * means the work is to find what is missing, not to apply an instruction.
 */
const LARGE = [
  "much more",
  "more complete",
  "more complex",
  "more premium",
  "premium",
  "improve everything",
  "improve the whole",
  "make it better",
  "make the site better",
  "make this better",
  "feel like",
  "look like",
  "world class",
  "world-class",
  "production ready",
  "production-ready",
  "professional",
  "polish the whole",
  "overhaul",
  "add authentication",
  "add a dashboard",
  "build a dashboard",
  "add a marketplace",
  "add a blog",
  "add a store",
  "multi page",
  "multi-page",
  "several pages",
  "whole site",
  "entire site",
  "every page",
  "all the pages",
]

/**
 * A named piece of work — real, bounded, more than one file, but not the
 * whole site.
 */
const MEDIUM = [
  // Verbs that mean "replace what is there", not "adjust it".
  "redesign",
  "rebuild",
  "restyle",
  "rework",
  "revamp",
  "overhaul",
  // Bringing something into existence, which always touches the thing, its
  // parent, and the stylesheet.
  "add a ",
  "add an ",
  "add testimonial",
  "add pricing",
  "add contact",
  "create a ",
  "create an ",
  "new section",
  "new page",
  "another section",
  // Cross-cutting concerns: none of these live in one file.
  "responsive",
  "on mobile",
  "mobile layout",
  "dark mode",
]

/**
 * NO BARE COMPONENT NOUNS ON THAT LIST, and that is the correction that
 * matters. "hero", "footer", "navbar" and "pricing" started there, which made
 * "make the hero text white" — a one-word change — ask for a plan and
 * twenty-four turns. A noun names WHERE the work is, never how much of it
 * there is; only a verb can say that.
 *
 * Where it is genuinely ambiguous, the higher tier is the safer mistake: the
 * budget is a ceiling, so a small task classified medium still finishes in
 * three turns, while a large task classified small is the original bug.
 */

const BUDGETS: Record<Complexity, Budget> = {
  /**
   * Two edits and a build. A request this specific does not need a plan, and
   * demanding one would spend a turn writing "1. change the word" before
   * changing the word.
   */
  small: { complexity: "small", maxTurns: 12, requiresPlan: false, minSteps: 0 },

  /** Enough to read what exists, change several files, and verify. */
  medium: { complexity: "medium", maxTurns: 24, requiresPlan: true, minSteps: 3 },

  /**
   * Enough to inspect the project, find what is missing, and actually do it.
   * Six steps is the floor for "make this complete" because fewer than that is
   * not an answer to the question — it is a gesture at one.
   */
  large: { complexity: "large", maxTurns: 40, requiresPlan: true, minSteps: 6 },
}

export function classifyComplexity(prompt: string): Budget {
  const text = prompt.toLowerCase()

  if (LARGE.some((phrase) => text.includes(phrase))) return BUDGETS.large
  if (MEDIUM.some((phrase) => text.includes(phrase))) return BUDGETS.medium

  /**
   * A long request is usually a compound one — several sentences describing
   * several things — even when none of its words are on a list. Length is a
   * weak signal used only after the explicit ones have said nothing.
   */
  if (prompt.trim().length > 180) return BUDGETS.medium

  return BUDGETS.small
}

/** What the model is told about the room it has, and what is expected in it. */
export function budgetInstruction(budget: Budget): string {
  switch (budget.complexity) {
    case "large":
      return `THIS IS A BROAD REQUEST, and broad requests are where an agent most often does one small thing and calls it finished. It is not asking for a change; it is asking you to find what is missing and fix it.

Read the project first — every page, the shared components, the stylesheet. Then decide what would genuinely move it toward what was asked: content that is not there, a hierarchy that does not lead anywhere, sections a site like this is expected to have, spacing and typography that read as unconsidered, states nobody handled, behaviour that breaks on a phone.

Write a plan of at least ${budget.minSteps} steps with set_plan, then carry it out. You have up to ${budget.maxTurns} turns; use what you need. One component edited is not an answer to this question.`

    case "medium":
      return `This names a real piece of work. Read what already exists before changing it — the component itself, whatever it sits inside, and the tokens it uses — then write a short plan with set_plan (about ${budget.minSteps} steps) and work through it. You have up to ${budget.maxTurns} turns.`

    case "small":
    default:
      return `This is a specific change. Make it, build, and stop — do not go looking for other things to improve, and do not write a plan for a single edit.`
  }
}
