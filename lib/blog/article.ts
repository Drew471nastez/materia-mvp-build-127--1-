/**
 * ===========================================================================
 *  ONE BLOG ARTICLE, READ FROM ITS BLOCKS
 * ===========================================================================
 * Pure, for the public article and its tests (tests/blog-public-r45.test.ts):
 * nothing here reads a database or the browser.
 *
 *   BLOCKS     normalizeBlocks: what a row's `content` holds, as the shared
 *              format (./blocks). Older rows put a list or a picture inside a
 *              paragraph's html (measured on storelib.com, October 2026: 28
 *              paragraphs holding a <ul>, 27 holding only an <img>); those
 *              become list and picture blocks, so a sanitiser that keeps
 *              inline tags only does not flatten them into one run of text.
 *   OUTLINE    articleOutline: each h2 and h3 with the anchor it gets
 *              (headingAnchor, made unique), the same list the contents
 *              ("On this page") links to.
 *   READ TIME  from the words a reader reads: not code, not a transcript.
 *   CTA        which sign up box a post shows (digital, physical, community)
 *              and the /signup address it links to, tagged the way
 *              lib/alternatives/attribution reads a source.
 *   PATHS      a category's address: /blog/category/<slug>, page 2 on at
 *              /blog/category/<slug>/page/<n>. The old
 *              /blog/explore/categories/<slug> is a 308 to it.
 */
import { headingAnchor, type Block, type BlockType } from "./blocks"
import { CATEGORY_SUBTITLES, STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { BLOG_ORIGIN, BLOG_PAGE_SIZE, BLOG_URL, blogPageCount, mergeBlogPosts, newestBlogChange } from "./listing"

/* ─── Paths ──────────────────────────────────────────────────────────── */

export const BLOG_CATEGORY_BASE = "/blog/category"

/** A category as the blog_categories table holds it (lib/blog/categories readBlogCategories). A renamed category keeps its slug. */
export interface BlogCategory {
  slug: string
  name: string
  description: string
}

/** The eight categories written in code: what the pages use while blog_categories is missing or unreadable. */
export const STATIC_BLOG_CATEGORIES: BlogCategory[] = STORELIB_CATEGORIES.map((name) => ({ slug: categoryToSlug(name), name, description: CATEGORY_SUBTITLES[name] ?? "" }))

/** A category's slug: the table's when it lists the name, else made from the name. */
export function categorySlugOf(name: string, categories: readonly BlogCategory[] = STATIC_BLOG_CATEGORIES): string {
  return categories.find((c) => c.name === name)?.slug ?? categoryToSlug(name)
}

/** `/blog/category/<slug>` for page 1, `/blog/category/<slug>/page/<n>` after it. */
export function blogCategoryPath(category: string, page = 1, categories?: readonly BlogCategory[]): string {
  const slug = categorySlugOf(category, categories)
  return page <= 1 ? `${BLOG_CATEGORY_BASE}/${slug}` : `${BLOG_CATEGORY_BASE}/${slug}/page/${page}`
}

/** Where an old /blog/explore/categories/<slug> address now lives, or null for a category that does not exist. */
export function legacyCategoryTarget(slug: string, categories: readonly BlogCategory[] = STATIC_BLOG_CATEGORIES): string | null {
  return categories.some((c) => c.slug === slug) ? `${BLOG_CATEGORY_BASE}/${slug}` : null
}

/* ─── Text ───────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/** The words of a piece of inline html: tags gone, the common entities read back. */
export function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#?[a-z0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? (/^#\d+$/.test(name) ? String.fromCharCode(Number(name.slice(1))) : m))
    .replace(/\s+/g, " ")
    .trim()
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/* ─── Blocks ─────────────────────────────────────────────────────────── */

const TYPES = new Set<BlockType>(["p", "h2", "h3", "hr", "img", "youtube", "table", "quote", "ul", "ol", "code", "callout", "cta", "embed", "video", "snippet"])

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
  return m ? (m[2] ?? m[3]) : undefined
}

