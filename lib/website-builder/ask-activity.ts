/**
 * ===========================================================================
 *  WHAT A RUN IS DOING, READ FROM WHAT IT SAYS
 * ===========================================================================
 * The page agent streams lines while it works (ThemeAgentEvent in
 * lib/website-builder/agent/loop.ts): its plan, its commentary, a step for
 * each tool call, each change as it lands, any section file it wrote. The
 * chat used to draw all of it as a panel with a spinner, "Working", ticks and
 * a 3/5 counter. This turns the same lines into what the chat draws now:
 *
 *   ONE LINE      what it is doing at this moment, which changes as it moves
 *   STEPS         what it has finished, folded away until asked for
 *   A SUMMARY     what it changed, by name, when it is over
 *   A QUESTION    when the run stopped to ask, with the answers to tap
 *
 * THE HEADLINE. The server says where a run is with `progress` lines
 * (lib/website-builder/agent/progress.ts): "Reading the page", "Planning",
 * "Writing the FAQ", "Checking contrast", "Saving the FAQ". Each one is the
 * line until the next replaces it, and joins the finished steps when it is
 * replaced. Its tool calls still arrive as `step` lines and are kept for the
 * list, but while there is a headline they do not take the line from it: a
 * run makes a dozen calls a second and the line would flicker through them.
 * Something newer and more specific than the headline still does: the
 * model's own sentence, or a change landing ("Added Testimonials"). The last
 * one, `done`, is not a step: it carries one sentence of what changed and the
 * sections it changed, by name, for the summary.
 *
 * THE QUESTION. A `question` line ends the run: one sentence, maybe why it
 * matters, and two to four answers. The closing `message` repeats it as text
 * for the transcript, which is how a conversation read back from the
 * database shows it (questionFromReply, below).
 *
 * GENERIC ON PURPOSE. The server's side of Storelib AI is its own work and
 * gains new kinds of progress lines. A line of a type this does not know,
 * carrying a `label`, is treated as a step, and a `progress` line of a phase
 * this does not know is a headline like any other: it becomes the one line
 * while it runs and joins the finished list after. So a new kind of line
 * shows up here without anything in the chat changing.
 *
 * Pure: tests/ask-dock.test.ts drives it with made up streams.
 */

export interface ActivityStep {
  id: string
  label: string
  state: "running" | "done" | "failed"
}

export interface ActivityCode {
  path: string
  source: string
}

/** The question a run stopped on: `{type: "question"}` in lib/website-builder/agent/loop.ts. */
export interface AskQuestion {
  id: string
  question: string
  /** Why it matters, in a few words, when the model said. */
  why?: string
  /** The answers to tap: two to four, each short. */
  options: string[]
}

/** The run's own account of what it changed: the `done` progress line. */
export interface ActivityDone {
  label: string
  /** One sentence of what changed. */
  detail?: string
  /** The sections it changed, by the names the sidebar uses. */
  sections: string[]
}

export interface Activity {
  steps: ActivityStep[]
  /** What it said it would do, before it did any of it. */
  plan?: string
  /** Its latest line of commentary. */
  note?: string
  /** The latest `progress` line's words: where the run is. */
  headline?: string
  /** One line per change, in the creator's words: "Added Testimonials". */
  changes: string[]
  /** The sections the changes touched, by id, for the count. */
  sections: string[]
  /** Whether the site's own settings (colours, fonts) changed. */
  theme: boolean
  /** Section files it wrote during the run. */
  code: ActivityCode[]
  /** Said at the end of a run that changed something. */
  done?: ActivityDone
  /** The run stopped to ask this. */
  question?: AskQuestion
  /**
   * Which kind of line arrived last. The one line follows the newest thing
   * said: a note that arrives after a step is newer than that step.
   */
  last: "none" | "plan" | "note" | "step" | "change" | "code" | "headline" | "done" | "question"
}

export const EMPTY_ACTIVITY: Activity = {
  steps: [],
  changes: [],
  sections: [],
  theme: false,
  code: [],
  last: "none",
}

/** Lines the chat handles itself: never steps, whatever they carry. */
const NOT_ACTIVITY = new Set(["conversation", "recorded", "unsaved", "message", "error", "sources-changed"])

/** A progress line of a kind this file does not know may say itself in `text` instead of `label`. */
const TEXT_IS_LABEL = /^(status|stage|phase|progress|activity|tool|task)$/

