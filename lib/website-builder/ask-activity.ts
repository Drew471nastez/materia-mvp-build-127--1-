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
 *   A SUMMARY     what it changed, counted, when it is over
 *
 * GENERIC ON PURPOSE. The server's side of Storelib AI is its own work and
 * gains new kinds of progress lines (checking colours, saving). A line of a
 * type this does not know, carrying a `label`, is treated as a step: it
 * becomes the one line while it runs and joins the finished list after. So
 * a new kind of line shows up here without anything in the chat changing.
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

export interface Activity {
  steps: ActivityStep[]
  /** What it said it would do, before it did any of it. */
  plan?: string
  /** Its latest line of commentary. */
  note?: string
  /** One line per change, in the creator's words: "Added Testimonials". */
  changes: string[]
  /** The sections the changes touched, by id, for the count. */
  sections: string[]
  /** Whether the site's own settings (colours, fonts) changed. */
  theme: boolean
  /** Section files it wrote during the run. */
  code: ActivityCode[]
  /**
   * Which kind of line arrived last. The one line follows the newest thing
   * said: a note that arrives after a step is newer than that step.
   */
  last: "none" | "plan" | "note" | "step" | "change" | "code"
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
const NOT_ACTIVITY = new Set(["conversation", "recorded", "message", "error", "sources-changed"])

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
 *   a step that is running          its label: "Reading the FAQ"
 *   commentary newer than any step  its first sentence
 *   a change that just landed       what changed: "Added Testimonials"
 *   steps finished, none running    "Working out the next step"
 *   nothing yet                     "Reading the page", then "Planning the change"
 *
 * Never a percentage and never a timer dressed up as progress: every word
 * here is either the run's own or true of the whole wait.
 */
export function activityLine(activity: Activity, elapsedMs: number): string {
  const running = [...activity.steps].reverse().find((s) => s.state === "running")
  if (running && activity.last === "step") return running.label
  if (activity.last === "note" && activity.note) return firstSentence(activity.note)
  if (activity.last === "change" && activity.changes.length) return activity.changes[activity.changes.length - 1]
  if (activity.last === "code" && activity.code.length) return `Writing ${activity.code[activity.code.length - 1].path.replace(/^sections\//, "")}`
  if (running) return running.label
  if (activity.steps.length > 0) return "Working out the next step"
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
  if (parts.length === 0 && activity.changes.length > 0) parts.push(`${activity.changes.length} change${activity.changes.length === 1 ? "" : "s"}`)
  const changed = parts.length ? `${parts.join(" and ")} changed` : ""
  const wrote = files > 0 ? `${files} section file${files === 1 ? "" : "s"} rewritten` : ""
  const line = [changed, wrote].filter(Boolean).join(", ")
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : null
}
