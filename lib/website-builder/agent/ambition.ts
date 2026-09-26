/**
 * ===========================================================================
 *  HOW MUCH WORK IS THIS ACTUALLY ASKING FOR?
 * ===========================================================================
 * The theme editor was borrowing lib/sites/agent/complexity, which is written
 * for the CODE agent and reads a vocabulary this editor never uses — files,
 * dashboards, authentication, "multi-file". Measured against real phrasings,
 * it produced exactly the wrong answer:
 *
 *   "build me a very good complex section"   → small  → the cheap model
 *   "design a complete FAQ section"          → small  → the cheap model
 *   "add a pricing section"                  → medium → the strong model
 *
 * So the words that mean AMBITION — complex, complete, proper, great — got the
 * cheap model and the small budget, and the most ordinary request in the
 * product got the expensive one. That is the whole of "I ask him to build me a
 * good complex section and he does small work".
 *
 * ---------------------------------------------------------------------------
 *  THE DEFAULT IS INVERTED ON PURPOSE
 * ---------------------------------------------------------------------------
 * The code agent defaults to cheap and escalates, because a code run can send
 * a 289KB project through a model and cost real money. A theme run sends a
 * list of sections and their settings — tens of thousands of tokens, not
 * millions — so the strong model on a theme edit is cents, and the cost of
 * getting it wrong is a creator looking at a thin section and concluding the
 * product does not work.
 *
 * So: the good model unless the request is provably tiny. A tweak is a
 * sentence naming one concrete change to one thing, and that is a much safer
 * thing to recognise than ambition is.
 */

export type Scope = "tweak" | "build"

export interface RequestShape {
  scope: Scope
  /** Turns the loop may take. A ceiling, never a target. */
  maxTurns: number
  /** Whether this run should reach for the stronger model. */
  strong: boolean
  /**
   * The request PLAINLY asks for something to be built, designed or made
   * good, rather than merely not being tiny. This is the narrow signal, and
   * it is what the route promotes the model on: "build me a proper pricing
   * section" is worth the better model, "what does this button do" is not.
   */
  ambitious: boolean
  /**
   * A whole page, not one section: "build me a landing page", "make the
   * whole home page", "a complete website for my samples". Several sections
   * that have to work together, which is a different size of job.
   */
  wholePage: boolean
}

/**
 * A request that names one concrete change to one thing.
 *
 * Recognising THIS rather than recognising ambition is the safer direction: a
 * missed tweak costs a fraction of a cent, and a missed build costs somebody
 * their opinion of the product.
 */
const TWEAK_VERBS =
  /\b(change|set|rename|replace|swap|rewrite|update|make)\b.{0,40}\b(to|into|as)\b/i

const TWEAK_SUBJECTS =
  /\b(heading|headline|title|subheading|text|copy|word|colour|color|background|padding|spacing|size|font|button|label|link|image|price|name|section)\b/i

/**
 * Words that say the answer should be substantial. Not used to ESCALATE —
 * the strong model is already the default — but to widen the turn budget,
 * because "build a complex section" is genuinely a dozen tool calls: add it,
 * set its controls, write every block, then answer the review.
 */
const AMBITION =
  /\b(complex|complete|comprehensive|detailed|rich|full|proper|properly|thorough|premium|professional|beautiful|great|impressive|polished|stunning|world.?class|high.?end|build|create|design|redesign|overhaul|rebuild|from scratch)\b/i

/**
 * A WHOLE PAGE, NOT ONE SECTION. "Build me a landing page" is six sections
 * that have to agree with each other, and it was getting the same two dozen
 * turns as "add a pricing section". Each section done properly is a read, an
 * add, its controls and a block per entry, so a page of six is four times
 * the work of one.
 */
const WHOLE_PAGE =
  /\b(whole|entire|complete|full)\s+(site|website|page|home ?page|landing ?page)\b|\b(land(ing)? ?page|home ?page|web ?site)\b.{0,20}\b(from scratch|for (me|my)|build|create|design|make)\b|\b(build|create|design|make|redesign|rebuild)\b.{0,30}\b(land(ing)? ?page|home ?page|web ?site|whole page|entire page)\b/i

/** Short, one clause, no "and". The shape of a request that is one change. */
function looksTiny(prompt: string): boolean {
  const text = prompt.trim()
  if (text.length > 90) return false
  if (/\band\b|,|;|\n/.test(text)) return false
  if (AMBITION.test(text)) return false
  return TWEAK_VERBS.test(text) && TWEAK_SUBJECTS.test(text)
}

export function classifyRequest(prompt: string): RequestShape {
  if (looksTiny(prompt)) {
    return { scope: "tweak", maxTurns: 8, strong: false, ambitious: false, wholePage: false }
  }

  const wholePage = WHOLE_PAGE.test(prompt)
  /* A whole page is ambitious whether or not it says "proper": it is six sections that have to agree. */
  const ambitious = AMBITION.test(prompt) || wholePage

  /**
   * Twenty-four, not sixteen. Building a section properly is: read the type,
   * add it, set its controls, write six blocks, then answer whatever the
   * review comes back with. Sixteen turns was set when the agent could only
   * edit settings, and a model that senses it is running out of room does the
   * rational thing and stops early — which is the behaviour being fixed.
   */
  return {
    scope: "build",
    /* Thirty-six for a whole page: six sections at a read, an add, its controls and its blocks. */
    maxTurns: wholePage ? 36 : ambitious ? 24 : 16,
    strong: true,
    ambitious,
    wholePage,
  }
}
