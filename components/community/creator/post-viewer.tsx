"use client"

/**
 * ===========================================================================
 *  A POST, OPENED FROM THE POSTS LIST WITHOUT LEAVING IT
 * ===========================================================================
 * Round 33 opened a row's post in a side sheet of the admin's own. Round 26,
 * the owner: "I don't like the additional side panel that appears when
 * clicking an existing post. It feels unnecessary and clunky. Reuse or adapt
 * the existing community post popup." So a row opens the post in the popup
 * members open it in (member/post-overlay.tsx): the panel over a light scrim
 * on a computer, the website builder's bottom sheet on a phone
 * (post-fullscreen.tsx), with their moves, Escape, the close button, a press
 * on the scrim, a pull down and Back. The address stays the admin's (a reload
 * lands on the list); nothing under it is navigated or read again.
 *
 *   THE POST is the community's own card in its opened form (member/
 *   post-card.tsx PostCard `full`) with its comments (member/comments.tsx),
 *   each with its moderator menu, exactly as the popup draws it for members.
 *   THE ACTIONS of the list's own menu sit in a row at the top of it
 *   (AdminPost): Edit (the card's own composer, in place), Pin, Move, Lock
 *   comments, Feature, Remove or Delete, Restore, and View in community. They
 *   are the list's (feed-section.tsx), so a pin here is the same pin as in the
 *   row's menu and the row under the popup changes with it. The card's own
 *   dots are not drawn: the row is that menu.
 *
 * FAST. A mouse resting on a row, or a press landing on it, reads the post,
 * its comments and its pictures ahead (warmPost), and an opened post is kept,
 * so opening it again draws it at once. A press on a post not read yet waits
 * for it a moment (OPEN_WAIT_MS) so the popup opens with the whole post
 * rather than a short one that grows; past that it opens with what the row
 * knows and fills in.
 */
import * as React from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { EditSpacesContext, PostCard } from "@/components/community/member/post-card"
import { PostOverlay, type PostUpdateFn } from "@/components/community/member/post-overlay"
import { readAheadComments } from "@/components/community/member/comments"
import { warmPostMedia } from "@/components/community/member/media"
import { api, apiBase } from "@/components/community/member/api"
import { spaceGlyph } from "@/components/community/member/space-glyph"
import type { ComposerSpace } from "@/components/community/member/view-types"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, FeedRowView } from "./view-types"
import { buttonSecondary } from "./parts"

/* ── The posts, read ahead and kept ─────────────────────────────────────── */

const KEPT = new Map<string, { post: FeedPostView; at: number }>()
const READING = new Map<string, Promise<FeedPostView | null>>()
/** An opened post younger than this is not read again on open. */
const FRESH_MS = 5_000

/** A post read before, as kept (null when it was not). */
export function keptPost(postId: string): FeedPostView | null {
  return KEPT.get(postId)?.post ?? null
}

