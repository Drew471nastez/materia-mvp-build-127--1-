/**
 * ===========================================================================
 *  QUESTIONS BEFORE JOINING (round 32)
 * ===========================================================================
 * What a community asks the people who join it, and what they answered,
 * checked the same way in the browser (the editor, the join form) and on the
 * server (supabase/sql/run-now/192_community_join_questions.sql keeps them).
 * Pure and browser safe.
 *
 *   A QUESTION   an id the server made (q_ and eight letters or digits), its
 *                words, an optional line under them, whether it must be
 *                answered, and its kind: a short answer, a paragraph, one
 *                choice, several choices, or an email address. A choice
 *                question has two to ten choices.
 *   AN ANSWER    the question's id, its words as they were asked (so a
 *                question changed later leaves the answer readable), its
 *                kind and the value: text, or the choices picked.
 */

export const JOIN_QUESTION_KINDS = ["short", "long", "choice", "multi", "email"] as const
export type JoinQuestionKind = (typeof JOIN_QUESTION_KINDS)[number]

export interface JoinQuestion {
  id: string
  kind: JoinQuestionKind
  label: string
  help: string
  required: boolean
  options: string[]
}

export interface JoinAnswer {
  id: string
  label: string
  kind: JoinQuestionKind
  value: string | string[]
}

export const JOIN_QUESTIONS_MAX = 8
export const JOIN_QUESTION_LABEL_MAX = 200
export const JOIN_QUESTION_HELP_MAX = 200
export const JOIN_OPTION_MAX = 80
export const JOIN_OPTIONS_MIN = 2
export const JOIN_OPTIONS_MAX = 10
export const JOIN_SHORT_MAX = 200
export const JOIN_LONG_MAX = 1000

const ID = /^q_[a-z0-9]{8}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Checked<T> = { ok: true; value: T } | { ok: false; error: string; index?: number; id?: string }

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

/** A fresh question id: q_ and eight letters or digits. */
export function newQuestionId(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789"
  let s = "q_"
  for (let i = 0; i < 8; i++) s += abc[Math.floor(random() * abc.length) % abc.length]
  return s
}

export function isChoiceKind(kind: JoinQuestionKind): boolean {
  return kind === "choice" || kind === "multi"
}

/**
 * The questions an editor sent, checked: up to eight, each with words, a
 * known kind, and two to ten different choices when it is a choice. A
 * question without an id (new in the editor) is given one; ids are unique.
 */
export function checkJoinQuestions(raw: unknown, random: () => number = Math.random): Checked<JoinQuestion[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "The questions did not arrive. Try again." }
  if (raw.length > JOIN_QUESTIONS_MAX) return { ok: false, error: `Ask up to ${JOIN_QUESTIONS_MAX} questions.` }
  const seen = new Set<string>()
  const out: JoinQuestion[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = (raw[i] && typeof raw[i] === "object" ? raw[i] : {}) as Record<string, unknown>
    const kind = (JOIN_QUESTION_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as JoinQuestionKind) : null
    if (!kind) return { ok: false, error: "Pick what kind of answer each question takes.", index: i }
    const label = oneLine(r.label, JOIN_QUESTION_LABEL_MAX + 1)
    if (!label) return { ok: false, error: "Write each question, or remove the empty one.", index: i }
    if (label.length > JOIN_QUESTION_LABEL_MAX) return { ok: false, error: `A question is up to ${JOIN_QUESTION_LABEL_MAX} characters.`, index: i }
    const help = oneLine(r.help, JOIN_QUESTION_HELP_MAX)
    let options: string[] = []
    if (isChoiceKind(kind)) {
      const list = Array.isArray(r.options) ? r.options : []
      options = list.map((o) => oneLine(o, JOIN_OPTION_MAX)).filter(Boolean)
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "Each choice must be different.", index: i }
      if (options.length < JOIN_OPTIONS_MIN) return { ok: false, error: `A choice question needs at least ${JOIN_OPTIONS_MIN} choices.`, index: i }
      if (options.length > JOIN_OPTIONS_MAX) return { ok: false, error: `A question has up to ${JOIN_OPTIONS_MAX} choices.`, index: i }
    }
    let id = typeof r.id === "string" && ID.test(r.id) && !seen.has(r.id) ? r.id : ""
    /* A given random that keeps repeating itself (a test's) cannot loop for ever: after a few tries, Math.random. */
    for (let tries = 0; !id || seen.has(id); tries++) id = newQuestionId(tries < 20 ? random : Math.random)
    seen.add(id)
    out.push({ id, kind, label, help, required: r.required === true, options })
  }
  return { ok: true, value: out }
}

