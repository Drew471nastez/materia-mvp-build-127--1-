/**
 * THE ABOUT PAGE'S FACTS, AS PLAIN VALUES: the month a community started and
 * the quiet list of facts its page shows (sales-page.tsx and the side card in
 * join-controls.tsx draw them). Pure and without any component, so the tests
 * call them without loading the page's client parts (the gallery's swipe
 * engine brings a stylesheet).
 */
import type { StatCell } from "./stats-row"
import { compactCount } from "@/lib/communities/format"
import type { CommunityVisibility } from "@/lib/communities/types"
import type { AboutExtras, CommunityStatsView, PublicCommunityView } from "./types"

const SINCE = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })

/** "Oct 2025", the month the community started, or null. */
export function sinceLabel(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? SINCE.format(t) : null
}

/** The exact count while it reads at a glance (1,284), then compact (12.4k). */
export function factFigure(n: number): string {
  return n < 10_000 ? Math.max(0, Math.round(n)).toLocaleString("en-US") : compactCount(n)
}

const VISIBILITY: Record<CommunityVisibility, string> = { public: "Public", private: "Private", unlisted: "Unlisted" }

/** One row of the facts list: what it is, and its value. `creator` rows carry the person, drawn with their picture. */
export type AboutFact = { key: "members" | "posts" | "courses" | "visibility" | "since"; label: string; value: string } | { key: "creator"; label: string; value: string; creator: NonNullable<PublicCommunityView["creator"]> }

/**
 * THE QUIET FACTS LIST (round 13, ask 22: "no Active this week, replace the
 * stats row and the Public community · Since · By line with a better
 * Storelib presentation"). One list of label and value rows, the way a
 * Storelib settings summary reads, in the side card from 1280px and in the
 * sheet below that: members, posts in the last 30 days and courses (each a
 * counted row, left out when there is none; members always), then what kind
 * of community it is, since when, and who runs it. No "active this week"
 * and no "online now": the owner asked for neither on this page.
 */
export function aboutFacts(c: Pick<PublicCommunityView, "visibility" | "creator">, stats: CommunityStatsView, extras: AboutExtras | null | undefined): AboutFact[] {
  const out: AboutFact[] = [{ key: "members", label: "Members", value: factFigure(stats.members) }]
  const posts = extras?.activity.posts30
  if (posts) out.push({ key: "posts", label: "Posts, last 30 days", value: factFigure(posts) })
  const courses = extras?.classroom?.total
  if (courses) out.push({ key: "courses", label: "Programs", value: factFigure(courses) })
  out.push({ key: "visibility", label: "Community", value: VISIBILITY[c.visibility] ?? VISIBILITY.public })
  const since = sinceLabel(extras?.activity.since)
  if (since) out.push({ key: "since", label: "Started", value: since })
  if (c.creator) out.push({ key: "creator", label: "Run by", value: c.creator.name, creator: c.creator })
  return out
}

/**
 * THE FIGURES (round 11, ask 23), kept for the cards that still draw a row of
 * figures. Round 13 took "Active this week" out everywhere: members, posts in
 * the last 30 days, courses, and Online now only when the heartbeat says
 * someone is. Pure, so the tests call it.
 */
export function aboutFigures(stats: CommunityStatsView, extras: AboutExtras | null | undefined): StatCell[] {
  const out: StatCell[] = [{ key: "members", label: stats.members === 1 ? "Member" : "Members", value: Math.max(0, stats.members) }]
  const a = extras?.activity
  if (a?.posts30) out.push({ key: "posts", label: "Posts in 30 days", value: a.posts30 })
  if (extras?.classroom?.total) out.push({ key: "courses", label: extras.classroom.total === 1 ? "Program" : "Programs", value: extras.classroom.total })
  if (out.length < 4 && stats.online) out.push({ key: "online", label: "Online now", value: stats.online })
  return out.slice(0, 4)
}

/**
 * ONE COVER ON THE PAGE (round 13, ask 22: the About page showed the cover
 * twice on a computer, in the community card on the left and as the
 * sheet's media). When the creator chose no gallery, the media is the cover
 * picture alone (lib/communities/server/public.ts communityGallery's
 * fallback); from 1024px the card in the left column already shows it, so
 * the sheet leaves it out there. True when every item is that picture. A
 * gallery the creator chose, or a cover video, is always drawn.
 */
export function galleryIsCoverOnly(gallery: PublicCommunityView["gallery"], coverUrl: string | null): boolean {
  return !!coverUrl && gallery.length > 0 && gallery.every((g) => g.type === "image" && g.url === coverUrl)
}
