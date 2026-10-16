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
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BarChart3, Heart, Lock, MessageCircle, Paperclip, Pin, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import { postPath } from "@/lib/communities/post-url"
import { requestCompose } from "@/lib/communities/client/compose-intent"
import type { FeedPostView, PostMedia } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { Composer, draftKey } from "@/components/community/member/composer"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { PostThumb } from "@/components/community/member/media"
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

export function FeedSection({ head, initial, spaces, compose }: { head: CommunityHead; initial: { rows: FeedRowView[]; next: string | null }; spaces: ComposerSpace[]; compose: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const me = head.me ?? null
  const [rows, setRows] = React.useState(initial.rows)
  const [next, setNext] = React.useState(initial.next)
  const [show, setShow] = React.useState<Show>("all")
  const [q, setQ] = React.useState("")
  const [space, setSpace] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const request = React.useRef(0)
  const [more, setMore] = React.useState(false)
  const [removing, setRemoving] = React.useState<FeedRowView | null>(null)
  const [deleting, setDeleting] = React.useState<FeedRowView | null>(null)
  const [moving, setMoving] = React.useState<{ row: FeedRowView; to: string } | null>(null)
  const [editing, setEditing] = React.useState<FeedPostView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const welcome = compose === "welcome"
  const canWrite = head.can.post === true && spaces.length > 0 && !head.archived && !!me

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

  const listQuery = React.useCallback(
    (which: Show, cursor?: string | null) => {
      const u = new URLSearchParams({ show: which })
      if (q.trim()) u.set("q", q.trim())
      if (space) u.set("space", space)
      if (cursor) u.set("cursor", cursor)
      return u.toString()
    },
    [q, space],
  )

  const reload = React.useCallback(
    async (which: Show) => {
      const mine = ++request.current
      setLoading(true)
      const res = await send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?${listQuery(which)}`, "GET")
      if (mine !== request.current) return
      setLoading(false)
      if (res.ok) {
        setRows(res.data.rows ?? [])
        setNext(res.data.next ?? null)
      } else toast(errorText(res.data.error, tt("The posts could not be loaded.")))
    },
    [base, listQuery, toast],
  )

  /* The search and the space apply as they change; typing waits a moment so every key is not a request. */
  const firstFilter = React.useRef(true)
  React.useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false
      return
    }
    const t = window.setTimeout(() => void reload(show), q ? 300 : 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, space])

  const onPosted = (post: FeedPostView) => {
    if (show === "all" && !q.trim() && (!space || space === post.space?.id)) setRows((x) => [rowOfPost(post, me), ...x.filter((y) => y.id !== post.id)])
    toast(post.kind === "announcement" ? tt("Announcement posted") : tt("Posted"))
    router.refresh()
  }

  const act = async (r: FeedRowView, action: string, extra?: { reason?: string; spaceId?: string }) => {
    setBusy(true)
    const res = await send<{ status?: string }>(`${base}/moderation`, "POST", { action, targetType: "post", targetId: r.id, reason: extra?.reason, spaceId: extra?.spaceId })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setRemoving(null)
    setMoving(null)
    const to = extra?.spaceId ? spaces.find((s) => s.id === extra.spaceId) : undefined
    const patch: Partial<FeedRowView> =
      action === "pin"
        ? { pinned: true }
        : action === "unpin"
          ? { pinned: false }
          : action === "lock"
            ? { locked: true }
            : action === "reopen"
              ? { locked: false }
              : action === "feature"
                ? { featured: true }
                : action === "unfeature"
                  ? { featured: false }
                  : action === "remove"
                    ? { status: "removed", pinned: false }
                    : action === "move"
                      ? { spaceId: to?.id ?? r.spaceId, spaceName: to?.name ?? r.spaceName, spaceIcon: writerSpaces.find((s) => s.id === to?.id)?.icon ?? null, spaceKind: to?.announcements ? "announcements" : "feed", kind: to?.announcements ? "announcement" : r.kind === "announcement" ? "post" : r.kind }
                      : { status: "published" }
    /* A row that no longer belongs in the view it is in leaves it: restored under Removed, unpinned or removed under Pinned. */
    const leaves = (show === "removed" && action === "restore") || (show === "pinned" && (action === "unpin" || action === "remove"))
    setRows((x) => (leaves ? x.filter((y) => y.id !== r.id) : x.map((y) => (y.id === r.id ? { ...y, ...patch } : y))))
    toast(action === "remove" ? tt("Post removed") : action === "restore" ? tt("Post restored") : action === "move" ? tt("Moved to {name}", { name: to?.name ?? "" }) : tt("Saved"))
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
    setRows((x) => x.filter((y) => y.id !== deleting.id))
    setDeleting(null)
    toast(tt("Post deleted"))
  }

  const loadMore = async () => {
    if (!next) return
    setMore(true)
    const res = await send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?${listQuery(show, next)}`, "GET")
    setMore(false)
    if (res.ok) {
      setRows((x) => [...x, ...(res.data.rows ?? [])])
      setNext(res.data.next ?? null)
    }
  }

  const hrefOf = (r: FeedRowView) => postPath(head.slug, { id: r.id, title: r.title, bodyText: r.excerpt })

  const menu = (r: FeedRowView): ActionMenuItem[] => {
    const c = head.can
    const mine = !!me && r.authorId === me.userId
    const items: ActionMenuItem[] = [{ label: tt("Open post"), href: hrefOf(r) }]
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

  return (
    <div className="space-y-4" data-feed="">
      <Toasts />
      {canWrite && me ? (
        /*
          The member feed's composer, as it is. On a phone its card is a full width row there; here, inside the page's own
          gutter, it keeps the rounded card the rest of the section has.
        */
        <div
          className="max-sm:[&>[data-composer]]:mx-0 max-sm:[&>[data-composer]]:w-auto max-sm:[&>[data-composer]]:rounded-2xl max-sm:[&>[data-composer]]:border max-sm:[&>[data-composer]]:border-[#e5e7eb]/80"
          data-feed-writer=""
          data-composer-welcome={welcome ? "" : undefined}
        >
          <Composer communityId={head.id} userId={me.userId} me={{ name: me.name, avatarUrl: me.avatarUrl }} spaces={writerSpaces} onPosted={onPosted} />
        </div>
      ) : null}

      <ListCard
        busy={loading}
        head={
          <FilterTabs
            label={tt("Which posts")}
            value={show}
            onChange={(v) => {
              setShow(v)
              void reload(v)
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
                        setRows((x) => x.map((y) => (y.id === post.id ? { ...y, ...rowOfPost(post, me), authorName: y.authorName, authorAvatar: y.authorAvatar } : y)))
                        setEditing(null)
                        toast(tt("Saved"))
                      },
                      onClose: () => setEditing(null),
                    }}
                  />
                  {/* On a phone the composer is its sheet over the list, and the row stays as it is under it. */}
                  <div className="flex gap-3 sm:hidden">
                    <FeedRowBody r={r} head={head} href={hrefOf(r)} />
                  </div>
                </li>
              ) : (
                <li key={r.id} onClick={rowPress(() => router.push(hrefOf(r)))} className={cn("flex gap-3 py-3.5 pl-4 pr-2 sm:pl-5 sm:pr-3", ROW_PRESS, r.status !== "published" && "bg-[#fcfcfd]")} data-feed-row={r.id}>
                  <FeedRowBody r={r} head={head} href={hrefOf(r)} />
                  <RowControls className="items-start self-start">
                    <RowMenu items={menu(r)} label={tt("Post actions")} />
                  </RowControls>
                </li>
              ),
            )}
          </ul>
        )}
        <ListFoot shown={rows.length} more={Boolean(next)} loading={more} onMore={() => void loadMore()} label={(n) => tt("{n, plural, one {# post} other {# posts}}", { n })} />
      </ListCard>
      {spaces.length === 0 && head.can.manage_spaces ? <Notice tone="info">{tt("There is no space to post in. Add one under Spaces.")}</Notice> : null}
      {head.can.post && spaces.length > 0 && !head.archived && !me ? <Notice tone="info">{tt("Refresh the page to write a post.")}</Notice> : null}

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

      <Confirm open={removing !== null} onClose={() => setRemoving(null)} title={tt("Remove this post?")} detail={tt("Members stop seeing it. You can restore it from Removed.")} action={tt("Remove")} danger busy={busy} reason onConfirm={(reason) => removing && void act(removing, "remove", { reason: reason || undefined })} />
      <Confirm open={deleting !== null} onClose={() => setDeleting(null)} title={tt("Delete this post?")} detail={tt("It is gone for everyone, with its comments. This cannot be undone.")} action={tt("Delete")} danger busy={busy} onConfirm={() => void remove()} />
    </div>
  )
}

/** One row's words and what the post carries, as the community's feed card shows them. */
function FeedRowBody({ r, head, href }: { r: FeedRowView; head: CommunityHead; href: string }) {
  const media = r.media ?? []
  const visual = media.filter((m) => VISUAL.has(m.type))
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  const live = r.status === "published"
  const counts = (n: number) => n.toLocaleString(appLocale())
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <MemberAvatar src={r.authorAvatar ?? undefined} name={r.authorName} size={36} className={cn("mt-0.5 h-9 w-9 shrink-0 rounded-full", !live && "opacity-60")} lazy />
      <div className="min-w-0 flex-1">
        {r.pinned ? (
          <p className="mb-0.5 flex items-center gap-1 text-[12px] font-medium text-[#4b5563]" data-feed-pinned="">
            <Pin aria-hidden className="h-3 w-3" />
            {tt("Pinned")}
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
            {/* The row's one link: Tab reaches it, Enter opens the post; a press anywhere else in the row does the same. */}
            <Link href={href} prefetch={false} data-row-open="" className="block min-w-0 rounded-sm outline-none focus-visible:shadow-[0_0_0_2px_#1a1a2e]" data-feed-open="">
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