/** Questions read back from the database: anything malformed is left out rather than refusing the page. */
export function readJoinQuestions(raw: unknown): JoinQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: JoinQuestion[] = []
  for (const q of raw.slice(0, JOIN_QUESTIONS_MAX)) {
    const r = (q && typeof q === "object" ? q : {}) as Record<string, unknown>
    if (typeof r.id !== "string" || !ID.test(r.id)) continue
    if (!(JOIN_QUESTION_KINDS as readonly string[]).includes(r.kind as string)) continue
    const label = oneLine(r.label, JOIN_QUESTION_LABEL_MAX)
    if (!label) continue
    const kind = r.kind as JoinQuestionKind
    const options = isChoiceKind(kind) && Array.isArray(r.options) ? r.options.map((o) => oneLine(o, JOIN_OPTION_MAX)).filter(Boolean).slice(0, JOIN_OPTIONS_MAX) : []
    if (isChoiceKind(kind) && options.length < JOIN_OPTIONS_MIN) continue
    out.push({ id: r.id, kind, label, help: oneLine(r.help, JOIN_QUESTION_HELP_MAX), required: r.required === true, options })
  }
  return out
}

/** The answer a field holds while it is being filled in: text, or the choices ticked. */
export type AnswerDraft = Record<string, string | string[]>

function textOf(kind: JoinQuestionKind, v: unknown): string {
  if (typeof v !== "string") return ""
  if (kind === "long") return v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, JOIN_LONG_MAX + 1)
  return v.replace(/\s+/g, " ").trim().slice(0, (kind === "email" ? 254 : JOIN_SHORT_MAX) + 1)
}

/**
 * What somebody answered, checked against the questions as they stand now:
 * a required question answered, a text within its length, an email that
 * looks like one, a choice one of the question's own. Answers to questions
 * that are not there any more are dropped. Empty optional answers are kept
 * out, so the list is what they actually said.
 */
export function checkJoinAnswers(questions: JoinQuestion[], raw: unknown): Checked<JoinAnswer[]> {
  const given = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const out: JoinAnswer[] = []
  for (const q of questions) {
    const v = given[q.id]
    if (isChoiceKind(q.kind)) {
      const picked = (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).filter((x): x is string => typeof x === "string")
      const valid = [...new Set(picked)].filter((x) => q.options.includes(x))
      if (valid.length !== new Set(picked).size) return { ok: false, error: "Pick one of the choices given.", id: q.id }
      if (q.kind === "choice" && valid.length > 1) return { ok: false, error: "Pick one choice.", id: q.id }
      if (!valid.length) {
        if (q.required) return { ok: false, error: "Answer this question to continue.", id: q.id }
        continue
      }
      out.push({ id: q.id, label: q.label, kind: q.kind, value: q.kind === "choice" ? valid[0] : q.options.filter((o) => valid.includes(o)) })
      continue
    }
    const text = textOf(q.kind, v)
    if (!text) {
      if (q.required) return { ok: false, error: "Answer this question to continue.", id: q.id }
      continue
    }
    const max = q.kind === "long" ? JOIN_LONG_MAX : q.kind === "email" ? 254 : JOIN_SHORT_MAX
    if (text.length > max) return { ok: false, error: `Keep this answer under ${max.toLocaleString("en-US")} characters.`, id: q.id }
    if (q.kind === "email" && !EMAIL.test(text)) return { ok: false, error: "That email address does not look right.", id: q.id }
    out.push({ id: q.id, label: q.label, kind: q.kind, value: q.kind === "email" ? text.toLowerCase() : text })
  }
  return { ok: true, value: out }
}

/** Answers read back from the database, for a screen: anything malformed is left out. */
export function readJoinAnswers(raw: unknown): JoinAnswer[] {
  if (!Array.isArray(raw)) return []
  const out: JoinAnswer[] = []
  for (const a of raw.slice(0, JOIN_QUESTIONS_MAX)) {
    const r = (a && typeof a === "object" ? a : {}) as Record<string, unknown>
    if (typeof r.id !== "string" || typeof r.label !== "string") continue
    const kind = (JOIN_QUESTION_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as JoinQuestionKind) : "short"
    const value = Array.isArray(r.value) ? r.value.filter((x): x is string => typeof x === "string") : typeof r.value === "string" ? r.value : ""
    if (Array.isArray(value) ? !value.length : !value) continue
    out.push({ id: r.id, label: r.label, kind, value })
  }
  return out
}

/** An answer as one line of text: choices joined with commas. */
export function answerText(a: Pick<JoinAnswer, "value">): string {
  return Array.isArray(a.value) ? a.value.join(", ") : a.value
}

/** Whether every required question has something in the draft, for the form's button. */
export function draftComplete(questions: JoinQuestion[], draft: AnswerDraft): boolean {
  return questions.every((q) => {
    if (!q.required) return true
    const v = draft[q.id]
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0
  })
}
