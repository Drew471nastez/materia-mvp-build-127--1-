"use client"

/**
 * ===========================================================================
 *  ONE POST
 * ===========================================================================
 * IN THE FEED (round 7, after Skool's card): the author's picture with their
 * level on it when the community counts levels, their name, how long ago
 * and in which space; the title in bold with a dot before it when there is
 * something here the member has not seen (post-seen.ts); two lines of the
 * words; ONE thumbnail on the right (media.tsx PostThumb; on a phone the
 * pictures go under the words instead, CardMedia, and the card is a full
 * width row, PHONE_ROW; round 12: a post with two or more pictures shows
 * them under the words on a computer too, and its GIFs play while on
 * screen); then the likes,
 * the comments, the faces of the last three people who commented and "New
 * comment 2d ago" when one came in the last week. The whole card opens the
 * post over the feed (post-overlay.tsx) at the post's own address; a link or
 * a button inside it does its own thing, and a press with a modifier key on
 * the title opens the post's page as any link would.
 *
 * OPENED (`full`): the whole text, the pictures and videos as a grid that
 * opens the lightbox (media.tsx PostMediaGrid), the poll, and Like, Comment
 * and Save as words.
 *
 * The rest (copy the link, save, edit or delete your own, report somebody
 * else's, and for a moderator pin, lock, remove, mute or ban) is behind the
 * dots, a menu on a computer and a sheet on a phone (ResponsiveActionMenu).
 *
 * A like and a save answer the press on the next frame and are never
 * turned off while the server is asked; presses as fast as anybody likes
 * make at most two requests, the last press wins, and the count never
 * flickers (post-intent.ts). A refusal of the last press puts it back.
 *
 * A YouTube or Vimeo address in the words plays under them in the opened
 * post and gives the card its thumbnail when nothing else does
 * (post-media.ts withBodyEmbeds).
 *
 * ROUND 13.
 *   NO UNREAD DOT. The black dot before a title is gone from cards entirely
 *   (Unread in the sort menu is where "new to me" lives).
 *   PINNED reads as pinned: a quiet line above the post ("Pinned", the pin
 *   glyph) and a card a shade firmer (a slightly darker hairline and the
 *   light shadow), the same at every width.
 *   THE SPACE'S GLYPH before its name on the space line (space-glyph.ts).
 *   SHARE: the system share sheet (the app's Share plugin when the app has
 *   it, else navigator.share) with the post's address, title and words. The
 *   shared link's preview is the post's own picture card (post-seo.ts), not
 *   Storelib's generic community card, when the post is public (open or paid
 *   public community; private and unlisted stay generic).
 *   EDIT POST is the composer itself (composer.tsx `edit`), in place of the
 *   post's words on a computer and as its screen on a phone; the spaces it
 *   may move to come from the feed (EditSpacesContext). The cards under it
 *   slide to their new places as it opens and closes.
 *   DELETE, REMOVE, BAN ask in Storelib's own sheet, above an opened post
 *   (report-confirm.tsx); a deleted card fades and the cards under it close
 *   the gap (feed-live.tsx foldAway).
 *   Dates: "57m", "3d" up to a week, then "Feb 23" (with the year when it
 *   is not this year): lib/communities/format.ts relativeTime.
 */
