"use client"

/**
 * ===========================================================================
 *  A POST OPENED OVER THE FEED
 * ===========================================================================
 * Pressing a card opens its post where the member is: on a computer a
 * panel over the feed (the feed stays where it was under a light scrim), on
 * a phone a sheet that slides up over it. The address becomes the post's
 * own (/community/<slug>/post/<id>) without loading a page, so a reload or a
 * shared link lands on the post page; Back, Escape, the close button, a
 * press on the scrim or a pull down on the phone's sheet close it (one step
 * of history, useHistoryLayer), and the feed under it is exactly where it
 * was: nothing under the post is drawn again or read again, and the page's
 * scroll is only held still while the post is open, never moved.
 *
 * The card's post is drawn at once, on the first frame, from the card's own
 * data, then read again from the server (a count may have moved) once the
 * slide has finished. Its comments are asked for the moment the post opens
 * (comments.tsx readAheadComments), the room they will take is kept from
 * the post's comment count, and they fade into it, so nothing under the post
 * jumps when they arrive. Likes, saves, edits and deletes made here reach
 * the card underneath through the feed's own update, so closing shows the
 * list as it now is.
 *
 * ON A PHONE (round 9) the sheet is the app's own (components/ui/
 * bottom-sheet.tsx), the one every phone sheet in /app uses: it follows the
 * finger from the first pixel, a pull down from the top of the post closes
 * it past the point where it would carry on by itself (velocity, not only
 * distance), a pull up gives on a rubber band, a short pull springs back at
 * the speed it was let go, and every frame of it is a move on the
 * compositor. It stands a little short of the top of the screen, as an iOS
 * sheet does, and sits on the keyboard when the comment box is typed in.
 *
 * ON A COMPUTER the panel's open and close are Web Animations on opacity
 * and translate (the compositor's, from the very first frame: no waiting
 * frame before the move starts), 240ms in on iOS's curve and 180ms out, and
 * a plain fade with reduced motion.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { BottomSheet, SHEET_CLOSE_EASE, SHEET_EASE } from "@/components/ui/bottom-sheet"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { CommentsPlaceholder, CommentsSection, readAheadComments } from "./comments"
import { useKeepFieldInSight } from "./keep-in-sight"
import { useHistoryLayer } from "./lightbox"
import type { MentionTextareaHandle } from "./mention-input"
import { intentOf } from "./post-intent"
import { markSeen } from "./post-seen"

const IN_MS = 240
const OUT_MS = 180
/** After the move has arrived, a moment before the comments are drawn, so their first frame is not the move's last. */
const SETTLE_MS = 80

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export type PostUpdateFn = (id: string, fn: (p: FeedPostView) => FeedPostView | null) => void

export interface PostOverlayProps {
  post: FeedPostView
  slug: string
  viewer: ViewerView
  readOnly?: boolean
  /** The feed's update: what changes here changes the card under it. */
  update: PostUpdateFn
  onClose: () => void
  /** The post drawn whole (the card component, in its full form). */
  renderPost: (post: FeedPostView, update: PostUpdateFn, onComment: () => void) => React.ReactNode
}

