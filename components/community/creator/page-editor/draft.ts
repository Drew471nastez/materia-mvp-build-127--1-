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
 *
 * ROUND 26: the short description and the member links (run-now part 220,
 * lib/communities/member-links.ts), and how the page is found (the search
 * title and line, being shown in Explore), so the whole page is edited here.
 * The parts are gathered into a few groups (PAGE_GROUPS) the panel opens one
 * at a time; a press on a part of the preview opens its group.
 */
import type { CommunityFaq, CommunityLink } from "@/lib/communities/types"
import { DEFAULT_LOOK, cleanLook, coverPosition, joinLookOf, joinWordsProblem, sameLook, type JoinWordsProblem, type PageLook } from "@/lib/communities/page-look"
import { SUMMARY_MAX, cleanSummary, memberLinkUrl, MEMBER_LINK_LABEL_MAX, type MemberLink } from "@/lib/communities/member-links"
import { socialLinksOf } from "@/lib/communities/social-links"
import { isBlankHtml, toEditorHtml } from "@/lib/rich-text/html"
import type { GalleryItemView, SalesPageData } from "@/components/community/public/types"
import type { GalleryItem } from "../logic"
import type { CommunityHead, GalleryVideoView, SettingsData } from "../view-types"

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
  /** Round 26: the short description on the card ("" for none). */
  summary: string
  /** Round 26: the shortcuts members see inside the community. */
  memberLinks: MemberLink[]
  seoTitle: string
  seoDescription: string
  discoveryEnabled: boolean
}

/** The draft a page starts from: what is saved, as the editor's fields hold it. */
export function draftOf(head: Pick<CommunityHead, "name" | "logoUrl" | "coverUrl">, data: SettingsData): PageDraft {
  return {
    name: head.name,
    tagline: data.tagline ?? "",
    descriptionHtml: toEditorHtml(data.descriptionHtml ?? data.description),
    logoUrl: head.logoUrl,
    coverUrl: head.coverUrl,
    gallery: data.gallery,
    benefits: data.benefits,
    faq: data.faq,
    links: data.links,
    look: data.pageLook ?? DEFAULT_LOOK,
    summary: data.summary ?? "",
    memberLinks: data.memberLinks ?? [],
    seoTitle: data.seoTitle ?? "",
    seoDescription: data.seoDescription ?? "",
    discoveryEnabled: data.discoveryEnabled,
  }
}

/** The parts of the page the editor opens, in the order the page reads. */
export const PAGE_BLOCKS = ["cover", "gallery", "logo", "name", "tagline", "summary", "description", "links", "memberLinks", "benefits", "join", "faq", "search"] as const
export type PageBlock = (typeof PAGE_BLOCKS)[number]

export function isPageBlock(v: unknown): v is PageBlock {
  return typeof v === "string" && (PAGE_BLOCKS as readonly string[]).includes(v)
}

/**
 * THE GROUPS (round 26, the owner: "simple field groups instead of a wall"). Six, in the order a creator sets a page up:
 * who it is, how it looks, what it says, where it points, how people join, how it is found. One is open at a time.
 */
export const PAGE_GROUPS = ["basics", "media", "about", "links", "join", "search"] as const
export type PageGroup = (typeof PAGE_GROUPS)[number]

export const GROUP_BLOCKS: Record<PageGroup, readonly PageBlock[]> = {
  basics: ["name", "tagline", "summary", "logo"],
  media: ["cover", "gallery"],
  about: ["description", "benefits", "faq"],
  links: ["links", "memberLinks"],
  join: ["join"],
  search: ["search"],
}

export function groupOf(block: PageBlock): PageGroup {
  return PAGE_GROUPS.find((g) => GROUP_BLOCKS[g].includes(block)) ?? "basics"
}

/** Why Save waits: a part that cannot be saved as it is, by the part it is in. Codes, so the editor words them. */
export type DraftProblem =
  | { block: "summary"; code: "long" }
  | { block: "memberLinks"; code: "name" | "address"; index: number }
  | { block: "join"; code: JoinWordsProblem; field: "joinLabel" | "joinNote" }

export function draftProblems(d: PageDraft, opts: { paid: boolean }): DraftProblem[] {
  const out: DraftProblem[] = []
  if (Array.from(d.summary.trim()).length > SUMMARY_MAX) out.push({ block: "summary", code: "long" })
  d.memberLinks.forEach((l, index) => {
    const label = l.label.trim()
    if (!label || Array.from(label).length > MEMBER_LINK_LABEL_MAX) out.push({ block: "memberLinks", code: "name", index })
    if (!memberLinkUrl(l.url).ok) out.push({ block: "memberLinks", code: "address", index })
  })
  for (const field of ["joinLabel", "joinNote"] as const) {
    const code = joinWordsProblem(d.look[field], opts.paid)
    if (code) out.push({ block: "join", code, field })
  }
  return out
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
  /* The card's short description (the About page reads `summary` from round 26); spread, so the page's type decides where it shows. */
  const summary = { summary: cleanSummary(d.summary) }
  return {
    ...base,
    community: {
      ...base.community,
      ...summary,
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
  if (now.summary.trim() !== start.summary.trim()) body.summary = now.summary.trim()
  if (!same(now.memberLinks, start.memberLinks)) body.memberLinks = now.memberLinks.map((l) => ({ ...l, label: l.label.trim(), url: memberLinkUrl(l.url).ok ? (memberLinkUrl(l.url) as { url: string }).url : l.url.trim() }))
  if (now.seoTitle.trim() !== start.seoTitle.trim()) body.seoTitle = now.seoTitle.trim()
  if (now.seoDescription.trim() !== start.seoDescription.trim()) body.seoDescription = now.seoDescription.trim()
  if (now.discoveryEnabled !== start.discoveryEnabled) body.discoveryEnabled = now.discoveryEnabled
  return body
}
