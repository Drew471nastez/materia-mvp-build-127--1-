"use client"

/**
 * ===========================================================================
 *  A POST, OPENED FROM THE POSTS LIST WITHOUT LEAVING IT (round 33)
 * ===========================================================================
 * The owner: clicking a post in the admin took them out of the admin to the
 * community's feed. A row now opens the post here, over the list: a sheet
 * from the right on a computer (ui-kit.tsx SideSheet), the section forms'
 * bottom sheet on a phone (form-sheet.tsx, the composer's own sheet). Closing
 * it leaves the list exactly where it was; nothing is navigated, nothing in
 * the list is read again.
 *
 *   THE POST is the member side's own card in its opened form (member/
 *   post-card.tsx PostCard `full`): the author, the space, the title, the
 *   whole text, the pictures and videos as their grid with the lightbox
 *   (member/media.tsx), the poll with its results, Like and the counts. Its
 *   comments are the member side's (member/comments.tsx CommentsSection),
 *   each with its moderator menu, and the box to answer in.
 *   THE ACTIONS of the list's own menu sit in a row over it: pin, move, lock,
 *   feature, remove or restore, and Edit and Delete on the person's own post
 *   (Edit is the card's own composer, in place). They are the list's (feed-
 *   section.tsx), so a pin here is the same pin as in the row's menu and the
 *   row under the sheet changes with it. The card's own dots menu is not
 *   drawn here: the row is that menu.
 *   VIEW IN COMMUNITY, the post at its address in the community, is a quiet
 *   link in the bar.
 *
 * FAST. The row's own data draws the post on the first frame (the author,
 * the title, the words it has, the pictures), then the post as the server has
 * it fills in. A mouse resting on a row, or a press landing on it, reads the
 * post, its comments and its pictures ahead (warmPost), and an opened post is
 * kept, so opening it again draws it at once and reads it again quietly. On a
 * computer the comments are drawn once the sheet has arrived, into the room
 * their count needs (CommentsPlaceholder), so the move draws only the move.
 */
import * as React from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { EditSpacesContext, PostCard } from "@/components/community/member/post-card"
import { CommentsPlaceholder, CommentsSection, readAheadComments } from "@/components/community/member/comments"
import { warmPostMedia } from "@/components/community/member/media"
import { api, apiBase } from "@/components/community/member/api"
import type { MentionTextareaHandle } from "@/components/community/member/mention-input"
import type { ComposerSpace } from "@/components/community/member/view-types"
import type { CommunityHead, FeedRowView } from "./view-types"
import { FormSheet, usePhoneNow } from "./form-sheet"
import { SideSheet } from "./ui-kit"
import { buttonSecondary } from "./parts"

/** One of the list's actions, as the viewer's row of buttons draws it. */
export interface ViewerAction {
  id: string
  label: string
  run: () => void
  danger?: boolean
}

/* ── The posts, read ahead and kept ─────────────────────────────────────── */

const KEPT = new Map<string, { post: FeedPostView; at: number }>()
const READING = new Map<string, Promise<FeedPostView | null>>()
/** An opened post younger than this is not read again on open. */
const FRESH_MS = 5_000

