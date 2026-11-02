/**
 * Search data for a creator's blog: the post as a BlogPosting whose
 * publisher is the store (never Storelib: lib/blog/structured-data.ts is
 * storelib.com's), the listing as a Blog, and the post's title, description
 * and share picture with their fallbacks. Pure; print the objects through
 * jsonLdScript (lib/seo/json-ld.ts).
 */
import type { PublicPost, PublicPostCard } from "./types"

export interface ArticleJsonLdInput {
  /** The post's full address (canonical). */
  url: string
  title: string
  description: string
  /** Full addresses; relative and svg ones are dropped. */
  images: (string | null | undefined)[]
  published: string | null
  modified: string | null
  author: { name: string; url?: string | null; role?: string | null; links?: { url: string }[] } | null
  publisher: { name: string; logo?: string | null; url: string }
  category?: string | null
  tags?: string[]
  wordCount?: number
}

function iso(value: string | null | undefined): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

const httpsImages = (list: (string | null | undefined)[]) => [...new Set(list.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u) && !/\.svg(?:[?#]|$)/i.test(u)))]

function organization(p: ArticleJsonLdInput["publisher"]) {
  const logo = p.logo && /^https?:\/\//i.test(p.logo) ? { logo: { "@type": "ImageObject", url: p.logo } } : {}
  return { "@type": "Organization", name: p.name, url: p.url, ...logo }
}

/** One post as a BlogPosting, published by the store. */
export function articleJsonLd(input: ArticleJsonLdInput) {
  const images = httpsImages(input.images)
  const published = iso(input.published)
  const modified = iso(input.modified) ?? published
  const sameAs = (input.author?.links ?? []).map((l) => l.url).filter((u) => /^https?:\/\//i.test(u))
  const author = input.author?.name
    ? { "@type": "Person", name: input.author.name, ...(input.author.role ? { jobTitle: input.author.role } : {}), ...(input.author.url ? { url: input.author.url } : {}), ...(sameAs.length ? { sameAs } : {}) }
    : organization(input.publisher)
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title.slice(0, 110),
    ...(input.description ? { description: input.description } : {}),
    ...(images.length ? { image: images } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author,
    publisher: organization(input.publisher),
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    ...(input.category ? { articleSection: input.category } : {}),
    ...(input.tags?.length ? { keywords: input.tags.join(", ") } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
  }
}

/** The listing as a Blog, its posts on this page as blogPost items. `posts[].url` are full addresses. */
export function blogJsonLd(input: { url: string; name: string; description: string; posts: { url: string; title: string; publishedAt?: string | null; updatedAt?: string | null; image?: string | null }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    blogPost: input.posts.map((p) => {
      const published = iso(p.publishedAt)
      const modified = iso(p.updatedAt)
      const image = p.image && httpsImages([p.image])[0]
      return {
        "@type": "BlogPosting",
        headline: p.title.slice(0, 110),
        url: p.url,
        ...(published ? { datePublished: published } : {}),
        ...(modified ? { dateModified: modified } : {}),
        ...(image ? { image } : {}),
      }
    }),
  }
}

type SeoPost = Pick<PublicPostCard, "title" | "excerpt" | "coverImageUrl"> & { seo?: Partial<PublicPost["seo"]>; summaryHtml?: string }

/** The `<title>`: the post's own search title, else "Title | Brand". */
export function postSeoTitle(post: SeoPost, brand: string): string {
  const own = post.seo?.title?.trim()
  if (own) return own
  const title = post.title.trim() || "Blog post"
  return brand.trim() && brand.trim() !== title ? `${title} | ${brand.trim()}` : title
}

/** The meta description: the post's own, else its excerpt, else its opening words, else the site's. At most 160 characters. */
export function postSeoDescription(post: SeoPost, siteDescription: string): string {
  const fromSummary = (post.summaryHtml ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const text = (post.seo?.description?.trim() || post.excerpt.trim() || fromSummary.trim() || siteDescription.trim()).replace(/\s+/g, " ")
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, "")}…` : text
}

/** The share picture: the post's social image, else its cover, else the fallback (the blog's or the site's). */
export function postShareImage(post: SeoPost, fallback: string): string {
  return post.seo?.ogImageUrl?.trim() || post.coverImageUrl?.trim() || fallback
}
