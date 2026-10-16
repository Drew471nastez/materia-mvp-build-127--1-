/**
 * ===========================================================================
 *  THE PAGE EDITOR'S DRAFT, AND THE PAGE IT DRAWS (round 33)
 * ===========================================================================
 * What the creator is changing, held in one object, and the About page's
 * data with those changes on it, so the preview is the real page
 * (components/community/public/sales-page.tsx) drawn from the draft rather
 * than a copy of it. Pure: the editor and the tests call it.
 *
 * The draft's parts map onto the page's as the server maps the saved row
 * (lib/communities/server/public.ts loadSalesPage): the gallery as
 * communityGallery reads it (the creator's own list, else the cover picture
 * alone), the links through socialLinksOf, the cover's focus and the button
 * through lib/communities/page-look.ts. What it saves is only what changed.
 */
import type { CommunityFaq, CommunityLink } from "@/lib/communities/types"
import { cleanLook, coverPosition, joinLookOf, sameLook, type PageLook } from "@/lib/communities/page-look"
import { socialLinksOf } from "@/lib/communities/social-links"
import { isBlankHtml } from "@/lib/rich-text/html"
import type { GalleryItemView, SalesPageData } from "@/components/community/public/types"
import type { GalleryItem } from "../logic"
import type { GalleryVideoView } from "../view-types"

export interface PageDraft {
  name: string
  tagline: string
  /** The rich text field's HTML (the product description's editor). */
  descriptionHtml: string
  logoUrl: string | null
  coverUrl: string | null
  gallery: GalleryItem[]
  benefits: string[]
  faq: CommunityFaq[]
  links: CommunityLink[]
  look: PageLook
}

/** The parts of the page the editor opens, in the order the page reads. */
export const PAGE_BLOCKS = ["cover", "gallery", "logo", "name", "tagline", "description", "links", "benefits", "join", "faq"] as const
export type PageBlock = (typeof PAGE_BLOCKS)[number]

export function isPageBlock(v: unknown): v is PageBlock {
  return typeof v === "string" && (PAGE_BLOCKS as readonly string[]).includes(v)
}

/** The gallery as the About page draws it: the creator's list (a video once it can play), else the cover picture alone. */
export function galleryViews(gallery: readonly GalleryItem[], coverUrl: string | null, videos: Record<string, GalleryVideoView>): GalleryItemView[] {
  const out: GalleryItemView[] = []
  for (const g of gallery) {
    if (g.type === "image") out.push({ type: "image", url: g.url })
    else if (g.type === "embed") out.push({ type: "embed", provider: g.provider, id: g.id, ...(g.hash ? { hash: g.hash } : {}), thumb: g.thumb ?? null })
    else {
      const v = videos[g.videoId]
      if (v && v.status !== "ready") continue
      out.push({ type: "video", videoId: g.videoId, posterUrl: v?.thumbnailUrl ?? coverUrl ?? null, ...(g.cover ? { cover: true as const } : {}) })
    }
  }
  if (out.length === 0 && coverUrl) out.push({ type: "image", url: coverUrl })
  return out
}

/** The About page's data with the draft on it. */
export function previewData(base: SalesPageData, d: PageDraft, videos: Record<string, GalleryVideoView>): SalesPageData {
  const look = cleanLook(d.look)
  const html = isBlankHtml(d.descriptionHtml) ? null : d.descriptionHtml
  return {
    ...base,
    community: {
      ...base.community,
      name: d.name.trim() || base.community.name,
      tagline: d.tagline.trim() || null,
      logoUrl: d.logoUrl,
      coverUrl: d.coverUrl,
      descriptionHtml: html,
      descriptionText: null,
      benefits: d.benefits.map((b) => b.trim()).filter(Boolean),
      faq: d.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a),
      links: socialLinksOf(d.links),
      gallery: galleryViews(d.gallery, d.coverUrl, videos),
      coverPosition: coverPosition(look) ?? null,
      joinLook: joinLookOf(look),
    },
  }
}

/** What Save sends: only the parts that changed, by the names the settings route reads. */
export function changedBody(start: PageDraft, now: PageDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (now.name !== start.name) body.name = now.name
  if (now.tagline !== start.tagline) body.tagline = now.tagline
  if (now.descriptionHtml !== start.descriptionHtml) body.descriptionHtml = isBlankHtml(now.descriptionHtml) ? "" : now.descriptionHtml
  if (now.logoUrl !== start.logoUrl) body.logoUrl = now.logoUrl
  if (now.coverUrl !== start.coverUrl) body.coverUrl = now.coverUrl
  if (!same(now.gallery, start.gallery)) body.gallery = now.gallery
  if (!same(now.benefits, start.benefits)) body.benefits = now.benefits.map((b) => b.trim()).filter(Boolean)
  if (!same(now.faq, start.faq)) body.faq = now.faq
  if (!same(now.links, start.links)) body.links = now.links
  if (!sameLook(cleanLook(now.look), cleanLook(start.look))) body.pageLook = cleanLook(now.look)
  return body
}
