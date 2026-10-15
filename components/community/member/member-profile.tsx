"use client"

/**
 * ===========================================================================
 *  A PERSON, INSIDE THE COMMUNITY
 * ===========================================================================
 * Round 15 (R, items 20, 21, 23). The community shell's `profile` place,
 * `/community/<slug>?profile=<handle>` and `?profile=me`, drawn by the shell
 * with no page load (components/community/member/place-host.tsx is the
 * shell's; everything inside the place is here). The data is the server's
 * one read, lib/communities/server/member-profile.ts loadMemberProfile, in
 * the shape lib/communities/member-profile-view.ts names.
 *
 *   THE HEAD     one white card: the cover in a band whose height is fixed
 *                before anything loads, the picture put in only once it is
 *                decoded (components/profile/decoded-cover.tsx), so it never
 *                flashes and never moves anything; the photo across the
 *                band's foot; the name, their role here, @handle, where they
 *                are from, a short bio, the counts; then Follow (the one
 *                Follow, calm both ways, at one fixed size) and the door to
 *                their full page.
 *   THE BOARD    round 18 (C18, items 10 to 13): under the head, their
 *                activity here (components/community/member/activity-board.tsx:
 *                the day grid, their level and points, the facts). The band
 *                is taller, the photo bigger and it opens in the creator
 *                page's viewer, and Visit page is a push there and a pop
 *                back (useFullPage below).
 *   ROUND 25     the owner, again: the band a bit taller, their level on
 *                their photo (the leaderboard's mark, large), their bio up
 *                to four lines, and the cover and words from their Storelib
 *                page when their own profile has none (the loader's
 *                pageLookOf). The board is simpler (activity-board.tsx). A
 *                creator's profile shows their posts first and the board
 *                under them, reached with Show more.
 *   SOMEBODY     their posts in this community that I may read here, newest
 *                first, a page at a time as the list nears its end.
 *   ME           NOT HERE ANY MORE (round 16). The owner: "I didn't mean for
 *                the profile account user page to be changed from how it was
 *                before." My own profile is the account page, so ?profile=me
 *                (and my own handle) goes there (AccountRedirect below; the
 *                server page redirects a fresh load before anything is
 *                drawn), and my posts from every community, with Edit and
 *                Delete, are its Posts pill (app/account/posts).
 *
 * A post here opens over the community the way the feed opens one
 * (openPost); a post of mine in another community opens there. Deleting
 * folds the row away (height and opacity together, 220ms) after the server
 * said yes, never before.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { swapTabPage } from "@/lib/nav/tab-swap"
import { communityContext, enterCommunityContext } from "@/lib/nav/community-context"
import { Heart, MessageCircle } from "lucide-react"
import { MenuDotsIcon } from "@solar-icons/react/linear/menu-dots"
import { PenIcon } from "@solar-icons/react/linear/pen"
import { TrashBinMinimalisticIcon } from "@solar-icons/react/linear/trash-bin-minimalistic"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { FollowButton, useFollow } from "@/components/profile/follow-button"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { armPageMotion, holdPageMotion, takeArmedMotion } from "@/lib/navigation/page-push"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { SoftImg } from "@/components/ui/soft-img"
import { relativeTime } from "@/lib/communities/format"
import { openPost } from "@/lib/communities/client/open-post"
import { useCommunityNavigator } from "@/lib/communities/client/navigator"
import {
  fullPageHref,
  postEditHref,
  type MemberProfileData,
  type ProfileCommunity,
  type ProfilePostView,
  type ProfilePostsPage,
} from "@/lib/communities/member-profile-view"
import { cn } from "@/lib/utils"
import { api, apiBase } from "./api"
import type { ConfirmState } from "./dialogs"
import { ConfirmSheet } from "./report-confirm"
import { MemberAvatar } from "./member-avatar"
import { MemberCover } from "./member-cover"
import { ActivityBoard } from "./activity-board"
import { LevelBadge } from "./level-badge"
import { RoleBadge } from "./role-badge"
import { toast } from "./toast"
import { ICON_BTN } from "./ui"

export interface MemberProfilePlaceProps {
  /** The community the place is in (the shell's community: only these are read). */
  community: { id: string; slug: string; name: string }
  /** Who is looking (the shell's viewer). */
  viewer: { userId: string | null; signedIn?: boolean }
  /** "me" or a handle, as the address has it. */
  profileRef: string
  /** loadMemberProfile's answer; null when there is nobody to show here. */
  data: MemberProfileData | null
}