function stateOf(value: unknown): ActivityStep["state"] | null {
  return value === "running" || value === "done" || value === "failed" ? value : null
}

function upsertStep(steps: ActivityStep[], step: ActivityStep, settleOthers: boolean): ActivityStep[] {
  const at = steps.findIndex((s) => s.id === step.id)
  /* A new line of progress is the previous one over, when the server does not say so itself. */
  const settled = settleOthers
    ? steps.map((s) => (s.state === "running" && s.id !== step.id && s.id.startsWith("~") ? { ...s, state: "done" as const } : s))
    : steps
  if (at < 0) return [...settled, step]
  const next = [...settled]
  next[at] = step
  return next
}

/** The run is over where it says so (`done`, a question): nothing it started is still going. */
function settleSteps(steps: ActivityStep[]): ActivityStep[] {
  return steps.some((s) => s.state === "running") ? steps.map((s) => (s.state === "running" ? { ...s, state: "done" as const } : s)) : steps
}

/** Strings, trimmed, blanks and repeats left out: "Home" and "home" are one choice. */
function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const text = typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""
    const key = text.toLowerCase()
    if (text && !seen.has(key)) {
      seen.add(key)
      out.push(text)
    }
  }
  return out
}

/** The most answers a question offers: the server's policy (lib/website-builder/agent/ask.ts). */
export const MAX_OPTIONS = 4

function readQuestion(event: Record<string, unknown>): AskQuestion | null {
  const question = typeof event.question === "string" ? event.question.replace(/\s+/g, " ").trim() : ""
  if (!question) return null
  const why = typeof event.why === "string" ? event.why.replace(/\s+/g, " ").trim() : ""
  return {
    id: typeof event.id === "string" && event.id ? event.id : `q:${question}`,
    question,
    ...(why ? { why } : {}),
    /* None is still a question: it is answered in the box. */
    options: texts(event.options).slice(0, MAX_OPTIONS),
  }
}

/**
 * The run with one more line in it. Returns the same object for a line that
 * changes nothing here (the chat's own lines, blank ones), so a caller can
 * skip the render.
 */
export function reduceActivity(activity: Activity, event: Record<string, unknown>): Activity {
  const type = typeof event.type === "string" ? event.type : ""
  if (!type || NOT_ACTIVITY.has(type)) return activity

  if (type === "thinking") {
    const note = typeof event.text === "string" ? event.text.trim() : ""
    return note ? { ...activity, note, last: "note" } : activity
  }
  if (type === "plan") {
    const plan = typeof event.text === "string" ? event.text.trim() : ""
    return plan ? { ...activity, plan, last: "plan" } : activity
  }
  if (type === "code") {
    const path = typeof event.path === "string" ? event.path : ""
    const source = typeof event.source === "string" ? event.source : ""
    if (!path || !source) return activity
    const at = activity.code.findIndex((file) => file.path === path)
    const code = at < 0 ? [...activity.code, { path, source }] : activity.code.map((f, i) => (i === at ? { path, source } : f))
    return { ...activity, code, last: "code" }
  }
  if (type === "op") {
    const op = (event.op ?? {}) as Record<string, unknown>
    const label = typeof event.label === "string" && event.label.trim() ? event.label.trim() : "Changed the page"
    const target = typeof op.id === "string" ? op.id : typeof op.sectionId === "string" ? op.sectionId : null
    const sections = target && op.kind !== "update_theme" && !activity.sections.includes(target) ? [...activity.sections, target] : activity.sections
    return {
      ...activity,
      changes: [...activity.changes, label],
      sections,
      theme: activity.theme || op.kind === "update_theme",
      last: "change",
    }
  }
  if (type === "step") {
    const id = typeof event.id === "string" && event.id ? event.id : `~step:${String(event.label ?? "")}`
    const label = typeof event.label === "string" ? event.label.trim() : ""
    if (!label) return activity
    return { ...activity, steps: upsertStep(activity.steps, { id, label, state: stateOf(event.state) ?? "running" }, false), last: "step" }
  }

  /*
    WHERE THE RUN IS. Each headline replaces the one before it, which joins
    the finished steps; the same words again (the next turn's "Planning")
    are the same step, running again. `done` is the summary, not a step.
  */
  if (type === "progress") {
    const label = typeof event.label === "string" ? event.label.replace(/\s+/g, " ").trim() : ""
    if (event.phase === "done") {
      const detail = typeof event.detail === "string" ? event.detail.replace(/\s+/g, " ").trim() : ""
      return {
        ...activity,
        steps: settleSteps(activity.steps),
        done: { label: label || "Done", ...(detail ? { detail } : {}), sections: texts(event.sections) },
        last: "done",
      }
    }
    if (!label) return activity
    return {
      ...activity,
      headline: label,
      steps: upsertStep(activity.steps, { id: `~progress:${label}`, label, state: "running" }, true),
      last: "headline",
    }
  }

  /* The run stopped to ask. Nothing it started is still going. */
  if (type === "question") {
    const question = readQuestion(event)
    if (!question) return activity
    return { ...activity, question, steps: settleSteps(activity.steps), last: "question" }
  }

  /* Anything else with words of its own is progress: a step. */
  const raw = typeof event.label === "string" ? event.label : TEXT_IS_LABEL.test(type) && typeof event.text === "string" ? event.text : ""
  const label = raw.trim()
  if (!label) return activity
  const explicit = typeof event.id === "string" && event.id ? event.id : null
  const id = explicit ?? `~${type}:${label}`
  const state = stateOf(event.state) ?? "running"
  return { ...activity, steps: upsertStep(activity.steps, { id, label, state }, true), last: "step" }
}

