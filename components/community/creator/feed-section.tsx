"use client"

/**
 * ===========================================================================
 *  FEED, FOR THE PEOPLE WHO RUN IT
 * ===========================================================================
 * Round 31, the owner: the writer here must be the community feed's own, and
 * the list must show posts the way the feed does.
 *
 *   THE WRITER is the member side's composer (components/community/member/
 *   composer.tsx), the same component and not a second one: its card that
 *   grows in place on a computer and its sheet on a phone, attachments,
 *   links and videos, polls, emoji and GIFs, the space picker with each
 *   space's icon, the sound and the check on Post, the leave question. It
 *   posts through the member route as the signed in person (head.me), so in
 *   the Announcements space it is an announcement members hear about. The
 *   welcome post (?compose=welcome, after New community) arrives as the
 *   composer's own kept draft, its title written, in the Announcements space.
 *
 *   THE ROWS show what the post carries: the author's picture, their name,
 *   the space with its icon and how long ago; the title and two lines of the
 *   words; the picture, the video's still or the GIF on the right (media.tsx
 *   PostThumb, "+2" when there are more); a file's name and a poll's question
 *   with its votes; the likes and comments. The whole row opens the post.
 *
 *   ON EACH ROW, behind its dots (a dropdown on a computer, a sheet on a
 *   phone): pin, move to another space, lock, feature, remove and restore,
 *   for whoever may (POST /api/app/community/<id>/moderation); edit and
 *   delete for the person's own post, the composer opening in the row on a
 *   computer and as its sheet on a phone (the member post route, which only
 *   lets an author change or delete their own).
 *
 *   ROUND 32: the list can be searched (words in a title or the text) and
 *   narrowed to one space, and shows All, Pinned or Removed, each read on
 *   the server (lib/communities/server/creator.ts loadFeedRows). How many are
 *   shown and Show more sit in the card's own foot.
 *
 *   ROUND 33: a row opens its post here, in the viewer (./post-viewer.tsx),
 *   not in the community; View in community is in the viewer's bar and the
 *   row's menu. All, Pinned and Removed are read side by side and kept, so a
 *   press on one shows it at once (ALL, PINNED AND REMOVED, AT ONCE, below).
 *   The Scheduled and drafts panel comes with the page (its `initial`).
 *
 *   ROUND 26, the owner: the writer opened and closed with a jump, scheduling
 *   was a second writer in a modal, and a post opened in a side panel.
 *     THE WRITER'S MOVE. The composer slides what is under it as it grows and
 *     folds (composer.tsx `following`), but here it sat alone in a wrapper, so
 *     the panel and the list jumped by its height in one frame both ways. The
 *     wrapper is marked data-composer-host and what follows it slides.
 *     SCHEDULE IN THE WRITER. The composer is passed `staff` (./composer-
 *     schedule.tsx): Schedule with a day and a time in the creator's zone,
 *     Save draft, and a row of the Scheduled and drafts list opened in it to
 *     change, reschedule, post now, make a draft or delete (part 194's routes).
 *     The list keeps no form of its own.
 *     THE COMMUNITY'S OWN POPUP. A row opens its post in member/post-overlay
 *     (./post-viewer.tsx AdminPostOverlay) with the list's actions over it.
 *     ANNOUNCEMENTS say so on their row, as Pinned does.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BarChart3, Heart, Lock, Megaphone, MessageCircle, Paperclip, Pin, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/(storelib)/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import { postPath } from "@/lib/communities/post-url"
import { requestCompose } from "@/lib/communities/client/compose-intent"
import type { FeedPostView, PostMedia } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { Composer, draftKey } from "@/components/community/member/composer"
import { ScheduledPostsPanel, type ScheduledPanelControl } from "./scheduled-posts-panel"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { PostThumb } from "@/components/community/member/media"
import { WARM_ON_HOVER_MS } from "@/components/community/member/post-card"
import type { ScheduledPanelData, ScheduledPostView } from "@/lib/communities/scheduled-posts"
import { AdminPostOverlay, OPEN_WAIT_MS, keptPost, previewOf, readPost, staffViewer, warmPost, type AdminPostHands } from "./post-viewer"
import type { ComposerStaff, StaffSaved } from "./composer-schedule"
import { spaceGlyph } from "@/components/community/member/space-glyph"
import { Toasts } from "@/components/community/member/toast"
import { api, apiBase } from "@/components/community/member/api"
import type { ComposerSpace as MemberComposerSpace } from "@/components/community/member/view-types"
import type { CommunityHead, FeedRowView } from "./view-types"
import { Confirm, Empty, FilterTabs, ListCard, Notice, PickButton, RowMenu, SearchField, ToolbarDivider, buttonPrimary, errorText, send, useToast } from "./parts"
import { ListFoot } from "./ui-kit"
import { FormSheet } from "./form-sheet"
import { ROW_PRESS, RowControls, rowPress } from "./rows"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export interface ComposerSpace {
  id: string
  name: string
  announcements: boolean
}

/** The pictures, videos and GIFs a row's thumbnail stands for. */
const VISUAL = new Set<PostMedia["type"]>(["image", "video", "gif", "embed"])