/** A picture address worth drawing: http(s) or a path on Storelib. */
export function safeImageUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim()
  if (/^https?:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//"))) return u
  return null
}

/**
 * A paragraph's html split where an older row put a list or a lone picture
 * inside it. Anything else stays one paragraph.
 */
function splitParagraph(block: Block): Block[] {
  const html = block.html ?? ""
  if (!/<(ul|ol|img)\b/i.test(html)) return [block]
  const out: Block[] = []
  const re = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1\s*>|<img\b[^>]*>/gi
  let last = 0
  let n = 0
  const push = (b: Omit<Block, "id">) => out.push({ ...b, id: `${block.id}${n++ ? `-${n - 1}` : ""}` } as Block)
  const text = (chunk: string) => {
    const trimmed = chunk.replace(/^\s*(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi, "").trim()
    if (plainText(trimmed)) push({ type: "p", html: trimmed })
  }
  for (let m = re.exec(html); m; m = re.exec(html)) {
    text(html.slice(last, m.index))
    if (m[1]) {
      const items = [...m[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)].map((li) => li[1].trim()).filter((li) => plainText(li))
      if (items.length) push({ type: m[1].toLowerCase() as "ul" | "ol", items })
    } else {
      const src = safeImageUrl(attr(m[0], "src"))
      if (src) push({ type: "img", url: src, alt: attr(m[0], "alt") ?? "" })
    }
    last = m.index + m[0].length
  }
  text(html.slice(last))
  return out
}

/** A row's `content` as blocks the article can draw: unknown entries dropped, every block with an id. */
export function normalizeBlocks(content: unknown): Block[] {
  if (!Array.isArray(content)) return []
  const out: Block[] = []
  content.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return
    const b = raw as Partial<Block>
    if (typeof b.type !== "string" || !TYPES.has(b.type as BlockType)) return
    const block = { ...b, id: typeof b.id === "string" && b.id ? b.id : `b${i}` } as Block
    if (block.type === "p" && !block.html && block.text) block.html = escapeHtml(block.text)
    if (block.type === "p") out.push(...splitParagraph(block))
    else out.push(block)
  })
  return out
}

/** The four code-written posts' lines ("## " a heading, "**bold**", a line break a new paragraph) as blocks. */
export function legacyBlocks(lines: string[]): Block[] {
  const out: Block[] = []
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      out.push({ id: `l${i}`, type: "h2", html: escapeHtml(line.slice(3).trim()) })
      return
    }
    line.split("\n").forEach((part, j) => {
      const html = escapeHtml(part.trim()).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      if (html) out.push({ id: `l${i}-${j}`, type: "p", html })
    })
  })
  return out
}

/* ─── Outline ────────────────────────────────────────────────────────── */

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

/**
 * Every h2 and h3 with its anchor, unique on the page (a second "Pricing" is
 * pricing-2). `anchors[i]` is block i's id, set for headings only, so the
 * heading and its contents link always agree.
 */
export function articleOutline(blocks: Block[]): { toc: TocItem[]; anchors: (string | undefined)[] } {
  const seen = new Map<string, number>()
  const toc: TocItem[] = []
  const anchors = blocks.map((b) => {
    if (b.type !== "h2" && b.type !== "h3") return undefined
    const text = plainText(b.html ?? b.text)
    if (!text) return undefined
    const base = headingAnchor(b)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const id = n === 1 ? base : `${base}-${n}`
    toc.push({ id, text, level: b.type === "h2" ? 2 : 3 })
    return id
  })
  return { toc, anchors }
}

/* ─── Reading time ───────────────────────────────────────────────────── */

const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length

/** The words a reader reads: prose, lists, tables, captions and boxes. Not code, not a collapsed transcript. */
export function articleWordCount(blocks: Block[]): number {
  let n = 0
  for (const b of blocks) {
    switch (b.type) {
      case "p":
      case "h2":
      case "h3":
      case "quote":
      case "callout":
        n += words(plainText(b.html ?? b.text))
        break
      case "ul":
      case "ol":
        for (const item of b.items ?? []) n += words(plainText(item))
        break
      case "table":
        for (const cell of [...(b.headers ?? []), ...(b.rows ?? []).flat()]) n += words(plainText(cell))
        break
      case "cta":
        n += words(`${b.title ?? ""} ${b.body ?? ""}`)
        break
      case "img":
      case "video":
      case "embed":
      case "youtube":
        n += words(b.caption ?? "")
        break
    }
  }
  return n
}

