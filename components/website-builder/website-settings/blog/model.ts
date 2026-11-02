/**
 * What the Blog screen decides without drawing anything: the status tabs and
 * their counts, which bulk actions a selection can take, the row menu a post
 * offers, the date a row shows, and selecting across a page. Kept apart so
 * tests/site-blog-ui.test.ts can hold each rule.
 */
import type { AdminPost, AdminPostSummary, SitePostMeta, SitePostStatus } from "@/lib/site-blog/types"
import { postSlugFrom } from "@/lib/site-blog/slug"
import { tt } from "@/lib/i18n/text"
import { formatDate, formatDateTime, instantAt, wallClockIn } from "@/lib/i18n/format"
import type { BulkAction, PostCounts, PostStatusFilter } from "./api"

export const STATUS_TABS: readonly { id: PostStatusFilter; label: () => string }[] = [
  { id: "all", label: () => tt("All") },
  { id: "draft", label: () => tt("Drafts") },
  { id: "scheduled", label: () => tt("Scheduled") },
  { id: "published", label: () => tt("Published") },
  { id: "archived", label: () => tt("Archived") },
]

export const EMPTY_COUNTS: PostCounts = { all: 0, draft: 0, scheduled: 0, published: 0, archived: 0 }

/** A count the server gave, or 0. "All" never includes archived posts: they are hidden from the default list. */
export const countFor = (counts: Partial<PostCounts> | null | undefined, id: PostStatusFilter): number => {
  const n = counts?.[id]
  return typeof n === "number" && Number.isFinite(n) ? n : 0
}

export function statusLabel(status: SitePostStatus): string {
  switch (status) {
    case "published":
      return tt("Published")
    case "scheduled":
      return tt("Scheduled")
    case "archived":
      return tt("Archived")
    default:
      return tt("Draft")
  }
}

export type StatusTone = "live" | "neutral" | "attention"
export const statusTone = (status: SitePostStatus): StatusTone => (status === "published" ? "live" : status === "scheduled" ? "attention" : "neutral")

/** The date a row shows, and what it is. */
export function rowDate(post: Pick<AdminPostSummary, "status" | "publishedAt" | "updatedAt">): string {
  if (post.status === "scheduled" && post.publishedAt) return tt("Goes live {when}", { when: formatDateTime(post.publishedAt, { dateStyle: "medium", timeStyle: "short" }) })
  if (post.status === "published" && post.publishedAt) return tt("Published {when}", { when: formatDate(post.publishedAt) })
  return tt("Edited {when}", { when: formatDate(post.updatedAt) })
}

export const pageCount = (total: number, perPage: number): number => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, perPage)))

/* ── Selection ─────────────────────────────────────────────────────────── */

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** The header's box: every post on the page selected, or (when they all were) none of them. Posts on other pages stay as they were. */
export function toggleAllOnPage(selected: ReadonlySet<string>, pageIds: readonly string[]): Set<string> {
  const next = new Set(selected)
  const all = pageIds.length > 0 && pageIds.every((id) => next.has(id))
  for (const id of pageIds) {
    if (all) next.delete(id)
    else next.add(id)
  }
  return next
}

export function pageSelection(selected: ReadonlySet<string>, pageIds: readonly string[]): "none" | "some" | "all" {
  const n = pageIds.filter((id) => selected.has(id)).length
  return n === 0 ? "none" : n === pageIds.length ? "all" : "some"
}

/* ── Bulk ──────────────────────────────────────────────────────────────── */

export const BULK_MAX = 200

/**
 * Which bulk actions a selection can take, from the statuses of the posts
 * known to be in it (a post selected on another page and since gone from
 * view counts as able to take any). Publish needs something not live;
 * Unpublish something live or scheduled; Archive something not archived.
 */
