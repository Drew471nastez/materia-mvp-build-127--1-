/**
 * ===========================================================================
 *  START WITH AI: FROM THE WEBSITE PAGE TO THE EDITOR
 * ===========================================================================
 * NOW: the site is built by a job on the server (lib/website-builder/ai-site,
 * the `job=` helpers at the end of this file). What follows is the path
 * before SQL part 380 has run: the description waits in this tab and the
 * editor builds the site in its own request (themes/[installId]/generate).
 * The steps below are how the description reaches the editor either way.
 *
 * Start with AI on /app/website-builder takes a description, makes a new
 * website (POST /api/website-builder/themes/create, mode "ai") and opens the
 * editor on it. The website agent runs in the editor, where its changes are
 * applied to the canvas as it makes them and stay editable, so the
 * description has to get there:
 *
 *   1. The page keeps it in this tab's sessionStorage under a key of the new
 *      website's own id, with the time, and opens the editor on it with
 *      `start=ai` among the address's words (withStartParam).
 *   2. The editor, seeing `start=ai`, takes the entry (removing it) and takes
 *      `start` off the address at once, so a reload or Back never sends it a
 *      second time. A missing entry, or one older than START_TTL_MS, sends
 *      nothing: the Ask panel just opens, empty.
 *   3. The Ask panel sends startMessage(description) through its own submit,
 *      exactly as if it had been typed there.
 *
 * Words, never the address: a description can be long and personal, and an
 * address is kept in history, logs and the Referer.
 */
import { classifyIntent } from "./agent/intent"

/** The address word the editor looks for: `?start=ai`. */
export const START_PARAM = "start"
export const START_AI = "ai"

/** How long a description waits for its editor. Ten minutes; a slow editor takes seconds. */
export const START_TTL_MS = 10 * 60_000

/** The longest description the page accepts. */
export const START_PROMPT_MAX = 2_000

/** Where a description waits, per website: the editor for another website never takes it. */
export function startKey(installId: string): string {
  return `storelib:start-ai:${installId}`
}

/** What sessionStorage offers, so a test can hand in a Map-backed stand in. */
export type StartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Keeps the description for the editor. False when the tab will not keep it (private mode, storage full). */
export function saveStartPrompt(storage: StartStorage | null | undefined, installId: string, prompt: string, now = Date.now()): boolean {
  const text = prompt.trim().slice(0, START_PROMPT_MAX)
  if (!storage || !installId || !text) return false
  try {
    storage.setItem(startKey(installId), JSON.stringify({ prompt: text, at: now }))
    return true
  } catch {
    return false
  }
}

/**
 * Takes the description for this website, once: the entry is removed
 * whatever it holds. Null when there is none, it cannot be read, or it is
 * older than START_TTL_MS (or from the future, a clock changed under it).
 */
export function takeStartPrompt(storage: StartStorage | null | undefined, installId: string, now = Date.now()): string | null {
  if (!storage || !installId) return null
  const key = startKey(installId)
  let raw: string | null = null
  try {
    raw = storage.getItem(key)
    storage.removeItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const entry = JSON.parse(raw) as { prompt?: unknown; at?: unknown }
    const prompt = typeof entry.prompt === "string" ? entry.prompt.trim() : ""
    const at = typeof entry.at === "number" ? entry.at : NaN
    if (!prompt || !Number.isFinite(at)) return null
    const age = now - at
    if (age < 0 || age > START_TTL_MS) return null
    return prompt.slice(0, START_PROMPT_MAX)
  } catch {
    return null
  }
}

/** An editor address (the website page's editorHref) that asks for the AI start: `start=ai` added to its words. */
export function withStartParam(editorHref: string): string {
  const [path, hash = ""] = editorHref.split("#", 2)
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}${START_PARAM}=${START_AI}${hash ? `#${hash}` : ""}`
}

/**
 * Whether this address asks for the AI start, and the address without it
 * (path, the other words and the hash kept), for history.replaceState.
 */
export function readStartParam(href: string): { wanted: boolean; cleaned: string | null } {
  let url: URL
  try {
    url = new URL(href, "https://storelib.invalid")
  } catch {
    return { wanted: false, cleaned: null }
  }
  if (!url.searchParams.has(START_PARAM)) return { wanted: false, cleaned: null }
  const wanted = url.searchParams.get(START_PARAM) === START_AI
  url.searchParams.delete(START_PARAM)
  return { wanted, cleaned: url.pathname + url.search + url.hash }
}

/** The words that open the message when the description alone would not read as a new website. */
export const START_LEAD = "Build a complete new website: "

/**
 * The first message to the website agent: the creator's words, verbatim.
 * When they already ask for a website ("Make me a site for my bakery"),
 * nothing is added. When they only describe one ("A sourdough bakery in
 * Lisbon, warm and simple"), a short lead says it is a new website to build,
 * so the agent builds the whole site rather than taking it for an edit.
 */
export function startMessage(prompt: string): string {
  const words = prompt.trim()
  if (!words) return ""
  const kind = classifyIntent(words, { bodySections: 0 }).kind
  return kind === "NEW_SITE_GENERATION" ? words : `${START_LEAD}${words}`
}

/* ===========================================================================
 *  START WITH AI AS A JOB (lib/website-builder/ai-site)
 * ===========================================================================
 * The Website page now starts the generation on the server and opens the
 * editor with the job's id among the address's words (`job=<id>`) beside
 * `start=ai`. The editor takes it off the address at once, like `start`, and
 * keeps it in this tab's storage under the website's id, so a reload still
 * shows the progress view while the job runs. The description itself goes
 * to the server in the request body (create route), never in the address.
 * When the server could not keep a job (SQL part 380 not run yet) the old
 * handoff above carries the description, and the editor builds the site in
 * its own request instead.
 */

/** The address word that names a generation job: `job=<id>`. */
export const JOB_PARAM = "job"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The editor address for a new AI website and its job. */
export function withJobParam(editorHref: string, jobId: string): string {
  const withStart = withStartParam(editorHref)
  const [path, hash = ""] = withStart.split("#", 2)
  return `${path}&${JOB_PARAM}=${encodeURIComponent(jobId)}${hash ? `#${hash}` : ""}`
}

/** The job named in an address, and the address without it. */
export function readJobParam(href: string): { jobId: string | null; cleaned: string | null } {
  let url: URL
  try {
    url = new URL(href, "https://storelib.invalid")
  } catch {
    return { jobId: null, cleaned: null }
  }
  if (!url.searchParams.has(JOB_PARAM)) return { jobId: null, cleaned: null }
  const raw = url.searchParams.get(JOB_PARAM) ?? ""
  url.searchParams.delete(JOB_PARAM)
  return { jobId: UUID.test(raw) ? raw.toLowerCase() : null, cleaned: url.pathname + url.search + url.hash }
}

export function jobKey(installId: string): string {
  return `storelib:start-ai-job:${installId}`
}

/** Remembers the website's running job in this tab, so a reload shows its progress. */
export function rememberJob(storage: StartStorage | null | undefined, installId: string, jobId: string | null): void {
  if (!storage || !installId) return
  try {
    if (jobId) storage.setItem(jobKey(installId), jobId)
    else storage.removeItem(jobKey(installId))
  } catch {
    /* a tab that keeps nothing shows the progress until it is reloaded */
  }
}

export function recallJob(storage: StartStorage | null | undefined, installId: string): string | null {
  if (!storage || !installId) return null
  try {
    const v = storage.getItem(jobKey(installId))
    return v && UUID.test(v) ? v : null
  } catch {
    return null
  }
}

/** A new key for one press of Create: the server makes one job per key. */
export function newStartKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}
