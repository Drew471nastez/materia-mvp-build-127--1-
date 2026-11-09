/**
 * ===========================================================================
 *  A SECTION SCRIPT'S RUNTIME ERROR, FROM THE CANVAS BACK TO THE AGENT
 * ===========================================================================
 * The server never runs a section's script (lib/ai-builder/render-check.ts
 * only parses it). The builder's canvas does, in the opaque-origin sandbox
 * (components/website-builder/sections/section-sandbox.tsx), and a script
 * that throws there says so with a guest "error" message. In the canvas
 * only, the page turns that into a window event (PREVIEW_ERROR_EVENT); the
 * editor, while an AI job is building this website, collects them
 * (lib/ai-builder/use-preview-errors.ts) and posts them to
 * POST /api/website-builder/ai-jobs/<id>/preview-errors, which keeps each as
 * an `error` event of the job with `source: "preview"`. The agent's next
 * iteration reads them and repairs the file.
 *
 * Everything that crosses is checked here, on both sides: the text a script
 * threw is somebody's code talking, so it is cut short, stripped of control
 * characters, and anything that looks like an address with a query or an
 * email is replaced. Nothing else of the page goes with it. Pure.
 */
import type { RuntimePreviewError } from "./types"

/** The window event the canvas raises for one sandboxed script error. */
export const PREVIEW_ERROR_EVENT = "storelib:section-script-error"

export const PREVIEW_ERROR_LIMITS = {
  /** Characters of the message kept. */
  message: 300,
  /** Errors in one post. */
  perPost: 10,
  /** Errors one open editor sends for one job, ever. */
  perSession: 40,
  /** Errors one job keeps in all (the route counts). */
  perJob: 60,
  /** Wait this long for more before posting, so a loop of errors is one post. */
  flushMs: 2_000,
} as const

const SECTION_ID = /^[A-Za-z0-9_-]{1,120}$/
const TYPE = /^[a-z0-9_-]{1,64}$/
const PAGE = /^[a-z0-9_.-]{1,80}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A script's words, made safe to keep and to show a model. */
export function cleanErrorMessage(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\bhttps?:\/\/[^\s"'<>]*\?[^\s"'<>]*/gi, "[address]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_ERROR_LIMITS.message)
}

/** One error as the editor or the route received it; null when it is not one. */
export function acceptPreviewError(raw: unknown, ctx: { installId: string; now?: Date }): RuntimePreviewError | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const sectionId = typeof r.sectionId === "string" ? r.sectionId.trim() : ""
  const type = typeof r.type === "string" ? r.type.trim().toLowerCase() : ""
  const page = typeof r.page === "string" ? r.page.trim() : ""
  const message = cleanErrorMessage(r.message)
  if (!SECTION_ID.test(sectionId) || !TYPE.test(type) || !PAGE.test(page) || !message) return null
  if (!UUID_RE.test(ctx.installId)) return null
  return { installId: ctx.installId.toLowerCase(), page, sectionId, type, message, at: (ctx.now ?? new Date()).toISOString() }
}

/** The `error` event payload (lib/ai-builder/types.ts AgentEvent) a preview error is kept as. */
export function previewErrorPayload(e: RuntimePreviewError): { message: string; retryable: false; source: "preview"; sectionId: string; type: string; page: string; path: string } {
  return { message: e.message, retryable: false, source: "preview", sectionId: e.sectionId, type: e.type, page: e.page, path: `sections/${e.type}.storelib` }
}

/** Is this stored event a preview error, for the agent reading its events. */
export function isPreviewErrorEvent(ev: { kind?: unknown; payload?: unknown }): boolean {
  return ev.kind === "error" && !!ev.payload && typeof ev.payload === "object" && (ev.payload as { source?: unknown }).source === "preview"
}

/**
 * What the editor holds between posts: each error once (section and words),
 * at most PREVIEW_ERROR_LIMITS.perSession in all. A section whose script
 * throws on every frame is reported once, not sixty times a second.
 */
export class PreviewErrorQueue {
  private seen = new Set<string>()
  private pending: RuntimePreviewError[] = []
  private sent = 0

  add(e: RuntimePreviewError): boolean {
    const key = `${e.page}|${e.sectionId}|${e.message}`
    if (this.seen.has(key) || this.sent + this.pending.length >= PREVIEW_ERROR_LIMITS.perSession) return false
    this.seen.add(key)
    this.pending.push(e)
    return true
  }

  /** The next post's errors, taken off the queue. */
  take(): RuntimePreviewError[] {
    const out = this.pending.splice(0, PREVIEW_ERROR_LIMITS.perPost)
    this.sent += out.length
    return out
  }

  get size(): number {
    return this.pending.length
  }
}