export function PostOverlay({ post: given, slug, viewer, readOnly = false, update, onClose, renderPost }: PostOverlayProps) {
  const phone = usePhone()
  const [post, setPost] = useState(given)
  /* "in" while it arrives, "shown" once it has, "out" from the moment it starts to leave. */
  const [phase, setPhase] = useState<"in" | "shown" | "out">("in")
  const box = useRef<MentionTextareaHandle>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  /*
    THE SAME CLOSE FOR AS LONG AS IT IS OPEN. The card hands a new onClose
    each time it draws (a like on it, say), and a close that changed with it
    set the page's overflow again each time: a style pass over the whole
    page, 95ms at 4x CPU, in the middle of a press.
  */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  /* Open as far as the history and the sheet are concerned; false starts the way out. */
  const [open, setOpen] = useState(true)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) setPhase("out")
  }, [open])

  /*
    One step of history for as long as it is on screen: Back closes it, and
    closing it any other way steps back over it once it has gone, not when
    it starts to go. Stepping back wakes the page's router and the feed (they
    hear the address change), and that work belongs after the slide, not in
    its first frames.
  */
  useHistoryLayer(true, close, `/community/${slug}/post/${given.id}`)

  /* The comments are asked for now, while the post slides in; they are drawn once it has. */
  useEffect(() => {
    void readAheadComments(given.communityId, given.id)
  }, [given.communityId, given.id])

  const local: PostUpdateFn = useCallback(
    (id, fn) => {
      let gone = false
      setPost((p) => {
        const next = fn(p)
        if (!next) {
          gone = true
          return p
        }
        return next
      })
      update(id, fn)
      if (gone) close()
    },
    [update, close],
  )

  /*
    NOTHING HEAVY WHILE IT MOVES. The comments, the post read again and the
    card underneath marked seen all wait until the slide has finished, so
    the frames of the slide draw only the slide.
  */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (phase !== "shown") return
    const t = window.setTimeout(() => setSettled(true), reducedMotion() ? 0 : SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  /* The post again from the server, and seen. */
  useEffect(() => {
    if (!settled) return
    markSeen(given.communityId, viewer.userId, given)
    let stop = false
    void (async () => {
      const r = await api<{ post: FeedPostView }>(`${apiBase(given.communityId)}/posts/${given.id}`)
      if (stop || !r.ok) return
      /* A like or a save pressed while this was read stays as pressed (post-intent.ts). */
      const like = intentOf(`like:${given.id}`)
      const save = intentOf(`save:${given.id}`)
      const fresh: FeedPostView = { ...r.data.post, ...(like ? { reacted: like.on, reactionCount: like.count } : {}), ...(save ? { bookmarked: save.on } : {}) }
      setPost(fresh)
      update(given.id, (p) => ({ ...p, ...fresh }))
    })()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given.id, settled])

  /*
    The page under it stays still, once for as long as it is open; the
    scrollbar's width is kept so nothing shifts sideways. Before the first
    frame is painted: set after it, the page's restyle landed on the second
    frame of the move (50ms at 4x CPU).
  */
  useLayoutEffect(() => {
    const html = document.documentElement
    const bar = window.innerWidth - html.clientWidth
    const prev = { overflow: html.style.overflow, pad: html.style.paddingRight }
    html.style.overflow = "hidden"
    if (bar > 0) html.style.paddingRight = `${bar}px`
    return () => {
      html.style.overflow = prev.overflow
      html.style.paddingRight = prev.pad
    }
  }, [])

  /* On a phone, the comment box stays in sight above the keyboard (keep-in-sight.ts). */
  useKeepFieldInSight(phone, () => contentRef.current?.closest<HTMLElement>("[data-sheet-scroll]") ?? null)

  const onComment = useCallback(() => {
    const el = box.current
    if (el) el.focus()
    else contentRef.current?.querySelector("[data-comments-list]")?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [])

  /* Drawn once per change of the post, not once per step of the slide. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => renderPost(post, local, onComment), [post, local, onComment])
  if (typeof document === "undefined") return null

  return <OverlayFrame phone={phone} post={post} open={open} phase={phase} setPhase={setPhase} close={close} onGone={() => onCloseRef.current()} contentRef={contentRef} content={<OverlayContent drawn={drawn} settled={settled} post={post} slug={slug} viewer={viewer} readOnly={readOnly} box={box} local={local} />} />
}

/*
  THE POST AND ITS COMMENTS DRAWN ONCE PER CHANGE OF THEM, not again when the
  overlay starts to close: a close that drew every comment again (each with
  its menu) cost the first frames of its own slide.
*/
const OverlayContent = memo(function OverlayContent({ drawn, settled, post, slug, viewer, readOnly, box, local }: { drawn: React.ReactNode; settled: boolean; post: FeedPostView; slug: string; viewer: ViewerView; readOnly: boolean; box: React.RefObject<MentionTextareaHandle | null>; local: PostUpdateFn }) {
  return (
    <>
      {/* The post whole, without a card's edge: the panel is the card. */}
      <div className="[&>article]:mx-0 [&>article]:w-auto [&>article]:rounded-none [&>article]:border-0 [&>article]:shadow-none" data-post-overlay-post="">
        {drawn}
      </div>
      <section id="comments" className="mt-1 border-t border-[#f0f1f3] px-4 pb-6 pt-4 sm:px-5" aria-label="Comments" data-comments="">
        {settled ? (
          <CommentsSection
            post={post}
            slug={slug}
            viewer={viewer}
            initial={null}
            readOnly={readOnly}
            boxRef={box}
            expected={post.commentCount}
            fadeIn
            onCount={(d) => local(post.id, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
          />
        ) : (
          <CommentsPlaceholder expected={post.commentCount} />
        )}
      </section>
    </>
  )
})

function OverlayFrame({ phone, post, open, phase, setPhase, close, onGone, contentRef, content }: { phone: boolean; post: FeedPostView; open: boolean; phase: "in" | "shown" | "out"; setPhase: React.Dispatch<React.SetStateAction<"in" | "shown" | "out">>; close: () => void; onGone: () => void; contentRef: React.RefObject<HTMLDivElement | null>; content: React.ReactNode }) {
  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={close}
        onOpened={() => setPhase((p) => (p === "in" ? "shown" : p))}
        onClosed={onGone}
        label={post.title || "Post"}
        hideFrom="sm"
        zIndex={130}
        aboveKeyboard
        /* Nearly the whole screen, short of the top by the status bar and a little more, as an iOS sheet stands. */
        height="calc(var(--vv-h, 100dvh) - max(env(safe-area-inset-top), 12px) - 8px)"
        maxHeight="calc(var(--vv-h, 100dvh) - max(env(safe-area-inset-top), 12px) - 8px)"
        header={
          <div className="flex h-11 items-center gap-1 border-b border-[#f0f1f3] px-1.5" data-post-overlay-bar="">
            <span className="w-10 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-[#1a1a2e]">{post.space?.name ?? "Post"}</span>
            {/* `data-sheet-close`: the sheet starts its own slide first, then the page hears (bottom-sheet.tsx). */}
            <button type="button" aria-label="Close post" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b7280] outline-none active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]" data-sheet-close="" data-post-overlay-close="">
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        }
      >
        <div ref={contentRef} data-post-overlay="phone" data-post-overlay-phase={phase}>
          {content}
        </div>
      </BottomSheet>
    )
  }

  return (
    <PostPanel title={post.title} space={post.space?.name ?? null} open={open} phase={phase} onShown={() => setPhase((p) => (p === "in" ? "shown" : p))} onGone={onGone} close={close} contentRef={contentRef}>
      {content}
    </PostPanel>
  )
}

