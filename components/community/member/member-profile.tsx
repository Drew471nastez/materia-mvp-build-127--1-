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
import { DecodedCover } from "@/components/profile/decoded-cover"
import { coverCropStyle } from "@/lib/images/cover-crop"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
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
const CARD = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
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
  const joined = monthYear(person.joinedAt)
  const cover = person.coverUrl ? optimizedImageUrl(person.coverUrl, 720) : null
  return (
    <header className={cn(CARD, "overflow-hidden")} data-member-profile-head="">
      {/* THE BAND'S HEIGHT IS DRAWN FIRST: the picture fills a box that already exists, so nothing under it moves when it comes. */}
      <div className={cn("relative w-full overflow-hidden", cover ? "h-[124px] bg-[#eceef1] sm:h-[168px]" : "h-14 bg-[#f3f4f6] sm:h-16")} data-member-profile-cover={cover ? "image" : "plain"}>
        {cover ? <DecodedCover src={cover} style={coverCropStyle(person.coverCrop)} /> : null}
      </div>
      <div className="relative px-4 pb-5 sm:px-6">
        <div className="-mt-[40px] flex items-end justify-between gap-3 sm:-mt-[46px]">
          <span className="relative inline-flex shrink-0 rounded-full bg-white p-[3px] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" data-member-profile-avatar="">
            <MemberAvatar src={person.avatarUrl} name={person.name} size={88} sizedByClass className="h-[80px] w-[80px] sm:h-[88px] sm:w-[88px]" />
          </span>
        </div>
        <div className="mt-3 min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-[20px] font-bold leading-[1.25] tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]" data-member-profile-name="">
            <span className="min-w-0 truncate">{person.name}</span>
            {person.role ? <RoleBadge role={person.role} /> : null}
          </h1>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13.5px] leading-5 text-[#6b7280]" data-member-profile-meta="">
            {person.username ? <span className="truncate">@{person.username}</span> : null}
            {person.level && person.level > 1 ? (
              <>
                <span aria-hidden className="text-[#c4c8cf]">·</span>
                <span className="whitespace-nowrap">Level {person.level}</span>
              </>
            ) : null}
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
            <p className="mt-2.5 line-clamp-3 whitespace-pre-line text-[14.5px] leading-[1.5] text-[#374151] [overflow-wrap:anywhere]" data-member-profile-bio="">
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
          {person.pageHref ? (
            <Link href={fullPageHref(person.pageHref, community.slug, profileRef)} className={SECONDARY} data-member-profile-page="">
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedImageUrl(post.imageUrl, 128)} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
}: {
  page: ProfilePostsPage
  community: MemberProfilePlaceProps["community"]
  profileRef: string
  showCommunity: boolean
  now: number
  empty: React.ReactNode
}) {
  const { posts, setPosts, next, state, more } = usePostPages(page, community.id, profileRef)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const end = useRef<HTMLDivElement | null>(null)

  /* The next page is asked for as the list nears its end, never on a press the person has to make. */
  useEffect(() => {
    const el = end.current
    if (!el || !next || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) void more()
    }, { rootMargin: `0px 0px ${AHEAD_PX}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [next, more])

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
      <section className="mx-auto w-full max-w-[680px] py-2" data-member-profile-place="missing">
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
  return (
    <section className="mx-auto flex w-full max-w-[680px] flex-col gap-4 py-2" data-member-profile-place="person" aria-label={`${data.person.name}'s profile`}>
      <ProfileHead data={data} community={community} profileRef={profileRef} signedIn={signedIn} />
      <div data-profile-panel="posts">
        <h2 className="mb-2.5 px-1 text-[15px] font-semibold text-[#1a1a2e]">Posts in {community.name}</h2>
        <PostList
          page={data.posts}
          community={community}
          profileRef={profileRef}
          showCommunity={false}
          now={now}
          empty={<p className="text-[14px] text-[#6b7280]">{first} has not posted here yet.</p>}
        />
      </div>
    </section>
  )
}