/** How long a press waits for a post not read yet before the popup opens with what its row knows. */
export const OPEN_WAIT_MS = 350

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
export function previewOf(row: FeedRowView, communityId: string): FeedPostView {
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

/** What the popup asks of the Posts list: the same functions for the list's whole life (feed-section.tsx). */
export interface AdminPostHands {
  /** A moderation action sent; the error to say, or null once done (the list's rows already changed). */
  act: (post: FeedPostView, action: string, extra?: { spaceId?: string }) => Promise<string | null>
  /** Remove (with its reason) or Delete, asked in the list's own dialog; `done` once it has happened. */
  askRemove: (post: FeedPostView, done: () => void) => void
  askDelete: (post: FeedPostView, done: () => void) => void
  /** A change made in the popup (a like, a comment, an edit, a fresh read): the row takes it; null, the post is gone. */
  update: PostUpdateFn
  /** The post at its address in the community. */
  communityHref: (post: FeedPostView) => string
}

/** A post open over the Posts list in the community's own popup (round 26). */
export function AdminPostOverlay({ post, head, viewer, spaces, hands, onClose }: { post: FeedPostView; head: CommunityHead; viewer: ViewerView; spaces: ComposerSpace[]; hands: AdminPostHands; onClose: () => void }) {
  const renderPost = React.useCallback(
    (p: FeedPostView, update: PostUpdateFn, onComment: () => void) => <AdminPost post={p} update={update} onComment={onComment} head={head} viewer={viewer} spaces={spaces} hands={hands} />,
    [head, viewer, spaces, hands],
  )
  return <PostOverlay key={post.id} post={post} slug={head.slug} viewer={viewer} update={hands.update} onClose={onClose} address={null} renderPost={renderPost} />
}

/** The admin's row of actions, then the community's own card for the post (its dots left out: the row is that menu). */
function AdminPost({ post, update, onComment, head, viewer, spaces, hands }: { post: FeedPostView; update: PostUpdateFn; onComment: () => void; head: CommunityHead; viewer: ViewerView; spaces: ComposerSpace[]; hands: AdminPostHands }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /* Edit: the card's own composer, asked for by turning its autoEdit on (off, then on, so a second press opens it again). */
  const [edit, setEdit] = React.useState(false)
  const c = head.can
  const mine = !!head.me && post.author?.id === head.me.userId
  const live = post.status === "published"

  const run = (action: string, patch: (p: FeedPostView) => FeedPostView, extra?: { spaceId?: string }) => async () => {
    if (busy) return
    setBusy(action)
    setError(null)
    const said = await hands.act(post, action, extra)
    setBusy(null)
    if (said) return setError(said)
    update(post.id, patch)
  }
  const startEdit = () => {
    setEdit(false)
    requestAnimationFrame(() => setEdit(true))
  }
  const chip = (id: string, label: string, onClick: () => void, danger = false) => (
    <button key={id} type="button" disabled={!!busy} onClick={onClick} className={cn(CHIP, danger && "text-[#b42318] hover:text-[#9a1d14]")} data-viewer-action={id} aria-busy={busy === id || undefined}>
      {label}
    </button>
  )

  const actions: React.ReactNode[] = []
  if (live) {
    if (post.canEdit) actions.push(chip("edit", tt("Edit"), startEdit))
    if (c.pin) actions.push(post.pinned ? chip("unpin", tt("Unpin"), run("unpin", (p) => ({ ...p, pinned: false }))) : chip("pin", tt("Pin"), run("pin", (p) => ({ ...p, pinned: true }))))
    if (c.moderate_content && spaces.length > 1)
      actions.push(
        <ResponsiveActionMenu
          key="move"
          title={tt("Move to another space")}
          align="start"
          items={spaces
            .filter((s) => s.id !== post.space?.id)
            .map((s) => ({
              label: s.name,
              icon: (
                <span aria-hidden className="inline-flex w-4 justify-center text-[14px] leading-none">
                  {spaceGlyph(s.icon, s.kind)}
                </span>
              ),
              onClick: () =>
                void run("move", (p) => ({ ...p, kind: s.kind === "announcements" ? "announcement" : p.kind === "announcement" ? "post" : p.kind, space: { id: s.id, slug: s.slug ?? p.space?.slug ?? "", name: s.name, icon: s.icon ?? null, kind: s.kind } }), { spaceId: s.id })(),
            }))}
          trigger={
            <button type="button" disabled={!!busy} className={cn(CHIP, "gap-1")} data-viewer-action="move">
              {tt("Move")}
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            </button>
          }
        />,
      )
    if (c.lock) actions.push(post.locked ? chip("reopen", tt("Allow comments"), run("reopen", (p) => ({ ...p, locked: false }))) : chip("lock", tt("Lock comments"), run("lock", (p) => ({ ...p, locked: true }))))
    if (c.feature) actions.push(post.featured ? chip("unfeature", tt("Stop featuring"), run("unfeature", (p) => ({ ...p, featured: false }))) : chip("feature", tt("Feature"), run("feature", (p) => ({ ...p, featured: true }))))
    if (mine) actions.push(chip("delete", tt("Delete"), () => hands.askDelete(post, () => update(post.id, () => null)), true))
    else if (c.moderate_content) actions.push(chip("remove", tt("Remove"), () => hands.askRemove(post, () => update(post.id, (p) => ({ ...p, status: "removed", pinned: false }))), true))
  } else if (post.status === "removed" && c.moderate_content) {
    actions.push(chip("restore", tt("Restore"), run("restore", (p) => ({ ...p, status: "published" }))))
  }

  return (
    <>
      {/* Every action in sight: they wrap onto a second line on a phone rather than hide past its edge. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-[#f0f1f3] px-4 py-2.5 sm:px-5" data-viewer-actions="" data-post-viewer={post.id}>
        {actions}
        <Link href={hands.communityHref(post)} prefetch={false} className={cn(LINK, "ml-auto")} data-viewer-community="">
          {tt("View in community")}
        </Link>
      </div>
      {error ? (
        <p role="alert" className="px-4 pt-2.5 text-[13px] text-[#b42318] sm:px-5" data-viewer-error="">
          {error}
        </p>
      ) : null}
      {/* The card without its own edge (the popup is the card) and without its dots. */}
      <div className="pt-1 [&>article]:mx-0 [&>article]:w-auto [&>article]:overflow-visible [&>article]:rounded-none [&>article]:border-0 [&>article]:shadow-none [&_[data-post-more]]:hidden" data-viewer-post="" data-viewer-ready="">
        <EditSpacesContext.Provider value={spaces}>
          <PostCard post={post} slug={head.slug} viewer={viewer} update={update} full onComment={onComment} autoEdit={edit && !!post.canEdit} />
        </EditSpacesContext.Provider>
      </div>
    </>
  )
}
