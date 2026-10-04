"use client"

/**
 * ===========================================================================
 *  THE WALL'S SIDE COLUMNS
 * ===========================================================================
 * Round 7 swapped the sides. Left: the community card (its cover, its name,
 * Members / Online / Admins, the faces of the members here most recently,
 * Settings for the people who run it; no "storelib.com/community/..." line
 * any more) and under it the top contributors (or the most active). Right:
 * the places in the community, each a soft coloured tile with a Solar line
 * glyph (bold when it is the open one), a word and a chevron, and under
 * them the next event. Each card only when there is something real to show
 * (lib/communities/server/wall.ts). From 1024px to 1279px all of it stacks
 * in the left column.
 *
 * Calm on purpose: white cards on the page's #f8f9fa, hairlines, ink for
 * words, the tiles in quiet tints of a few hues, no violet. A face, a name
 * and a contributor open the person's page and, resting on them on a
 * computer, their card (person-card.tsx), like every name in the community.
 */
import Link from "next/link"
import { MessageSquareText, Settings, Users } from "lucide-react"
import { AltArrowRightIcon as ChevronLine } from "@solar-icons/react/linear/alt-arrow-right"
import { CalendarIcon as CalendarLine } from "@solar-icons/react/linear/calendar"
import { CalendarIcon as CalendarBold } from "@solar-icons/react/bold/calendar"
import { CupStarIcon as CupLine } from "@solar-icons/react/linear/cup-star"
import { CupStarIcon as CupBold } from "@solar-icons/react/bold/cup-star"
import { HomeSmileIcon as HomeLine } from "@solar-icons/react/linear/home-smile"
import { HomeSmileIcon as HomeBold } from "@solar-icons/react/bold/home-smile"
import { InfoCircleIcon as InfoLine } from "@solar-icons/react/linear/info-circle"
import { InfoCircleIcon as InfoBold } from "@solar-icons/react/bold/info-circle"
import { SquareAcademicCapIcon as CapLine } from "@solar-icons/react/linear/square-academic-cap"
import { SquareAcademicCapIcon as CapBold } from "@solar-icons/react/bold/square-academic-cap"
import { UsersGroupRoundedIcon as UsersLine } from "@solar-icons/react/linear/users-group-rounded"
import { UsersGroupRoundedIcon as UsersBold } from "@solar-icons/react/bold/users-group-rounded"
import { useEffect, useState } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { compactCount, eventDateBadge } from "@/lib/communities/format"
import { FULL_ON_HOVER, type NavEntry, type TabKey } from "./nav"
import { memberHref } from "./person-href"
import { EventWhen } from "./time"
import { CommunityMark } from "./community-mark"
import { InviteGlyph } from "./invite-glyph"
import { CARD, DEPTH, DEPTH_PRESS } from "./ui"
import type { ShellCommunity, WallCardData, WallContributors, WallEvent } from "./view-types"

/* ── The community card ────────────────────────────────────────────────── */