/** A post as the composer hands it back, as a row of this list. */
export function rowOfPost(post: FeedPostView, me: CommunityHead["me"] | null): FeedRowView {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    excerpt: (post.bodyText || "").slice(0, 240),
    spaceName: post.space?.name ?? null,
    authorName: post.author?.name ?? me?.name ?? "",
    pinned: post.pinned,
    locked: post.locked,
    featured: post.featured,
    status: post.status === "removed" ? "removed" : post.status === "deleted" ? "deleted" : "published",
    reactionCount: post.reactionCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    media: post.media.filter((m) => m.type !== "link"),
    poll: post.poll ? { question: post.poll.question, votes: post.poll.totalVotes, options: post.poll.options.length, closed: post.poll.closed } : null,
    spaceId: post.space?.id ?? null,
    spaceIcon: post.space?.icon ?? null,
    spaceKind: post.space?.kind ?? null,
    authorId: post.author?.id ?? me?.userId ?? null,
    authorAvatar: post.author?.avatarUrl ?? me?.avatarUrl ?? null,
  }
}

type Show = "all" | "pinned" | "removed"
const SHOWS: readonly Show[] = ["all", "pinned", "removed"]

/*
  ===========================================================================
   ALL, PINNED AND REMOVED, AT ONCE (round 33)
  ===========================================================================
  The owner: switching between All posts, Pinned and Removed was "slow, laggy and delayed". Each press asked the server
  and waited, the old list on screen under the new tab until the answer came. Now the three lists are read side by side as
  the section mounts (All comes with the page), each kept per community, view, search and space (LISTS), so a press shows
  its list on the frame of the press. A kept list older than LIST_FRESH_MS is shown and read again quietly; the answer
  replaces it only when nothing changed it here meanwhile and it has not grown with Show more (it would shrink under the
  person). The search and the space stay the server's filters: a change reads the three lists for it, side by side.

  A pin, a removal, a restore, a move, an edit or a new post changes every kept list at once (relist): the row goes into
  the views it now belongs in, at its place by date, and out of the ones it left, so Pinned has the post pinned a moment
  ago without asking. A list of another search only changes the row it holds, and is read again when it is next shown.
*/
interface List {
  show: Show
  /** The search, trimmed, and the space, as the server was asked. */
  q: string
  space: string
  rows: FeedRowView[]
  next: string | null
  /** When it was read or last changed here; 0 once it is known to be out of date. */
  at: number
  /** Pages in it (Show more): a list grown past its first page is never read again under the person. */
  pages: number
}
const LISTS = new Map<string, List>()
const READING = new Map<string, Promise<List | null>>()
/** A kept list younger than this is shown and not asked for again. */
export const LIST_FRESH_MS = 15_000
const words = (q: string) => q.trim()
const listKey = (communityId: string, show: Show, q: string, space: string) => `${communityId}|${show}|${space}|${words(q).toLowerCase()}`

/** Whether a row belongs in a view, as the server's filter for it reads (lib/communities/server/creator.ts loadFeedRows). */
export function belongsIn(show: Show, r: Pick<FeedRowView, "status" | "pinned">): boolean {
  return show === "removed" ? r.status === "removed" : show === "pinned" ? r.status === "published" && r.pinned : r.status === "published" || r.status === "removed"
}

/** A row put where its date puts it among rows newest first; older than the last row read while there is more, it waits for that page. */
function placed(rows: FeedRowView[], r: FeedRowView, more: boolean): FeedRowView[] {
  const at = rows.findIndex((x) => x.createdAt < r.createdAt || (x.createdAt === r.createdAt && x.id < r.id))
  if (at === -1) return more ? rows : [...rows, r]
  return [...rows.slice(0, at), r, ...rows.slice(at)]
}

/**
 * Every kept list after one row changed (`row`) or went (null). The lists of the search and space on screen take it in,
 * change it or let it go, as the server would now answer them; a new row goes into a searched list only when that search
 * already had it. A list of another search or space changes the row it holds and is marked out of date.
 */
export function relist(lists: Record<string, List>, id: string, row: FeedRowView | null, filter: { q: string; space: string }, now = Date.now()): Record<string, List> {
  const q = words(filter.q)
  const here = (l: List) => l.q === q && l.space === filter.space
  const matched = Object.values(lists).some((l) => here(l) && l.rows.some((x) => x.id === id))
  const out: Record<string, List> = {}
  for (const [k, l] of Object.entries(lists)) {
    const has = l.rows.some((x) => x.id === id)
    const fits = !!row && belongsIn(l.show, row) && (!l.space || row.spaceId === l.space)
    let rows = l.rows
    if (!fits) rows = has ? l.rows.filter((x) => x.id !== id) : l.rows
    else if (has) rows = l.rows.map((x) => (x.id === id ? row! : x))
    else if (here(l) && (!l.q || matched)) rows = placed(l.rows, row!, !!l.next)
    out[k] = !here(l) ? { ...l, rows, at: 0 } : rows === l.rows ? l : { ...l, rows, at: now }
  }
  return out
}

function rowIn(lists: Record<string, List>, id: string): FeedRowView | null {
  for (const l of Object.values(lists)) {
    const r = l.rows.find((x) => x.id === id)
    if (r) return r
  }
  return null
}