/** Minutes at 230 words a minute, rounded up, never less than one. */
export function readMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 230))
}

/* ─── Dates ──────────────────────────────────────────────────────────── */

const DAY = 86_400_000

/** True when a post was saved again at least two days after it went out: a real update, not the publish itself. */
export function isMeaningfullyUpdated(published: string | null | undefined, updated: string | null | undefined): boolean {
  const p = published ? Date.parse(published) : NaN
  const u = updated ? Date.parse(updated) : NaN
  return Number.isFinite(p) && Number.isFinite(u) && u - p >= 2 * DAY
}

export function formatBlogDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/* ─── YouTube chapters ───────────────────────────────────────────────── */

export interface Chapter {
  seconds: number
  stamp: string
  label: string
}

/** "1:05 Pricing" and "1:02:03 Wrap up" lines as chapters, in the order given. A line without a time is skipped. */
export function parseChapters(lines: string[] | null | undefined): Chapter[] {
  const out: Chapter[] = []
  for (const line of lines ?? []) {
    const m = line.trim().match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:[-–—:]\s*)?(.+)$/)
    if (!m) continue
    const parts = m[1].split(":").map(Number)
    const seconds = parts.reduce((acc, p) => acc * 60 + p, 0)
    if (!Number.isFinite(seconds)) continue
    out.push({ seconds, stamp: m[1], label: m[2].trim() })
  }
  return out
}

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** The watch address at a time, for a chapter link that works without script. */
export function youtubeWatchUrl(videoId: string, seconds = 0): string {
  return `https://www.youtube.com/watch?v=${videoId}${seconds > 0 ? `&t=${seconds}s` : ""}`
}

/* ─── Author ─────────────────────────────────────────────────────────── */

export interface BlogAuthor {
  name: string
  role: string | null
  /** True for a team byline ("Storelib Team"): schema.org says Organization, not Person. */
  organization: boolean
}

/** "Anisia - Head of Marketing" is a name and a role; "Storelib Team" is the company. */
export function authorOf(byline: string | null | undefined): BlogAuthor {
  const text = (byline ?? "").trim() || "Storelib Team"
  const [name, ...role] = text.split(/\s+[-–—|]\s+/)
  const clean = name.trim() || text
  return { name: clean, role: role.length ? role.join(" - ").trim() : null, organization: /^storelib(\s+(team|blog|editors?))?$/i.test(clean) }
}

/* ─── The sign up box ────────────────────────────────────────────────── */

export type CtaVariant = "digital" | "physical" | "community"

/**
 * What the box inside an article says, by what the post is about (ctaVariant).
 * Facts from the product: a free plan with no monthly fee, unlimited digital
 * products and courses, websites and a creator page on it (lib/billing/plans).
 * Changed on purpose (round 47, the owner: "Storelib is about many things"):
 * each box names its own kind of selling first, then the rest of Storelib.
 */
export const BLOG_CTA: Record<CtaVariant, { title: string; body: string }> = {
  /* Round 49, the owner: shorter, and never only about digital products. Each one names the whole of Storelib in one line. */
  digital: {
    title: "Start selling on Storelib",
    body: "Products, courses, communities and your website, all in one place.",
  },
  physical: {
    title: "Start selling on Storelib",
    body: "Physical and digital products, courses and your website, all in one place.",
  },
  community: {
    title: "Start your community on Storelib",
    body: "Members, paid access, products and courses, all in one place.",
  },
}

/**
 * THE CARD UNDER "ON THIS PAGE": one line and a short subline, the same on
 * every post (round 49, the owner: "too wordy"). It names no kind of
 * product, so it never offers what the platform does not sell.
 */
