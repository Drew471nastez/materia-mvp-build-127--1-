/**
 * The agent's own checklist, and the gate that decides whether it may stop.
 *
 * ---------------------------------------------------------------------------
 *  THE BUG THIS EXISTS TO CLOSE
 * ---------------------------------------------------------------------------
 * A turn with no tool calls was read as "the model is finished", and the loop
 * believed it. The model could stop at any point — after one edit, after none —
 * and the run was recorded as succeeded. Asked to make a site "much more
 * complete and premium", it would change one section and go quiet, and nothing
 * in the system disagreed.
 *
 * Silence is not evidence of completion. A run may now only end when the work
 * the agent ITSELF said was needed is done, and the project builds.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE AGENT WRITES ITS OWN CRITERIA
 * ---------------------------------------------------------------------------
 * The alternative is a fixed checklist per request type, which is wrong twice:
 * it cannot know what a particular site is missing, and it becomes a form to
 * fill in rather than a description of the work. Having the agent commit to a
 * plan first and then be held to it turns a vague ask into something with an
 * observable finish, without anybody having to guess in advance what the steps
 * are.
 *
 * It can revise the plan — projects surprise you — but it cannot quietly
 * shorten it to whatever it happens to have done.
 */

export interface PlanStep {
  /** What this step accomplishes, in the creator's language. */
  title: string
  done: boolean
}

export interface RunPlan {
  steps: PlanStep[]
  /** Set when the plan is revised, so the transcript shows it changed. */
  revisions: number
}

export const MAX_PLAN_STEPS = 20

export function emptyPlan(): RunPlan {
  return { steps: [], revisions: 0 }
}

export function setSteps(plan: RunPlan, titles: string[]): RunPlan {
  const steps = titles
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_PLAN_STEPS)
    .map((title) => {
      /**
       * A revised plan keeps what was already finished. Otherwise an agent
       * that reconsiders halfway through would mark completed work as
       * outstanding and do it twice.
       */
      const existing = plan.steps.find((s) => s.title === title)
      return { title, done: existing?.done ?? false }
    })

  return { steps, revisions: plan.steps.length === 0 ? 0 : plan.revisions + 1 }
}

/** Marks the first unfinished step whose title matches. */
export function completeStep(plan: RunPlan, title: string): { plan: RunPlan; found: boolean } {
  const wanted = title.trim().toLowerCase()
  let found = false

  const steps = plan.steps.map((step) => {
    if (found || step.done) return step
    // Loose matching on purpose: a model restating its own step slightly
    // differently should not be told the step does not exist.
    const t = step.title.toLowerCase()
    if (t === wanted || t.includes(wanted) || wanted.includes(t)) {
      found = true
      return { ...step, done: true }
    }
    return step
  })

  return { plan: { ...plan, steps }, found }
}

export function openSteps(plan: RunPlan): PlanStep[] {
  return plan.steps.filter((s) => !s.done)
}

export interface CompletionState {
  plan: RunPlan
  /** Whether a plan was required for this request at all. */
  requiresPlan: boolean
  minSteps: number
  /** The last build's verdict, or null if the agent has not built. */
  buildOk: boolean | null
  /** Whether anything at all was written. */
  changedAnything: boolean
  /**
   * The request was a question, not an instruction.
   *
   * "What does the hero component do?" is answered by reading and replying;
   * demanding an edit would refuse a run that did exactly what was asked. The
   * change requirement exists to catch a run that was TOLD to do something and
   * did not — not one that was asked something.
   */
  isQuestion: boolean
  /** How many times finishing has already been refused. */
  refusals: number
}

/**
 * Refusals are capped. A model that cannot satisfy the gate after several
 * attempts is stuck, and looping it until the turn budget runs out turns a
 * partial result into a failed run and bills for the difference. Two
 * corrections is enough to catch "forgot to build" and "forgot three steps";
 * past that, letting it finish and telling the creator what is outstanding is
 * more useful than grinding.
 */
export const MAX_REFUSALS = 2

/**
 * Does this read as a question rather than an instruction?
 *
 * Deterministic and deliberately narrow — a false positive here lets a run
 * finish having done nothing, which is the bug this file exists to stop. Only
 * an actual question mark, or an opening word that cannot begin an
 * instruction, counts.
 */
export function looksLikeQuestion(prompt: string): boolean {
  const text = prompt.trim().toLowerCase()
  if (text.endsWith("?")) return true
  return /^(what|why|how|where|which|who|when|does|do|is|are|can|could|should|will|would)\b/.test(
    text,
  )
}

/**
 * The reason the agent may not stop yet, or null when it may.
 *
 * Phrased as instructions rather than errors, because this text is fed back
 * into the run: it is the difference between the model knowing what to do next
 * and the model apologising.
 */
export function refuseToFinish(state: CompletionState): string | null {
  if (state.refusals >= MAX_REFUSALS) return null

  const open = openSteps(state.plan)

  if (state.requiresPlan && state.plan.steps.length === 0) {
    return `You have not written a plan. This request needs one: call set_plan with at least ${state.minSteps} steps describing what you are going to change, then carry them out. Do not stop here.`
  }

  if (state.requiresPlan && state.plan.steps.length < state.minSteps) {
    return `Your plan has ${state.plan.steps.length} step${
      state.plan.steps.length === 1 ? "" : "s"
    } and a request this broad needs at least ${state.minSteps}. Look at the project again — the pages, the shared components, the stylesheet — and extend the plan to cover what is actually missing. Then carry it out.`
  }

  if (open.length > 0) {
    return `You are not finished. These steps are still open:\n${open
      .map((s) => `  - ${s.title}`)
      .join(
        "\n",
      )}\nDo them, then mark each one with complete_step. If a step turned out to be unnecessary, say so in your reply and mark it complete — but do not stop with it silently outstanding.`
  }

  /**
   * A run that wrote nothing has not done the thing that was asked, whatever
   * it says. This is the exact shape of the original complaint: a confident
   * summary of work that never happened.
   */
  if (!state.changedAnything && !state.isQuestion) {
    return `You have not changed anything. If the request genuinely needs no change, say that plainly in your reply — otherwise make the change that was asked for.`
  }

  /**
   * Never built, or built red. Finishing on an unverified project is how a
   * creator gets a broken site and a message telling them it went well.
   */
  if (state.buildOk === null) {
    return `You have edited files but never built. Call run_build and fix anything it reports before you finish.`
  }

  if (state.buildOk === false) {
    return `The last build failed. Read the errors, fix them, and build again. Do not finish on a failing build.`
  }

  return null
}
