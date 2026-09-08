/**
 * ===========================================================================
 *  THE AGENT ASKING SOMETHING BACK
 * ===========================================================================
 * "Build me a landing page for my barber shop" is not enough to build a good
 * site from. What is it called? Which town? What does a cut cost? When is it
 * open? Without those the model invents them, and a site full of invented
 * details is one the creator has to correct line by line.
 *
 * ---------------------------------------------------------------------------
 *  ASKING MEANS WAITING. THIS FILE USED TO ARGUE THE OPPOSITE.
 * ---------------------------------------------------------------------------
 * The first version asked and kept going: four questions on screen at once, a
 * site built on defaults, answers folded in afterwards as a follow-up message.
 * The reasoning was that a form in front of an empty page is homework.
 *
 * It was wrong in practice, for a reason the reasoning missed. By the time the
 * run had finished there was nothing left for the answers to change cheaply —
 * the copy was written, the pages were laid out, and "actually we are in Cluj"
 * meant redoing work that had just been done. The questions had become a
 * correction pass rather than an input. Worse, the chat disabled the answer
 * controls while a run was going, so the one moment they were useful was the
 * one moment they could not be touched.
 *
 * So the run WAITS now:
 *
 *   ONE QUESTION AT A TIME. Four at once is a form. One is a conversation, and
 *   it also lets the second question depend on the first answer — which is the
 *   only way the questions get sharper rather than generic.
 *
 *   MID-BUILD, NOT AFTER. The agent asks the moment it needs to know, and the
 *   answer changes what it builds next rather than what it rebuilds.
 *
 *   ANSWER OR SKIP, BOTH MOVE IT ON. Skipping is a decision and is passed to
 *   the model as one. Silence is not: see the timeout below.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE WAIT IS BOUNDED ANYWAY
 * ---------------------------------------------------------------------------
 * The route runs with maxDuration 300. A run that waits forever does not wait
 * forever — it is killed mid-build and everything it had done is lost, which
 * is a far worse outcome than a guessed town name.
 *
 * So the wait has a deadline, and it is subtracted from the run's own budget
 * rather than being a constant: waiting is only allowed while enough time
 * remains to finish building afterwards. Past that the model is told plainly
 * that nobody answered and to use its judgement.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE SHAPE IS VALIDATED HERE
 * ---------------------------------------------------------------------------
 * These strings are rendered as interface — chips somebody taps. A question
 * three sentences long produces a card nobody can read. The bounds are
 * enforced where the data is parsed rather than in the component, because a
 * component that has to defend itself against its own data is one that will be
 * got wrong once.
 */

/** One thing the agent wants to know. */
export interface AgentQuestion {
  /** Stable within a run, so answers can be matched back to questions. */
  id: string
  /** The question itself. One sentence. */
  question: string
  /** Why it is being asked — shown small, and it is what makes it feel fair. */
  why?: string
  /**
   * Tappable answers. Never exhaustive: free text is always allowed, so these
   * are a shortcut for the common case rather than a closed list.
   */
  suggestions: string[]
  /** Hint text in the free-text box. */
  placeholder?: string
}

/**
 * A question after the fact: what was asked and what came back.
 *
 * Separate from AgentQuestion because the two are true at different times.
 * AgentQuestion is what goes on screen while the run is stopped; this is what
 * is written to the transcript once it is over, and it is what somebody sees
 * when they reopen the site tomorrow.
 */
export interface AskedQuestion extends AgentQuestion {
  answer?: string
  outcome: "answered" | "skipped" | "timeout"
}

/**
 * How many times one run may stop to ask.
 *
 * Not how many can be on screen — that is always exactly one. This is the
 * total across a run, and it is what keeps "ask when you need to know" from
 * becoming an interview. Three is enough to get a name, a place and a price,
 * which is most of what a generic site is missing.
 */
export const MAX_ASKS_PER_RUN = 3

/** Long enough for "What are your opening hours?", short enough to be a chip. */
const MAX_QUESTION_CHARS = 160
const MAX_WHY_CHARS = 120
const MAX_SUGGESTIONS = 5
const MAX_SUGGESTION_CHARS = 48

function clean(value: unknown, limit: number): string {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, limit)
}

/**
 * The model's arguments, turned into the one question it may ask.
 *
 * Returns null rather than throwing for anything malformed. A bad tool call is
 * something the agent is told about and can retry — it is never a reason to
 * end a run that is otherwise building a site correctly.
 */
export function parseQuestion(args: Record<string, unknown>, id: string): AgentQuestion | null {
  const question = clean(args.question, MAX_QUESTION_CHARS)
  if (!question) return null

  const suggestions = (Array.isArray(args.suggestions) ? args.suggestions : [])
    .map((s) => clean(s, MAX_SUGGESTION_CHARS))
    .filter(Boolean)
    /**
     * Deduplicated, because two identical chips read as a bug in the page
     * rather than as a repeated suggestion.
     */
    .filter((s, index, all) => all.indexOf(s) === index)
    .slice(0, MAX_SUGGESTIONS)

  return {
    id,
    question,
    why: clean(args.why, MAX_WHY_CHARS) || undefined,
    suggestions,
    placeholder: clean(args.placeholder, MAX_SUGGESTION_CHARS) || undefined,
  }
}

/** How a question ended. `timeout` is nobody home, which is not a skip. */
export type AnswerOutcome =
  | { kind: "answered"; answer: string }
  | { kind: "skipped" }
  | { kind: "timeout" }

/**
 * What the model reads when the wait is over.
 *
 * The three outcomes are deliberately different sentences, because they are
 * different facts and a model that cannot tell them apart will treat a skip as
 * a licence to ask the same thing again in another form.
 */
export function answerNote(question: AgentQuestion, outcome: AnswerOutcome): string {
  switch (outcome.kind) {
    case "answered":
      return [
        `They answered: ${outcome.answer}`,
        "Use it everywhere it belongs — the header, the footer, the page copy, the contact details, the page titles — not only in the one place you were thinking of. Then carry on building.",
      ].join(" ")

    case "skipped":
      return [
        `They skipped "${question.question}".`,
        "That is an answer: they do not want to decide it, so decide it for them with something plausible and do not ask again in another form. Carry on building.",
      ].join(" ")

    case "timeout":
    default:
      return [
        "Nobody answered — they may have stepped away.",
        "Do not ask anything else this run. Use your best judgement for this and everything like it, finish the whole site, and say in your reply which details you chose so they know what to correct.",
      ].join(" ")
  }
}

/**
 * Told to the model when it tries to ask once too often.
 *
 * A refusal it can act on rather than an error: the run is not in trouble, it
 * simply has to decide this one itself.
 */
export function tooManyAsksNote(): string {
  return `You have already asked ${MAX_ASKS_PER_RUN} questions this run, which is the limit. Decide the rest yourself with plausible defaults, finish the site, and say in your reply what you chose.`
}
