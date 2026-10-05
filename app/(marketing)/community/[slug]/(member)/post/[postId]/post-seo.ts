/**
 * ===========================================================================
 *  A COMMUNITY POST IN SEARCH AND IN A SHARED LINK
 * ===========================================================================
 * Round 12: "a post in a public community's public space has its own SEO
 * metadata (title, a description from its text, canonical
 * /community/<slug>/post/<id>, indexable, Article structured data) and a
 * dynamic social image (post title, community name + logo, author, first
 * image if any); posts in private communities or restricted spaces stay
 * noindex with a generic preview."
 *
 * WHICH POSTS ARE PUBLIC (publicPost): all of these, or none of it is said.
 *
 *   THE COMMUNITY   published (or archived: read only, still there), listed
 *                   publicly (visibility "public"), free to join (a paid,
 *                   invite only or product community is paid or chosen
 *                   content, however it is listed), not hidden by Storelib,
 *                   not suspended, not deleted
 *   THE SPACE       none, or one that lets every member in (no tier,
 *                   product, level or role rule: lib/communities/access
 *                   isOpenRule) and is not archived
 *   THE POST        published, not removed, not deleted
 *
 * Anything else is the GENERIC PREVIEW: "A post in <community>", a line
 * saying members can read it, the community's card picture, noindex. Never
 * the post's title, words, picture or author: the community's own face is
 * public (its About page answers anybody), the post is not.
 *
 * THE PICTURE is /community/<slug>/post/<id>/share.png?v=<fingerprint>
 * (./share.png/route.tsx), drawn per request by the same rule, so a post
 * made private later draws the generic card from then on; `v` changes with
 * what it is drawn from, and with the rule's answer.
 *
 * Pure, so the tests read it without a server (./post-facts.ts reads the
 * rows).
 */
import type { Metadata } from "next"
import { plainSummary } from "@/lib/html-entities"
import { isOpenRule } from "@/lib/communities/access"
import { postPath as postPublicPath, postShortId } from "@/lib/communities/post-url"
import type { AccessRuleJson, CommunityRow, PostMedia } from "@/lib/communities/types"

const SITE = "https://storelib.com"
export const POST_SHARE_WIDTH = 1200
export const POST_SHARE_HEIGHT = 630

export type PostCommunityFacts = Pick<CommunityRow, "slug" | "name" | "logo_url" | "visibility" | "access" | "status" | "platform_hidden" | "suspended_at" | "deleted_at">

export interface PostFacts {
  community: PostCommunityFacts
  /** The space the post is in, null for none. */
  space: { name: string; view_access: AccessRuleJson | null; archived_at: string | null } | null
  post: {
    id: string
    title: string | null
    bodyText: string
    media: PostMedia[]
    status: string
    deletedAt: string | null
    createdAt: string
    editedAt: string | null
    commentCount: number
  }
  author: { name: string; username: string | null; avatarUrl: string | null } | null
}

/** The rule above, in one place. */
export function publicPost(f: PostFacts): boolean {
  const c = f.community
  const communityOpen =
    (c.status === "published" || c.status === "archived") && c.visibility === "public" && c.access === "free" && !c.platform_hidden && !c.suspended_at && !c.deleted_at
  const spaceOpen = !f.space || (!f.space.archived_at && isOpenRule(f.space.view_access ?? {}))
  const postOpen = f.post.status === "published" && !f.post.deletedAt
  return communityOpen && spaceOpen && postOpen
}

/** Canonical path for a post (readable slug + short id). */
export function postPath(slug: string, post: { id: string; title?: string | null; bodyText?: string | null }): string {
  return postPublicPath(slug, post)
}

/** Share image route segment: always the short id (stable when the title changes). */
export function postShareRouteId(postId: string): string {
  return postShortId(postId)
}

