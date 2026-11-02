/**
 * Creator website blogs: the shared contract. The tables (SQL part 353,
 * site_blog_*), the server reads and writes (lib/site-blog), the Blog screen
 * in Website Settings, theme rendering and the native Blog templates all
 * speak these types.
 */
import type { SiteBlock } from "./blocks"

export type { SiteBlock }

/** draft: never public. scheduled: published with a date still ahead. published: live. archived: kept, never public. */
export type SitePostStatus = "draft" | "scheduled" | "published" | "archived"

/** The page keys of the two templates. Imported (compat) themes call the listing "blog"; native sites "blogs", because a creator's own page may be called "blog". */
export type BlogTemplateKeys = { listing: "blog" | "blogs"; post: "article" }

export interface SiteBlogSettings {
  handle: string
  previousHandles: string[]
  title: string
  description: string
  postsPerPage: number
  seoTitle: string
  seoDescription: string
  ogImageUrl: string
}

export interface SiteBlogCategory {
  id: string
  slug: string
  name: string
  description: string
  sortOrder: number
  seoTitle: string
  seoDescription: string
  postCount?: number
}

export interface SiteBlogAuthor {
  id: string
  slug: string
  name: string
  role: string
  bio: string
  avatarUrl: string
  links: { label: string; url: string }[]
}

export interface SitePostMeta {
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string
  coverAlt: string
  categoryId: string | null
  tags: string[]
  authorId: string | null
  seoTitle: string
  seoDescription: string
  canonicalUrl: string
  ogTitle: string
  ogDescription: string
  ogImageUrl: string
  noindex: boolean
  featured: boolean
  publishedAt: string | null
}

export interface AdminPostSummary {
  id: string
  status: SitePostStatus
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string
  categoryId: string | null
  tags: string[]
  authorId: string | null
  featured: boolean
  publishedAt: string | null
  updatedAt: string
  /** A live post whose draft differs from what visitors see. */
  hasUnpublishedChanges: boolean
  /** The path visitors open, when the post is live or scheduled. */
  livePath: string | null
}

export interface AdminPost extends AdminPostSummary {
  /** The draft view: the working copy over the live one. */
  meta: SitePostMeta
  blocks: SiteBlock[]
  /** Bumped by every save; a save carrying an older one is answered 409. */
  version: number
  liveSlug: string | null
  createdAt: string
  firstPublishedAt: string | null
  wordCount: number
  readingMinutes: number
}

export interface PublicPostCard {
  id: string
  slug: string
  path: string
  title: string
  excerpt: string
  summaryHtml: string
  coverImageUrl: string
  coverAlt: string
  category: { slug: string; name: string; path: string } | null
  tags: string[]
  author: SiteBlogAuthor | null
  publishedAt: string
  updatedAt: string
  readingMinutes: number
  featured: boolean
}

export interface PublicPost extends PublicPostCard {
  blocks: SiteBlock[]
  /** Sanitized article markup (lib/site-blog/render-html). */
  html: string
  wordCount: number
  seo: { title: string; description: string; canonicalUrl: string; ogTitle: string; ogDescription: string; ogImageUrl: string; noindex: boolean }
}

export interface BlogListing {
  blog: SiteBlogSettings
  posts: PublicPostCard[]
  page: number
  pages: number
  total: number
  category: SiteBlogCategory | null
  tag: string | null
  categories: SiteBlogCategory[]
  allTags: string[]
}

export type SiteBlogApiError = { error: string; sql?: 353 }