import Link from "next/link"
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { BarChart3, Bookmark, Lock, MessageCircle, Paperclip, VolumeX, Ban } from "lucide-react"
import { FlagIcon } from "@solar-icons/react/linear/flag"
import { MenuDotsIcon } from "@solar-icons/react/linear/menu-dots"
import { PenIcon } from "@solar-icons/react/linear/pen"
import { PinIcon } from "@solar-icons/react/linear/pin"
import { PinIcon as PinBold } from "@solar-icons/react/bold/pin"
import { ShareIcon } from "@solar-icons/react/linear/share"
import { ShieldIcon } from "@solar-icons/react/linear/shield"
import { TrashBinMinimalisticIcon } from "@solar-icons/react/linear/trash-bin-minimalistic"
import { MemberAvatar } from "./member-avatar"
import { LevelBadge } from "./level-badge"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import { cardPictures, withBodyEmbeds } from "@/lib/communities/post-media"
import type { FeedPostView, PollView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { BodyText, inline } from "./body-text"
import { Composer } from "./composer"
import type { ConfirmState, ReportTargetRef } from "./dialogs"
import { foldAway } from "./feed-live"
import { ConfirmSheet } from "./report-confirm"
import { ReportSheet } from "./report-sheet"
import { spaceGlyph } from "./space-glyph"
import type { ComposerSpace } from "./view-types"
import { LikeHeart, likeSound } from "./heart"
import { CardMedia, PostMediaGrid, PostThumb, warmPostMedia } from "./media"
import { REOPEN, actOnContent, actOnMember, moderationMenu, muteUntil } from "./moderation"
import { PollBlock, pollFitsInline } from "./poll"
import { postPath } from "@/lib/communities/post-url"
import { readAheadComments } from "./comments"
import { PostOverlay } from "./post-overlay"
import { SaveButton } from "./save-button"
import { useOpenPostRequests } from "@/lib/communities/client/open-post"
import { intentOf, press, useIntent } from "./post-intent"
import { toast } from "./toast"
import { BTN_GHOST, CARD, ICON_BTN, STACK, STACK_FACE } from "./ui"
import { memberHref } from "./person-href"
import { RoleBadge } from "./role-badge"

/** "New comment 2d ago", "New comment just now". */
export function newCommentLabel(iso: string, now = Date.now()): string {
  const when = relativeTime(iso, now)
  return when === "just now" ? "New comment just now" : `New comment ${when} ago`
}

export type PostUpdate = (id: string, fn: (p: FeedPostView) => FeedPostView | null) => void

/** The spaces a post may be moved to in Edit post: the feed's composer spaces (feed.tsx provides them; a lone post page has none). */
export const EditSpacesContext = createContext<ComposerSpace[] | null>(null)

/**
 * THE ADDRESS A SHARE CARRIES (round 14). storelib.com, always, never
 * `window.location.origin`: a community read on a creator's own domain
 * would otherwise share that domain, and only a storelib.com address opens
 * the Storelib app (lib/platform/app-links.ts).
 */
export const SHARE_ORIGIN = "https://storelib.com"

/**
 * SHARING A POST (round 13): the app's own Share plugin when the app has it,
 * the browser's share sheet when it has one, else the link copied. Answers
 * what happened ("shared", "copied", "cancelled" or "failed").
 */
export async function sharePost(url: string, title: string | null, text: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const words = text.replace(/\s+/g, " ").trim().slice(0, 140)
  const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Share?: { share: (o: { title?: string; text?: string; url: string; dialogTitle?: string }) => Promise<unknown> } } } }).Capacitor
  /* Android's share sheet (WhatsApp especially) drops the url field and sends
     only text, so the https address has to be in the text. iOS keeps url as
     the link and would show it twice if it were also in the text. */
  const ios = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const message = ios ? words || undefined : [words, url].filter(Boolean).join("\n\n")
  try {
    if (native?.isNativePlatform?.() && native.Plugins?.Share) {
      await native.Plugins.Share.share({ title: title ?? undefined, text: message, url, dialogTitle: "Share post" })
      return "shared"
    }
    if (typeof navigator.share === "function") {
      await navigator.share(ios ? { title: title ?? undefined, text: words || undefined, url } : { title: title ?? undefined, text: message })
      return "shared"
    }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return "cancelled"
    /* A share sheet that failed: the link copied instead. */
  }
  try {
    await navigator.clipboard.writeText(url)
    return "copied"
  } catch {
    return "failed"
  }
}

/** Whether this browser (or the app) has a share sheet, read after the first paint. */
function useCanShare(): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => {
    const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Share?: unknown } } }).Capacitor
    setCan(typeof navigator.share === "function" || !!(native?.isNativePlatform?.() && native.Plugins?.Share))
  }, [])
  return can
}

export interface PostCardProps {
  post: FeedPostView
  slug: string
  viewer: ViewerView
  update: PostUpdate
  /** The permalink: the whole text, no link on the title. */
  full?: boolean
  readOnly?: boolean
  /** One of the first cards on the screen: its pictures are asked for at once, first, not when they scroll near. */
  priority?: boolean
  /** Where the comment button goes; the permalink passes a function that focuses its box. */
  onComment?: () => void
  /** Open Edit post at once (the post page with ?edit=1, round 13); ignored unless the viewer may edit it. */
  autoEdit?: boolean
}

/**
 * ON A PHONE A POST IS A ROW (round 9, after Skool's phone feed, image 60):
 * the screen's full width whatever padding the column has (the margin is
 * worked out from the viewport, not from the column's padding), no rounded
 * card edge, and a thin #f1f2f4 band under it as the only thing between two
 * posts. From 640px it is the card it always was. The composer above the
 * posts is a row the same way (composer.tsx).
 */
export const PHONE_ROW =
  "max-sm:mx-[calc(50%-50vw)] max-sm:mb-0 max-sm:w-screen max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:border-b-8 max-sm:border-b-[#f1f2f4]"