/** The card every block of the place sits on: Storelib's white, a hairline and a 1px soft shadow. */
const CARD = "rounded-2xl border border-[#eceef1] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
/** Storelib's quiet secondary, at the Follow button's height and rounding, so the two sit as a pair. */
const SECONDARY =
  "inline-flex h-10 min-w-[128px] shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl border border-[#d9dbe0] bg-white px-5 text-[14px] font-medium text-[#1a1a2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f7f7f8] active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]"

function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}

const monthYear = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** The clock for times: the server's on the first render (so hydration agrees), then this device's. */
function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

/* ── The head ─────────────────────────────────────────────────────────── */

/**
 * THE PLACE'S COLUMN (round J1, the owner: "no longer tabs in the right side, and larger cards now"). From 1280px the
 * profile takes the middle and the right columns (shell-frame.tsx, wideCenter), so its cards run the frame's whole
 * middle, up to 992px, lined up with the left column's cards; it was 680px beside the right column's cards. Below
 * 1280px it is the middle column, and the whole width on a phone. Capped at the same 992px (PROFILE_COLUMN_PX,
 * lib/communities/member-cover.ts) wherever it is drawn outside the frame.
 * Changed (the owner: "the content is a bit too wide"): from 1280px it is 95.2% of those two columns, at most 944px
 * (PROFILE_COLUMN_SHARE, PROFILE_COLUMN_WIDE_PX), centred: 944px at 1440px, 24px either side. Phones and tablets unchanged.
 */
const COLUMN_CLASS = "max-w-[992px] xl:max-w-[min(944px,95.2%)]"

/** The router's "full" prefetch (the whole page, not only up to its loading screen), as shell-frame.tsx asks. */
const FULL = "full" as never
/** Full pages already asked for in this tab: each once. */
const prefetched = new Set<string>()
/** How long the profile is on screen before its full page is read ahead, so a quick look costs nothing. */
export const PAGE_AHEAD_MS = 900

/**
 * VISIT PAGE, A PUSH AND A POP (round 18, item 12). The full page is read
 * ahead in full (once the profile has been on screen PAGE_AHEAD_MS, or at
 * once on a press, a hover or focus), so the press lands on a page that is
 * ready, never on its loading screen. The press arms a push: in the commit
 * that takes the community away, a copy of it drifts left under the full page
 * as that comes in from the right edge (lib/navigation/page-push.ts, the
 * full page's half in components/profile/profile-arrival.tsx). Its back arrow
 * pops it off to the right over this place, which comes back as it was.
 */
function useFullPage(href: string | null) {
  const router = useRouter()
  const ahead = useCallback(() => {
    if (!href || prefetched.has(href)) return
    prefetched.add(href)
    try {
      router.prefetch(href, { kind: FULL })
    } catch {
      prefetched.delete(href)
    }
  }, [href, router])
  useEffect(() => {
    if (!href) return
    const t = window.setTimeout(ahead, PAGE_AHEAD_MS)
    return () => window.clearTimeout(t)
  }, [href, ahead])
  return ahead
}

