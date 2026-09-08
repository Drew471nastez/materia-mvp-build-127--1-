/**
 * ===========================================================================
 *  THE AGENT ASKING SOMETHING BACK
 * ===========================================================================
 * "Build me a landing page for my barber shop" is not enough to build a good
 * site from. What is it called? Which town? What does a cut cost? When is it
 * open? Without those, the model invents them, and a site full of invented
 * details is one the creator has to correct line by line — which is worse than
 * being asked four questions up front.
 *
 * ---------------------------------------------------------------------------
 *  ASKING MUST NOT MEAN WAITING
 * ---------------------------------------------------------------------------
 * The obvious design is to stop and wait for an answer. It is the wrong one.
 *
 * A creator who types one sentence and gets a form back has been given
 * homework, and the run they started has produced nothing they can look at.
 * Worse, a run that blocks has to hold a server-side conversation open across
 * a reply that might never come.
 *
 * So the agent asks AND KEEPS BUILDING. It puts the questions on screen, fills
 * the site with the best defaults it can justify, and finishes. The answers
 * arrive as an ordinary next message and refine what is already there — which
 * is also the honest order, because a creator can tell you what is wrong with
 * a site far more easily than they can specify one from nothing.
 *
 * That is why `ask_creator` returns immediately with an instruction to carry
 * on, and why nothing in the loop waits on it.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE SHAPE IS VALIDATED HERE
 * ---------------------------------------------------------------------------
 * These strings are rendered as interface — chips somebody taps. A model that
 * emits twelve questions, or a question that is three sentences long, produces
 * a chat pane nobody can use. The bounds are enforced where the data is
 * parsed rather than in the component, because a component that has to defend
 * itself against its own data is a component that will be got wrong once.
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
 * Four. A creator will answer four questions and abandon eight, and the run
 * has to be able to proceed on defaults regardless — so asking more buys
 * nothing and costs the whole interaction.
 */
export const MAX_QUESTIONS = 4

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
 * The model's arguments, turned into questions worth rendering.
 *
 * Returns `[]` rather than throwing for anything malformed. A bad tool call is
 * something the agent is told about and can retry — it is never a reason to
 * end a run that is otherwise building a site correctly.
 */
export function parseQuestions(args: Record<string, unknown>): AgentQuestion[] {
  const raw = Array.isArray(args.questions) ? args.questions : []
  const out: AgentQuestion[] = []

  for (const entry of raw) {
    /**
     * The cap is on questions KEPT, not on entries read.
     *
     * Slicing the raw array first meant four malformed entries could discard a
     * valid fifth — the creator would be told nothing was asked while the
     * model believed it had asked. Counting what survives is the only version
     * that means "at most four questions".
     */
    if (out.length >= MAX_QUESTIONS) break
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>

    const question = clean(record.question, MAX_QUESTION_CHARS)
    if (!question) continue

    const suggestions = (Array.isArray(record.suggestions) ? record.suggestions : [])
      .map((s) => clean(s, MAX_SUGGESTION_CHARS))
      .filter(Boolean)
      /**
       * Deduplicated, because two identical chips read as a bug in the page
       * rather than as a repeated suggestion.
       */
      .filter((s, index, all) => all.indexOf(s) === index)
      .slice(0, MAX_SUGGESTIONS)

    out.push({
      id: `q${out.length + 1}`,
      question,
      why: clean(record.why, MAX_WHY_CHARS) || undefined,
      suggestions,
      placeholder: clean(record.placeholder, MAX_SUGGESTION_CHARS) || undefined,
    })
  }

  return out
}

/**
 * What the model is told after asking.
 *
 * Phrased as an instruction to continue, and deliberately blunt about it: the
 * failure this guards against is a model that asks a question and then stops,
 * leaving a creator with a form and no site. That is the single worst outcome
 * available here, so the tool's own result says not to do it.
 */
export function askedNote(questions: AgentQuestion[]): string {
  return [
    `Asked the creator ${questions.length} question${questions.length === 1 ? "" : "s"}. They are on screen now.`,
    "DO NOT WAIT FOR AN ANSWER AND DO NOT STOP. You will not receive one during this run — the answers come back as a separate message afterwards.",
    "Carry on building the whole site now, using the most plausible defaults you can justify for anything you asked about. Say in your final reply which details you guessed at, so they know what to correct.",
  ].join(" ")
}

/**
 * Turned back into a prompt when the creator answers.
 *
 * Includes the QUESTION beside each answer rather than the answer alone,
 * because "Tuesday to Saturday, 9 to 6" on its own is a fact with no home —
 * the next run has a fresh transcript and no idea what was asked.
 */
export function answersPrompt(
  answers: Array<{ question: string; answer: string }>,
): string {
  const filled = answers.filter((a) => a.answer.trim().length > 0)
  if (filled.length === 0) return ""
  return [
    "Here are the answers to what you asked. Update the site so it uses them everywhere they belong — the header, the footer, the page copy, the contact details, the metadata — not only in one place.",
    ...filled.map((a) => `- ${a.question} ${a.answer.trim()}`),
  ].join("\n")
}
