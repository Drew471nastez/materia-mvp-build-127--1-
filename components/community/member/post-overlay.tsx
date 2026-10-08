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
 *
 * ROUND 13.
 *   THE PAGE NEVER SHIFTS. On a computer the page's scrollbar is no longer
 *   hidden while a post is open (hiding it, then padding the page by its
 *   width, moved everything sideways under a page that already keeps its
 *   gutter: shell-frame.tsx scrollbar-gutter stable). The page stays as it
 *   is; a wheel over the scrim is simply not given to it, and the panel's
 *   own scroll never runs on into it (overscroll-behavior: contain). A phone
 *   still holds the page still under its sheet (no scrollbar there).
 *   A SLIM SCROLLBAR in the panel: thin, light grey, no track (SLIM_SCROLL).
 *   THE COMMENTS ALWAYS COME. They were drawn only once the open had
 *   "finished", told by the sheet's or the panel's animation; a finger that
 *   caught the phone's sheet while it was still rising (a scroll straight
 *   away) cancelled that animation, the finish never came, and the comments
 *   never loaded. Now the open counts as finished at the latest
 *   SETTLE_LATEST_MS after it started, whatever happened to the move.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { SHEET_CLOSE_EASE, SHEET_EASE } from "@/components/ui/bottom-sheet"
import { PostFullscreen } from "./post-fullscreen"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { CommentsPlaceholder, CommentsSection, readAheadComments } from "./comments"
import { useKeepFieldInSight } from "./keep-in-sight"
import { useHistoryLayer } from "./lightbox"
import type { MentionTextareaHandle } from "./mention-input"
import { intentOf } from "./post-intent"
import { markSeen } from "./post-seen"
import { postPath } from "@/lib/communities/post-url"

/*
  THE TEARDOWN WAITS (round 19). The post's teardown (every comment and picture taken out of the page, the address stepped
  back) waits until the close has finished and the page is idle, so it never lands in the move's last frames or in the
  first scroll after it.
*/
function whenIdle(run: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 180 })
  else window.setTimeout(run, 32)
}

const IN_MS = 240
const OUT_MS = 180
/** After the move has arrived, a moment before the comments are drawn, so their first frame is not the move's last. */
const SETTLE_MS = 80
/** The open counts as arrived after this at the latest, even when its animation was cancelled (a finger on the sheet). */
export const SETTLE_LATEST_MS = 650
/** The panel's scrollbar: thin, a light grey thumb, no track (standard properties, and WebKit's own for Safari). */
export const SLIM_SCROLL =
  "[scrollbar-width:thin] [scrollbar-color:#d3d6db_transparent] [&::-webkit-scrollbar]:w-[8px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-white [&::-webkit-scrollbar-thumb]:bg-[#d3d6db] hover:[&::-webkit-scrollbar-thumb]:bg-[#b9bdc4]"

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
  /**
   * False when the address is already this post (a shared link opened over
   * the feed). Pushing another history entry would make Back land on the
   * post page again.
   */
  history?: boolean
  /** The card the post was opened from: on a phone the post grows out of it and goes back into it (post-fullscreen.tsx). */
  origin?: () => HTMLElement | null
}