/**
 * ===========================================================================
 *  A PAGE OF POSTS COSTS ONE SCREENFUL TO DRAW (round 9)
 * ===========================================================================
 * Going back to the feed or switching a space drew twenty cards in one go:
 * about half a second of main thread at 4x CPU before the first of them
 * showed (scripts/check-community-posts.mjs MOUNT). Three things now:
 *
 *   EVERY CARD IS LAID OUT, ON SCREEN OR NOT (round 24). It was skipped
 *   while off screen (content-visibility: auto), kept at a remembered
 *   height. That height was the card's border box handed to a property that
 *   sizes the content box, so every skipped card was 32px too tall on a
 *   phone (its padding and border counted twice): each card that came on
 *   screen jumped, and Back landed a few hundred pixels off. Measured over
 *   the same swipes at 4x CPU, the skipping also cost more than it saved:
 *   style 405ms against 125, layout 220 against 80, raster 400 to 570
 *   against 170, because every card coming near the screen was styled,
 *   laid out and rasterised from nothing. The remembered height (REMEMBERED
 *   below, the border box, measured by one shared ResizeObserver) still
 *   sizes a card's placeholder for its first frame, which is what a border
 *   box is right for.
 *
 *   THE FEED DRAWS A SCREENFUL FIRST (feed.tsx, FIRST_CARDS): the rest are
 *   placeholders of the same remembered height for one frame, then become
 *   cards in a transition React can pause for a tap.
 *
 *   NOTHING A CARD DOES NOT SHOW IS BUILT: its confirm and report dialogs
 *   are put in the page the first time they are asked for, and a date
 *   older than a week (an Intl format) is worked out once per post.
 */
export const FIRST_CARDS = 8
/** A card never seen yet: about a card with a line of words and its footer. */
const CARD_GUESS_PX = 320
const REMEMBERED = new Map<string, number>()
let watcher: ResizeObserver | null = null
function watchHeight(el: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {}
  watcher ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const id = (e.target as HTMLElement).dataset.post
      const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)
      /* A card skipped while off screen reports the height it was given, not its own: only a drawn one is remembered. */
      if (id && h > 0 && h !== heightOf(id)) REMEMBERED.set(id, h)
    }
  })
  watcher.observe(el)
  return () => watcher?.unobserve(el)
}
const heightOf = (id: string) => REMEMBERED.get(id) ?? CARD_GUESS_PX

/** A card still to be drawn: its place, at the height it will have (feed.tsx draws these past the first screenful for one frame). */
export function PostCardPlaceholder({ post }: { post: FeedPostView }) {
  return <div className={`${CARD} ${PHONE_ROW}`} style={{ height: heightOf(post.id) }} data-post-placeholder={post.id} aria-hidden />
}

/** The cards after this one in its list, which slide to their new places when it changes height (Edit post opening and closing). */
function followers(el: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let x = el?.nextElementSibling ?? null; x; x = x.nextElementSibling) {
    if (!(x instanceof HTMLElement)) continue
    if (x.getBoundingClientRect().top > window.innerHeight) break
    out.push(x)
  }
  return out
}

/** "57m", "3d", or "Sep 11" (lib/communities/format.ts relativeTime): the last kind (an Intl format, the costly one) once per date. */
const OLD_DATES = new Map<string, string>()
function whenLabel(iso: string): string {
  const have = OLD_DATES.get(iso)
  if (have) return have
  const label = relativeTime(iso)
  if (Date.now() - Date.parse(iso) > 8 * 86_400_000) OLD_DATES.set(iso, label)
  return label
}

/*
  ONE CARD DRAWN AGAIN, NOT THE WHOLE FEED. A like changes one post, but the
  feed hands every card a new `update` each time its list changes, so each
  press drew every card again (several frames' work at 4x CPU). A card now
  draws again only when its own post (or how it is shown) changes, and calls
  the feed's latest `update` through a ref.
*/
export const PostCard = memo(PostCardView, (a, b) => a.post === b.post && a.slug === b.slug && a.viewer === b.viewer && a.full === b.full && a.readOnly === b.readOnly && a.onComment === b.onComment && a.autoEdit === b.autoEdit && a.priority === b.priority)