export function blogRailCta(): { title: string; body: string } {
  return {
    title: "Sell anything from one place",
    body: "Products, courses, communities",
  }
}

/**
 * Which box a post shows, from what it is about. The categories say what
 * kind of post it is (a guide, news), not what is sold, so the title, slug
 * and keywords decide. Physical only while physical commerce is switched on.
 */
export function ctaVariant(post: { title?: string | null; slug?: string | null; keywords?: string | null; category?: string | null }, physicalEnabled: boolean): CtaVariant {
  const text = `${post.title ?? ""} ${post.slug ?? ""} ${post.keywords ?? ""}`.toLowerCase().replace(/-/g, " ")
  if (/\bcommunit(y|ies)\b|\bmembership/.test(text)) return "community"
  if (physicalEnabled && /\bphysical\b|\bshipping\b|\bmerch\b|\bprint on demand\b|\bt shirts?\b|\binventory\b/.test(text)) return "physical"
  return "digital"
}

/**
 * The sign up address a box links to. `src` is the box (blog-digital), and
 * `ref` the same unless the visit arrived with one of its own, the rule
 * lib/alternatives/attribution signupHref follows; /signup reads both with
 * readSignupSource and reports them to analytics.
 */
export function blogSignupHref(variant: CtaVariant, opts: { email?: string; ref?: string | null } = {}): string {
  const src = `blog-${variant}`
  const q = new URLSearchParams({ intent: "sell", src, ref: opts.ref || src })
  if (opts.email) q.set("email", opts.email)
  return `/signup?${q.toString()}`
}

/* ─── Related and neighbours ─────────────────────────────────────────── */

/** Up to `n` posts to read next: the same category first, then the newest. `posts` is newest first. */
export function relatedPosts<T extends { slug: string; category?: string | null }>(posts: T[], current: { slug: string; category?: string | null }, n = 3): T[] {
  const others = posts.filter((p) => p.slug !== current.slug)
  const same = current.category ? others.filter((p) => p.category === current.category) : []
  const rest = others.filter((p) => !same.includes(p))
  return [...same, ...rest].slice(0, n)
}

/** The posts either side of this one in time: `previous` older, `next` newer. `posts` is newest first. */
export function postNeighbours<T extends { slug: string }>(posts: T[], slug: string): { previous: T | null; next: T | null } {
  const i = posts.findIndex((p) => p.slug === slug)
  if (i < 0) return { previous: null, next: null }
  return { previous: posts[i + 1] ?? null, next: posts[i - 1] ?? null }
}

/* ─── Sitemap ────────────────────────────────────────────────────────── */

/**
 * The blog's sitemap rows with the categories at their new address. The rows
 * come from lib/blog/listing blogSitemapEntries, which still writes the old
 * /blog/explore/categories/<slug> (a 308 now); each is rewritten to
 * /blog/category/<slug>, and a category's older pages (/page/2 on, only once
 * it has more than one page) are added with the newest date on each.
 */
export function withBlogCategoryPages(
  entries: Array<{ url: string; lastModified: string | null }>,
  rows: Array<{ slug: string; category?: string | null; published_at: string | null; updated_at?: string | null }>,
  categories: readonly BlogCategory[] = STATIC_BLOG_CATEGORIES,
): Array<{ url: string; lastModified: string | null }> {
  const out = entries.map((e) => ({ ...e, url: e.url.replace(`${BLOG_URL}/explore/categories/`, `${BLOG_ORIGIN}${BLOG_CATEGORY_BASE}/`) }))
  const posts = mergeBlogPosts(rows.map((r) => ({ id: r.slug, title: "", excerpt: "", read_time: "", cover_image_url: null, ...r, category: r.category ?? "" })))
  for (const c of categories) {
    const inIt = posts.filter((p) => p.category === c.name)
    for (let page = 2; page <= blogPageCount(inIt.length); page++) {
      out.push({ url: `${BLOG_ORIGIN}${blogCategoryPath(c.name, page, categories)}`, lastModified: newestBlogChange(inIt.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE)) })
    }
  }
  return out
}
