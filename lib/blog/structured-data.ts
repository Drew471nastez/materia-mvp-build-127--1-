/**
 * ===========================================================================
 *  THE BLOG'S STRUCTURED DATA, AS PURE FUNCTIONS
 * ===========================================================================
 * Only types and fields Google documents and that are true of the page:
 *
 *   BlogPosting     on an article: headline, description, image (full
 *                   addresses, always at least one), datePublished,
 *                   dateModified, author, publisher with its logo,
 *                   mainEntityOfPage. The author is a Person when the byline
 *                   names one ("Anisia - Head of Marketing": name and
 *                   jobTitle), and Storelib the Organization when it is a
 *                   team byline ("Storelib Team"). The blog_authors row
 *                   wins when the post has one (name, role, its links as
 *                   sameAs). A Person's url only when an author page
 *                   exists; none does yet.
 *   BreadcrumbList  on an article, a category and the index.
 *   VideoObject     per YouTube block, only with Google's required fields:
 *                   name (the block's title, its caption, or the post's
 *                   title), thumbnailUrl (YouTube's hqdefault), uploadDate.
 *                   uploadDate is not in YouTube's address and is never
 *                   fetched while rendering, so without block.uploadDate
 *                   there is no VideoObject.
 *   Blog            on the index, with its posts as blogPost items.
 *
 * Printed through lib/seo/json-ld jsonLdScript. Tested in
 * tests/blog-public-r45.test.ts.
 */
import type { Block } from "./blocks"
import { YOUTUBE_ID, authorOf } from "./article"
import { storelibLogoUrl } from "@/lib/brand/logo"

export const BLOG_SD_ORIGIN = "https://storelib.com"

const ORG = { "@type": "Organization", name: "Storelib", url: BLOG_SD_ORIGIN } as const

export function storelibPublisher() {
  return { ...ORG, logo: { "@type": "ImageObject", url: storelibLogoUrl(), width: 512, height: 512 } }
}

const abs = (pathOrUrl: string) => (/^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${BLOG_SD_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`)

/** An ISO date Google can read, or null. "2026-03-01" and full times both pass. */
export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) ? value.trim() : null
}

export interface BreadcrumbItem {
  name: string
  /** A path on storelib.com or a full address. */
  path: string
}

export function breadcrumbListJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  }
}

export interface BlogPostingInput {
  url: string
  title: string
  description: string
  /** Full addresses; svg and relative ones are dropped. At least one is always printed (`fallbackImage`). */
  images: (string | null | undefined)[]
  fallbackImage: string
  published: string | null
  modified: string | null
  byline: string | null
  /** The post's author from blog_authors (lib/blog/post readBlogAuthor), when it has one; wins over the byline text. */
  profile?: { name: string; role?: string | null; links?: { url: string }[] } | null
  /** An author page, when one exists. */
  authorUrl?: string | null
  category?: string | null
  wordCount?: number
  keywords?: string[]
}

export function blogPostingJsonLd(input: BlogPostingInput) {
  const images = [...new Set(input.images.filter((u): u is string => typeof u === "string" && /^https:\/\//i.test(u) && !/\.svg(?:[?#]|$)/i.test(u)))]
  const author = input.profile?.name ? { ...authorOf(input.profile.name), role: input.profile.role?.trim() || null } : authorOf(input.byline)
  const sameAs = (input.profile?.links ?? []).map((l) => l.url).filter((u) => /^https:\/\//i.test(u))
  const published = isoDate(input.published)
  const modified = isoDate(input.modified) ?? published
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title.slice(0, 110),
    description: input.description,
    image: images.length ? images : [abs(input.fallbackImage)],
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author: author.organization
      ? ORG
      : { "@type": "Person", name: author.name, ...(author.role ? { jobTitle: author.role } : {}), ...(input.authorUrl ? { url: abs(input.authorUrl) } : {}), ...(sameAs.length ? { sameAs } : {}) },
    publisher: storelibPublisher(),
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    ...(input.category ? { articleSection: input.category } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
    ...(input.keywords?.length ? { keywords: input.keywords.join(", ") } : {}),
    isPartOf: { "@type": "Blog", name: "Storelib Blog", url: `${BLOG_SD_ORIGIN}/blog` },
  }
}

/** A VideoObject for each YouTube block that has everything Google requires; none for the rest. */
export function videoObjectsJsonLd(blocks: Block[], post: { title: string; description: string; url: string }) {
  const out: Record<string, unknown>[] = []
  for (const b of blocks) {
    if (b.type !== "youtube" || !b.videoId || !YOUTUBE_ID.test(b.videoId)) continue
    const uploadDate = isoDate(b.uploadDate)
    if (!uploadDate) continue
    const name = (b.title || b.caption || post.title).trim()
    if (!name) continue
    out.push({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name,
      description: (b.caption && b.caption !== name ? b.caption : post.description) || name,
      thumbnailUrl: [`https://i.ytimg.com/vi/${b.videoId}/hqdefault.jpg`],
      uploadDate,
      embedUrl: `https://www.youtube.com/embed/${b.videoId}`,
      url: `https://www.youtube.com/watch?v=${b.videoId}`,
      ...(b.transcript ? { transcript: b.transcript.slice(0, 5000) } : {}),
    })
  }
  return out
}

export interface BlogListItem {
  slug: string
  title: string
  published_at: string | null
  updated_at?: string | null
  cover_image_url?: string | null
}

/** The index as a Blog with its posts on this page as blogPost items. */
export function blogJsonLd(posts: BlogListItem[], opts: { url: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Storelib Blog",
    description: opts.description,
    url: opts.url,
    publisher: storelibPublisher(),
    blogPost: posts.map((p) => {
      const image = p.cover_image_url && /^https:\/\//i.test(p.cover_image_url) ? p.cover_image_url : p.cover_image_url?.startsWith("/") && !/\.svg/i.test(p.cover_image_url) ? abs(p.cover_image_url) : null
      const published = isoDate(p.published_at)
      return {
        "@type": "BlogPosting",
        headline: p.title.slice(0, 110),
        url: `${BLOG_SD_ORIGIN}/blog/${p.slug}`,
        ...(published ? { datePublished: published } : {}),
        ...(isoDate(p.updated_at) ? { dateModified: isoDate(p.updated_at) } : {}),
        ...(image ? { image } : {}),
      }
    }),
  }
}
