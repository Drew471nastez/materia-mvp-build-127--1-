/**
 * ===========================================================================
 *  START WITH AI: WATCHING THE SITE BEING BUILT (round N, N1)
 * ===========================================================================
 * Andrew: "When I start with the AI builder it needs to open the website
 * builder immediately and start designing in real time. I cannot see it."
 *
 * What stood between the press and a canvas that fills in (found in round N,
 * the full list is in the N1 report and in tests/ai-builder-start-live-n1):
 *
 *   • the create call waited up to 8 s for a photograph of an empty site;
 *   • the editor showed "Loading the editor", then a white page or the
 *     theme's header and footer over "Empty Page, add sections";
 *   • the agent's events were only read once the editor had loaded, after a
 *     first poll of the classic view;
 *   • the canvas read the drafts again at most every 8 s, only for the page
 *     that was open (home), so a page the agent wrote never showed;
 *   • the progress card sat in the middle of the canvas, up to 560 px tall,
 *     over the very place new sections appear.
 *
 * The pure parts of the fix live here, so they are tested without a browser:
 * when to read the drafts again (debounced, never starved), which page to
 * follow, what the agent is doing in plain words, which sections are new.
 * Pure and safe in the browser and on the server.
 */
import type { AgentEvent, AgentToolName } from "@/lib/ai-builder/types"
import { componentName } from "./agent-progress"

/* ── reading the drafts again while the agent writes ───────────────────── */

/** Quiet time after the last change before the canvas reads the drafts again. */
export const LIVE_QUIET_MS = 900
/** The longest a change waits while changes keep coming: the canvas never starves. */
export const LIVE_MAX_WAIT_MS = 3_000

/**
 * How long to wait before reading the drafts again. `firstAt` is the first
 * change not read yet, `lastAt` the newest. Debounced by LIVE_QUIET_MS, and
 * never later than LIVE_MAX_WAIT_MS after the first one. Pure.
 */
export function liveRefreshDelay(o: { now: number; firstAt: number; lastAt: number }, quietMs = LIVE_QUIET_MS, maxMs = LIVE_MAX_WAIT_MS): number {
  const quiet = o.lastAt + quietMs - o.now
  const cap = o.firstAt + maxMs - o.now
  return Math.max(0, Math.min(quiet, cap))
}

/* ── which page the canvas follows ─────────────────────────────────────── */

/**
 * The page the agent worked on last, from new events: the newest page event
 * that made or filled a page (not one it removed). Null when the events say
 * nothing about a page. Pure.
 */
export function followPage(events: readonly AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind !== "page" || e.action === "removed") continue
    if (e.action === "created" && e.sections === 0) continue
    if (typeof e.page === "string" && e.page) return e.page
  }
  return null
}

/* ── what it is doing, in plain words ──────────────────────────────────── */

const PAGE_WORD: Record<string, string> = { home: "home", product: "product", collection: "collection", cart: "cart", search: "search" }

/** "home" → "the home page", "size-guide" → "the size guide page". */
export function pageWords(page: string): string {
  const name = PAGE_WORD[page] ?? page.replace(/[-_]+/g, " ").trim()
  return name ? `the ${name} page` : "a page"
}

/** "the header", "the hero banner": a section file as a person says it. */
function sectionWords(path: string): string {
  return `the ${componentName(path)}`
}

/** The tool's own words in a `tool` event's summary: "write file sections/ai_x.storelib", "set page sections page home". */
function targetOf(e: { tool: string; summary: string }): { path: string | null; page: string | null } {
  const head = e.tool.replace(/_/g, " ")
  const rest = e.summary.startsWith(head) ? e.summary.slice(head.length).replace(/:.*$/, "").trim() : ""
  if (/^sections\/|\.storelib$/.test(rest)) return { path: rest, page: null }
  const page = /^page (\S+)/.exec(rest)
  return { path: null, page: page ? page[1] : null }
}

/**
 * One tool call as the step the person reads ("Designing the header",
 * "Writing the product page"), or null for the looking around a person does
 * not need to read (listing files, reading one). Present tense: it is what
 * the agent is on. Pure; English, the view translates.
 */
export function toolStep(e: { tool: AgentToolName | string; summary: string; ok: boolean }): string | null {
  const { path, page } = targetOf(e)
  const where = page ? pageWords(page) : null
  if (e.ok === false) {
    if (e.tool === "report_progress") return e.summary || null
    if (path) return `Fixing ${sectionWords(path)}`
    return null
  }
  switch (e.tool) {
    case "write_file":
    case "edit_file":
      return path ? `Designing ${sectionWords(path)}` : "Designing a section"
    case "delete_file":
      return path ? `Removing ${sectionWords(path)}` : null
    case "set_page_sections":
    case "set_section_settings":
      return `Writing ${where ?? "a page"}`
    case "add_page":
      return `Adding ${where ?? "a page"}`
    case "set_tokens":
      return "Choosing colors and fonts"
    case "bind_data":
      return `Connecting your products to ${where ?? "a page"}`
    case "search_knowledge":
      return "Looking up design ideas"
    case "list_capabilities":
      return "Looking at your products and pages"
    case "validate":
      return path ? `Checking ${sectionWords(path)}` : "Checking for errors"
    case "render_check":
      return `Checking how ${where ?? "the page"} looks`
    case "report_progress":
      return e.summary || null
    case "finish":
      return "Finishing up"
    default:
      return null
  }
}

const PHASE_STEP: Record<string, string> = {
  brief: "Reading your description",
  plan: "Planning the design",
  build: "Building your website",
  verify: "Checking for errors",
  repair: "Fixing problems",
  finish: "Finishing up",
}

/**
 * What the agent is on now, in plain words, from the newest event that says
 * something a person would read: a step, a section designed, a page written.
 * Null before anything happened. Pure.
 */
export function currentStep(events: readonly AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    switch (e.kind) {
      case "tool": {
        const s = toolStep(e)
        if (s) return s
        break
      }
      case "file":
        if (e.action !== "deleted") return `Designing ${sectionWords(e.path)}`
        break
      case "page":
        if (e.action !== "removed") return `Writing ${pageWords(e.page)}`
        break
      case "tokens":
        return "Choosing colors and fonts"
      case "repair":
        return `Fixing ${sectionWords(e.path)}`
      case "phase":
        return PHASE_STEP[e.phase] ?? null
      default:
        break
    }
  }
  return null
}

/* ── the canvas while it builds ────────────────────────────────────────── */

/**
 * Whether the canvas shows the building state instead of the page: a build
 * is live and the open page has nothing of its own yet. Never over a missing
 * page's own message. Pure.
 */
export function showBuilding(o: { live: boolean; bodyCount: number; missing?: boolean }): boolean {
  return o.live && o.bodyCount === 0 && !o.missing
}

/** The ids that are on the page now and were not before a read of the drafts, in page order. Pure. */
export function arrivedIds(before: readonly string[], after: readonly { id: string }[]): string[] {
  const had = new Set(before)
  return after.map((s) => s.id).filter((id) => !had.has(id))
}