function PostCardView({ post, slug, viewer, update: given, full = false, readOnly = false, onComment, autoEdit = false, priority = false }: PostCardProps) {
  const latest = useRef(given)
  useEffect(() => {
    latest.current = given
  })
  const update: PostUpdate = useCallback((id, fn) => latest.current(id, fn), [])
  const base = `/community/${slug}`
  const href = postPath(slug, post)
  /*
    While a press is on its way, what the member asked for wins over a copy
    of the post read before it. Only the buttons below draw it as it moves
    (LikeButton, SaveButton, SavedMark subscribe themselves), so a press
    redraws a button, not the whole card; the card reads it when it draws.
  */
  const bookmarked = intentOf(`save:${post.id}`)?.on ?? post.bookmarked
  const media = useMemo(() => withBodyEmbeds(post.media, post.bodyText), [post.media, post.bodyText])
  const inlinePoll = !full && post.poll && pollFitsInline(post.poll)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const [opened, setOpened] = useState(false)
  const canShare = useCanShare()
  /* The dialogs are built the first time one is asked for, then kept (so they can animate out). */
  const asked = useRef(false)
  if (confirm || report) asked.current = true
  const dialogs = asked.current ? (
    <>
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
      <ReportSheet communityId={post.communityId} target={report} onClose={() => setReport(null)} />
    </>
  ) : null
  /* Its height, remembered for the next time the feed is drawn (A PAGE OF POSTS COSTS ONE SCREENFUL). */
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (full || !cardRef.current) return
    return watchHeight(cardRef.current)
  }, [full])
  const mod = moderationMenu(viewer, post.author ? { id: post.author.id, role: post.author.role } : null)
  const own = post.canEdit

  /*
    EDIT POST OPENS AND CLOSES IN PLACE, SMOOTHLY. The card's height before the change is read as it is asked for; once the
    card is drawn the other way, the cards under it start where they were and slide to their new places (translate, on the
    compositor), and what is now in the card fades in. With reduced motion it simply changes.
  */
  const heightBefore = useRef<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const startEdit = () => {
    heightBefore.current = cardRef.current?.offsetHeight ?? null
    setEditing(true)
  }
  const endEdit = () => {
    heightBefore.current = cardRef.current?.offsetHeight ?? null
    setEditing(false)
  }
  /* ?edit=1 (a profile's Edit link): Edit post opens at once, only for its author and never read only. */
  useEffect(() => {
    if (autoEdit && own && !readOnly) setEditing(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])
  useLayoutEffect(() => {
    const before = heightBefore.current
    heightBefore.current = null
    const el = cardRef.current
    if (before == null || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    if (!editing) contentRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0, 0, 0.2, 1)" })
    const d = el.offsetHeight - before
    if (Math.abs(d) < 1 || full) return
    for (const x of followers(el)) x.animate([{ translate: `0 ${-d}px` }, { translate: "0 0" }], { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
  }, [editing, full])

  /* The card opens its post over the feed; a link or a button inside it does its own thing. */
  const openPost = (e: React.MouseEvent) => {
    if (full || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    /* A press inside the opened post (portalled, so not inside this card) or on its scrim is the overlay's, never a second open. */
    if (!e.currentTarget.contains(e.target as Node)) return
    const target = e.target as HTMLElement
    const inner = target.closest("a, button, input, textarea, select, label, [role=menu], [role=menuitem], [role=dialog], [data-no-open]")
    if (inner && !inner.hasAttribute("data-post-open")) return
    if (window.getSelection?.()?.toString()) return
    e.preventDefault()
    warmPostMedia(media, post.communityId, post.id)
    setOpened(true)
  }

  /* openPost(id) from anywhere (a search row, a notification; lib/communities/client/open-post.ts): the card on screen opens it. */
  useOpenPostRequests((r) => {
    if (full || editing || r.postId !== post.id) return false
    warmPostMedia(media, post.communityId, post.id)
    setOpened(true)
    return true
  })

  const like = () => {
    if (readOnly || !viewer.can.react) return
    const now = intentOf(`like:${post.id}`) ?? { on: post.reacted, count: post.reactionCount }
    /* The like's tiny sound, softer for an unlike (heart.tsx likeSound), in the press itself. */
    likeSound(!now.on)
    press(`like:${post.id}`, now, {
      send: (on) => api<{ on: boolean; count: number }>(`${apiBase(post.communityId)}/reactions`, { body: { targetType: "post", targetId: post.id, on } }),
      apply: (t) => update(post.id, (p) => ({ ...p, reacted: t.on, reactionCount: t.count })),
    })
  }

  /* `said`: from the menu, where nothing else shows it, a toast says it; the opened post's Save button says it itself. */
  const save = (said = true) => {
    press(`save:${post.id}`, intentOf(`save:${post.id}`) ?? { on: post.bookmarked, count: 0 }, {
      send: (on) => api<{ on: boolean }>(`${apiBase(post.communityId)}/bookmarks`, { body: { postId: post.id, on } }),
      apply: (t) => update(post.id, (p) => ({ ...p, bookmarked: t.on })),
      /* Said once, when the server has it, and only if it ended somewhere new. */
      done: (t, from) => {
        if (said && t.on !== from.on) toast(t.on ? "Saved. Find it under Saved." : "Removed from Saved.")
      },
    })
  }

  const share = async () => {
    const url = `${SHARE_ORIGIN}${href}?v=3`
    const headline = (post.title || "").replace(/\s+/g, " ").trim() || post.bodyText.replace(/\s+/g, " ").trim().slice(0, 90)
    const how = await sharePost(url, headline || null, post.bodyText)
    if (how === "copied") toast("Link copied")
    else if (how === "failed") toast(url)
  }

  const moderate = (action: "pin" | "unpin" | "lock" | typeof REOPEN, done: (p: FeedPostView) => FeedPostView, said: string) => async () => {
    const r = await actOnContent(post.communityId, { action, targetType: "post", targetId: post.id })
    if (!r.ok) return toast(r.error)
    update(post.id, done)
    toast(said)
  }

  const items: ActionMenuItem[] = []
  if (canShare) items.push({ label: "Share post", icon: <ShareIcon size={16} />, onClick: () => void share() })
  if (!full && viewer.active) items.push({ label: bookmarked ? "Remove from Saved" : "Save post", icon: <Bookmark className="h-4 w-4" strokeWidth={1.75} />, onClick: () => save() })
  if (own && !readOnly) {
    items.push({ label: "Edit post", icon: <PenIcon size={16} />, onClick: startEdit })
    items.push({
      label: "Delete post",
      icon: <TrashBinMinimalisticIcon size={16} />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: "Delete this post?",
          detail: "It goes for everyone, with its comments.",
          action: "Delete",
          danger: true,
          run: async () => {
            const r = await api(`${apiBase(post.communityId)}/posts/${post.id}`, { method: "DELETE" })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            foldAway(post.id)
            update(post.id, () => null)
            toast("Post deleted")
            return true
          },
        }),
    })
  }
  if (!own && viewer.can.report) items.push({ label: "Report post", icon: <FlagIcon size={16} />, onClick: () => setReport({ type: "post", id: post.id, what: "post" }) })
  const modItems: ActionMenuItem[] = []
  if (mod.pin) modItems.push({ label: post.pinned ? "Unpin" : "Pin to top", icon: <PinIcon size={16} />, onClick: post.pinned ? moderate("unpin", (p) => ({ ...p, pinned: false }), "Unpinned") : moderate("pin", (p) => ({ ...p, pinned: true }), "Pinned to the top") })
  if (mod.lock) modItems.push({ label: post.locked ? "Open comments" : "Close comments", icon: <Lock className="h-4 w-4" />, onClick: post.locked ? moderate(REOPEN, (p) => ({ ...p, locked: false }), "Comments open") : moderate("lock", (p) => ({ ...p, locked: true }), "Comments closed") })
  if (mod.remove && !own)
    modItems.push({
      label: "Remove post",
      icon: <ShieldIcon size={16} />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: "Remove this post?",
          detail: "Members will no longer see it. It stays in the moderation log.",
          action: "Remove",
          reason: true,
          danger: true,
          run: async (reason) => {
            const r = await actOnContent(post.communityId, { action: "remove", targetType: "post", targetId: post.id, reason: reason || undefined })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            foldAway(post.id)
            update(post.id, () => null)
            toast("Post removed")
            return true
          },
        }),
    })
  if (mod.mute && post.author)
    modItems.push({
      label: `Mute ${post.author.name} for a day`,
      icon: <VolumeX className="h-4 w-4" />,
      variant: "warning",
      onClick: async () => {
        const r = await actOnMember(post.communityId, { action: "mute", userId: post.author!.id, until: muteUntil(24) })
        toast(r.ok ? `${post.author!.name} is muted for 24 hours` : r.error)
      },
    })
  if (mod.ban && post.author)
    modItems.push({
      label: `Ban ${post.author.name}`,
      icon: <Ban className="h-4 w-4" />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: `Ban ${post.author!.name}?`,
          detail: "They lose access to the community and cannot join again.",
          action: "Ban",
          reason: true,
          danger: true,
          run: async (reason) => {
            const r = await actOnMember(post.communityId, { action: "ban", userId: post.author!.id, reason: reason || undefined })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            toast(`${post.author!.name} is banned`)
            return true
          },
        }),
    })
  if (modItems.length) modItems[0] = { ...modItems[0], section: "Moderation" }

  const author = post.author
  const removed = post.status === "removed"
  const level = post.showLevel && author?.level ? author.level : null
  const fresh = post.lastCommentAt && Date.now() - Date.parse(post.lastCommentAt) < 7 * 86_400_000 ? post.lastCommentAt : null
  const files = media.filter((m) => m.type === "file").length
  /* Two or more pictures: under the words on a computer too (round 12), not one thumbnail on the right. */
  const several = useMemo(() => cardPictures(media).length >= 2, [media])

  const head = (
    <header className="flex items-start gap-3">
      <span className="relative shrink-0">
        {author ? (
          <Link href={memberHref(slug, author)} className="block rounded-full" data-person-link="" data-person-id={author.id}>
            <MemberAvatar src={author.avatarUrl} name={author.name} alt="" size={40} />
          </Link>
        ) : (
          <MemberAvatar src={null} name="Former member" alt="" size={40} warm={false} />
        )}
        {level ? <LevelBadge level={level} /> : null}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {/* One line: a long name is cut short before the role ever drops under it. */}
        <div className="flex min-w-0 items-center gap-x-1.5 text-[14.5px] leading-5" data-post-name-line="">
          {author ? (
            <Link href={memberHref(slug, author)} className="truncate font-semibold text-[#1a1a2e] hover:underline" data-person-link="" data-person-id={author.id}>
              {author.name}
            </Link>
          ) : (
            <span className="font-semibold text-[#6b7280]">Former member</span>
          )}
          <RoleBadge role={author?.role} />
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] leading-5 text-[#6b7280]">
          <Link href={href} className="hover:underline" suppressHydrationWarning data-post-open="" onClick={openPost}>
            <time dateTime={post.createdAt} suppressHydrationWarning>
              {whenLabel(post.createdAt)}
            </time>
          </Link>
          {post.editedAt ? <span>· edited</span> : null}
          {post.space ? (
            <>
              <span aria-hidden>·</span>
              <Link href={`${base}/space/${post.space.slug}`} className="inline-flex min-w-0 max-w-[200px] items-center gap-1 font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e] hover:underline" data-post-space="">
                <span aria-hidden className="shrink-0 text-[12px] leading-none no-underline" data-space-glyph="">
                  {spaceGlyph(post.space.icon, post.space.kind)}
                </span>
                <span className="truncate">{post.space.name}</span>
              </Link>
            </>
          ) : null}
        </div>
      </div>
      <div className="-mr-2 -mt-1 flex shrink-0 items-center">
        <ResponsiveActionMenu
          title="Post"
          items={[...items, ...modItems]}
          trigger={
            <button type="button" aria-label="More" className={ICON_BTN} data-post-more="">
              <MenuDotsIcon size={20} />
            </button>
          }
        />
      </div>
    </header>
  )
  /* PINNED (round 13): a quiet line above the post, the same open and in the feed. */
  const pinnedLine = post.pinned ? (
    <div className="-mt-0.5 mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#4b5563]" data-pin-mark="">
      <PinBold size={14} className="text-[#1a1a2e]" aria-hidden />
      Pinned
    </div>
  ) : null
  /* Edit post: the composer, in place of the words on a computer, its own screen on a phone (the words stay under it). */
  const editor = editing ? <EditInCard post={post} viewer={viewer} update={update} onDone={endEdit} /> : null

  const likeButton = <LikeButton post={post} full={full} disabled={readOnly || !viewer.can.react} onPress={like} />

  if (!full) {
    return (
      <article
        ref={cardRef}
        className={`${CARD} ${PHONE_ROW} group/post cursor-pointer px-4 pb-2 pt-4 transition-[border-color,box-shadow] duration-150 sm:px-5 sm:pt-5 sm:hover:border-[#dfe2e6] sm:hover:shadow-[0_1px_3px_rgba(17,24,39,0.05)] ${post.pinned ? PINNED : ""}`}
        data-post={post.id}
        data-pinned={post.pinned ? "true" : undefined}
        onClick={editing ? undefined : openPost}
        /* The comments are asked for as the finger lands, so they are usually here before the post has finished opening. */
        onPointerDown={(e) => {
          /* The opened post is portalled, but its presses still bubble here through React: only the card's own read ahead. */
          if (!e.currentTarget.contains(e.target as Node)) return
          if (e.button !== 0 || (e.target as HTMLElement).closest("button, [role=menu]")) return
          warmPostMedia(media, post.communityId, post.id)
          void readAheadComments(post.communityId, post.id)
        }}
      >
        {pinnedLine}
        {head}
        {removed ? <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-[13px] text-[#8a5a00]">Removed by a moderator. Only moderators see it.</p> : null}
        {editor}
        {editing && !phoneNow() ? null : (
          <div ref={contentRef} className="mt-3 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              {post.kind === "announcement" ? <div className="mb-1 text-[12.5px] font-medium text-[#6b7280]">Announcement</div> : null}
              {post.title ? (
                <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.005em] text-[#1a1a2e] sm:text-[18px]">
                  <Link href={href} className="min-w-0 [overflow-wrap:anywhere] hover:underline" data-post-open="" onClick={openPost}>
                    {post.title}
                  </Link>
                </h2>
              ) : null}
              {post.bodyText ? (
                <p className={`line-clamp-2 break-words text-[15px] leading-[1.55] text-[#4b5563] ${post.title ? "mt-1" : ""}`} data-post-excerpt="">
                  {inline(post.bodyText.replace(/\s+/g, " ").slice(0, 400))}
                </p>
              ) : null}
              {post.poll && !inlinePoll ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
                  <span className="inline-flex items-center gap-1.5" data-card-poll="">
                    <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Poll · {post.poll.totalVotes === 1 ? "1 vote" : `${post.poll.totalVotes} votes`}
                  </span>
                </div>
              ) : null}
              {files ? (
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280] ${post.poll && !inlinePoll ? "" : "mt-2"}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {files === 1 ? "1 file" : `${files} files`}
                  </span>
                </div>
              ) : null}
              {inlinePoll && post.poll ? (
                <PollBlock
                  poll={post.poll}
                  communityId={post.communityId}
                  canVote={!readOnly && !!viewer.can.react}
                  embed
                  onChange={(poll: PollView) => update(post.id, (p) => ({ ...p, poll }))}
                />
              ) : null}
              {/* A phone draws the pictures here, under the words; a computer too when there are two or more, else its thumbnail on the right. */}
              <CardMedia media={media} priority={priority} className={several ? "mt-3" : "mt-3 sm:hidden"} />
            </div>
            {several ? null : <PostThumb media={media} className="max-sm:hidden" />}
          </div>
        )}
        <footer className="mt-2 flex min-h-11 items-center gap-1 sm:mt-2.5">
          {likeButton}
          <button type="button" data-post-open="" aria-label={`Comments, ${post.commentCount}`} className={`${BTN_GHOST} gap-2 px-2 sm:px-2.5`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount}</span>
          </button>
          {post.recentCommenters?.length ? (
            <span className={`ml-1 shrink-0 ${STACK}`} data-commenters="" data-avatar-stack="">
              {/* Three faces; two on a narrow phone, so "New comment 2d ago" keeps its words. */}
              {post.recentCommenters.slice(0, 3).map((c, i) => (
                <MemberAvatar key={c.id} src={c.avatarUrl} name={c.name} alt="" size={24} warm={false} className={`${STACK_FACE} ${i === 2 ? "max-[399px]:hidden" : ""}`} />
              ))}
            </span>
          ) : null}
          {fresh ? (
            <span className="ml-1.5 min-w-0 truncate text-[12.5px] font-medium text-[#1a1a2e]/80 sm:ml-2 sm:text-[13px]" suppressHydrationWarning data-new-comment="">
              {newCommentLabel(fresh)}
            </span>
          ) : null}
          {post.locked ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12.5px] text-[#6b7280]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Comments closed</span>
            </span>
          ) : (
            <SavedMark post={post} />
          )}
        </footer>

        {dialogs}
        {opened ? (
          <PostOverlay
            post={post}
            slug={slug}
            viewer={viewer}
            readOnly={readOnly}
            update={update}
            onClose={() => setOpened(false)}
            origin={() => cardRef.current}
            renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} />}
          />
        ) : null}
      </article>
    )
  }

  return (
    <article ref={cardRef} className={`${CARD} ${PHONE_ROW} px-4 pb-2 pt-4 sm:px-5 sm:pt-5`} data-post={post.id} data-pinned={post.pinned ? "true" : undefined}>
      {pinnedLine}
      {head}
      {removed ? <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-[13px] text-[#8a5a00]">Removed by a moderator. Only moderators see it.</p> : null}

      {editor}
      {editing && !phoneNow() ? null : (
        <div ref={contentRef} className="mt-3">
          {post.kind === "announcement" ? <div className="mb-1 text-[12.5px] font-medium text-[#6b7280]">Announcement</div> : null}
          {post.title ? <h1 className="pr-8 text-[19px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[21px]">{post.title}</h1> : null}
          {post.bodyText ? <BodyText text={post.bodyText} clamp={false} className={post.title ? "mt-1.5" : ""} /> : null}
          <PostMediaGrid media={media} communityId={post.communityId} postId={post.id} priority />
          {post.poll ? (
            <PollBlock poll={post.poll} communityId={post.communityId} canVote={!readOnly && !!viewer.can.react} onChange={(poll: PollView) => update(post.id, (p) => ({ ...p, poll }))} />
          ) : null}
        </div>
      )}

      {/* While Edit post is open in place its own Save is the one on screen: the footer (with the bookmark's "Save") waits. */}
      <footer className={`mt-2 flex items-center gap-0.5 border-t border-[#f0f1f3] px-0.5 pt-1.5 sm:mt-3 sm:gap-1 sm:px-0 ${editing ? "sm:hidden" : ""}`}>
        {likeButton}
        {onComment ? (
          <button type="button" onClick={onComment} className={`${BTN_GHOST} gap-2`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount > 0 ? post.commentCount : "Comment"}</span>
          </button>
        ) : (
          <Link href={`${href}#comments`} className={`${BTN_GHOST} gap-2`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount > 0 ? post.commentCount : "Comment"}</span>
          </Link>
        )}
        {post.locked ? (
          <span className="ml-1 inline-flex items-center gap-1 text-[12.5px] text-[#6b7280]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Comments closed
          </span>
        ) : null}
        {canShare ? (
          <button
            type="button"
            onClick={() => void share()}
            aria-label="Share post"
            className={`${BTN_GHOST} ${viewer.active ? "" : "-mr-2 ml-auto"} !px-2.5`}
            data-share-post=""
          >
            <ShareIcon size={18} aria-hidden />
          </button>
        ) : null}
        {viewer.active ? <SaveButton post={post} full onPress={() => save(false)} /> : null}
      </footer>

      {dialogs}
    </article>
  )
}

/**
 * A like's button: the ghost button without its press scale, so a press moves
 * the heart (heart.tsx) and never the box around it (round 10).
 */
const LIKE_BTN = BTN_GHOST.replace("active:scale-[0.97]", "")

/** The heart and its count: the one part of a card a like draws again. */
function LikeButton({ post, full, disabled, onPress }: { post: FeedPostView; full: boolean; disabled: boolean; onPress: () => void }) {
  const intent = useIntent(`like:${post.id}`)
  const reacted = intent ? intent.on : post.reacted
  const count = intent ? intent.count : post.reactionCount
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={reacted}
      aria-label={full ? undefined : reacted ? `Unlike, ${count} likes` : `Like, ${count} likes`}
      disabled={disabled}
      data-like=""
      className={`${LIKE_BTN} group/like -ml-2 gap-2 touch-manipulation ${full ? "" : "px-2 sm:px-2.5"} ${reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`}
    >
      <LikeHeart on={reacted} size={20} />
      <span className="tabular-nums" data-like-count="">
        {full ? (count > 0 ? count : "Like") : count}
      </span>
    </button>
  )
}