function Stat({ value, label, dot = false, kind }: { value: string; label: string; dot?: boolean; kind: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-1 py-0.5" data-wall-stat={kind}>
      <span className="text-[17px] font-semibold leading-6 tabular-nums text-[#1a1a2e]">{value}</span>
      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] leading-4 text-[#6b7280]">
        {dot ? <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[#22a06b]" data-online-dot="" /> : null}
        {label}
      </span>
    </div>
  )
}

/** The card's actions: a white button with a hairline and a one pixel shadow, Invite for everybody, Settings beside it for staff. */
const CARD_ACTION = `flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl ${DEPTH} ${DEPTH_PRESS} text-[14px] font-medium text-[#1a1a2e] outline-none transition-[background-color,box-shadow] hover:bg-[#f6f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15`

export function WallCommunityCard({ community, card, membersHref, onInvite }: { community: ShellCommunity; card: WallCardData; membersHref: string | null; onInvite?: () => void }) {
  const base = `/community/${community.slug}`
  const { stats, faces, more } = card
  const cells = [<Stat key="members" kind="members" value={compactCount(stats.members)} label={stats.members === 1 ? "Member" : "Members"} />]
  if (stats.online !== null) cells.push(<Stat key="online" kind="online" value={compactCount(stats.online)} label="Online" dot={stats.online > 0} />)
  if (stats.admins !== null) cells.push(<Stat key="admins" kind="admins" value={compactCount(stats.admins)} label={stats.admins === 1 ? "Admin" : "Admins"} />)
  const moreLabel = `+${compactCount(more)}`
  return (
    <section className={`${CARD} overflow-hidden`} data-wall-card="">
      {community.coverUrl ? (
        <Link href={base} tabIndex={-1} aria-hidden className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={optimizedImageUrl(community.coverUrl, 640)} alt="" className="aspect-[16/9] w-full bg-[#f1f2f4] object-cover" data-wall-cover="" />
        </Link>
      ) : null}
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {community.coverUrl ? null : <CommunityMark community={community} size={40} />}
          <div className="min-w-0">
            <Link href={base} className="block truncate text-[16px] font-semibold leading-snug text-[#1a1a2e] hover:underline" data-wall-name="">
              {community.name}
            </Link>
          </div>
        </div>

        <div className="mt-3.5 flex items-stretch divide-x divide-[#eceef1] border-y border-[#eceef1] py-3" data-wall-stats="">
          {cells}
        </div>

        {faces.length ? (
          <div className="mt-3.5 flex items-center" data-wall-faces="">
            <div className="flex -space-x-2">
              {faces.map((f) => (
                <Link key={f.id} href={memberHref(community.slug, f)} className="relative rounded-full ring-2 ring-white transition-[translate] duration-150 hover:-translate-y-0.5 motion-reduce:transition-none" data-person-link="" data-person-id={f.id} aria-label={f.name}>
                  <AppAvatar src={f.avatarUrl} name={f.name} alt="" size={32} markWhileLoading />
                </Link>
              ))}
            </div>
            {more > 0 ? (
              membersHref ? (
                <Link href={membersHref} className="relative -ml-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-[#f1f2f4] px-2 text-[12px] font-semibold tabular-nums text-[#4b5563] ring-2 ring-white hover:bg-[#e9ebee]" aria-label={`${more} more members`} data-wall-more="">
                  {moreLabel}
                </Link>
              ) : (
                <span className="relative -ml-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-[#f1f2f4] px-2 text-[12px] font-semibold tabular-nums text-[#4b5563] ring-2 ring-white" data-wall-more="">
                  {moreLabel}
                </span>
              )
            ) : null}
          </div>
        ) : null}

        {onInvite || card.settingsHref ? (
          /* Round 8: Invite for every member (invite-sheet.tsx), Settings beside it for whoever may change them. */
          <div className="mt-3.5 flex gap-2" data-wall-actions="">
            {onInvite ? (
              <button type="button" onClick={onInvite} className={CARD_ACTION} aria-haspopup="dialog" data-community-invite="card">
                <InviteGlyph size={18} className="text-[#4b5563]" />
                Invite
              </button>
            ) : null}
            {card.settingsHref ? (
              <Link href={card.settingsHref} className={CARD_ACTION} data-wall-settings="">
                <Settings className="h-[17px] w-[17px] text-[#4b5563]" strokeWidth={1.8} aria-hidden />
                Settings
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ── The places ────────────────────────────────────────────────────────── */

type SolarIcon = React.ComponentType<{ size?: number; className?: string }>

/** Each place's tile: a quiet tint and a deeper shade of the same hue for the glyph. */
const PLACE_LOOK: Record<TabKey, { line: SolarIcon; bold: SolarIcon; tile: string; ink: string }> = {
  home: { line: HomeLine, bold: HomeBold, tile: "bg-[#eef1f5]", ink: "text-[#475569]" },
  classroom: { line: CapLine, bold: CapBold, tile: "bg-[#eaf1fb]", ink: "text-[#2f5f9e]" },
  events: { line: CalendarLine, bold: CalendarBold, tile: "bg-[#fcefee]", ink: "text-[#b4483c]" },
  members: { line: UsersLine, bold: UsersBold, tile: "bg-[#e8f4ed]", ink: "text-[#2f7a55]" },
  leaderboard: { line: CupLine, bold: CupBold, tile: "bg-[#fbf3dc]", ink: "text-[#a16207]" },
  about: { line: InfoLine, bold: InfoBold, tile: "bg-[#e7f3f3]", ink: "text-[#2c7a7b]" },
}

/**
 * A plain click on a place, for the frame to mark it at once (before the page arrives); a click that opens a new tab is not one.
 * Shared with the row of tabs (shell-frame.tsx SectionTabs).
 */
export function plainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

export function WallPlaces({ entries, current, onGo }: { entries: NavEntry[]; current: TabKey; onGo?: (key: TabKey) => void }) {
  return (
    <nav aria-label="Community" className={`${CARD} p-2`} data-wall-places="">
      <ul className="space-y-0.5">
        {entries.map((e) => {
          const on = e.key === current
          const look = PLACE_LOOK[e.key]
          const Icon = on ? look.bold : look.line
          return (
            <li key={e.key}>
              <Link
                href={e.href}
                /* Asked for in full the moment a pointer rests on it (or a finger lands), so the place is usually here by the click. */
                {...FULL_ON_HOVER}
                onClick={(ev) => { if (plainClick(ev)) onGo?.(e.key) }}
                aria-current={on ? "page" : undefined}
                data-community-nav={e.label}
                data-on={on ? "true" : "false"}
                className={`group/place flex h-12 items-center gap-3 rounded-xl px-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none ${on ? "bg-[#f3f4f6]" : "hover:bg-[#f8f9fa]"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${look.tile} ${look.ink}`} data-place-tile="">
                  <Icon size={20} />
                </span>
                <span className={`min-w-0 flex-1 truncate text-[15px] ${on ? "font-semibold text-[#1a1a2e]" : "font-medium text-[#262633]"}`}>{e.label}</span>
                <span aria-hidden data-place-chevron="" className={`inline-flex shrink-0 transition-[translate,color] duration-150 motion-reduce:transition-none ${on ? "text-[#6b7280]" : "text-[#b0b4bb] group-hover/place:translate-x-0.5 group-hover/place:text-[#6b7280]"}`}>
                  <ChevronLine size={16} />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ── The next event ────────────────────────────────────────────────────── */

/** The date tile, drawn in the viewer's own zone once in the browser; until then it keeps its size. */
function DateTile({ startsAt }: { startsAt: string }) {
  const [b, setB] = useState<{ month: string; day: string } | null>(null)
  useEffect(() => setB(eventDateBadge(startsAt)), [startsAt])
  return (
    <span className="flex h-[56px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl border border-[#e8e9ec] bg-white leading-none" data-wall-date="">
      <span className="h-3 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#c4290c]">{b?.month ?? ""}</span>
      <span className="mt-1 h-[22px] text-[21px] font-semibold tabular-nums text-[#1a1a2e]">{b?.day ?? ""}</span>
    </span>
  )
}

function CardHead({ title, detail, href, hrefLabel = "View all" }: { title: string; detail?: string | null; href?: string | null; hrefLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15.5px] font-semibold leading-6 text-[#1a1a2e]">{title}</h2>
        {detail ? <p className="text-[12.5px] leading-4 text-[#8a8f98]">{detail}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="-mr-1 -mt-1 inline-flex h-8 shrink-0 items-center rounded-lg px-1 text-[13.5px] font-medium text-[#4b5563] hover:text-[#1a1a2e] hover:underline" data-wall-view-all="">
          {hrefLabel}
        </Link>
      ) : null}
    </div>
  )
}

export function WallUpcoming({ slug, event }: { slug: string; event: WallEvent }) {
  const base = `/community/${slug}`
  const href = `${base}/events/${event.id}`
  return (
    <section className={`${CARD} p-4`} data-wall-upcoming="" aria-label="Upcoming event">
      <CardHead title="Upcoming event" href={`${base}/events`} />
      <Link href={href} className="group/event mt-3 flex gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
        <DateTile startsAt={event.startsAt} />
        <span className="min-w-0 pt-0.5">
          <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-[#1a1a2e] group-hover/event:underline">{event.title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-[#6b7280]">
            <EventWhen startsAt={event.startsAt} endsAt={event.endsAt} />
          </span>
          {event.going > 0 ? (
            <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]" data-wall-going="">
              <Users className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
              {compactCount(event.going)} going
            </span>
          ) : null}
        </span>
      </Link>
      <Link href={href} className={`mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl ${DEPTH} ${DEPTH_PRESS} text-[14px] font-medium text-[#1a1a2e] transition-[background-color,box-shadow] hover:bg-[#f6f7f8]`} data-wall-view-event="">
        <CalendarLine size={17} className="text-[#4b5563]" />
        View event
      </Link>
    </section>
  )
}

/* ── Top contributors ──────────────────────────────────────────────────── */

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

/** What the list counts, said plainly: points, or posts and comments, and over what. */
export function contributorsDetail(data: Pick<WallContributors, "basis" | "since">): string {
  if (data.basis === "points") return "Points, last 30 days"
  if (!data.since) return "Posts and comments, last 30 days"
  const t = Date.parse(data.since)
  return Number.isFinite(t) ? `Posts and comments since ${SHORT_DATE.format(t)}` : "Posts and comments, lately"
}

export function WallContributorsCard({ slug, data, viewAllHref }: { slug: string; data: WallContributors; viewAllHref: string | null }) {
  const points = data.basis === "points"
  return (
    <section className={`${CARD} p-4`} data-wall-contributors={data.basis} aria-label={points ? "Top contributors" : "Most active"}>
      <CardHead title={points ? "Top contributors" : "Most active"} detail={contributorsDetail(data)} href={viewAllHref} />
      <ol className="mt-2.5 space-y-0.5">
        {data.rows.map((r) => (
          <li key={r.userId} className="flex h-12 items-center gap-3" data-wall-contributor={r.userId}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[12.5px] font-semibold tabular-nums text-[#4b5563]" data-wall-rank="">
              {r.rank}
            </span>
            <Link href={memberHref(slug, { id: r.userId, username: r.username, hasStorefront: r.hasStorefront })} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-person-link="" data-person-id={r.userId}>
              <AppAvatar src={r.avatarUrl} name={r.name} alt="" size={34} markWhileLoading />
              <span className="truncate text-[14.5px] font-medium text-[#1a1a2e] hover:underline">{r.name}</span>
            </Link>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold tabular-nums text-[#374151]" data-wall-value="" aria-label={points ? `${r.value} points` : `${r.value} posts and comments`}>
              {points ? <CupBold size={15} className="text-[#d08a17]" /> : <MessageSquareText className="h-[15px] w-[15px] text-[#9ca3af]" strokeWidth={1.9} aria-hidden />}
              {compactCount(r.value)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
