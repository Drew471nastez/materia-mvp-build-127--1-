/**
 * ===========================================================================
 *  A POST AS THE EDITOR HOLDS IT
 * ===========================================================================
 * Two halves: the blocks (lib/blog/blocks.ts) and the meta, everything else
 * the editor edits. On a post that is live, both are saved into the draft
 * copy (blog_posts.draft_content and draft_meta, SQL part 345) and reach the
 * live columns only on Update. On a post nobody can see yet, the live
 * columns are written too, so the list, the preview and an older reader all
 * see the same thing.
 *
 * Pure, shared by the editor (components/admin/blog-editor.tsx and
 * app/admin/blog/posts/_editor-client.tsx) and the server
 * (lib/blog/admin-store.ts), which runs every meta through normalizeMeta.
 */

import type { Block } from "./blocks"
import { plainText, safeHref, safeMediaUrl, sanitizeBlocks, uniqueAnchors } from "./sanitize"

export interface PostMeta {
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  read_time: string
  author_id: string | null
  /** The byline drawn when there is no author profile, and kept in step with the profile when there is: "Name - Role". */
  author_name: string
  cover_image_url: string
  cover_alt: string
  /** The share card. Empty: the cover is used. */
  og_image_url: string
  seo_title: string
  seo_description: string
  /** Optional. Stored in seo_keywords, which every version of the table has. */
  focus_keyword: string
  /** Empty: the post is canonical at its own address. */
  canonical_url: string
  noindex: boolean
}

export const SEO_TITLE_LIMIT = 60
export const META_DESCRIPTION_LIMIT = 160
export const DEFAULT_CATEGORY = "Getting Started"
export const DEFAULT_BYLINE = "Storelib Team"

export function emptyMeta(): PostMeta {
  return {
    title: "",
    slug: "",
    excerpt: "",
    category: DEFAULT_CATEGORY,
    tags: [],
    read_time: "",
    author_id: null,
    author_name: "",
    cover_image_url: "",
    cover_alt: "",
    og_image_url: "",
    seo_title: "",
    seo_description: "",
    focus_keyword: "",
    canonical_url: "",
    noindex: false,
  }
}

/** A title as an address: lower case ASCII letters and digits, single hyphens, at most 80 characters. */
export function slugify(text: string): string {
  return (text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
}

/** Words in the blocks, at 230 a minute, as "N min read". */
export function readTimeFor(blocks: Block[]): string {
  let words = 0
  const count = (s?: string) => {
    if (s) words += plainText(s, 1_000_000).split(/\s+/).filter(Boolean).length
  }
  for (const b of blocks) {
    count(b.html)
    b.items?.forEach(count)
    b.rows?.forEach((r) => r.forEach(count))
    count(b.text)
    count(b.body)
    count(b.title)
  }
  return `${Math.max(1, Math.round(words / 230))} min read`
}

const s = (v: unknown, max: number) => plainText(v, max).trim()

/** Every field checked, trimmed and capped. What the server stores, whatever the browser sent. */
export function normalizeMeta(input: Partial<PostMeta> | null | undefined, fallback: PostMeta = emptyMeta()): PostMeta {
  const m = { ...fallback, ...(input ?? {}) }
  const tags: string[] = []
  for (const t of Array.isArray(m.tags) ? m.tags : []) {
    const tag = s(t, 40).replace(/\s+/g, " ")
    if (tag && !tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag)
    if (tags.length >= 20) break
  }
  const canonical = safeHref(typeof m.canonical_url === "string" ? m.canonical_url : "")
  return {
    title: s(m.title, 200),
    slug: slugify(typeof m.slug === "string" ? m.slug : ""),
    excerpt: s(m.excerpt, 500),
    category: s(m.category, 80) || DEFAULT_CATEGORY,
    tags,
    read_time: s(m.read_time, 30),
    author_id: typeof m.author_id === "string" && /^[0-9a-f-]{36}$/i.test(m.author_id) ? m.author_id.toLowerCase() : null,
    author_name: s(m.author_name, 120),
    cover_image_url: safeMediaUrl(m.cover_image_url) ?? "",
    cover_alt: s(m.cover_alt, 300),
    og_image_url: safeMediaUrl(m.og_image_url) ?? "",
    seo_title: s(m.seo_title, 120),
    seo_description: s(m.seo_description, 320),
    focus_keyword: s(m.focus_keyword, 100),
    canonical_url: canonical && /^https?:\/\//i.test(canonical) ? canonical : "",
    noindex: m.noindex === true,
  }
}

/** Blocks as they are stored: sanitized, headings with unique anchors. */
export function normalizeBlocks(input: unknown): Block[] {
  return uniqueAnchors(sanitizeBlocks(input))
}

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" ? v : "")

/** The live columns of a row as a PostMeta. */
export function metaFromRow(row: Row): PostMeta {
  return normalizeMeta({
    title: str(row.title),
    slug: str(row.slug),
    excerpt: str(row.excerpt),
    category: str(row.category),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    read_time: str(row.read_time),
    author_id: str(row.author_id) || null,
    author_name: str(row.author_name) || str(row.author),
    cover_image_url: str(row.cover_image_url),
    cover_alt: str(row.cover_alt),
    og_image_url: str(row.og_image_url),
    seo_title: str(row.seo_title),
    seo_description: str(row.seo_description),
    focus_keyword: str(row.seo_keywords),
    canonical_url: str(row.canonical_url),
    noindex: row.noindex === true,
  })
}

/** What the editor opens: the draft when there is one, the live post otherwise. */
export function editorStateFromRow(row: Row): { meta: PostMeta; blocks: Block[]; hasDraft: boolean } {
  const live = metaFromRow(row)
  const draftMeta = row.draft_meta && typeof row.draft_meta === "object" ? (row.draft_meta as Partial<PostMeta>) : null
  const draftBlocks = Array.isArray(row.draft_content) ? row.draft_content : null
  return {
    meta: draftMeta ? normalizeMeta(draftMeta, live) : live,
    blocks: normalizeBlocks(draftBlocks ?? row.content),
    hasDraft: Boolean(draftMeta || draftBlocks),
  }
}

/**
 * The live columns for a meta and its blocks. `full` (SQL part 345) adds the
 * columns only that part creates; without it they are left out, so an
 * update never names a column the table does not have.
 */
export function liveColumns(meta: PostMeta, blocks: Block[], full: boolean): Row {
  const row: Row = {
    title: meta.title || "Untitled",
    slug: meta.slug,
    excerpt: meta.excerpt,
    content: blocks,
    category: meta.category,
    read_time: meta.read_time || readTimeFor(blocks),
    author_name: meta.author_name || DEFAULT_BYLINE,
    cover_image_url: meta.cover_image_url || null,
    seo_title: meta.seo_title || null,
    seo_description: meta.seo_description || null,
    seo_keywords: meta.focus_keyword || null,
  }
  if (full) {
    row.tags = meta.tags
    row.author_id = meta.author_id
    row.cover_alt = meta.cover_alt || null
    row.og_image_url = meta.og_image_url || null
    row.canonical_url = meta.canonical_url || null
    row.noindex = meta.noindex
  }
  return row
}

/** Whether the draft differs from what is live, field by field and block by block. */
export function draftDiffers(row: Row, meta: PostMeta, blocks: Block[]): boolean {
  return JSON.stringify(metaFromRow(row)) !== JSON.stringify(meta) || JSON.stringify(normalizeBlocks(row.content)) !== JSON.stringify(blocks)
}