export function bulkAvailability(statuses: readonly (SitePostStatus | undefined)[]): Record<BulkAction, boolean> {
  const any = (fn: (s: SitePostStatus | undefined) => boolean) => statuses.some(fn)
  const has = statuses.length > 0 && statuses.length <= BULK_MAX
  return {
    publish: has && any((s) => s !== "published" && s !== "scheduled"),
    unpublish: has && any((s) => s === undefined || s === "published" || s === "scheduled"),
    archive: has && any((s) => s !== "archived"),
    unarchive: has && any((s) => s === undefined || s === "archived"),
    delete: has,
    set_category: has,
    add_tag: has,
    remove_tag: has,
  }
}

/** What a bulk answer says: how many were done, and the first reason one was not. */
export function bulkOutcome(done: number, failed: { error: string }[]): { tone: "ok" | "partial" | "failed"; text: string } {
  if (!failed.length) return { tone: "ok", text: tt("{count, plural, one {# post updated} other {# posts updated}}", { count: done }) }
  if (!done) return { tone: "failed", text: failed[0]?.error || tt("Something went wrong. Try again.") }
  return { tone: "partial", text: tt("{done} done, {failed} not: {reason}", { done, failed: failed.length, reason: failed[0]?.error ?? "" }) }
}

/* ── A row's menu ──────────────────────────────────────────────────────── */

export type RowAction = "edit" | "view" | "duplicate" | "publish" | "unpublish" | "archive" | "unarchive" | "delete"

/** In the order the menu lists them; Delete last. View only where visitors can open it now. */
export function rowActions(post: Pick<AdminPostSummary, "status" | "livePath">): RowAction[] {
  const out: RowAction[] = ["edit"]
  if (post.status === "published" && post.livePath) out.push("view")
  out.push("duplicate")
  if (post.status === "published" || post.status === "scheduled") out.push("unpublish")
  if (post.status === "archived") out.push("unarchive")
  else out.push("archive")
  out.push("delete")
  return out
}

/** A slug typed by hand, as the server keeps it: lower case, a to z, 0 to 9 and single hyphens. */
export function cleanSlugInput(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 120)
}

/* ── A date and time typed in the app's time zone ─────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0")

/** An instant as the two fields a date and a time input hold, on the wall clock of `zone`. */
export function zonedInputs(at: string | number | Date, zone: string): { date: string; time: string } {
  const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at)
  if (!Number.isFinite(ms)) return { date: "", time: "" }
  const w = wallClockIn(ms, zone)
  return { date: `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.min)}` }
}

/** The instant the two fields name on the wall clock of `zone`, or null when they do not name one. */
export function instantFromInputs(date: string, time: string, zone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time || "00:00")
  if (!d || !t) return null
  const [y, m, day, h, min] = [Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])]
  if (m < 0 || m > 11 || day < 1 || day > 31 || h > 23 || min > 59) return null
  const at = instantAt(y, m, day, h, min, zone)
  return Number.isFinite(at.getTime()) ? at : null
}

/* ── A post's slug and tags ────────────────────────────────────────────── */

/** Whether the slug should keep following the title: a post never published whose slug is still the title's, or a placeholder. */
export function slugFollowsTitle(post: Pick<AdminPost, "firstPublishedAt">, meta: Pick<SitePostMeta, "slug" | "title">): boolean {
  if (post.firstPublishedAt) return false
  return !meta.slug || meta.slug === postSlugFrom(meta.title) || /^(post|untitled|new-post)(-\d+)?$/.test(meta.slug)
}

export const TAGS_MAX = 20

/** A tag as the post keeps it: its words, single spaced, at most 40 characters. */
export function tidyTag(raw: string): string {
  return raw.replace(/[,#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

/** Tags typed (one, or several separated by commas) added to a post's, once each whatever their case, up to 20. */
export function addTags(tags: readonly string[], raw: string): string[] {
  const out = [...tags]
  for (const part of raw.split(",")) {
    const t = tidyTag(part)
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase()) && out.length < TAGS_MAX) out.push(t)
  }
  return out
}
