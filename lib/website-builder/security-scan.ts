/**
 * ===========================================================================
 *  WHAT THE PUBLISH PANEL CAN SAY ABOUT A SITE'S SAFETY
 * ===========================================================================
 * The panel said "No security issues found" with nothing behind it. This is
 * the thing behind it: a read of the draft that is about to go live, theme
 * settings and every page, section and block, for what would make a
 * visitor's browser warn about the page, block part of it, or run something
 * nobody meant to put there.
 *
 *   a link or embed whose address runs code (javascript:, vbscript:) or
 *     holds a document (a data: address that is not a picture)
 *   a picture, video, frame or script loaded over plain http
 *   custom HTML with a script, an inline handler (onclick=, onload=…),
 *     a frame from a non-https address, or a form that posts to one
 *
 * Most of these are removed before a visitor sees them (sanitize.ts on
 * save, raw-html.ts as a section is drawn), and that is what the messages
 * say: the point is to tell a creator that the embed they pasted will not do
 * what they expect, not to alarm them.
 *
 * Pure: a draft in, a list out. One issue per kind per section, at most
 * SECURITY_ISSUE_LIMIT of them, in the order the site reads: theme settings,
 * then the home page, then the other pages by key, each top to bottom.
 */
import { isScriptScheme } from "@/lib/storelib-theme/storelib/raw-html"

export type SecurityIssueKind =
  | "script-link"
  | "insecure-media"
  | "custom-script"
  | "inline-handler"
  | "insecure-frame"
  | "insecure-form"

export interface SecurityIssue {
  kind: SecurityIssueKind
  /** The page's key, or null for the theme's own settings. */
  page: string | null
  /** The section's id, or null for the theme's own settings. A block's issue is its section's. */
  sectionId: string | null
  /** One short sentence for the creator. */
  message: string
}

export interface SiteDraft {
  /** The theme settings that will go live: draft_settings, else settings. */
  settings: Record<string, unknown> | null | undefined
  /** Every page, with the sections that will go live: draft_sections, else sections. */
  pages: { page_key: string; sections: unknown }[]
}

export const SECURITY_ISSUE_LIMIT = 20

export const SECURITY_MESSAGES: Record<SecurityIssueKind, string> = {
  "script-link": "A link here does not lead to a web page. Replace it with a normal web address.",
  "insecure-media": "A picture or video here loads over http, so browsers may block it. Use an https address.",
  "custom-script": "Custom code here includes a script. Scripts are removed, so it will not run on your site.",
  "inline-handler": "Custom code here reacts to clicks or loading. That part is removed, so it will not run.",
  "insecure-frame": "An embedded frame here loads over http, so browsers will block it. Use an https address.",
  "insecure-form": "A form here sends what people type without encryption. Use an https address.",
}

/* ── What a value looks like ─────────────────────────────────────────── */

/** A data: address that holds something other than a picture. */
function isDocumentData(value: string): boolean {
  const v = value.replace(/[\u0000- ]/g, "").toLowerCase()
  return v.startsWith("data:") && !v.startsWith("data:image/")
}

function isLinkThatRuns(value: string): boolean {
  return isScriptScheme(value) || isDocumentData(value)
}

function isInsecure(value: string): boolean {
  return /^\s*http:\/\//i.test(value)
}

/** A video address the embed filter turns into its https player, however it was pasted. */
function isPlayerAddress(value: string): boolean {
  return /^\s*http:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//i.test(value)
}

