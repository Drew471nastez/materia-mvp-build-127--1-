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
export type AboutFact = { key: "members" | "posts" | "courses" | "visibility" | "since" | "admins"; label: string; value: string } | { key: "creator"; label: string; value: string; creator: NonNullable<PublicCommunityView["creator"]> }

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
  out.push({ key: "visibility", label: "Community", value: VISIBILITY[c.visibility] ?? VISIBILITY.public })
  /* Round 26, the owner: the admin count belongs in the card, not in the row under the name. Only a counted figure. */
  if (stats.admins && stats.admins > 0) out.push({ key: "admins", label: stats.admins === 1 ? "Admin" : "Admins", value: factFigure(stats.admins) })
  const since = sinceLabel(extras?.activity.since)
  if (since) out.push({ key: "since", label: "Started", value: since })
  if (c.creator) out.push({ key: "creator", label: "Run by", value: c.creator.name, creator: c.creator })
  return out
}

/** One fact in the row under the name: a figure or a word in ink, and what it is in grey. */
export interface AboutRowFact {
  key: "visibility" | "members" | "online" | "price"
  /** In ink: "1,284", "Free", "$19/month", "Private". */
  value: string
  /** In grey after it: "members", "online", "admins"; "" for a fact that is its own word. */
  word: string
}

/**
 * THE ROW UNDER THE NAME (round 33, the owner: "key facts in a horizontal row
 * with light grey dividers like Skool"). Who it is for, how many members,
 * how many are here now, what it costs. Online only when it is known and
 * above zero; the price is the button's own tier, else the first paid one,
 * else Free. Round 26: the admins moved to the info card (aboutFacts), the
 * social icons too. Pure, for the tests.
 */
export function aboutRow(c: Pick<PublicCommunityView, "visibility" | "options">, stats: CommunityStatsView, option: { kind: string; priceLine: string } | null): AboutRowFact[] {
  const out: AboutRowFact[] = [{ key: "visibility", value: VISIBILITY[c.visibility] ?? VISIBILITY.public, word: "" }]
  out.push({ key: "members", value: factFigure(stats.members), word: stats.members === 1 ? "member" : "members" })
  if (stats.online && stats.online > 0) out.push({ key: "online", value: factFigure(stats.online), word: "online" })
  const paid = option && option.kind === "paid" && option.priceLine ? option : c.options.find((o) => o.kind === "paid" && o.priceLine && o.priceLine !== "Free") ?? null
  out.push({ key: "price", value: paid ? paid.priceLine : "Free", word: "" })
  return out
}

/** The longest short description, as the editor allows it (communities.summary, part 220). */
export const SUMMARY_MAX = 160

/** Cut to `max` characters at a word, with an ellipsis when anything was cut. */
function clipWords(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  const cut = chars.slice(0, max - 1).join("")
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, "")}…`
}

/**
 * THE CARD'S SHORT DESCRIPTION (round 26, the owner's section 6): the creator's own (summary), else the tagline, else
 * the first 160 characters of the description's plain text, cut at a word. One line of plain text with its spaces
 * folded; null when there is nothing to say. `descriptionPlain` is already plain (the server reads it from the
 * sanitized HTML), so this stays pure.
 */
export function cardSummary(c: { summary?: string | null; tagline?: string | null; descriptionPlain?: string | null }): string | null {
  for (const raw of [c.summary, c.tagline, c.descriptionPlain]) {
    const text = (raw ?? "").replace(/\s+/g, " ").trim()
    if (text) return clipWords(text, SUMMARY_MAX)
  }
  return null
}

/**
 * WHO MAY SHARE THE COMMUNITY FROM ITS CARD (round 26, the owner's section 8). Its public address only, never an invite
 * link, and only while that address shows anything: a published community that is not archived or suspended. A
 * public or unlisted one anybody may pass on (the address is the same one they are on); a private one only the people
 * who run it, since for anybody else it is a door they cannot open.
 */
export function canShareCommunity(c: { status?: string | null; archived?: boolean; visibility?: CommunityVisibility | null; access?: string | null }, viewer: { staff: boolean }): boolean {
  if (c.archived || (c.status && c.status !== "published")) return false
  const priv = c.visibility === "private" || c.access === "invite_only"
  return !priv || viewer.staff
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