/** The post as the member side has it (the staff member reads it as a member does: GET /api/community/<id>/posts/<postId>). */
export function readPost(communityId: string, postId: string, fresh = false): Promise<FeedPostView | null> {
  const have = KEPT.get(postId)
  if (have && !fresh) return Promise.resolve(have.post)
  const going = READING.get(postId)
  if (going) return going
  const p = api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts/${postId}`).then((r) => {
    READING.delete(postId)
    if (!r.ok) return have?.post ?? null
    KEPT.set(postId, { post: r.data.post, at: Date.now() })
    return r.data.post
  })
  READING.set(postId, p)
  return p
}

/** A row about to be opened: its post, its comments and its pictures, asked for once however often this is called. */
export function warmPost(communityId: string, row: FeedRowView) {
  void readPost(communityId, row.id)
  void readAheadComments(communityId, row.id)
  if (row.media?.length) warmPostMedia(row.media, communityId, row.id)
}

/** The signed in staff member as the member side's components ask for a viewer: their role and what it lets them do. */
export function staffViewer(head: CommunityHead): ViewerView {
  return {
    userId: head.me?.userId ?? null,
    signedIn: !!head.me,
    role: head.role,
    status: "active",
    active: true,
    tierId: null,
    level: 1,
    points: 0,
    isOwner: head.role === "owner",
    isCreatorAccount: true,
    mutedUntil: null,
    can: head.can,
  }
}

/** The post drawn from its row until the server's copy is here: what the row knows, nothing pressable that needs more. */
function previewOf(row: FeedRowView, communityId: string): FeedPostView {
  return {
    id: row.id,
    communityId,
    space: row.spaceId ? { id: row.spaceId, slug: "", name: row.spaceName ?? "", icon: row.spaceIcon ?? null, kind: row.spaceKind ?? undefined } : null,
    kind: row.kind,
    title: row.title,
    body: "",
    bodyText: row.excerpt,
    media: row.media ?? [],
    pinned: row.pinned,
    featured: row.featured,
    locked: row.locked,
    status: row.status === "removed" ? "removed" : "published",
    author: row.authorId ? { id: row.authorId, name: row.authorName, username: null, avatarUrl: row.authorAvatar ?? null, role: null, level: null } : null,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    reacted: false,
    bookmarked: false,
    poll: null,
    createdAt: row.createdAt,
    editedAt: null,
    lastActivityAt: row.createdAt,
    canEdit: false,
    canModerate: true,
  }
}

const CHIP = cn(buttonSecondary, "shrink-0 whitespace-nowrap disabled:opacity-60")
const LINK = "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 max-sm:h-10"

export interface PostViewerProps {
  open: boolean
  /** The row opened, as the list has it now (a pin or a move made from here shows in it). Kept while the sheet goes. */
  row: FeedRowView | null
  head: CommunityHead
  viewer: ViewerView
  /** The spaces Edit may move the post to. */
  spaces: ComposerSpace[]
  actions: ViewerAction[]
  busy: boolean
  error: string | null
  /** The post at its address in the community. */
  communityHref: string
  onClose: () => void
  /** The post changed here (a like, a comment, an edit): the row takes it. */
  onChange: (post: FeedPostView) => void
}

export function PostViewer({ open, row, head, viewer, spaces, actions, busy, error, communityHref, onClose, onChange }: PostViewerProps) {
  const phone = usePhoneNow()
  /* On a computer the comments wait for the sheet to arrive; a phone's sheet rises once what is in it is drawn. */
  const [arrived, setArrived] = React.useState(false)
  React.useEffect(() => {
    if (!open) setArrived(false)
  }, [open])
  /* Edit: the card's own composer, asked for by turning its autoEdit on (off, then on, so a second press opens it again). */
  const [edit, setEdit] = React.useState(false)
  const [editable, setEditable] = React.useState(false)
  React.useEffect(() => {
    setEdit(false)
    setEditable(false)
  }, [row?.id])
  const startEdit = () => {
    setEdit(false)
    requestAnimationFrame(() => setEdit(true))
  }
  if (!row) return null

  const title = row.spaceName ? tt("Posted in {name}", { name: row.spaceName }) : tt("Post")
  const buttons = (
    /* Every action in sight: they wrap onto a second line on a phone rather than hide past its edge. */
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-4 py-2.5 sm:px-5" data-viewer-actions="">
      {editable && row.status === "published" ? (
        <button type="button" onClick={startEdit} className={CHIP} data-viewer-action="edit">
          {tt("Edit")}
        </button>
      ) : null}
      {actions.map((a) => (
        <button key={a.id} type="button" disabled={busy} onClick={a.run} className={cn(CHIP, a.danger && "text-[#b42318] hover:text-[#9a1d14]")} data-viewer-action={a.id}>
          {a.label}
        </button>
      ))}
      {phone ? (
        <Link href={communityHref} prefetch={false} className={cn(LINK, "ml-auto")} data-viewer-community="">
          {tt("View in community")}
        </Link>
      ) : null}
    </div>
  )
  const said = error ? (
    <p role="alert" className="px-4 pb-2.5 text-[13px] text-[#b42318] sm:px-5" data-viewer-error="">
      {error}
    </p>
  ) : null
  const body = (
    <ViewerBody key={row.id} row={row} head={head} viewer={viewer} spaces={spaces} autoEdit={edit} onEditable={setEditable} drawComments={phone || arrived} onChange={onChange} />
  )

  if (phone)
    return (
      <FormSheet open={open} onClose={onClose} title={row.spaceName ?? tt("Post")} cancelLabel={tt("Close")} name="post-viewer" focus>
        {/* The sheet's own gutter is the card's here, so the post's edges are where the composer's are. */}
        <div className="-mx-4 -mt-4" data-post-viewer={row.id}>
          <div className="border-b border-[#f0f1f3]">
            {buttons}
            {said}
          </div>
          {body}
        </div>
      </FormSheet>
    )

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      onShown={() => setArrived(true)}
      label={row.title || title}
      name="post-viewer"
      bar={
        <>
          <div className="flex h-12 items-center gap-1 pl-5 pr-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#6b7280]">{title}</span>
            <Link href={communityHref} prefetch={false} className={LINK} data-viewer-community="">
              {tt("View in community")}
            </Link>
            <button type="button" onClick={onClose} aria-label={tt("Close")} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-viewer-close="">
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
          <div className="border-t border-[#f0f1f3]">
            {buttons}
            {said}
          </div>
        </>
      }
    >
      <div data-post-viewer={row.id}>{body}</div>
    </SideSheet>
  )
}

/** The post and its comments, for one row (keyed by it, so another post starts from its own row). */
function ViewerBody({ row, head, viewer, spaces, autoEdit, onEditable, drawComments, onChange }: { row: FeedRowView; head: CommunityHead; viewer: ViewerView; spaces: ComposerSpace[]; autoEdit: boolean; onEditable: (on: boolean) => void; drawComments: boolean; onChange: (post: FeedPostView) => void }) {
  const [post, setPost] = React.useState<FeedPostView | null>(() => KEPT.get(row.id)?.post ?? null)
  const box = React.useRef<MentionTextareaHandle>(null)

  /* The server's copy: at once when kept and recent, read again quietly when kept and older, read when new. */
  React.useEffect(() => {
    let stop = false
    const have = KEPT.get(row.id)
    void readPost(head.id, row.id, !have || Date.now() - have.at > FRESH_MS).then((p) => {
      if (!stop && p) setPost(p)
    })
    void readAheadComments(head.id, row.id)
    return () => {
      stop = true
    }
  }, [head.id, row.id])

  /* Moved from here or from the row's menu: its space's address is the server's to say, so it is read again. */
  const spaceNow = row.spaceId ?? null
  React.useEffect(() => {
    if (!post || (post.space?.id ?? null) === spaceNow) return
    let stop = false
    void readPost(head.id, row.id, true).then((p) => {
      if (!stop && p) setPost(p)
    })
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceNow])

  React.useEffect(() => {
    onEditable(!!post?.canEdit)
  }, [post?.canEdit, onEditable])

  /* What the list says about the post wins over the copy read before it: a pin, a lock, a removal made a moment ago. */
  const shown = React.useMemo<FeedPostView>(() => {
    const base = post ?? previewOf(row, head.id)
    const moved = row.spaceId && base.space?.id !== row.spaceId
    return {
      ...base,
      kind: row.kind,
      pinned: row.pinned,
      locked: row.locked,
      featured: row.featured,
      status: row.status === "removed" ? "removed" : base.status,
      space: moved ? { id: row.spaceId!, slug: base.space?.slug ?? "", name: row.spaceName ?? "", icon: row.spaceIcon ?? null, kind: row.spaceKind ?? undefined } : base.space,
    }
  }, [post, row, head.id])

  const latest = React.useRef({ shown, onChange })
  React.useEffect(() => {
    latest.current = { shown, onChange }
  })
  /* A like, a vote, a comment or an edit made in the card: kept here, and handed to the row. */
  const update = React.useCallback((_id: string, fn: (p: FeedPostView) => FeedPostView | null) => {
    const next = fn(latest.current.shown)
    if (!next) return
    KEPT.set(next.id, { post: next, at: Date.now() })
    setPost(next)
    latest.current.onChange(next)
  }, [])
  const focusBox = React.useCallback(() => box.current?.focus(), [])

  return (
    <>
      {/* The card without its own edge (the sheet is the card) and without its dots: the row of actions above is that menu. */}
      <div className="[&>article]:mx-0 [&>article]:w-auto [&>article]:overflow-visible [&>article]:rounded-none [&>article]:border-0 [&>article]:shadow-none [&_[data-post-more]]:hidden" data-viewer-post="" data-viewer-ready={post ? "" : undefined}>
        <EditSpacesContext.Provider value={spaces}>
          <PostCard post={shown} slug={head.slug} viewer={viewer} update={update} full readOnly={!post} onComment={focusBox} autoEdit={autoEdit && !!post?.canEdit} />
        </EditSpacesContext.Provider>
      </div>
      <section aria-label={tt("Comments")} className="mt-1 border-t border-[#f0f1f3] px-4 pb-6 pt-4 sm:px-5" data-viewer-comments="">
        {drawComments && post ? (
          <CommentsSection
            post={shown}
            slug={head.slug}
            viewer={viewer}
            initial={null}
            boxRef={box}
            expected={shown.commentCount}
            fadeIn
            onCount={(d) => update(shown.id, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
          />
        ) : (
          <CommentsPlaceholder expected={row.commentCount} />
        )}
      </section>
    </>
  )
}
