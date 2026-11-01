/**
 * ===========================================================================
 *  THE WRITER'S TOOLS, AS PLAIN FUNCTIONS
 * ===========================================================================
 * What the blog editor (components/admin/blog-editor.tsx and
 * app/admin/blog/posts/_editor-client.tsx) decides without a browser, kept
 * here so it is the same in the editor and in tests/blog-editor-r47.test.ts:
 *
 *   markdownShortcut   "## " at the start of an empty line makes a heading
 *   history            undo and redo across blocks, typing grouped by pause
 *   shortcuts          Cmd/Ctrl+S, Z, Shift+Z, Y
 *   wordCount          the words a reader reads, and the minutes
 *   searchTitle        the <title> the article renders ("%s | Storelib")
 *   seoChecklist       facts about the post, no score
 */

import type { Block, BlockType } from "./blocks"
import type { PostMeta } from "./editor-model"
import { plainText } from "./sanitize"

/* ── Markdown at the start of a line ─────────────────────────────────────── */

const MARKDOWN: { re: RegExp; type: BlockType }[] = [
  { re: /^###\s$/, type: "h3" },
  { re: /^##\s$/, type: "h2" },
  { re: /^[-*]\s$/, type: "ul" },
  { re: /^1[.)]\s$/, type: "ol" },
  { re: /^>\s$/, type: "quote" },
  { re: /^```$/, type: "code" },
  { re: /^---$/, type: "hr" },
]

/** The block a paragraph's whole text turns into, or null. A no-break space counts as a space: a browser types one at the end of a line. */
export function markdownShortcut(text: string): BlockType | null {
  const t = text.replace(/ /g, " ")
  for (const m of MARKDOWN) if (m.re.test(t)) return m.type
  return null
}

/* ── Undo and redo ───────────────────────────────────────────────────────── */

/**
 * Snapshots of the whole block list, which is never mutated, so a snapshot
 * is a reference. Typing in one block is one step until a pause of
 * TYPING_PAUSE_MS; anything else (Enter, a paste, a move, a delete, a
 * conversion) is a step of its own.
 */
export interface History<T> {
  past: T[]
  future: T[]
  lastKey: string | null
  lastAt: number
}

export const TYPING_PAUSE_MS = 1200
export const HISTORY_LIMIT = 200

export function createHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0 }
}

/** Before a change: `before` is the state it changes. `key` names a run of typing that may join the step before it; null always starts a step. */
export function recordChange<T>(h: History<T>, before: T, key: string | null, now: number, limit = HISTORY_LIMIT): void {
  h.future = []
  if (key !== null && key === h.lastKey && now - h.lastAt < TYPING_PAUSE_MS) {
    h.lastAt = now
    return
  }
  h.past.push(before)
  if (h.past.length > limit) h.past.shift()
  h.lastKey = key
  h.lastAt = now
}

/** The state to go back to, or null when there is none. `current` is kept for redo. */
export function undoStep<T>(h: History<T>, current: T): T | null {
  if (!h.past.length) return null
  const prev = h.past.pop() as T
  h.future.push(current)
  h.lastKey = null
  return prev
}

export function redoStep<T>(h: History<T>, current: T): T | null {
  if (!h.future.length) return null
  const next = h.future.pop() as T
  h.past.push(current)
  h.lastKey = null
  return next
}

/* ── Keys ────────────────────────────────────────────────────────────────── */

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const mod = (e: KeyLike) => (e.metaKey || e.ctrlKey) && !e.altKey

/** Cmd+S on a Mac, Ctrl+S elsewhere: save now. */
export function isSaveShortcut(e: KeyLike): boolean {
  return mod(e) && !e.shiftKey && e.key.toLowerCase() === "s"
}

export function isUndoShortcut(e: KeyLike): boolean {
  return mod(e) && !e.shiftKey && e.key.toLowerCase() === "z"
}

/** Shift+Cmd+Z, and Ctrl+Y as Windows has it. */
export function isRedoShortcut(e: KeyLike): boolean {
  return (mod(e) && e.shiftKey && e.key.toLowerCase() === "z") || (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "y")
}

/** Shift+Cmd+F: focus mode, the writing column alone. */
export function isFocusShortcut(e: KeyLike): boolean {
  return mod(e) && e.shiftKey && e.key.toLowerCase() === "f"
}

/* ── Words ───────────────────────────────────────────────────────────────── */

export const WORDS_PER_MINUTE = 230

/** The words a reader reads: text, list items, table cells, code, a call to action. A line break separates words. */
export function wordCount(blocks: Block[]): number {
  let words = 0
  const count = (s?: string) => {
    if (s) words += plainText(s.replace(/<br\s*\/?>/gi, " "), 1_000_000).split(/\s+/).filter(Boolean).length
  }
  for (const b of blocks) {
    count(b.html)
    b.items?.forEach(count)
    b.headers?.forEach(count)
    b.rows?.forEach((r) => r.forEach(count))
    count(b.text)
    count(b.body)
    count(b.title)
  }
  return words
}

export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/* ── Search ──────────────────────────────────────────────────────────────── */

export const TITLE_SUFFIX = " | Storelib"

/** The <title> the live article renders: the SEO title or the title, then the site's template (app/layout.tsx "%s | Storelib"). */
export function searchTitle(meta: Pick<PostMeta, "seo_title" | "title">): string {
  const base = (meta.seo_title || meta.title || "").replace(/ \| Storelib(?: Blog)?$/i, "").trim()
  return base ? `${base}${TITLE_SUFFIX}` : ""
}

/** The meta description the article renders: the SEO description, else the excerpt. */
export function searchDescription(meta: Pick<PostMeta, "seo_description" | "excerpt">): string {
  return (meta.seo_description || meta.excerpt || "").trim()
}

export const TITLE_FITS = 60
export const DESCRIPTION_FITS = 160

/** Every link address in a block's HTML, decoded. The editor's HTML is sanitized, so attributes are double quoted. */
function hrefsOf(html: string | undefined): string[] {
  if (!html) return []
  return [...html.matchAll(/<a\s[^>]*?href="([^"]*)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"))
}

/** A link to one of storelib.com's own pages: a path on this site, or an address on storelib.com. */
export function isInternalLink(href: string): boolean {
  const h = href.trim()
  if (!h || h.startsWith("#") || h.startsWith("//")) return false
  if (h.startsWith("/")) return true
  if (/^(mailto|tel|javascript|data):/i.test(h)) return false
  try {
    const host = new URL(h).hostname.toLowerCase()
    return host === "storelib.com" || host === "www.storelib.com"
  } catch {
    /* A relative address with no leading slash, such as "pricing". */
    return !/^[a-z][a-z0-9+.-]*:/i.test(h)
  }
}

export function internalLinks(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    const html = [b.html, ...(b.items ?? [])]
    for (const h of html) for (const href of hrefsOf(h)) if (isInternalLink(href)) out.push(href)
    if (b.type === "cta" && b.url && isInternalLink(b.url)) out.push(b.url)
  }
  return out
}

export const CLEAN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_LONG = 60

export type CheckState = "ok" | "warn" | "info"
export interface Check {
  id: "title" | "description" | "cover" | "images" | "h2" | "slug" | "links" | "keyword-title" | "keyword-intro"
  state: CheckState
  text: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function hasPhrase(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase().replace(/\s+/g, " ")
  return Boolean(n) && haystack.toLowerCase().replace(/\s+/g, " ").includes(n)
}

/**
 * Facts about the post a writer can act on. Each says what is there; "warn"
 * only where a search result or a reader is shorter of something. There is
 * no score: nothing here adds up to one.
 */
export function seoChecklist(meta: PostMeta, blocks: Block[], opts: { full: boolean }): Check[] {
  const out: Check[] = []

  const title = searchTitle(meta)
  if (!title) out.push({ id: "title", state: "warn", text: "No title yet." })
  else out.push({ id: "title", state: title.length <= TITLE_FITS ? "ok" : "warn", text: `Title in search results is ${plural(title.length, "character")}${title.length > TITLE_FITS ? `; about ${TITLE_FITS} fit before Google cuts it` : ""}.` })

  const description = searchDescription(meta)
  if (!description) out.push({ id: "description", state: "warn", text: "No meta description or excerpt: the search engine picks a line from the post." })
  else out.push({ id: "description", state: description.length <= DESCRIPTION_FITS ? "ok" : "warn", text: `Meta description is ${plural(description.length, "character")}${description.length > DESCRIPTION_FITS ? `; about ${DESCRIPTION_FITS} fit` : ""}.` })

  if (!meta.cover_image_url) out.push({ id: "cover", state: "warn", text: "No featured image." })
  else if (!opts.full) out.push({ id: "cover", state: "info", text: "Featured image set. Its alt text is saved once SQL part 345 has run." })
  else if (!meta.cover_alt.trim()) out.push({ id: "cover", state: "warn", text: "The featured image has no alt text." })
  else out.push({ id: "cover", state: "ok", text: "Featured image with alt text." })

  const pictures = blocks.filter((b) => b.type === "img" && b.url)
  const noAlt = pictures.filter((b) => !(b.alt ?? "").trim()).length
  if (!pictures.length) out.push({ id: "images", state: "info", text: "No pictures in the post." })
  else if (noAlt) out.push({ id: "images", state: "warn", text: `${noAlt} of ${plural(pictures.length, "picture")} ${noAlt === 1 ? "has" : "have"} no alt text.` })
  else out.push({ id: "images", state: "ok", text: pictures.length === 1 ? "The picture has alt text." : `All ${pictures.length} pictures have alt text.` })

  const h2 = blocks.filter((b) => b.type === "h2" && plainText(b.html ?? "", 500).trim()).length
  out.push(h2 ? { id: "h2", state: "ok", text: `${plural(h2, "H2 heading")}.` } : { id: "h2", state: "warn", text: "No H2 heading." })

  const slug = meta.slug
  if (!slug) out.push({ id: "slug", state: "warn", text: "No address yet." })
  else if (!CLEAN_SLUG.test(slug)) out.push({ id: "slug", state: "warn", text: `/blog/${slug} has characters other than a to z, 0 to 9 and single hyphens.` })
  else if (slug.length > SLUG_LONG) out.push({ id: "slug", state: "warn", text: `/blog/${slug} is ${slug.length} characters long.` })
  else out.push({ id: "slug", state: "ok", text: `/blog/${slug}` })

  const links = internalLinks(blocks).length
  out.push(links ? { id: "links", state: "ok", text: `${plural(links, "link")} to storelib.com pages.` } : { id: "links", state: "warn", text: "No links to other storelib.com pages." })

  const kw = meta.focus_keyword.trim()
  if (kw) {
    const inTitle = hasPhrase(meta.seo_title || meta.title, kw)
    out.push({ id: "keyword-title", state: inTitle ? "ok" : "warn", text: inTitle ? `“${kw}” is in the title.` : `“${kw}” is not in the title.` })
    const first = blocks.find((b) => b.type === "p" && plainText(b.html ?? "", 5000).trim())
    const inIntro = first ? hasPhrase(plainText(first.html ?? "", 5000), kw) : false
    out.push({ id: "keyword-intro", state: inIntro ? "ok" : "warn", text: !first ? "No first paragraph yet." : inIntro ? `“${kw}” is in the first paragraph.` : `“${kw}” is not in the first paragraph.` })
  }
  return out
}