/** The first sentence of the model's own words, short enough for one line. */
export function firstSentence(text: string, max = 64): string {
  const flat = text.replace(/\s+/g, " ").trim()
  const stop = flat.search(/[.!?](\s|$)/)
  const sentence = (stop > 0 ? flat.slice(0, stop) : flat).trim()
  if (sentence.length <= max) return sentence
  const cut = sentence.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`
}

/** Before the first line arrives: reading, and then planning, which is what the server does first. */
export const READING_MS = 1600

/**
 * THE ONE LINE. What the run is doing now, from the newest thing it said:
 *
 *   a headline from the server      its words: "Writing the FAQ", until the
 *                                   next one, or until one of the two below
 *                                   says something newer
 *   a step that is running          its label: "Reading the FAQ", when the
 *                                   server sends no headlines
 *   commentary newer than any step  its first sentence
 *   a change that just landed       what changed: "Added Testimonials"
 *   steps finished, none running    "Choosing the next step"
 *   nothing yet                     "Reading the page", then "Planning the change"
 *
 * Never a percentage and never a timer dressed up as progress: every word
 * here is either the run's own or true of the whole wait.
 */
export function activityLine(activity: Activity, elapsedMs: number): string {
  if (activity.last === "done" && activity.done) return activity.done.label
  if (activity.last === "question" && activity.question) return activity.question.question
  if (activity.headline) {
    if (activity.last === "note" && activity.note) return firstSentence(activity.note)
    if (activity.last === "change" && activity.changes.length) return activity.changes[activity.changes.length - 1]
    if (activity.last === "code" && activity.code.length) return `Writing ${activity.code[activity.code.length - 1].path.replace(/^sections\//, "")}`
    return activity.headline
  }
  const running = [...activity.steps].reverse().find((s) => s.state === "running")
  if (running && activity.last === "step") return running.label
  if (activity.last === "note" && activity.note) return firstSentence(activity.note)
  if (activity.last === "change" && activity.changes.length) return activity.changes[activity.changes.length - 1]
  if (activity.last === "code" && activity.code.length) return `Writing ${activity.code[activity.code.length - 1].path.replace(/^sections\//, "")}`
  if (running) return running.label
  if (activity.steps.length > 0) return "Choosing the next step"
  if (activity.last === "plan" || elapsedMs >= READING_MS) return "Planning the change"
  return "Reading the page"
}

/**
 * The run is over: nothing is still running. A step the server never closed
 * is settled with the run, failed when the run failed.
 */
export function settleActivity(activity: Activity, failed = false): Activity {
  if (!activity.steps.some((s) => s.state === "running")) return activity
  return {
    ...activity,
    steps: activity.steps.map((s) => (s.state === "running" ? { ...s, state: failed ? ("failed" as const) : ("done" as const) } : s)),
  }
}

/** A run read back from the history: its changes, counted the same way as a live one. */
export function activityFromOps(ops: unknown[]): Activity {
  let activity = EMPTY_ACTIVITY
  for (const op of ops) activity = reduceActivity(activity, { type: "op", op })
  return activity
}

/** Every finished step, oldest first, the running one left out. */
export function finishedSteps(activity: Activity): ActivityStep[] {
  return activity.steps.filter((s) => s.state !== "running")
}

/**
 * THE COUNT UNDER AN ANSWER. "1 section changed", "2 sections and the site's
 * colours changed", or nothing when nothing did. The model's reply says what
 * it did in words; this says how much, from the changes that actually landed.
 */
export function changeCount(activity: Pick<Activity, "sections" | "theme" | "changes" | "code">): string | null {
  const n = activity.sections.length
  const files = activity.code.length
  const parts: string[] = []
  if (n > 0) parts.push(`${n} section${n === 1 ? "" : "s"}`)
  if (activity.theme) parts.push("the site's settings")
  /* Changes that name no section are counted as changes: "2 changes made", never "2 changes changed". */
  const loose = parts.length === 0 ? activity.changes.length : 0
  const changed = loose > 0 ? `${loose} change${loose === 1 ? "" : "s"} made` : parts.length ? `${parts.join(" and ")} changed` : ""
  const wrote = files > 0 ? `${files} section file${files === 1 ? "" : "s"} rewritten` : ""
  const line = [changed, wrote].filter(Boolean).join(", ")
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : null
}

/** "Hero", "Hero and FAQ", "Hero, FAQ and Footer". */
function listed(names: string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** More names than this and the rest are counted: "Hero, FAQ and 3 more". */
const NAMED_AT_MOST = 3

/**
 * THE SUMMARY UNDER A FINISHED ANSWER. By name when the run said which
 * sections it changed ("Changed Hero and FAQ"), and counted when it did not:
 * a conversation read back from the database, or a server that sends no
 * `done` line.
 */
export function changeSummary(activity: Pick<Activity, "sections" | "theme" | "changes" | "code" | "done">): string | null {
  const names = activity.done?.sections ?? []
  if (names.length === 0) return changeCount(activity)
  const shown = names.length > NAMED_AT_MOST ? [...names.slice(0, NAMED_AT_MOST - 1), `${names.length - (NAMED_AT_MOST - 1)} more`] : names
  const parts = activity.theme ? [...shown, "the site's settings"] : shown
  const files = activity.code.length
  const wrote = files > 0 ? `, ${files} section file${files === 1 ? "" : "s"} rewritten` : ""
  return `Changed ${listed(parts)}${wrote}`
}

/** Words compared the way a person reads them: case, spacing and closing punctuation aside. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/, "")
    .trim()
}

/**
 * THE `done` SENTENCE, WHERE IT SAYS SOMETHING THE ANSWER DOES NOT. The
 * server writes it from the run's closing message, so under that message it
 * would be the same words twice. It is shown where the answer is not: a run
 * cut off after it finished, and the folded pill (theme-chat.tsx).
 */
export function detailToShow(reply: string | undefined, done: ActivityDone | undefined): string | null {
  const detail = done?.detail
  if (!detail) return null
  const said = plain(detail)
  if (!said) return null
  return reply && plain(reply).includes(said) ? null : detail
}

/**
 * A QUESTION READ BACK FROM THE TRANSCRIPT. The run's closing message keeps
 * it as text, in the shape questionText writes (lib/website-builder/agent/
 * ask.ts): the sentence, then one "- answer" line per choice. The same test
 * the agent uses to recognise its own question (a first line ending in "?",
 * lib/website-builder/agent/memory.ts), and then nothing but the choices, so
 * an ordinary answer with a list in it is still an ordinary answer.
 */
export function questionFromReply(reply: string | undefined, id: string): AskQuestion | null {
  if (!reply) return null
  const lines = reply
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const [question, ...rest] = lines
  if (!question || !/\?$/.test(question)) return null
  if (rest.length < 2 || rest.length > MAX_OPTIONS || !rest.every((line) => /^- \S/.test(line))) return null
  return { id, question, options: texts(rest.map((line) => line.slice(2))) }
}

/** Which of the answers was the one sent, when one was: the reply to a question is the next message. */
export function chosenOption(question: AskQuestion, answer: string | undefined): string | null {
  if (!answer) return null
  const sent = plain(answer)
  return question.options.find((option) => plain(option) === sent) ?? null
}
