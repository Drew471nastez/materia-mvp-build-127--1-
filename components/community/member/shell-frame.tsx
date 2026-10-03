"use client"

/**
 * ===========================================================================
 *  THE MEMBER AREA'S FRAME
 * ===========================================================================
 * Somebody's community, not a dashboard. On a computer a slim column on the
 * left holds the community (its picture, its name, how many members and, only
 * when presence says so, how many are here now), the places in it and its
 * spaces; the page sits to its right. From 1024px down there is no column: a
 * compact row with the community and the bell, then one row of pills in the
 * Library's style that scrolls sideways and stays under the header, and the
 * spaces in a sheet from the bottom.
 *
 * The header above is the platform's and is sticky, so the frame measures it
 * once (ResizeObserver) and hands the height to everything that sticks
 * (--community-top) rather than guessing it twice.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Settings2 } from "lucide-react"
import { Home2Icon as HomeLine } from "@solar-icons/react/linear/home-2"
import { Home2Icon as HomeBold } from "@solar-icons/react/bold/home-2"
import { NotebookIcon as ClassLine } from "@solar-icons/react/linear/notebook"
import { NotebookIcon as ClassBold } from "@solar-icons/react/bold/notebook"
import { CalendarIcon as EventsLine } from "@solar-icons/react/linear/calendar"
import { CalendarIcon as EventsBold } from "@solar-icons/react/bold/calendar"
import { UsersGroupRoundedIcon as MembersLine } from "@solar-icons/react/linear/users-group-rounded"
import { UsersGroupRoundedIcon as MembersBold } from "@solar-icons/react/bold/users-group-rounded"
import { CupStarIcon as BoardLine } from "@solar-icons/react/linear/cup-star"
import { CupStarIcon as BoardBold } from "@solar-icons/react/bold/cup-star"
import { BookmarkIcon as SavedLine } from "@solar-icons/react/linear/bookmark"
import { BookmarkIcon as SavedBold } from "@solar-icons/react/bold/bookmark"
import { BellIcon as BellLine } from "@solar-icons/react/linear/bell"
import { BellIcon as BellBold } from "@solar-icons/react/bold/bell"
import { AppAvatar } from "@/components/app/app-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { memberCountLabel } from "@/lib/communities/format"
import type { ViewerView } from "@/lib/communities/types"
import { navEntries, sectionFromPath } from "./nav"
import { useOnlineCount, useUnreadNotifications } from "./realtime"
import { SpaceIcon } from "./space-icon"
import { Toasts } from "./toast"
import { ICON_BTN, PILL, PILL_OFF, PILL_ON } from "./ui"
import type { ShellCommunity, ShellSection, SpaceView } from "./view-types"

type IconComp = React.ComponentType<{ size?: number | string; className?: string }>
const ICONS: Record<string, { line: IconComp; fill: IconComp }> = {
  home: { line: HomeLine, fill: HomeBold },
  classroom: { line: ClassLine, fill: ClassBold },
  events: { line: EventsLine, fill: EventsBold },
  members: { line: MembersLine, fill: MembersBold },
  leaderboard: { line: BoardLine, fill: BoardBold },
  saved: { line: SavedLine, fill: SavedBold },
  notifications: { line: BellLine, fill: BellBold },
}

function countBadge(n: number): string {
  return n > 99 ? "99+" : String(n)
}

export interface ShellFrameProps {
  community: ShellCommunity
  viewer: ViewerView
  spaces: SpaceView[]
  unreadNotifications: number
  active?: ShellSection
  children: React.ReactNode
}

export function ShellFrame({ community, viewer, spaces, unreadNotifications, active, children }: ShellFrameProps) {
  const pathname = usePathname()
  const current: ShellSection = active ?? sectionFromPath(pathname, community.slug)
  const staff = !!viewer.can.manage_members
  const entries = useMemo(() => navEntries(community, staff), [community, staff])
  const unread = useUnreadNotifications(community.id, viewer.userId, unreadNotifications)
  const online = useOnlineCount(community.id, viewer.userId)
  const base = `/community/${community.slug}`
  const rootRef = useRef<HTMLDivElement>(null)
  const [sheet, setSheet] = useState(false)

  /* The platform header's height, measured once and shared with everything that sticks under it. */
  useLayoutEffect(() => {
    const root = rootRef.current
    const header = document.getElementById("platform-header-root")
    if (!root) return
    const set = () => {
      const sticky = header && getComputedStyle(header).position !== "relative" && getComputedStyle(header).position !== "static"
      root.style.setProperty("--community-top", `${sticky ? Math.round(header.getBoundingClientRect().height) : 0}px`)
    }
    set()
    if (!header || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(set)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  /* A new page closes the sheet. */
  useEffect(() => setSheet(false), [pathname])

  const activeSpace = current.startsWith("space:") ? spaces.find((s) => `space:${s.slug}` === current) : null
  const onlineLine = online !== null && online > 1 ? `${online} online` : null

  return (
    <div ref={rootRef} data-community-shell="" className="min-h-[calc(100svh-var(--community-top,0px))] bg-[#f8f9fa] [--community-top:0px]">
      <div className="mx-auto flex w-full max-w-[1280px] gap-8 px-4 sm:px-6 lg:px-8">
        {/* ── The column, from 1024px ─────────────────────────────────── */}
        <aside data-community-rail="" className="hidden w-[232px] shrink-0 lg:block">
          <div className="sticky top-[calc(var(--community-top,0px)+20px)] flex max-h-[calc(100svh-var(--community-top,0px)-40px)] flex-col overflow-y-auto pb-6 pt-6 scrollbar-hide">
            <Link href={base} className="group/head flex items-center gap-3 rounded-xl px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
              <CommunityMark community={community} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">{community.name}</span>
                <span className="block truncate text-[12.5px] leading-5 text-[#6b7280]" data-community-counts="">
                  {memberCountLabel(community.memberCount)}
                  {onlineLine ? (
                    <>
                      <span aria-hidden className="mx-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-[#22a06b] align-middle" />
                      <span data-community-online="">{onlineLine}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </Link>

            <nav aria-label={community.name} className="mt-5 space-y-0.5">
              {entries.map((e) => (
                <RailLink key={e.key} href={e.href} label={e.label} icon={ICONS[e.key]} on={current === e.key} />
              ))}
              <RailLink href={`${base}/notifications`} label="Notifications" icon={ICONS.notifications} on={current === "notifications"} count={unread} />
            </nav>

            {spaces.length ? (
              <div className="mt-6">
                <div className="px-2.5 pb-1.5 text-[12px] font-medium text-[#8a8f98]">Spaces</div>
                <div className="space-y-0.5" data-community-spaces="">
                  {spaces.map((s) => (
                    <SpaceLink key={s.id} space={s} href={`${base}/space/${s.slug}`} on={current === `space:${s.slug}`} />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 space-y-0.5 border-t border-[#eceef1] pt-4">
              <Link href={`${base}/about`} className="flex h-9 items-center rounded-[10px] px-2.5 text-[13.5px] text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
                About this community
              </Link>
              {(viewer.isOwner || viewer.isCreatorAccount) && (viewer.can.manage_settings || viewer.can.review_reports) ? (
                <a href={`/app/community/${community.id}`} className="flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[13.5px] text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
                  <Settings2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Manage community
                </a>
              ) : null}
            </div>
          </div>
        </aside>

        {/* ── The page ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Below 1024px: the community, the bell, and the places as pills. */}
          <div className="lg:hidden" data-community-phone-bar="">
            <div className="flex items-center gap-3 pb-2 pt-3">
              <Link href={base} className="flex min-w-0 flex-1 items-center gap-2.5">
                <CommunityMark community={community} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold leading-5 text-[#1a1a2e]">{community.name}</span>
                  <span className="block truncate text-[12px] leading-4 text-[#6b7280]">
                    {memberCountLabel(community.memberCount)}
                    {onlineLine ? ` · ${onlineLine}` : ""}
                  </span>
                </span>
              </Link>
              <Link href={`${base}/notifications`} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={`${ICON_BTN} relative -mr-1.5`} data-community-bell="">
                {current === "notifications" ? <BellBold size={22} /> : <BellLine size={22} />}
                {unread > 0 ? (
                  <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-[#1a1a2e] px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white ring-2 ring-[#f8f9fa]">{countBadge(unread)}</span>
                ) : null}
              </Link>
            </div>
          </div>
          <PhonePills entries={entries} current={current} spaces={spaces} activeSpace={activeSpace ?? null} onSpaces={() => setSheet(true)} />
          {/* The classroom and events pages (their own worker's) draw only their body; the frame gives it the same room as the feed. */}
          {current === "classroom" || current === "events" ? <div className="pb-16 pt-2 lg:pt-6" data-community-body="">{children}</div> : children}
        </div>
      </div>

      <BottomSheet isOpen={sheet} onClose={() => setSheet(false)} title="Spaces" hideFrom={null}>
        <div className="space-y-0.5 px-2 pb-[calc(16px+env(safe-area-inset-bottom))]" data-community-spaces-sheet="">
          {spaces.map((s) => (
            <SpaceLink key={s.id} space={s} href={`${base}/space/${s.slug}`} on={current === `space:${s.slug}`} big />
          ))}
        </div>
      </BottomSheet>
      <Toasts />
    </div>
  )
}

/** The community's picture, or its initials on a quiet grey square. */
export function CommunityMark({ community, size }: { community: Pick<ShellCommunity, "name" | "logoUrl">; size: number }) {
  return <AppAvatar src={community.logoUrl} name={community.name} alt="" size={size} className="shrink-0 rounded-[10px]" markWhileLoading />
}

function RailLink({ href, label, icon, on, count = 0 }: { href: string; label: string; icon: { line: IconComp; fill: IconComp }; on: boolean; count?: number }) {
  const Icon = on ? icon.fill : icon.line
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      data-community-nav={label}
      className={`flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 ${
        on ? "bg-[#e9ebee] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
      }`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? <span className="rounded-full bg-[#1a1a2e] px-1.5 text-[11px] font-semibold leading-[18px] text-white">{countBadge(count)}</span> : null}
    </Link>
  )
}

function SpaceLink({ space, href, on, big = false }: { space: SpaceView; href: string; on: boolean; big?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      data-community-space={space.slug}
      className={`flex items-center gap-2.5 rounded-[10px] px-2.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 ${big ? "h-12 text-[15px]" : "h-9 text-[14px]"} ${
        on ? "bg-[#e9ebee] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
      }`}
    >
      <span className={`flex w-[18px] shrink-0 justify-center ${on ? "text-[#1a1a2e]" : "text-[#8a8f98]"}`}>
        <SpaceIcon icon={space.icon} kind={space.kind} />
      </span>
      <span className={`min-w-0 flex-1 truncate ${space.unread > 0 ? "text-[#1a1a2e]" : ""}`}>{space.name}</span>
      {space.unread > 0 ? <span className="rounded-full bg-[#1a1a2e] px-1.5 text-[11px] font-semibold leading-[18px] text-white">{countBadge(space.unread)}</span> : null}
    </Link>
  )
}

/** Below 1024px: the places as one row of pills that scrolls sideways and stays under the header. */
function PhonePills({
  entries,
  current,
  spaces,
  activeSpace,
  onSpaces,
}: {
  entries: { key: ShellSection; label: string; href: string }[]
  current: ShellSection
  spaces: SpaceView[]
  activeSpace: SpaceView | null
  onSpaces: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = () => {
    const el = trackRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }
  useLayoutEffect(() => {
    measure()
    const el = trackRef.current
    const on = el?.querySelector<HTMLElement>('[data-on="true"]')
    if (el && on) {
      const to = on.offsetLeft + on.offsetWidth + 24 - el.clientWidth
      if (to > el.scrollLeft) el.scrollLeft = to
    }
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [current])
  const unreadInSpaces = spaces.reduce((n, s) => n + s.unread, 0)
  const mask =
    edges.left && edges.right
      ? "[mask-image:linear-gradient(to_right,transparent_0,black_20px,black_calc(100%-28px),transparent_100%)]"
      : edges.right
        ? "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent_100%)]"
        : edges.left
          ? "[mask-image:linear-gradient(to_right,transparent_0,black_20px)]"
          : ""
  const [home, ...rest] = entries
  return (
    <nav aria-label="Community" data-community-pills="" className="sticky top-[var(--community-top,0px)] z-20 -mx-4 bg-[#f8f9fa]/95 py-2 backdrop-blur-[2px] sm:-mx-6 lg:hidden">
      <div ref={trackRef} onScroll={measure} className={`overflow-x-auto overscroll-x-contain px-4 scrollbar-hide sm:px-6 ${mask}`}>
        <div className="flex w-max items-center gap-2">
          <Link href={home.href} data-on={current === "home" ? "true" : "false"} aria-current={current === "home" ? "page" : undefined} className={`${PILL} ${current === "home" ? PILL_ON : PILL_OFF}`}>
            {home.label}
          </Link>
          {spaces.length ? (
            <button type="button" onClick={onSpaces} data-on={activeSpace ? "true" : "false"} data-community-spaces-pill="" className={`${PILL} ${activeSpace ? PILL_ON : PILL_OFF}`} aria-haspopup="dialog">
              <span className="max-w-[150px] truncate">{activeSpace ? activeSpace.name : "Spaces"}</span>
              {unreadInSpaces > 0 && !activeSpace ? <span aria-label={`${unreadInSpaces} unread`} className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e]" /> : null}
              <ChevronDown className="-mr-1 h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {rest.map((e) => (
            <Link key={e.key} href={e.href} data-on={current === e.key ? "true" : "false"} aria-current={current === e.key ? "page" : undefined} className={`${PILL} ${current === e.key ? PILL_ON : PILL_OFF}`}>
              {e.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
