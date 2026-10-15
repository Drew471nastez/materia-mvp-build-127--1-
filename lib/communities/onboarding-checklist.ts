/**
 * ===========================================================================
 *  A NEW MEMBER'S FIRST STEPS (round 32)
 * ===========================================================================
 * The short list a community's admins choose for new members, and the
 * welcome message sent to each of them as a direct message (run-now part
 * 187). Pure and browser safe: the editor and the server check with the
 * same rules.
 *
 *   intro    Introduce yourself      done by any post in the community
 *   profile  Add a line about you    done by the member's community bio
 *   rules    Read the rules          done when they open them from the list
 *   comment  Comment on a post       done by any comment
 *   learn    Start a program         done by a lesson completed
 *   event    RSVP to an event        done by an RSVP
 *   custom   the admin's own words   done when they open it (with its link)
 *            or tick it
 *
 * A built in step appears once and its id is its kind; a custom step's id is
 * c_ and six letters or digits. Up to eight steps.
 */

export const STEP_KINDS = ["intro", "profile", "rules", "comment", "learn", "event", "custom"] as const
export type StepKind = (typeof STEP_KINDS)[number]

export interface ChecklistStep {
  id: string
  kind: StepKind
  /** The member reads this; empty means the kind's own words. */
  label: string
  /** A custom step's link (https, or a path on Storelib). */
  url: string
}

export interface OnboardingConfig {
  steps: ChecklistStep[]
  dmEnabled: boolean
  dmBody: string
}

export const STEPS_MAX = 8
export const STEP_LABEL_MAX = 80
export const STEP_URL_MAX = 500
export const DM_BODY_MAX = 2000

/** Progress rows that are not steps: the welcome message was sent, the member hid the list. */
export const PROGRESS_WELCOME_DM = "welcome_dm"
export const PROGRESS_DISMISSED = "dismissed"

/** How long after joining the list is shown, unless finished or hidden first. */
export const CHECKLIST_DAYS = 30

/** The steps a member does anyway, and the activity that says they did. */
export const ACTIVITY_OF: Partial<Record<StepKind, "post" | "comment" | "lesson_completed" | "rsvp">> = {
  intro: "post",
  comment: "comment",
  learn: "lesson_completed",
  event: "rsvp",
}

/** Steps the member marks done themselves, by opening or ticking them. */
export function manualStep(kind: StepKind): boolean {
  return kind === "rules" || kind === "custom"
}

/** The member's words for a step left without a label (the member side is English). */
export const STEP_DEFAULT_LABEL: Record<StepKind, string> = {
  intro: "Introduce yourself",
  profile: "Add a line about yourself",
  rules: "Read the rules",
  comment: "Comment on a post",
  learn: "Start a program",
  event: "RSVP to an event",
  custom: "Open this",
}

const CUSTOM_ID = /^c_[a-z0-9]{6}$/

type Checked<T> = { ok: true; value: T } | { ok: false; error: string; index?: number }

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

/** A custom step's link: https, or a path on Storelib. Anything else is no link. */
export function stepUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s) return ""
  if (s.length > STEP_URL_MAX) return null
  if (s.startsWith("/") && !s.startsWith("//") && !/[\s\\]/.test(s)) return s
  try {
    const u = new URL(s)
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}

export function newCustomId(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789"
  let s = "c_"
  for (let i = 0; i < 6; i++) s += abc[Math.floor(random() * abc.length) % abc.length]
  return s
}

/** What the editor sent, checked: the steps (each built in kind once), whether the welcome message is on, and its words. */
export function checkOnboarding(raw: unknown, random: () => number = Math.random): Checked<OnboardingConfig> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(r.steps) ? r.steps : []
  if (list.length > STEPS_MAX) return { ok: false, error: `Up to ${STEPS_MAX} steps.` }
  const steps: ChecklistStep[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    const s = (list[i] && typeof list[i] === "object" ? list[i] : {}) as Record<string, unknown>
    const kind = (STEP_KINDS as readonly string[]).includes(s.kind as string) ? (s.kind as StepKind) : null
    if (!kind) return { ok: false, error: "That step is not one Storelib knows.", index: i }
    const label = oneLine(s.label, STEP_LABEL_MAX + 1)
    if (label.length > STEP_LABEL_MAX) return { ok: false, error: `A step is up to ${STEP_LABEL_MAX} characters.`, index: i }
    let url = ""
    if (kind === "custom") {
      if (!label) return { ok: false, error: "Write what the step asks, or remove it.", index: i }
      const u = stepUrl(s.url)
      if (u === null) return { ok: false, error: "A link starts with https:// or is a path on Storelib.", index: i }
      url = u
    }
    let id: string = kind
    if (kind === "custom") {
      id = typeof s.id === "string" && CUSTOM_ID.test(s.id) && !seen.has(s.id) ? s.id : ""
      for (let tries = 0; !id || seen.has(id); tries++) id = newCustomId(tries < 20 ? random : Math.random)
    } else if (seen.has(id)) return { ok: false, error: "Each step appears once.", index: i }
    seen.add(id)
    steps.push({ id, kind, label, url })
  }
  const dmBody = typeof r.dmBody === "string" ? r.dmBody.replace(/\r\n?/g, "\n").trim() : ""
  if (dmBody.length > DM_BODY_MAX) return { ok: false, error: `The welcome message is up to ${DM_BODY_MAX.toLocaleString("en-US")} characters.` }
  const dmEnabled = r.dmEnabled === true
  if (dmEnabled && !dmBody) return { ok: false, error: "Write the welcome message, or turn it off." }
  return { ok: true, value: { steps, dmEnabled, dmBody } }
}

/** What the database holds, read for a screen: anything malformed is left out. */
export function readOnboarding(row: { steps?: unknown; dm_enabled?: unknown; dm_body?: unknown } | null | undefined): OnboardingConfig {
  const steps: ChecklistStep[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(row?.steps) ? row!.steps.slice(0, STEPS_MAX) : []) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    if (!(STEP_KINDS as readonly string[]).includes(s.kind as string)) continue
    const kind = s.kind as StepKind
    const id = kind === "custom" ? (typeof s.id === "string" && CUSTOM_ID.test(s.id) ? s.id : "") : kind
    if (!id || seen.has(id)) continue
    const label = oneLine(s.label, STEP_LABEL_MAX)
    if (kind === "custom" && !label) continue
    seen.add(id)
    steps.push({ id, kind, label, url: kind === "custom" ? (stepUrl(s.url) ?? "") : "" })
  }
  const dmBody = typeof row?.dm_body === "string" ? row.dm_body.slice(0, DM_BODY_MAX) : ""
  return { steps, dmEnabled: row?.dm_enabled === true && !!dmBody.trim(), dmBody }
}

/** The welcome message with the member's name in it: {name} becomes their first name, or "there". */
export function welcomeText(body: string, name: string | null | undefined): string {
  const first = (name ?? "").trim().replace(/^@/, "").split(/\s+/)[0] || "there"
  return body.replace(/\{name\}/g, first).trim()
}

/** Whether a member still sees the list: joined in the last 30 days, not the owner. */
export function checklistWindow(joinedAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = joinedAt ? Date.parse(joinedAt) : NaN
  return Number.isFinite(t) && now - t < CHECKLIST_DAYS * 86_400_000 && now - t >= -60_000
}

export interface ChecklistItemView {
  id: string
  kind: StepKind
  label: string
  href: string | null
  done: boolean
  /** The member marks it done by opening or ticking it. */
  manual: boolean
}

export interface ChecklistView {
  items: ChecklistItemView[]
  done: number
  total: number
}