/** A setting whose value is a picture, a video or a frame rather than somewhere to go. */
const MEDIA_KEY = /image|img|photo|picture|logo|icon|video|poster|background|(^|_)bg($|_)|thumbnail|avatar|cover|media|gallery|favicon|banner|embed|(^|_)src$/i
/** A setting whose value is somewhere to go. A heading that starts "JavaScript:" is not one. */
const LINK_KEY = /url|link|href|action|redirect|destination/i
const MEDIA_FILE = /\.(avif|gif|jpe?g|png|svg|webp|mp4|webm|mov|m4v|mp3|wav|ogg)(\?|#|$)/i

const TAG = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTRIBUTE = /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/** The kinds of problem in one value, found by what it is and what it holds. */
function problemsIn(key: string, value: string, into: Set<SecurityIssueKind>) {
  if (!value) return
  if (value.indexOf("<") === -1) {
    const media = MEDIA_KEY.test(key)
    const link = LINK_KEY.test(key)
    if ((media || link) && isLinkThatRuns(value)) into.add("script-link")
    else if (isInsecure(value) && !isPlayerAddress(value) && (media || (!link && MEDIA_FILE.test(value)))) into.add("insecure-media")
    return
  }
  if (/<script[\s>/]/i.test(value)) into.add("custom-script")
  for (const tag of value.matchAll(TAG)) {
    const name = tag[1].toLowerCase()
    for (const attribute of tag[2].matchAll(ATTRIBUTE)) {
      const attr = attribute[1].toLowerCase()
      const v = attribute[2] ?? attribute[3] ?? attribute[4] ?? ""
      if (attr.startsWith("on") && attribute[0].includes("=")) into.add("inline-handler")
      if (["href", "src", "action", "formaction", "xlink:href", "data"].includes(attr) && isLinkThatRuns(v)) into.add("script-link")
      if (name === "form" && attr === "action" && isInsecure(v)) into.add("insecure-form")
      if ((attr === "src" || attr === "poster" || attr === "srcset" || attr === "data") && isInsecure(v)) {
        into.add(name === "iframe" || name === "frame" ? "insecure-frame" : "insecure-media")
      }
    }
  }
}

/** Every text value under a settings object, with the key it sits under. Arrays and nested groups included. */
function walk(value: unknown, key: string, depth: number, visit: (key: string, value: string) => void) {
  if (depth > 8) return
  if (typeof value === "string") { visit(key, value); return }
  if (Array.isArray(value)) { for (const item of value) walk(item, key, depth + 1, visit); return }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      /* `_theme_pack` is section schemas, and `_product_data` is filled in at view time: neither is content. */
      if (k.startsWith("_")) continue
      walk(v, k, depth + 1, visit)
    }
  }
}

const ORDER: SecurityIssueKind[] = ["script-link", "custom-script", "inline-handler", "insecure-form", "insecure-frame", "insecure-media"]

export function scanSiteSecurity(draft: SiteDraft, limit = SECURITY_ISSUE_LIMIT): SecurityIssue[] {
  const issues: SecurityIssue[] = []
  const report = (page: string | null, sectionId: string | null, kinds: Set<SecurityIssueKind>) => {
    for (const kind of ORDER) {
      if (issues.length >= limit) return
      if (kinds.has(kind)) issues.push({ kind, page, sectionId, message: SECURITY_MESSAGES[kind] })
    }
  }

  const theme = new Set<SecurityIssueKind>()
  walk(draft.settings ?? {}, "", 0, (k, v) => problemsIn(k, v, theme))
  report(null, null, theme)

  const pages = [...(draft.pages ?? [])].sort((a, b) =>
    a.page_key === b.page_key ? 0 : a.page_key === "home" ? -1 : b.page_key === "home" ? 1 : a.page_key < b.page_key ? -1 : 1,
  )
  for (const page of pages) {
    if (!Array.isArray(page.sections)) continue
    for (const section of page.sections as { id?: unknown; settings?: unknown; blocks?: { settings?: unknown }[] }[]) {
      if (issues.length >= limit) return issues
      if (!section || typeof section !== "object") continue
      const kinds = new Set<SecurityIssueKind>()
      walk(section.settings ?? {}, "", 0, (k, v) => problemsIn(k, v, kinds))
      for (const block of Array.isArray(section.blocks) ? section.blocks : []) walk(block?.settings ?? {}, "", 0, (k, v) => problemsIn(k, v, kinds))
      report(page.page_key, typeof section.id === "string" ? section.id : null, kinds)
    }
  }
  return issues
}