function ProfileHead({ data, community, profileRef, signedIn }: { data: MemberProfileData; community: MemberProfilePlaceProps["community"]; profileRef: string; signedIn: boolean }) {
  const { person, self } = data
  const [followers, setFollowers] = useState(person.followers)
  const follow = useFollow({
    targetUserId: person.userId,
    initialFollowing: data.viewerFollowing,
    signedIn,
    onFollowers: setFollowers,
    onChange: (on) => setFollowers((n) => Math.max(0, n + (on ? 1 : -1))),
    onError: (message) => toast(message),
  })
  /* The board says when they joined and their level; without one (an older answer) the line under the name still does. */
  const joined = data.board ? null : monthYear(person.joinedAt)
  /* Their level on their photo (round 25), where the community counts points: the board's standing, else the member row's. */
  const badge = data.board ? data.board.standing?.level ?? null : person.level && person.level > 1 ? person.level : null
  const pageHref = person.pageHref ? fullPageHref(person.pageHref, community.slug, profileRef) : null
  const ahead = useFullPage(pageHref)
  const head = useRef<HTMLElement | null>(null)

  /* The commit that takes the community away after Visit page: the community, as it stood, slides under the page that comes. */
  useLayoutEffect(() => {
    const el = head.current
    return () => {
      if (!takeArmedMotion("push")) return
      holdPageMotion((el?.closest("[data-community-shell]") as HTMLElement | null) ?? el?.closest("[data-member-profile-place]") ?? null, "push")
    }
  }, [])

  return (
    <header ref={head} className={cn(CARD, "overflow-hidden")} data-member-profile-head="">
      {/*
        THE BAND'S SHAPE IS DRAWN FIRST: the picture fills a box that already exists, so nothing under it moves when it
        comes. Round J1: one shape for everybody (2:1 on a phone, 16:5 wider up, so 179px on a 390px phone), their cover, else their creator page's (the loader), else a wash of their own photo's colours, never a
        flat grey band (components/community/member/member-cover.tsx).
      */}
      <MemberCover url={person.coverUrl} crop={person.coverCrop} name={person.name} avatarUrl={person.avatarUrl} />
      <div className="relative px-4 pb-5 sm:px-6 lg:px-8 lg:pb-7">
        <div className="-mt-[51px] flex items-end justify-between gap-3 sm:-mt-[59px] lg:-mt-[67px]">
          {/* Round 18 (item 13): bigger, and a press opens it the way a creator page's photo opens (its own viewer, reused). */}
          <AvatarLightbox src={person.avatarUrl} name={person.name}>
            <span className="relative inline-flex shrink-0 rounded-full bg-white p-[3px] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" data-member-profile-avatar="">
              <MemberAvatar src={person.avatarUrl} name={person.name} size={112} sizedByClass className="h-[96px] w-[96px] sm:h-[112px] sm:w-[112px] lg:h-[128px] lg:w-[128px]" />
              {badge ? <LevelBadge level={badge} size="lg" data-member-profile-level="" /> : null}
            </span>
          </AvatarLightbox>
        </div>
        <div className="mt-3 min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-[20px] font-bold leading-[1.25] tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px] lg:text-[26px]" data-member-profile-name="">
            <span className="min-w-0 truncate">{person.name}</span>
            {person.role ? <RoleBadge role={person.role} /> : null}
          </h1>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13.5px] leading-5 text-[#6b7280]" data-member-profile-meta="">
            {person.username ? <span className="truncate">@{person.username}</span> : null}
            {joined ? (
              <>
                <span aria-hidden className="text-[#c4c8cf]">·</span>
                <span className="whitespace-nowrap">Joined {joined}</span>
              </>
            ) : null}
          </p>
          {person.location ? (
            <p className="mt-1 truncate text-[13.5px] leading-5 text-[#6b7280]" data-member-profile-location="">
              {person.location}
            </p>
          ) : null}
          {person.bio ? (
            <p className="mt-2.5 line-clamp-4 whitespace-pre-line text-[14.5px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere]" data-member-profile-bio="">
              {person.bio}
            </p>
          ) : null}
          <p className="mt-2.5 text-[13.5px] leading-5 text-[#6b7280]" data-member-profile-counts="">
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{compact(followers)}</span> {followers === 1 ? "follower" : "followers"}
            <span aria-hidden className="px-1.5 text-[#c4c8cf]">
              ·
            </span>
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{compact(person.following)}</span> following
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" data-member-profile-actions="">
          {self ? null : <FollowButton following={follow.following} busy={follow.busy} onClick={follow.toggle} name={person.name} data-member-profile-follow="" />}
          {pageHref ? (
            <Link
              href={pageHref}
              prefetch={false}
              className={SECONDARY}
              onPointerDown={ahead}
              onMouseEnter={ahead}
              onFocus={ahead}
              onClick={(e) => {
                if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                ahead()
                armPageMotion("push")
              }}
              data-member-profile-page=""
            >
              {person.hasStorefront ? "Visit page" : "Full profile"}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/* ── One post ─────────────────────────────────────────────────────────── */

function CommunityMark({ community }: { community: ProfileCommunity }) {
  return (
    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-black/[0.06] bg-[#f3f4f6] text-[10px] font-semibold text-[#6b7280]" aria-hidden>
      {community.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageUrl(community.logoUrl, 36)} alt="" width={18} height={18} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        (community.name.trim()[0] || "·").toUpperCase()
      )}
    </span>
  )
}

function PostRow({
  post,
  here,
  showCommunity,
  now,
  onDelete,
}: {
  post: ProfilePostView
  /** The community the place is in: its posts open over it. */
  here: string
  showCommunity: boolean
  now: number
  onDelete: (post: ProfilePostView, row: HTMLElement | null) => void
}) {
  const router = useRouter()
  const row = useRef<HTMLLIElement | null>(null)
  const items: ActionMenuItem[] = []
  if (post.canEdit) items.push({ label: "Edit post", icon: <PenIcon size={16} />, onClick: () => router.push(postEditHref(post.href)) })
  if (post.canDelete) items.push({ label: "Delete post", icon: <TrashBinMinimalisticIcon size={16} />, variant: "destructive", onClick: () => onDelete(post, row.current) })
  const sameCommunity = post.community.id === here
  return (
    <li ref={row} className="relative" data-profile-post={post.id} data-profile-post-own={items.length ? "" : undefined}>
      <Link
        href={post.href}
        onClick={(e) => {
          if (!sameCommunity || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          /* A post of this community opens over it, as from the feed; nobody to open it, its own page by address. */
          e.preventDefault()
          openPost(post.id, row.current)
        }}
        className={cn("flex min-w-0 gap-3 px-4 py-3.5 outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f7f7f8] active:bg-[#f3f4f6] focus-visible:bg-[#f3f4f6] sm:px-5", items.length ? "pr-12 sm:pr-14" : "")}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 text-[#6b7280]" data-profile-post-where="">
            {showCommunity ? (
              <>
                <CommunityMark community={post.community} />
                <span className="min-w-0 truncate font-medium text-[#374151]">{post.community.name}</span>
              </>
            ) : null}
            {post.space ? (
              <>
                {showCommunity ? <span aria-hidden className="text-[#c4c8cf]">·</span> : null}
                <span className="min-w-0 max-w-[140px] truncate">{post.space}</span>
              </>
            ) : null}
            {showCommunity || post.space ? <span aria-hidden className="text-[#c4c8cf]">·</span> : null}
            <time dateTime={post.at} className="shrink-0 tabular-nums">
              {relativeTime(post.at, now, "UTC")}
            </time>
          </span>
          <span className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.4] text-[#1a1a2e] [overflow-wrap:anywhere]">{post.title}</span>
          {post.excerpt ? <span className="mt-0.5 line-clamp-2 text-[14px] leading-[1.5] text-[#4b5563] [overflow-wrap:anywhere]">{post.excerpt}</span> : null}
          {post.reactions > 0 || post.comments > 0 ? (
            <span className="mt-1.5 flex items-center gap-3 text-[12.5px] tabular-nums text-[#6b7280]">
              {post.reactions > 0 ? (
                <span className="inline-flex items-center gap-1" aria-label={`${post.reactions} likes`}>
                  <Heart className="h-3.5 w-3.5" aria-hidden />
                  {post.reactions}
                </span>
              ) : null}
              {post.comments > 0 ? (
                <span className="inline-flex items-center gap-1" aria-label={`${post.comments} comments`}>
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  {post.comments}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {post.imageUrl ? (
          /* The thumbnail's box is there before the picture: 64px, never a jump. */
          <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f1f2f4]">
            <SoftImg src={post.imageUrl} width={64} height={64} className="h-full w-full object-cover" />
          </span>
        ) : null}
      </Link>
      {items.length ? (
        <div className="absolute right-1.5 top-2 sm:right-2.5">
          <ResponsiveActionMenu
            title="Your post"
            items={items}
            trigger={
              <button type="button" aria-label="Post options" className={ICON_BTN} data-profile-post-more="">
                <MenuDotsIcon size={20} />
              </button>
            }
          />
        </div>
      ) : null}
    </li>
  )
}

/* ── A list of posts, a page at a time ────────────────────────────────── */

/** How close to the list's end the next page is asked for. */
const AHEAD_PX = 700
/** A wait shorter than this shows nothing at all. */
const QUIET_WAIT_MS = 250
/** The fold of a deleted row. */
export const FOLD_MS = 220

function usePostPages(initial: ProfilePostsPage, communityId: string, profileRef: string) {
  const [posts, setPosts] = useState(initial.posts)
  const [next, setNext] = useState(initial.next)
  const [state, setState] = useState<"idle" | "loading" | "slow" | "error">("idle")
  const busy = useRef(false)
  /* A new person (or a refresh of the place) starts over from what the server handed. */
  useEffect(() => {
    setPosts(initial.posts)
    setNext(initial.next)
    setState("idle")
  }, [initial])
  const more = useCallback(async () => {
    if (busy.current || !next) return
    busy.current = true
    setState("loading")
    const slow = window.setTimeout(() => setState((s) => (s === "loading" ? "slow" : s)), QUIET_WAIT_MS)
    const r = await api<ProfilePostsPage>(`${apiBase(communityId)}/member-profile?${new URLSearchParams({ ref: profileRef, cursor: next })}`)
    window.clearTimeout(slow)
    busy.current = false
    if (!r.ok) {
      setState("error")
      return
    }
    setPosts((list) => {
      const have = new Set(list.map((p) => p.id))
      return [...list, ...r.data.posts.filter((p) => !have.has(p.id))]
    })
    setNext(r.data.next)
    setState("idle")
  }, [communityId, next, profileRef])
  return { posts, setPosts, next, state, more }
}

function PostList({
  page,
  community,
  profileRef,
  showCommunity,
  now,
  empty,
  byButton = false,
}: {
  page: ProfilePostsPage
  community: MemberProfilePlaceProps["community"]
  profileRef: string
  showCommunity: boolean
  now: number
  empty: React.ReactNode
  /** Something comes after the list (a creator's board): the next page waits for Show more, so it can be reached. */
  byButton?: boolean
}) {
  const { posts, setPosts, next, state, more } = usePostPages(page, community.id, profileRef)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const end = useRef<HTMLDivElement | null>(null)

  /* The next page is asked for as the list nears its end, never on a press the person has to make. */
  useEffect(() => {
    const el = end.current
    if (byButton || !el || !next || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) void more()
    }, { rootMargin: `0px 0px ${AHEAD_PX}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [next, more, byButton])

  const remove = (post: ProfilePostView, row: HTMLElement | null) =>
    setConfirm({
      title: "Delete this post?",
      detail: `It goes for everyone in ${post.community.name}, with its comments.`,
      action: "Delete",
      danger: true,
      run: async () => {
        const r = await api(`${apiBase(post.community.id)}/posts/${post.id}`, { method: "DELETE" })
        if (!r.ok) {
          toast(r.error)
          return false
        }
        /* The server said yes: the row folds away (its height and its opacity together), then leaves the list. */
        const gone = () => setPosts((list) => list.filter((p) => p.id !== post.id))
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        if (row && typeof row.animate === "function" && !reduced) {
          const h = row.offsetHeight
          row.style.overflow = "hidden"
          const fold = row.animate(
            [
              { height: `${h}px`, opacity: 1 },
              { height: "0px", opacity: 0 },
            ],
            { duration: FOLD_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" },
          )
          fold.onfinish = gone
          window.setTimeout(gone, FOLD_MS + 120)
        } else gone()
        toast("Post deleted")
        return true
      },
    })

  if (!posts.length && !next) return <div className={cn(CARD, "px-5 py-8 text-center")}>{empty}</div>
  return (
    <>
      <ul className={cn(CARD, "divide-y divide-[#f0f1f3] overflow-hidden")} data-profile-posts={showCommunity ? "all" : "community"}>
        {posts.map((post) => (
          <PostRow key={post.id} post={post} here={community.id} showCommunity={showCommunity} now={now} onDelete={remove} />
        ))}
      </ul>
      <div ref={end} aria-hidden className="h-px" data-profile-posts-end="" />
      {state === "slow" ? (
        <p className="py-4 text-center text-[13px] text-[#6b7280]" data-profile-posts-loading="">
          Loading more posts
        </p>
      ) : null}
      {byButton && next && state !== "error" ? (
        <div className="flex justify-center pt-3">
          <button type="button" onClick={() => void more()} disabled={state !== "idle"} aria-busy={state !== "idle" || undefined} className={SECONDARY} data-profile-posts-more="">
            Show more
          </button>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="flex justify-center py-4">
          <button type="button" onClick={() => void more()} className={SECONDARY} data-profile-posts-retry="">
            Show more
          </button>
        </div>
      ) : null}
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

/* ── My own profile is the account page ───────────────────────────────── */

/** Where my own profile is, from inside a community as from anywhere (lib/nav/buyer-tabs.ts, the Profile tab). */
export const OWN_PROFILE_HREF = "/account"

/**
 * ?profile=me, or my own handle, on screen: the account page takes its place, the way the Profile tab goes there. The
 * address is replaced, not added to, so back from the account page is the place I was on before. The community stays the
 * context and its bar is held for the account page before it arrives (components/account/account-community-chrome.tsx),
 * so Storelib's header never flashes in. Only while this place is the one on screen: a kept screen does nothing.
 */
function AccountRedirect({ slug, onScreen }: { slug: string; onScreen: boolean }) {
  const router = useRouter()
  const sent = useRef(false)
  useLayoutEffect(() => {
    if (!onScreen || sent.current) return
    sent.current = true
    if (communityContext() !== slug) enterCommunityContext(slug)
    document.documentElement.setAttribute("data-account-community-pending", "")
    const go = () => router.replace(OWN_PROFILE_HREF, { scroll: false })
    if (!swapTabPage(go, OWN_PROFILE_HREF)) go()
  }, [onScreen, router, slug])
  /* Nothing drawn meanwhile: the account page is the next thing on screen, never a card of its own first. */
  return <section className="min-h-[60svh]" aria-busy="true" data-member-profile-place="account" />
}

/* ── The place ────────────────────────────────────────────────────────── */

export function MemberProfilePlace({ community, viewer, profileRef, data }: MemberProfilePlaceProps) {
  const now = useNow(data?.now ?? Date.now())
  const nav = useCommunityNavigator()
  const self = profileRef.toLowerCase() === "me" || !!data?.self
  /* On screen: the navigator's place is this one (inside the shell), or there is no navigator (a page of its own). */
  const onScreen = !nav.inCommunity || (nav.place.kind === "profile" && nav.place.ref.toLowerCase() === profileRef.toLowerCase())

  if (self) return <AccountRedirect slug={community.slug} onScreen={onScreen} />

  if (!data) {
    return (
      <section className={cn("mx-auto w-full py-2", COLUMN_CLASS)} data-member-profile-place="missing">
        <div className={cn(CARD, "px-5 py-10 text-center")}>
          <p className="text-[16px] font-semibold text-[#1a1a2e]">Nobody here by that name</p>
          <p className="mt-1.5 text-[14px] text-[#6b7280]">They may have left {community.name}, or changed their handle.</p>
          <Link
            href={`/community/${community.slug}/members`}
            onClick={(e) => {
              /* Inside the shell the member list is a place, never a server page. */
              if (!nav.inCommunity || e.metaKey || e.ctrlKey) return
              e.preventDefault()
              nav.go({ kind: "members" })
            }}
            className={cn(SECONDARY, "mt-5")}
          >
            See members
          </Link>
        </div>
      </section>
    )
  }

  const first = data.person.name.split(/\s+/)[0] || data.person.name
  const signedIn = viewer.signedIn ?? !!viewer.userId
  /*
    A CREATOR'S PROFILE READS POSTS FIRST (round 25, the owner: "on a creator's profile, the activity section goes BELOW the
    posts section"). Somebody with a store, or the one who runs this community, is visited for what they post; a member's
    profile keeps their activity under the head. Below a list, the board is reached by paging with Show more rather than
    by a list that keeps growing under the finger.
  */
  const postsFirst = !!data.board && (data.person.hasStorefront || data.person.role === "owner")
  const board = data.board ? <ActivityBoard board={data.board} name={data.person.name} /> : null
  return (
    <section className={cn("mx-auto flex w-full flex-col gap-4 py-2 lg:gap-5", COLUMN_CLASS)} data-member-profile-place="person" data-profile-order={postsFirst ? "posts-first" : "board-first"} aria-label={`${data.person.name}'s profile`}>
      <ProfileHead data={data} community={community} profileRef={profileRef} signedIn={signedIn} />
      {postsFirst ? null : board}
      <div data-profile-panel="posts">
        <h2 className="mb-2.5 px-1 text-[15px] font-semibold text-[#1a1a2e]">Posts in {community.name}</h2>
        <PostList
          page={data.posts}
          community={community}
          profileRef={profileRef}
          showCommunity={false}
          now={now}
          byButton={postsFirst}
          empty={<p className="text-[14px] text-[#6b7280]">{first} has not posted here yet.</p>}
        />
      </div>
      {postsFirst ? board : null}
    </section>
  )
}