/** The card's small saved mark: always in the page and only hidden when off, so a save adds no element (an added one restyles the page's :has() rules) and an unsaved card keeps the room for "New comment". */
function SavedMark({ post }: { post: FeedPostView }) {
  const intent = useIntent(`save:${post.id}`)
  const on = intent ? intent.on : post.bookmarked
  return <Bookmark className={`ml-auto h-4 w-4 shrink-0 fill-current text-[#1a1a2e] ${on ? "" : "hidden"}`} aria-label={on ? "Saved" : undefined} aria-hidden={on ? undefined : true} data-saved-mark={on ? "" : undefined} />
}

/** A pinned card: a shade firmer edge and the light shadow (round 13). */
const PINNED = "border-[#dcdfe4] shadow-[0_1px_3px_rgba(16,24,40,0.06)]"

/** Whether the screen is a phone's now (Edit post draws its screen there, the words staying in the card). */
function phoneNow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches
}

/** Edit post: the composer with this post in it (composer.tsx `edit`). */
function EditInCard({ post, viewer, update, onDone }: { post: FeedPostView; viewer: ViewerView; update: PostUpdate; onDone: () => void }) {
  const given = useContext(EditSpacesContext)
  /* The spaces it may move to; the one it is in is always there (a lone post page knows no other). */
  const spaces = useMemo<ComposerSpace[]>(() => {
    const list = [...(given ?? [])]
    if (post.space && !list.some((x) => x.id === post.space!.id)) list.unshift({ id: post.space.id, name: post.space.name, kind: post.space.kind ?? "feed", icon: post.space.icon ?? null })
    return list
  }, [given, post.space])
  const edit = useMemo(
    () => ({
      post,
      onSaved: (p: FeedPostView) => {
        update(post.id, (x) => ({ ...x, ...p, reacted: x.reacted, reactionCount: x.reactionCount, bookmarked: x.bookmarked }))
        onDone()
        toast("Post updated")
      },
      onClose: onDone,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post.id],
  )
  return (
    <Composer
      communityId={post.communityId}
      userId={viewer.userId ?? ""}
      me={{ name: post.author?.name ?? "You", avatarUrl: post.author?.avatarUrl ?? null }}
      spaces={spaces}
      fixedSpaceId={spaces.length <= 1 ? (post.space?.id ?? null) : null}
      edit={edit}
      onPosted={() => undefined}
    />
  )
}