export function PostOverlay({ post: given, slug, viewer, readOnly = false, update, onClose, renderPost, history = true, origin }: PostOverlayProps) {
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
  const close = useCallback(() => {
    setOpen(false)
  }, [])
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
  useHistoryLayer(history, close, postPath(slug, given), open)

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
  /* THE COMMENTS ALWAYS COME: arrived at the latest after SETTLE_LATEST_MS, whatever happened to the move. */
  useEffect(() => {
    const t = window.setTimeout(() => setPhase((p) => (p === "in" ? "shown" : p)), SETTLE_LATEST_MS)
    return () => window.clearTimeout(t)
  }, [])

  /* The post again from the server, and seen. */
  useEffect(() => {
    if (!settled || phase === "out" || !open) return
    markSeen(given.communityId, viewer.userId, given)
    let stop = false
    void (async () => {
      const r = await api<{ post: FeedPostView }>(`${apiBase(given.communityId)}/posts/${given.id}`)
      if (stop || !r.ok) return
      /* A like or a save pressed while this was read stays as pressed (post-intent.ts). */
      const like = intentOf(`like:${given.id}`)
      const save = intentOf(`save:${given.id}`)
      const fresh: FeedPostView = { ...r.data.post, ...(like ? { reacted: like.on, reactionCount: like.count } : {}), ...(save ? { bookmarked: save.on } : {}) }
      /* After the slide, and when the page is idle, so the swap does not hitch a finger that is still on the sheet. */
      const apply = () => {
        if (stop) return
        setPost(fresh)
        update(given.id, (p) => ({ ...p, ...fresh }))
      }
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(apply, { timeout: 400 })
      else window.setTimeout(apply, 32)
    })()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given.id, settled, phase, open])

  /*
    THE PAGE UNDER IT STAYS STILL. On a phone, held for as long as the sheet is open, before the first frame is painted (set
    after it, the page's restyle landed on the second frame of the move, 50ms at 4x CPU). On a computer the page's scrollbar
    stays where it is (THE PAGE NEVER SHIFTS): the panel takes the wheel over the scrim (PostPanel).
  */
  /*
    NO OVERFLOW LOCK ON <html>. It was `overflow: hidden` on the document for as long as the sheet was up, and on iOS a document
    whose overflow is turned off and back on keeps its scroll view stuck for a moment after: the feed would not move for a few
    seconds after a swipe down closed a post (the pull to refresh found the same and stopped doing it, hooks/use-pull-
    to-refresh.ts). Nothing needs it: the sheet covers the page, its scrim refuses a drag (bottom-sheet.tsx), and its own
    scroller does not chain. Only the overscroll is held, so a pull past the sheet's top cannot become the browser's Back.
  */
  useLayoutEffect(() => {
    if (!phone) return
    const html = document.documentElement
    const prevOverscroll = html.style.overscrollBehavior
    html.style.overscrollBehavior = "none"
    return () => {
      html.style.overscrollBehavior = prevOverscroll
    }
  }, [phone])

  /* On a phone the composer floats at the page's foot (comments.tsx floatComposer); the computer's panel still scrolls the field into view. */
  useKeepFieldInSight(!phone, () => contentRef.current?.closest<HTMLElement>("[data-post-overlay-scroll]") ?? contentRef.current?.closest<HTMLElement>("[data-sheet-scroll]") ?? null)

  const onComment = useCallback(() => {
    const el = box.current
    if (el) el.focus()
    else contentRef.current?.querySelector("[data-comments-list]")?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [])

  /* Drawn once per change of the post, not once per step of the slide. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => renderPost(post, local, onComment), [post, local, onComment])
  if (typeof document === "undefined") return null

  return <OverlayFrame phone={phone} post={post} open={open} phase={phase} setPhase={setPhase} close={close} onGone={() => onCloseRef.current()} contentRef={contentRef} origin={origin} content={<OverlayContent drawn={drawn} settled={settled} post={post} slug={slug} viewer={viewer} readOnly={readOnly} box={box} local={local} pinComposer={phone} />} />
}

/*
  THE POST AND ITS COMMENTS DRAWN ONCE PER CHANGE OF THEM, not again when the
  overlay starts to close: a close that drew every comment again (each with
  its menu) cost the first frames of its own slide.
*/
const OverlayContent = memo(function OverlayContent({ drawn, settled, post, slug, viewer, readOnly, box, local, pinComposer }: { drawn: React.ReactNode; settled: boolean; post: FeedPostView; slug: string; viewer: ViewerView; readOnly: boolean; box: React.RefObject<MentionTextareaHandle | null>; local: PostUpdateFn; pinComposer: boolean }) {
  return (
    <>
      {/* The post whole, without a card's edge: the panel is the card. */}
      <div className="[&>article]:mx-0 [&>article]:w-auto [&>article]:overflow-visible [&>article]:rounded-none [&>article]:border-0 [&>article]:shadow-none" data-post-overlay-post="">
        {drawn}
      </div>
      <section id="comments" className={`mt-1 border-t border-[#f0f1f3] px-4 pt-4 sm:px-5 ${pinComposer ? "flex flex-1 flex-col pb-0" : "pb-6"}`} aria-label="Comments" data-comments="">
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
            pinComposer={pinComposer}
            floatComposer={pinComposer}
            onCount={(d) => local(post.id, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
          />
        ) : (
          <CommentsPlaceholder expected={post.commentCount} pinComposer={pinComposer} />
        )}
      </section>
    </>
  )
})

function OverlayFrame({ phone, post, open, phase, setPhase, close, onGone, contentRef, content, origin }: { phone: boolean; post: FeedPostView; open: boolean; phase: "in" | "shown" | "out"; setPhase: React.Dispatch<React.SetStateAction<"in" | "shown" | "out">>; close: () => void; onGone: () => void; contentRef: React.RefObject<HTMLDivElement | null>; content: React.ReactNode; origin?: () => HTMLElement | null }) {
  if (phone) {
    /* A phone: the card grows into a full screen page and goes back into it (post-fullscreen.tsx, round 19). */
    return (
      <PostFullscreen
        open={open}
        label={post.title || "Post"}
        title={post.space?.name ?? "Post"}
        origin={origin}
        onRequestClose={close}
        onShown={() => setPhase((p) => (p === "in" ? "shown" : p))}
        /* The post and its comments are taken down, and the history step given back, once the morph is over and the page is idle. */
        onGone={() => whenIdle(onGone)}
        contentRef={contentRef}
      >
        {content}
      </PostFullscreen>
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
    const a = panel.animate([{ opacity: fromOpacity, translate: fromAt }, { opacity: 0, translate: "0 12px" }], { duration: OUT_MS, easing: SHEET_CLOSE_EASE, fill: "forwards" })
    scrim.animate([{ opacity: scrimFrom }, { opacity: 0 }], { duration: OUT_MS, easing: "ease-out", fill: "forwards" })
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

  /* A wheel over the scrim (or the panel's header) is not the page's: it would scroll the feed under the post. */
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      const scroller = (e.target as HTMLElement | null)?.closest?.("[data-post-overlay-scroll]")
      if (!scroller) e.preventDefault()
    }
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => root.removeEventListener("wheel", onWheel)
  }, [])

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

  const live = open && phase !== "out"
  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[130]" data-post-overlay-root="" style={live ? undefined : { pointerEvents: "none" }}>
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-[#0f1115]/35" onClick={live ? close : undefined} data-post-overlay-scrim="" style={live ? undefined : { pointerEvents: "none" }} />
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden px-6 pt-10 sm:pt-12">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title || "Post"}
          /* A sheet's mark: the document's `:has([role=dialog][aria-modal])` rules leave it out, so opening and closing a post no longer restyles the whole page. */
          data-sheet-root=""
          data-post-overlay="panel"
          data-post-overlay-phase={phase}
          className={`relative flex max-h-[calc(100dvh-72px)] w-full max-w-[760px] flex-col self-start overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_24px_64px_-20px_rgba(17,24,39,0.35),0_2px_8px_rgba(17,24,39,0.06)] ${live ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#f0f1f3] pl-5 pr-2">
            <span className="min-w-0 truncate text-[13.5px] font-medium text-[#6b7280]">{space ? `Posted in ${space}` : "Post"}</span>
            <button type="button" onClick={close} aria-label="Close post" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-post-overlay-close="">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={contentRef} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${SLIM_SCROLL}`} data-post-overlay-scroll="">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
