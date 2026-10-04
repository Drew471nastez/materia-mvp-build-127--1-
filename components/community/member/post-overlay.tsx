"use client"

/**
 * ===========================================================================
 *  A POST OPENED OVER THE FEED
 * ===========================================================================
 * Pressing a card opens its post where the member is: on a computer a
 * panel over the feed (the feed stays where it was under a light scrim), on
 * a phone a screen of its own that slides up. The address becomes the
 * post's own (/community/<slug>/post/<id>) without loading a page, so a
 * reload or a shared link lands on the post page; Back, Escape, the close
 * button, a press on the scrim or a swipe down on the phone's bar close it
 * (one step of history, useHistoryLayer).
 *
 * The card's post is drawn at once, then read again from the server (a
 * count may have moved) with its comments under it (comments.tsx). Likes,
 * saves, edits and deletes made here reach the card underneath through the
 * feed's own update, so closing shows the list as it now is.
 *
 * The open and close are opacity and translate only (no scale: a scaled
 * layer is drawn again at its final size when the move ends, which cost a
 * frame), 220ms in and 180ms out, and a plain fade with reduced motion.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X } from "lucide-react"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { CommentsSection } from "./comments"
import { useHistoryLayer } from "./lightbox"
import type { MentionTextareaHandle } from "./mention-input"
import { intentOf } from "./post-intent"
import { markSeen } from "./post-seen"

const IN_MS = 220
const OUT_MS = 180

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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
  }, [])
  return reduced
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
  const reduced = useReducedMotion()
  const [post, setPost] = useState(given)
  const [phase, setPhase] = useState<"in" | "shown" | "out">("in")
  const [pull, setPull] = useState(0)
  const box = useRef<MentionTextareaHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)
  const drag = useRef<{ y: number; at: number } | null>(null)

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
  const close = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    setPhase("out")
    window.setTimeout(() => onCloseRef.current(), reduced ? 0 : OUT_MS)
  }, [reduced])

  useHistoryLayer(true, close, `/community/${slug}/post/${given.id}`)

  /* In on the next frame, so the first frame is the closed one. */
  useLayoutEffect(() => {
    let b = 0
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setPhase((p) => (p === "in" ? "shown" : p)))
    })
    return () => {
      cancelAnimationFrame(a)
      cancelAnimationFrame(b)
    }
  }, [])

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
    const t = window.setTimeout(() => setSettled(true), reduced ? 0 : IN_MS + 80)
    return () => window.clearTimeout(t)
  }, [phase, reduced])

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog], [data-state=open][role=dialog]:not([data-post-overlay])")) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  /* The page under it stays still, once for as long as it is open; the scrollbar's width is kept so nothing shifts sideways. */
  useEffect(() => {
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

  const onComment = useCallback(() => {
    const el = box.current
    if (el) el.focus()
    else scroller.current?.querySelector("[data-comments-list]")?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [])

  /* A swipe down on the phone's bar closes it. */
  const onBarDown = (e: React.PointerEvent) => {
    if (!phone || (e.target as HTMLElement).closest("button")) return
    drag.current = { y: e.clientY, at: performance.now() }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onBarMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setPull(Math.max(0, e.clientY - drag.current.y))
  }
  const onBarUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    const fast = dy / Math.max(1, performance.now() - drag.current.at) > 0.6
    drag.current = null
    if (dy > 110 || (fast && dy > 30)) close()
    else setPull(0)
  }

  const shown = phase === "shown"
  const ms = reduced ? 0 : phase === "out" ? OUT_MS : IN_MS

  /* Drawn once per change of the post, not once per step of the slide. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => renderPost(post, local, onComment), [post, local, onComment])
  if (typeof document === "undefined") return null
  const content = (
    <>
      {/* The post whole, without a card's edge: the panel is the card. */}
      <div className="[&>article]:rounded-none [&>article]:border-0 [&>article]:shadow-none" data-post-overlay-post="">
        {drawn}
      </div>
      <section id="comments" className="mt-1 border-t border-[#f0f1f3] px-4 pb-6 pt-4 sm:px-5" aria-label="Comments" data-comments="">
        {settled ? (
          <CommentsSection post={post} slug={slug} viewer={viewer} initial={null} readOnly={readOnly} boxRef={box} onCount={(d) => local(post.id, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))} />
        ) : (
          <div className="flex items-center gap-2.5" aria-hidden>
            <span className="h-8 w-8 shrink-0 rounded-full bg-[#f1f2f4]" />
            <span className="h-11 flex-1 rounded-2xl border border-[#eceef1]" />
          </div>
        )}
      </section>
    </>
  )

  if (phone) {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={post.title || "Post"}
        data-post-overlay="phone"
        data-post-overlay-phase={phase}
        className="fixed inset-x-0 top-[var(--vv-top,0px)] z-[130] flex h-[var(--vv-h,100dvh)] flex-col bg-white"
        style={{
          willChange: settled && !pull ? undefined : "translate",
          translate: shown ? `0 ${pull}px` : reduced ? "0 0" : "0 100%",
          opacity: reduced && !shown ? 0 : 1,
          transition: pull ? "none" : reduced ? `opacity ${ms}ms ease-out` : `translate ${ms}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        <div className="shrink-0 touch-none border-b border-[#f0f1f3] pt-[env(safe-area-inset-top)]" onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp} data-post-overlay-bar="">
          <div className="flex h-12 items-center gap-1 px-1.5">
            <button type="button" onClick={close} aria-label="Close post" className="flex h-10 w-10 items-center justify-center rounded-full text-[#1a1a2e] outline-none active:bg-[#f1f2f4]" data-post-overlay-close="">
              <ChevronDown className="h-6 w-6" strokeWidth={2} />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-[#1a1a2e]">{post.space?.name ?? "Post"}</span>
            <span className="w-10" aria-hidden />
          </div>
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]" data-post-overlay-scroll="">
          {content}
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[130]" data-post-overlay-root="">
      <div aria-hidden className="absolute inset-0 bg-[#0f1115]/35" style={{ opacity: shown ? 1 : 0, transition: `opacity ${ms}ms ease-out` }} onClick={close} data-post-overlay-scrim="" />
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden px-6 pt-10 sm:pt-12">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={post.title || "Post"}
          data-post-overlay="panel"
          data-post-overlay-phase={phase}
          className="pointer-events-auto relative flex max-h-[calc(100dvh-72px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_24px_64px_-20px_rgba(17,24,39,0.35),0_2px_8px_rgba(17,24,39,0.06)]"
          style={{
            willChange: settled ? undefined : "opacity, translate",
            opacity: shown ? 1 : 0,
            translate: shown || reduced ? "0 0" : "0 16px",
            transition: `opacity ${ms}ms ease-out, translate ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
          }}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#f0f1f3] pl-5 pr-2">
            <span className="min-w-0 truncate text-[13.5px] font-medium text-[#6b7280]">{post.space ? `Posted in ${post.space.name}` : "Post"}</span>
            <button type="button" onClick={close} aria-label="Close post" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-post-overlay-close="">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-post-overlay-scroll="">
            {content}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
