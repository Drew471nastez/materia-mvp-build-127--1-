/**
 * An event in a shared link: title, a line from the description, and a
 * picture drawn from the cover. A restricted event (or a community that is
 * not public and free) says only which community it is in.
 */
import type { Metadata } from "next"
import { plainSummary } from "@/lib/html-entities"
import { isOpenRule } from "@/lib/communities/access"
import type { AccessRuleJson, CommunityRow } from "@/lib/communities/types"

const SITE = "https://storelib.com"
export const EVENT_SHARE_WIDTH = 1200
export const EVENT_SHARE_HEIGHT = 630

export type EventCommunityFacts = Pick<CommunityRow, "slug" | "name" | "logo_url" | "visibility" | "access" | "status" | "platform_hidden" | "suspended_at" | "deleted_at">

export interface EventFacts {
  community: EventCommunityFacts
  event: {
    id: string
    title: string
    description: string | null
    coverUrl: string | null
    startsAt: string
    timezone: string
    location: string | null
    status: string
    access: AccessRuleJson | null
    updatedAt: string | null
  }
  /** Round 44: the community's creator is banned (lib/seo/bans.ts). Never in search. */
  ownerBanned?: boolean
}

export function publicEvent(f: EventFacts): boolean {
  const c = f.community
  const communityOpen =
    (c.status === "published" || c.status === "archived") && c.visibility === "public" && c.access === "free" && !c.platform_hidden && !c.suspended_at && !c.deleted_at
  return communityOpen && isOpenRule(f.event.access ?? {})
}

/** Whether search engines may index it (round 26): a public event in a community that is still published, never an archived one's. */
export function indexableEvent(f: EventFacts): boolean {
  return publicEvent(f) && f.community.status === "published" && !f.ownerBanned
}

export function eventPath(slug: string, eventId: string): string {
  return `/community/${slug}/events/${eventId}`
}

export function eventShareVersion(parts: unknown[]): string {
  let h = 0x811c9dc5
  for (const ch of parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|")) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function eventPlain(html: string | null | undefined, max = 180): string {
  const text = (html || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ")
  return plainSummary(text, max)
}

export function eventShareImageUrl(slug: string, eventId: string, version: string | null | undefined): string {
  return `${SITE}${eventPath(slug, eventId)}/share.png${version ? `?v=${version}` : ""}`
}

function fingerprint(f: EventFacts, open: boolean): string {
  return open
    ? eventShareVersion([1, f.community.name, f.community.logo_url, f.event.title, f.event.description, f.event.coverUrl, f.event.startsAt, f.event.status, f.event.updatedAt])
    : eventShareVersion([0, f.community.name, f.community.logo_url])
}

export function eventMetadata(f: EventFacts): Metadata {
  /* Previewed only while the community is published (round 26). */
  const open = indexableEvent(f)
  const url = `${SITE}${eventPath(f.community.slug, f.event.id)}`
  const image = eventShareImageUrl(f.community.slug, f.event.id, fingerprint(f, open))
  const images = [{ url: image, width: EVENT_SHARE_WIDTH, height: EVENT_SHARE_HEIGHT, alt: open ? f.event.title : f.community.name, type: "image/png" }]
  if (!open) {
    const title = `An event in ${f.community.name}`
    const description = `Members of ${f.community.name} can see this event on Storelib.`
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: "website", url, siteName: "Storelib", title, description, images },
      twitter: { card: "summary_large_image", title, description, images: [image] },
      robots: { index: false, follow: false },
    }
  }
  const title = `${f.event.title} · ${f.community.name}`
  const words = eventPlain(f.event.description, 200)
  const description = words || `An event in ${f.community.name} on Storelib.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: "Storelib", title: f.event.title, description, images },
    twitter: { card: "summary_large_image", title: f.event.title, description, images: [image] },
    robots: { index: true, follow: true },
  }
}