/**
 * The computer's panel. Its moves are Web Animations started in a layout
 * effect, so the first frame the browser paints is already the first frame
 * of the move, and the move runs on the compositor however busy the page is.
 */
function PostPanel({
  title,
  space,
  open,
  phase,
  onShown,
  onGone,
  close,
  contentRef,
  children,
}: {
  title: string | null
  space: string | null
  open: boolean
  phase: "in" | "shown" | "out"
  onShown: () => void
  onGone: () => void
  close: () => void
  contentRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const done = useRef({ onShown, onGone })
  useEffect(() => {
    done.current = { onShown, onGone }
  })

  /* In: from a little below and transparent, on iOS's curve; the scrim on an even fade. */
  useLayoutEffect(() => {
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!panel || !scrim) return
    if (reducedMotion() || typeof panel.animate !== "function") {
      done.current.onShown()
      return
    }
    const a = panel.animate([{ opacity: 0, translate: "0 16px" }, { opacity: 1, translate: "0 0" }], { duration: IN_MS, easing: SHEET_EASE })
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS, easing: "ease-out" })
    a.onfinish = () => done.current.onShown()
    return () => a.cancel()
  }, [])

  /* Out: from wherever the move in has got to, then gone. */
  useLayoutEffect(() => {
    if (open) return
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!panel || !scrim || reducedMotion() || typeof panel.animate !== "function") {
      done.current.onGone()
      return
    }
    const from = getComputedStyle(panel)
    const fromOpacity = Number(from.opacity)
    const fromAt = from.translate === "none" ? "0 0" : from.translate
    const scrimFrom = Number(getComputedStyle(scrim).opacity)
    for (const x of [...panel.getAnimations(), ...scrim.getAnimations()]) x.cancel()
    panel.style.opacity = "0"
    scrim.style.opacity = "0"
    const a = panel.animate([{ opacity: fromOpacity, translate: fromAt }, { opacity: 0, translate: "0 12px" }], { duration: OUT_MS, easing: SHEET_CLOSE_EASE })
    scrim.animate([{ opacity: scrimFrom }, { opacity: 0 }], { duration: OUT_MS, easing: "ease-out" })
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      done.current.onGone()
    }
    a.onfinish = end
    /* A tab in the background draws no frames: it still goes. */
    const t = window.setTimeout(end, OUT_MS + 200)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog], [data-state=open][role=dialog]:not([data-post-overlay])")) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  return createPortal(
    <div className="fixed inset-0 z-[130]" data-post-overlay-root="" style={open ? undefined : { pointerEvents: "none" }}>
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-[#0f1115]/35" onClick={close} data-post-overlay-scrim="" />
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden px-6 pt-10 sm:pt-12">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title || "Post"}
          data-post-overlay="panel"
          data-post-overlay-phase={phase}
          className="pointer-events-auto relative flex max-h-[calc(100dvh-72px)] w-full max-w-[760px] flex-col self-start overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_24px_64px_-20px_rgba(17,24,39,0.35),0_2px_8px_rgba(17,24,39,0.06)]"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#f0f1f3] pl-5 pr-2">
            <span className="min-w-0 truncate text-[13.5px] font-medium text-[#6b7280]">{space ? `Posted in ${space}` : "Post"}</span>
            <button type="button" onClick={close} aria-label="Close post" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-post-overlay-close="">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-post-overlay-scroll="">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