/** What a moderation action changes on the row, as the server has just done it. */
function patched(x: FeedRowView, action: string, to: ComposerSpace | undefined, icon: string | null): FeedRowView {
  switch (action) {
    case "pin":
      return { ...x, pinned: true }
    case "unpin":
      return { ...x, pinned: false }
    case "lock":
      return { ...x, locked: true }
    case "reopen":
      return { ...x, locked: false }
    case "feature":
      return { ...x, featured: true }
    case "unfeature":
      return { ...x, featured: false }
    case "remove":
      return { ...x, status: "removed", pinned: false }
    case "move":
      return { ...x, spaceId: to?.id ?? x.spaceId, spaceName: to?.name ?? x.spaceName, spaceIcon: icon, spaceKind: to?.announcements ? "announcements" : "feed", kind: to?.announcements ? "announcement" : x.kind === "announcement" ? "post" : x.kind }
    default:
      return { ...x, status: "published" }
  }
}

export function FeedSection({ head, initial, spaces, compose, scheduled }: { head: CommunityHead; initial: { rows: FeedRowView[]; next: string | null }; spaces: ComposerSpace[]; compose: string | null; /** The Scheduled and drafts panel's rows, read with the page (round 33). */ scheduled?: ScheduledPanelData | null }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const me = head.me ?? null
  const [show, setShow] = React.useState<Show>("all")
  const [q, setQ] = React.useState("")
  const [space, setSpace] = React.useState("")
  const [more, setMore] = React.useState(false)
  const [removing, setRemoving] = React.useState<FeedRowView | null>(null)
  const [deleting, setDeleting] = React.useState<FeedRowView | null>(null)
  const [moving, setMoving] = React.useState<{ row: FeedRowView; to: string } | null>(null)
  const [editing, setEditing] = React.useState<FeedPostView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const welcome = compose === "welcome"
  const canWrite = head.can.post === true && spaces.length > 0 && !head.archived && !!me

  /* The kept lists of this community (ALL, PINNED AND REMOVED, AT ONCE), All from the page itself. */
  const [lists, setLists] = React.useState<Record<string, List>>(() => {
    const seed: Record<string, List> = {}
    for (const [k, l] of LISTS) if (k.startsWith(`${head.id}|`)) seed[k] = l
    seed[listKey(head.id, "all", "", "")] = { show: "all", q: "", space: "", rows: initial.rows, next: initial.next, at: Date.now(), pages: 1 }
    return seed
  })
  const listsRef = React.useRef(lists)
  const commit = React.useCallback(
    (next: Record<string, List>) => {
      for (const k of Object.keys(listsRef.current)) if (!(k in next)) LISTS.delete(k)
      for (const [k, l] of Object.entries(next)) LISTS.set(k, l)
      listsRef.current = next
      setLists(next)
    },
    [],
  )
  const filter = React.useRef({ show, q, space })
  filter.current = { show, q, space }

  /* The spaces as the composer draws them: each with its icon, where a row of this page has told it. */
  const writerSpaces = React.useMemo<MemberComposerSpace[]>(() => {
    const seen = new Map<string, { icon: string | null; kind: FeedRowView["spaceKind"] }>()
    for (const r of initial.rows) if (r.spaceId) seen.set(r.spaceId, { icon: r.spaceIcon ?? null, kind: r.spaceKind ?? null })
    return spaces.map((s) => ({ id: s.id, name: s.name, kind: seen.get(s.id)?.kind ?? (s.announcements ? "announcements" : "feed"), icon: seen.get(s.id)?.icon ?? null }))
  }, [spaces, initial.rows])

  /*
    THE WELCOME POST (after New community): handed to the composer as its own kept draft before it mounts, its title
    written and the Announcements space picked, so it opens with them (in place on a computer, under Continue on a phone).
    A draft already there is never written over.
  */
  React.useState(() => {
    if (!welcome || !canWrite || typeof window === "undefined") return null
    try {
      const key = draftKey(head.id)
      if (!window.localStorage.getItem(key)) {
        const room = spaces.find((s) => s.announcements) ?? spaces[0]
        window.localStorage.setItem(key, JSON.stringify({ title: tt("Welcome to {name}", { name: head.name }), body: "", spaceId: room?.id ?? null, poll: null, media: [] }))
      }
    } catch {
      /* No storage: the composer opens empty. */
    }
    return null
  })

  const listQuery = (which: Show, qq: string, sp: string, cursor?: string | null) => {
    const u = new URLSearchParams({ show: which })
    if (words(qq)) u.set("q", words(qq))
    if (sp) u.set("space", sp)
    if (cursor) u.set("cursor", cursor)
    return u.toString()
  }

  /* One list from the server, asked for once however many times this is called while it is out. */
  const read = React.useCallback(
    (which: Show, qq: string, sp: string): Promise<List | null> => {
      const k = listKey(head.id, which, qq, sp)
      const going = READING.get(k)
      if (going) return going
      const started = Date.now()
      const p = send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?${listQuery(which, qq, sp)}`, "GET").then((res) => {
        READING.delete(k)
        const cur = listsRef.current[k]
        if (!res.ok) {
          if (!cur && listKey(head.id, filter.current.show, filter.current.q, filter.current.space) === k) toast(errorText(res.data.error, tt("The posts could not be loaded.")))
          return cur ?? null
        }
        /* Changed here while it was out, or grown by Show more: what is on screen is newer than this answer. */
        if (cur && (cur.at > started || cur.pages > 1)) return cur
        const got: List = { show: which, q: words(qq), space: sp, rows: res.data.rows ?? [], next: res.data.next ?? null, at: Date.now(), pages: 1 }
        commit({ ...listsRef.current, [k]: got })
        return got
      })
      READING.set(k, p)
      return p
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, head.id, commit, toast],
  )
  /* A list shown: as kept when it is recent (or grown), read again quietly when it is not, read when there is none. */
  const ensure = React.useCallback(
    (which: Show, qq: string, sp: string) => {
      const kept = listsRef.current[listKey(head.id, which, qq, sp)]
      if (kept && (kept.pages > 1 || Date.now() - kept.at < LIST_FRESH_MS)) return
      void read(which, qq, sp)
    },
    [head.id, read],
  )

  /* Pinned and Removed, side by side, as the section mounts (All came with the page). */
  React.useEffect(() => {
    void read("pinned", "", "")
    void read("removed", "", "")
  }, [read])

  /* The search and the space apply as they change, all three views at once; typing waits a moment so every key is not a request. */
  const firstFilter = React.useRef(true)
  React.useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false
      return
    }
    const t = window.setTimeout(() => {
      ensure(filter.current.show, q, space)
      for (const s of SHOWS) if (s !== filter.current.show) ensure(s, q, space)
    }, q ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [q, space, ensure])

  /* What is drawn: the list asked for, or while it is first read for a new search, the one that was on screen. */
  const key = listKey(head.id, show, q, space)
  const current = lists[key]
  const lastShown = React.useRef(key)
  if (current) lastShown.current = key
  const view = current ?? lists[lastShown.current]
  const rows = view?.rows ?? []
  const next = view?.next ?? null
  const loading = !current

  /* The post open in the community's own popup (./post-viewer.tsx AdminPostOverlay), and the press still waiting for one. */
  const [opened, setOpened] = React.useState<FeedPostView | null>(null)
  const openTicket = React.useRef(0)
  const viewer = React.useMemo(() => staffViewer(head), [head])

  /* One row changed (or went, null) everywhere it is kept. */
  const changeRow = React.useCallback(
    (id: string, fn: (r: FeedRowView) => FeedRowView | null, known?: FeedRowView) => {
      const was = rowIn(listsRef.current, id) ?? known ?? null
      const row = was ? fn(was) : null
      commit(relist(listsRef.current, id, row, filter.current))
    },
    [commit],
  )

  const onPosted = (post: FeedPostView) => {
    const row = rowOfPost(post, me)
    changeRow(post.id, () => row, row)
    toast(post.kind === "announcement" ? tt("Announcement posted") : tt("Posted"))
    router.refresh()
  }

  /* Remove and Delete asked from the popup: what to do there once they have happened. */
  const removingDone = React.useRef<(() => void) | null>(null)
  const deletingDone = React.useRef<(() => void) | null>(null)

  /* `quiet`: asked from the popup, whose buttons show what happened; an error is handed back for it to say. */
  const act = async (r: FeedRowView, action: string, extra?: { reason?: string; spaceId?: string }, quiet = false): Promise<string | null> => {
    setBusy(true)
    const res = await send<{ status?: string }>(`${base}/moderation`, "POST", { action, targetType: "post", targetId: r.id, reason: extra?.reason, spaceId: extra?.spaceId })
    setBusy(false)
    if (!res.ok) {
      const said = errorText(res.data.error)
      if (!quiet) toast(said)
      return said
    }
    setRemoving(null)
    setMoving(null)
    if (action === "remove") {
      removingDone.current?.()
      removingDone.current = null
    }
    const to = extra?.spaceId ? spaces.find((s) => s.id === extra.spaceId) : undefined
    const icon = writerSpaces.find((s) => s.id === to?.id)?.icon ?? null
    changeRow(r.id, (x) => patched(x, action, to, icon), r)
    if (!quiet) toast(action === "remove" ? tt("Post removed") : action === "restore" ? tt("Post restored") : action === "move" ? tt("Moved to {name}", { name: to?.name ?? "" }) : tt("Saved"))
    return null
  }

  /* Edit: the post as the feed has it (the member route), then the composer opens with it. */
  const startEdit = async (r: FeedRowView) => {
    const res = await api<{ post: FeedPostView }>(`${apiBase(head.id)}/posts/${r.id}`)
    if (!res.ok) return toast(res.error || tt("That post could not be opened."))
    setEditing(res.data.post)
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    const res = await api<{ ok: true }>(`${apiBase(head.id)}/posts/${deleting.id}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) return toast(res.error || tt("The post was not deleted. Try again."))
    changeRow(deleting.id, () => null)
    deletingDone.current?.()
    deletingDone.current = null
    setDeleting(null)
    toast(tt("Post deleted"))
  }

  const loadMore = async () => {
    const k = key
    const l = lists[k]
    if (!l?.next) return
    setMore(true)
    const res = await send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?${listQuery(show, q, space, l.next)}`, "GET")
    setMore(false)
    const cur = listsRef.current[k]
    if (res.ok && cur) {
      const fresh = (res.data.rows ?? []).filter((x) => !cur.rows.some((y) => y.id === x.id))
      commit({ ...listsRef.current, [k]: { ...cur, rows: [...cur.rows, ...fresh], next: res.data.next ?? null, at: Date.now(), pages: cur.pages + 1 } })
    }
  }

  const hrefOf = (r: FeedRowView) => postPath(head.slug, { id: r.id, title: r.title, bodyText: r.excerpt })

  /*
    A row opens its post here, over the list, in the community's own popup; what it needs is asked for as the press lands.
    A post read before opens on the press; one not read yet is waited for a moment (OPEN_WAIT_MS), so the popup opens with
    the whole post, not the row's short one growing under the eye. The list's own word on a pin, a lock or a removal wins
    over a copy read before it.
  */
  const withRow = (p: FeedPostView, r: FeedRowView | null): FeedPostView =>
    r ? { ...p, kind: r.kind, pinned: r.pinned, locked: r.locked, featured: r.featured, status: r.status === "removed" ? "removed" : p.status } : p
  const openPost = (r: FeedRowView) => {
    warmPost(head.id, r)
    const ticket = ++openTicket.current
    const have = keptPost(r.id)
    if (have) return setOpened(withRow(have, r))
    void Promise.race([readPost(head.id, r.id), new Promise<null>((done) => window.setTimeout(() => done(null), OPEN_WAIT_MS))]).then((p) => {
      if (ticket !== openTicket.current) return
      setOpened(withRow(p ?? previewOf(r, head.id), rowIn(listsRef.current, r.id) ?? r))
    })
  }
  /* A posted one in the Scheduled and drafts list: its post, read, then opened the same way. */
  const openPostById = (postId: string) => {
    const ticket = ++openTicket.current
    void readPost(head.id, postId).then((p) => {
      if (ticket !== openTicket.current) return
      if (p) setOpened(withRow(p, rowIn(listsRef.current, postId)))
      else toast(tt("That post could not be opened."))
    })
  }
  /* A mouse resting on a row (WARM_ON_HOVER_MS, the member feed's) reads its post ahead; a press reads it as it lands (hands, below). */
  const hoverTimer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  const menu = (r: FeedRowView): ActionMenuItem[] => {
    const c = head.can
    const mine = !!me && r.authorId === me.userId
    const items: ActionMenuItem[] = [
      { label: tt("Open post"), onClick: () => openPost(r) },
      { label: tt("View in community"), href: hrefOf(r), target: "_blank" },
    ]
    if (r.status === "published") {
      if (mine) items.push({ label: tt("Edit post"), onClick: () => void startEdit(r) })
      if (c.pin) items.push({ label: r.pinned ? tt("Unpin") : tt("Pin to the top"), onClick: () => void act(r, r.pinned ? "unpin" : "pin"), separatorBefore: true })
      if (c.moderate_content && spaces.length > 1) items.push({ label: tt("Move to another space"), onClick: () => setMoving({ row: r, to: r.spaceId ?? "" }) })
      if (c.lock) items.push({ label: r.locked ? tt("Allow comments") : tt("Lock comments"), onClick: () => void act(r, r.locked ? "reopen" : "lock") })
      if (c.feature) items.push({ label: r.featured ? tt("Stop featuring") : tt("Feature"), onClick: () => void act(r, r.featured ? "unfeature" : "feature") })
      if (mine) items.push({ label: tt("Delete post"), variant: "destructive", onClick: () => setDeleting(r), separatorBefore: true })
      else if (c.moderate_content) items.push({ label: tt("Remove"), variant: "destructive", onClick: () => setRemoving(r), separatorBefore: true })
    } else if (r.status === "removed" && c.moderate_content) {
      items.push({ label: tt("Restore"), onClick: () => void act(r, "restore"), separatorBefore: true })
    }
    return items
  }

  /*
    NOTHING BUT THE LIST IS DRAWN AGAIN FOR A TAB (round 33). The writer and the panel are the same elements from one press
    to the next (so React leaves them as they are), and a row that is in both lists is not drawn again (FeedRow, memo):
    a press on a tab costs the rows that change, not the section.
  */
  /* What the popup asks of the list (./post-viewer.tsx AdminPostHands): the same functions for the section's whole life. */
  const rowFor = (p: FeedPostView): FeedRowView => rowIn(listsRef.current, p.id) ?? rowOfPost(p, me)
  const overlayUpdate = (id: string, fn: (p: FeedPostView) => FeedPostView | null) => {
    const cur = openedRef.current
    if (!cur || cur.id !== id) return
    const next = fn(cur)
    if (!next) return changeRow(id, () => null)
    openedRef.current = next
    changeRow(id, (y) => ({ ...y, ...rowOfPost(next, me), authorName: y.authorName, authorAvatar: y.authorAvatar }), rowOfPost(next, me))
  }
  const openedRef = React.useRef<FeedPostView | null>(null)
  if (opened && openedRef.current?.id !== opened.id) openedRef.current = opened

  /* The staff writer (./composer-schedule.tsx): a row of the Scheduled and drafts list, or Schedule a post, opens it. */
  const panelControl = React.useRef<ScheduledPanelControl | null>(null)
  const [staffAsk, setStaffAsk] = React.useState<ComposerStaff["open"]>(null)
  const askWriter = (item: ScheduledPostView | null) => setStaffAsk((a) => ({ seq: (a?.seq ?? 0) + 1, item }))
  const onStaffSaved = (done: StaffSaved) => {
    if (done.kind === "deleted") return panelControl.current?.drop(done.id)
    panelControl.current?.put(done.post)
    /* Posted now from the list: the post goes into the list of posts as the feed has it. */
    if (done.kind === "published" && done.post.postId) {
      void readPost(head.id, done.post.postId, true).then((p) => {
        if (p) {
          const row = rowOfPost(p, me)
          changeRow(p.id, () => row, row)
        } else router.refresh()
      })
    }
  }

  const latest = React.useRef({ onPosted, openPost, menu, act, rowFor, overlayUpdate, askWriter, onStaffSaved, openPostById })
  latest.current = { onPosted, openPost, menu, act, rowFor, overlayUpdate, askWriter, onStaffSaved, openPostById }
  const adminHands = React.useMemo<AdminPostHands>(
    () => ({
      act: (p, action, extra) => latest.current.act(latest.current.rowFor(p), action, extra, true),
      askRemove: (p, done) => {
        removingDone.current = done
        setRemoving(latest.current.rowFor(p))
      },
      askDelete: (p, done) => {
        deletingDone.current = done
        setDeleting(latest.current.rowFor(p))
      },
      update: (id, fn) => latest.current.overlayUpdate(id, fn),
      communityHref: (p) => postPath(head.slug, { id: p.id, title: p.title, bodyText: p.bodyText }),
    }),
    [head.slug],
  )
  const staffReady = scheduled?.ready !== false
  /* Round 27: part 222 keeps what a scheduled post carries; before it, the writer names the part instead. */
  const staffMedia = scheduled?.media !== false
  const staff = React.useMemo<ComposerStaff>(() => ({ ready: staffReady, media: staffMedia, open: staffAsk, onSaved: (d) => latest.current.onStaffSaved(d) }), [staffReady, staffMedia, staffAsk])
  const posted = React.useCallback((post: FeedPostView) => latest.current.onPosted(post), [])
  const hands = React.useMemo<RowHands>(
    () => ({
      openPost: (r) => latest.current.openPost(r),
      menu: (r) => latest.current.menu(r),
      warm: (r) => warmPost(head.id, r),
      hover: (r, e) => {
        if (e.pointerType !== "mouse") return
        window.clearTimeout(hoverTimer.current)
        hoverTimer.current = window.setTimeout(() => warmPost(head.id, r), WARM_ON_HOVER_MS)
      },
      unhover: () => window.clearTimeout(hoverTimer.current),
    }),
    [head.id],
  )
  const writerMe = React.useMemo(() => (me ? { name: me.name, avatarUrl: me.avatarUrl } : null), [me])
  const writer = React.useMemo(
    () =>
      canWrite && me && writerMe ? (
        /*
          The member feed's composer, as it is. On a phone its card is a full width row there; here, inside the page's own
          gutter, it keeps the rounded card the rest of the section has.
        */
        <div
          className="max-sm:[&>[data-composer]]:mx-0 max-sm:[&>[data-composer]]:w-auto max-sm:[&>[data-composer]]:rounded-2xl max-sm:[&>[data-composer]]:border max-sm:[&>[data-composer]]:border-[#e5e7eb]/80"
          data-feed-writer=""
          /* What comes after this wrapper (the panel, the list) slides as the editor grows and folds (composer.tsx following). */
          data-composer-host=""
          data-composer-welcome={welcome ? "" : undefined}
        >
          <Composer communityId={head.id} userId={me.userId} me={writerMe} spaces={writerSpaces} onPosted={posted} staff={staff} />
        </div>
      ) : null,
    [canWrite, me, writerMe, welcome, head.id, writerSpaces, posted, staff],
  )
  /* Drafts and posts set to go up later (./scheduled-posts-panel), drawn with the page from what it read (round 33). */
  const panelHands = React.useMemo(
    () => ({ compose: () => latest.current.askWriter(null), edit: (row: ScheduledPostView) => latest.current.askWriter(row), open: (id: string) => latest.current.openPostById(id) }),
    [],
  )
  const panel = React.useMemo(
    () => <ScheduledPostsPanel head={head} initial={scheduled} onCompose={canWrite ? panelHands.compose : undefined} onEdit={canWrite ? panelHands.edit : undefined} onOpenPost={panelHands.open} control={panelControl} />,
    [head, scheduled, canWrite, panelHands],
  )

  return (
    <div className="space-y-4" data-feed="">
      <Toasts />
      {writer}
      {panel}

      <ListCard
        busy={loading}
        data-feed-show={show}
        head={
          <FilterTabs
            label={tt("Which posts")}
            value={show}
            onChange={(v) => {
              setShow(v)
              ensure(v, q, space)
            }}
            tabs={[
              { value: "all", label: tt("All posts") },
              { value: "pinned", label: tt("Pinned") },
              { value: "removed", label: tt("Removed") },
            ]}
          />
        }
        toolbar={
          <>
            <SearchField value={q} onChange={setQ} placeholder={tt("Search posts")} label={tt("Search posts by title or text")} />
            {spaces.length > 1 ? (
              <>
                <ToolbarDivider />
                <PickButton name="post-space" title={tt("Space")} options={[{ value: "", label: tt("All spaces") }, ...spaces.map((x) => ({ value: x.id, label: x.name }))]} value={space} onPick={setSpace} align="end" />
              </>
            ) : null}
          </>
        }
      >
        {rows.length === 0 ? (
          q.trim() || space ? (
            <Empty title={tt("No posts like that.")} detail={q.trim() ? tt("Try fewer words, or another space.") : undefined} />
          ) : show === "removed" ? (
            <Empty title={tt("Nothing removed.")} icon={MessageCircle} />
          ) : show === "pinned" ? (
            <Empty title={tt("Nothing pinned.")} detail={tt("Pin a post from its menu to keep it at the top of its space.")} icon={Pin} />
          ) : (
            <Empty title={tt("No posts yet.")} detail={tt("Start the conversation: say who it is for and how to begin.")} icon={MessageCircle}>
              {canWrite ? (
                <button type="button" onClick={() => requestCompose()} className={buttonPrimary} data-empty-write="">
                  {tt("Write the first post")}
                </button>
              ) : null}
            </Empty>
          )
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {rows.map((r) =>
              editing?.id === r.id && me ? (
                <li key={r.id} className="py-3.5 pl-4 pr-2 sm:px-5 sm:py-3" data-feed-row={r.id} data-feed-editing="">
                  <Composer
                    communityId={head.id}
                    userId={me.userId}
                    me={{ name: me.name, avatarUrl: me.avatarUrl }}
                    spaces={writerSpaces}
                    onPosted={() => {}}
                    edit={{
                      post: editing,
                      onSaved: (post) => {
                        changeRow(post.id, (y) => ({ ...y, ...rowOfPost(post, me), authorName: y.authorName, authorAvatar: y.authorAvatar }))
                        setEditing(null)
                        toast(tt("Saved"))
                      },
                      onClose: () => setEditing(null),
                    }}
                  />
                  {/* On a phone the composer is its sheet over the list, and the row stays as it is under it. */}
                  <div className="flex gap-3 sm:hidden">
                    <FeedRowBody r={r} head={head} href={hrefOf(r)} onOpen={() => openPost(r)} />
                  </div>
                </li>
              ) : (
                <FeedRow key={r.id} r={r} head={head} href={hrefOf(r)} open={opened?.id === r.id} hands={hands} />
              ),
            )}
          </ul>
        )}
        <ListFoot shown={rows.length} more={Boolean(next)} loading={more} onMore={() => void loadMore()} label={(n) => tt("{n, plural, one {# post} other {# posts}}", { n })} />
      </ListCard>
      {spaces.length === 0 && head.can.manage_spaces ? <Notice tone="info">{tt("There is no space to post in. Add one under Spaces.")}</Notice> : null}
      {head.can.post && spaces.length > 0 && !head.archived && !me ? <Notice tone="info">{tt("Refresh the page to write a post.")}</Notice> : null}

      {opened ? (
        <AdminPostOverlay
          post={opened}
          head={head}
          viewer={viewer}
          spaces={writerSpaces}
          hands={adminHands}
          onClose={() => {
            openTicket.current++
            openedRef.current = null
            setOpened(null)
          }}
        />
      ) : null}

      <FormSheet
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={tt("Move to another space")}
        name="move"
        action={moving ? { label: tt("Move"), busyLabel: tt("Moving"), busy, onClick: () => moving.to && moving.to !== moving.row.spaceId && void act(moving.row, "move", { spaceId: moving.to }), data: { "data-move-save": "" } } : null}
      >
        {moving ? (
          <div role="radiogroup" aria-label={tt("Space")} className="-my-1 divide-y divide-[#f1f2f4]" data-move-spaces="">
            {writerSpaces.map((s) => {
              const on = moving.to === s.id
              const here = moving.row.spaceId === s.id
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setMoving({ ...moving, to: s.id })} className="flex min-h-12 w-full cursor-pointer items-center gap-3 py-2 text-left" data-move-space={s.id}>
                  <span aria-hidden className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-[#1a1a2e]" : "border-[#b5b5bd]")}>
                    {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
                  </span>
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#f3f4f6] text-[15px] leading-none">
                    {spaceGlyph(s.icon, s.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[#1a1a2e]">{s.name}</span>
                  {here ? <span className="shrink-0 text-[12.5px] text-[#6b7280]">{tt("Now here")}</span> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </FormSheet>

      <Confirm open={removing !== null} onClose={() => ((removingDone.current = null), setRemoving(null))} title={tt("Remove this post?")} detail={tt("Members stop seeing it. You can restore it from Removed.")} action={tt("Remove")} danger busy={busy} reason onConfirm={(reason) => removing && void act(removing, "remove", { reason: reason || undefined })} />
      <Confirm open={deleting !== null} onClose={() => ((deletingDone.current = null), setDeleting(null))} title={tt("Delete this post?")} detail={tt("It is gone for everyone, with its comments. This cannot be undone.")} action={tt("Delete")} danger busy={busy} onConfirm={() => void remove()} />
    </div>
  )
}

/** What a row asks its section for: the same functions for the section's whole life, so a row is drawn again only when it changes. */
interface RowHands {
  openPost: (r: FeedRowView) => void
  menu: (r: FeedRowView) => ActionMenuItem[]
  warm: (r: FeedRowView) => void
  hover: (r: FeedRowView, e: React.PointerEvent) => void
  unhover: () => void
}

/** One row: a press opens its post in the viewer, a press landing reads it ahead, its dots keep the rest (round 33). */
const FeedRow = React.memo(function FeedRow({ r, head, href, open, hands }: { r: FeedRowView; head: CommunityHead; href: string; /** Its post is open in the viewer. */ open: boolean; hands: RowHands }) {
  const { openPost } = hands
  return (
    <li
      onClick={rowPress(() => openPost(r))}
      onPointerDown={() => hands.warm(r)}
      onPointerEnter={(e) => hands.hover(r, e)}
      onPointerLeave={hands.unhover}
      className={cn("flex gap-3 py-3.5 pl-4 pr-2 sm:pl-5 sm:pr-3", ROW_PRESS, r.status !== "published" && "bg-[#fcfcfd]", open && "bg-[#f5f6f7]")}
      data-feed-row={r.id}
      data-feed-row-open={open ? "" : undefined}
    >
      <FeedRowBody r={r} head={head} href={href} onOpen={() => openPost(r)} />
      <RowControls className="items-start self-start">
        <RowMenu items={hands.menu(r)} label={tt("Post actions")} />
      </RowControls>
    </li>
  )
})

/** One row's words and what the post carries, as the community's feed card shows them. */
function FeedRowBody({ r, head, href, onOpen }: { r: FeedRowView; head: CommunityHead; href: string; onOpen: () => void }) {
  const media = r.media ?? []
  const visual = media.filter((m) => VISUAL.has(m.type))
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  const live = r.status === "published"
  const counts = (n: number) => n.toLocaleString(appLocale())
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <MemberAvatar src={r.authorAvatar ?? undefined} name={r.authorName} size={36} className={cn("mt-0.5 h-9 w-9 shrink-0 rounded-full", !live && "opacity-60")} lazy />
      <div className="min-w-0 flex-1">
        {r.pinned || r.kind === "announcement" ? (
          <p className="mb-0.5 flex items-center gap-3 text-[12px] font-medium text-[#4b5563]">
            {r.pinned ? (
              <span className="inline-flex items-center gap-1" data-feed-pinned="">
                <Pin aria-hidden className="h-3 w-3" />
                {tt("Pinned")}
              </span>
            ) : null}
            {r.kind === "announcement" ? (
              <span className="inline-flex items-center gap-1" data-feed-announcement="">
                <Megaphone aria-hidden className="h-3 w-3" />
                {tt("Announcement")}
              </span>
            ) : null}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[#6b7280]">
          <span className="truncate font-medium text-[#1a1a2e]">{r.authorName}</span>
          {r.spaceName ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span aria-hidden>·</span>
              <span aria-hidden className="text-[12px] leading-none" data-space-glyph="">
                {spaceGlyph(r.spaceIcon ?? null, r.spaceKind ?? (r.kind === "announcement" ? "announcements" : "feed"))}
              </span>
              <span className="truncate">{r.spaceName}</span>
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">{relativeTime(r.createdAt)}</span>
          {r.status === "removed" ? <StatusBadge tone="critical">{tt("Removed")}</StatusBadge> : null}
          {r.locked ? <Lock aria-label={tt("Comments locked")} className="h-3.5 w-3.5" /> : null}
          {r.featured ? <Star aria-label={tt("Featured")} className="h-3.5 w-3.5" /> : null}
        </div>
        <div className="mt-1 flex min-w-0 gap-3">
          <div className="min-w-0 flex-1">
            {/*
              The row's one link: Tab reaches it, Enter opens the post in the viewer, as a press anywhere else in the row does
              (round 33). It stays a link to the post in the community, for a press with a modifier key or a new tab.
            */}
            <Link
              href={href}
              prefetch={false}
              data-row-open=""
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onOpen()
              }}
              className="block min-w-0 rounded-sm outline-none focus-visible:shadow-[0_0_0_2px_#1a1a2e]"
              data-feed-open=""
            >
              {r.title ? <span className={cn("block truncate text-[15px] font-semibold leading-snug", live ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{r.title}</span> : null}
              {r.excerpt ? <span className={cn("mt-0.5 line-clamp-2 block text-[14px] leading-snug", live ? "text-[#4b5563]" : "text-[#9ca3af]")}>{r.excerpt}</span> : null}
              {!r.title && !r.excerpt ? <span className="block text-[14px] text-[#9ca3af]">{tt("Open post")}</span> : null}
            </Link>
            {r.poll ? (
              <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-[#4b5563]" data-feed-poll="">
                <BarChart3 aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
                <span className="truncate font-medium text-[#1a1a2e]">{r.poll.question}</span>
                <span className="shrink-0 tabular-nums text-[#6b7280]">
                  {"· "}
                  {tt("{n, plural, one {# vote} other {# votes}}", { n: r.poll.votes })}
                  {r.poll.closed ? tt(", closed") : ""}
                </span>
              </p>
            ) : null}
            {files.length ? (
              <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-[#4b5563]" data-feed-files={files.length}>
                <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
                <span className="truncate">{files[0].name}</span>
                {files.length > 1 ? <span className="shrink-0 tabular-nums text-[#6b7280]">{tt("and {n} more", { n: files.length - 1 })}</span> : null}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-3.5 text-[12.5px] tabular-nums text-[#6b7280]" data-feed-counts="">
              <span className="inline-flex items-center gap-1" aria-label={tt("{n, plural, one {# like} other {# likes}}", { n: r.reactionCount })}>
                <Heart aria-hidden className="h-3.5 w-3.5" />
                {counts(r.reactionCount)}
              </span>
              <span className="inline-flex items-center gap-1" aria-label={tt("{n, plural, one {# comment} other {# comments}}", { n: r.commentCount })}>
                <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                {counts(r.commentCount)}
              </span>
            </div>
          </div>
          {visual.length ? (
            <span className={cn("relative shrink-0 self-start", !live && "opacity-60")} data-feed-media={visual.length}>
              <PostThumb media={visual} communityId={head.id} className="!h-16 !w-16 sm:!h-[84px] sm:!w-[84px]" />
              {visual.length > 1 ? (
                <span className="absolute bottom-1 right-1 rounded-[6px] bg-black/60 px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums" data-feed-media-more="">
                  +{visual.length - 1}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