/** The post's first picture, for the card and the structured data: a photo, else a GIF's still, a video's poster, an embed's or a link's picture. */
export function firstPicture(media: PostMedia[] | null | undefined): string | null {
  for (const m of media ?? []) {
    const url =
      m.type === "image" ? m.url : m.type === "gif" ? m.still : m.type === "video" ? m.poster : m.type === "embed" ? m.thumb : m.type === "link" ? m.image : undefined
    if (typeof url === "string" && /^https:\/\//.test(url)) return url
  }
  return null
}

/** The words the post leads with: its title, else the start of its text. */
export function postHeadline(f: Pick<PostFacts, "post">): string {
  const title = (f.post.title || "").replace(/\s+/g, " ").trim()
  if (title) return title.slice(0, 110)
  return plainSummary(f.post.bodyText, 90)
}

/** A short fingerprint of what the picture is drawn from (FNV-1a), so its address changes when it would. */
export function postShareVersion(parts: ReadonlyArray<string | number | boolean | null | undefined>): string {
  let h = 0x811c9dc5
  for (const ch of parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|")) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function postShareImageUrl(slug: string, postId: string, version: string | null | undefined): string {
  return `${SITE}/community/${slug}/post/${postShareRouteId(postId)}/share.png${version ? `?v=${version}` : ""}`
}

function fingerprint(f: PostFacts, open: boolean): string {
  return open
    ? postShareVersion([1, f.community.name, f.community.logo_url, f.post.title, f.post.bodyText.slice(0, 300), firstPicture(f.post.media), f.author?.name, f.author?.avatarUrl, f.post.editedAt])
    : postShareVersion([0, f.community.name, f.community.logo_url])
}

export function postMetadata(f: PostFacts): Metadata {
  const open = publicPost(f)
  const url = `${SITE}${postPath(f.community.slug, f.post)}`
  const image = postShareImageUrl(f.community.slug, f.post.id, fingerprint(f, open))
  const images = [{ url: image, width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, alt: open ? postHeadline(f) || f.community.name : f.community.name, type: "image/png" }]
  if (!open) {
    const title = `A post in ${f.community.name}`
    const description = `Members of ${f.community.name} can read this post on Storelib.`
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: "website", url, siteName: "Storelib", title, description, images },
      twitter: { card: "summary_large_image", title, description, images: [image] },
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    }
  }
  const headline = postHeadline(f) || `A post in ${f.community.name}`
  const title = `${headline} · ${f.community.name}`
  const words = plainSummary(f.post.bodyText, 200)
  const description = words && words !== headline ? words : f.author ? `${f.author.name} in ${f.community.name} on Storelib.` : `A post in ${f.community.name} on Storelib.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "Storelib",
      title: headline,
      description,
      publishedTime: f.post.createdAt,
      ...(f.post.editedAt ? { modifiedTime: f.post.editedAt } : {}),
      ...(f.author?.username ? { authors: [`${SITE}/@${f.author.username}`] } : {}),
      ...(f.space ? { section: f.space.name } : {}),
      images,
    },
    twitter: { card: "summary_large_image", title: headline, description, images: [image] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  }
}

/**
 * THE ARTICLE, for search: only for a public post (null otherwise, and the
 * page prints nothing). Its headline, words, picture, dates, author (their
 * profile when they have a handle) and the community as the publisher, with
 * its logo, and how many comments it has, which is a real count.
 */
export function postArticleJsonLd(f: PostFacts): Record<string, unknown> | null {
  if (!publicPost(f)) return null
  const url = `${SITE}${postPath(f.community.slug, f.post)}`
  const picture = firstPicture(f.post.media)
  const headline = postHeadline(f) || `A post in ${f.community.name}`
  const words = plainSummary(f.post.bodyText, 300)
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: headline.slice(0, 110),
    ...(words ? { description: words } : {}),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: f.post.createdAt,
    dateModified: f.post.editedAt || f.post.createdAt,
    image: [picture || postShareImageUrl(f.community.slug, f.post.id, fingerprint(f, true))],
    ...(f.author
      ? { author: { "@type": "Person", name: f.author.name, ...(f.author.username ? { url: `${SITE}/@${f.author.username}` } : {}) } }
      : {}),
    publisher: {
      "@type": "Organization",
      name: f.community.name,
      url: `${SITE}/community/${f.community.slug}`,
      ...(f.community.logo_url ? { logo: { "@type": "ImageObject", url: f.community.logo_url } } : {}),
    },
    commentCount: Math.max(0, f.post.commentCount || 0),
    isAccessibleForFree: true,
  }
}
