"use client"

/**
 * ===========================================================================
 *  AN INSTAGRAM POST ON THE PAGE, WITH ITS HEIGHT UNDER CONTROL (round AL)
 * ===========================================================================
 * The owner: the Instagram embeds were "failing", and nothing controlled
 * where their "View full post" button sat. What it was:
 *
 *   THE CUT      the post was clipped at 380px whatever its width, so at a
 *                computer's width the photo was cut through the middle, and
 *                on a phone the cut fell anywhere. It was also clipped before
 *                Instagram had said how tall the post is, so a short post was
 *                cut too, with a button promising more that was not there.
 *   THE BUTTON   a bordered strip under the post in the page's text colour,
 *                a separate thing from the post it opened, drawn whatever the
 *                post's height, in a sheet and in a carousel too.
 *   EXPANDED     "View full post" took the cap away but the frame kept the
 *                height it was first given until Instagram spoke again, so
 *                the post could open still cut.
 *
 * Now the post is laid out in Instagram's own units: the frame is drawn at a
 * width Instagram supports (326 to 540px) and scaled to the column, so the
 * height Instagram says is the height drawn, times the scale. Folded, it
 * shows the account line and the picture (up to 4:5) and fades into the
 * card's white, with "View full post" sitting on that fade, inside the post's
 * own edge. A post no taller than that is shown whole with no button. Open,
 * it is exactly as tall as Instagram says, and "Show less" folds it back,
 * keeping its top on screen.
 *
 * In a sheet (components/onepage/block-sheet) the post is always whole: the
 * sheet scrolls, the post does not, and there is no button.
 *
 * The same component draws it everywhere: the Embed block, a link shown as
 * the post (components/onepage/block-presentation), and the posts block in
 * a list, a grid or a carousel (components/onepage/storelib-blocks), in the
 * editor's preview and on the live page.
 */

import { useContext, useEffect, useRef, useState } from "react"
import { embedHeightFromMessage } from "@/lib/onepage/creator-blocks"
import { tt } from "@/lib/i18n/text"
import { nextEmbedHeight, rememberEmbedHeight, rememberedEmbedHeight } from "./embed-frame"
import { InBlockSheetContext } from "./block-sheet"

/** The narrowest and widest Instagram draws its card. */
export const INSTAGRAM_MIN_WIDTH = 326
export const INSTAGRAM_MAX_WIDTH = 540
/** The account line above the picture, in Instagram's units. */
const HEAD = 60
/** Shown this long after load even if Instagram never says its height. */
const SHOW_AFTER_LOAD_MS = 900

/** The width the frame is drawn at for a column, in Instagram's units. */
export function instagramFrameWidth(column: number): number {
  return Math.max(INSTAGRAM_MIN_WIDTH, Math.min(INSTAGRAM_MAX_WIDTH, Math.round(column)))
}

/** How tall a folded post is, in Instagram's units: the account line and a picture up to 4:5. */
export function instagramFoldHeight(frameWidth: number): number {
  return Math.round(HEAD + frameWidth * 1.25)
}

/** A post taller than its fold by more than this has more to show; less, and it is shown whole. */
export const FOLD_SLACK = 32

/**
 * The height drawn, in Instagram's units, and whether a button is drawn. Pure, for the tests.
 * `said` is what Instagram said (null until it has), `estimate` the usual height until then.
 */
export function instagramBox(frameWidth: number, said: number | null, open: boolean, whole: boolean): { height: number; folds: boolean } {
  const fold = instagramFoldHeight(frameWidth)
  const full = said ?? Math.round(fold + 150)
  /* Until Instagram has said, nothing is promised: folded at most to the fold, and no button yet. */
  const folds = !whole && said !== null && said > fold + FOLD_SLACK
  if (whole || (open && said !== null)) return { height: full, folds }
  return { height: Math.min(full, fold), folds }
}

export function CompactInstagramPost({
  src,
  title = "Instagram post",
  radius = 16,
  whole: wholeProp,
}: {
  src: string
  title?: string
  radius?: number
  /** Always the whole post (a sheet sets it for everything inside). */
  whole?: boolean
}) {
  const inSheet = useContext(InBlockSheetContext)
  const whole = wholeProp ?? inSheet
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [column, setColumn] = useState<number | null>(null)
  const [said, setSaid] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState(false)

  /* The column's width, kept current: the frame's width and scale follow it. */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const read = () => setColumn(Math.round(el.clientWidth))
    read()
    if (typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* What this browser saw last time, read after the first render so the server's markup and the first client render agree. */
  useEffect(() => {
    const r = rememberedEmbedHeight(src)
    if (r) setSaid(r)
  }, [src])

  useEffect(() => {
    let first = true
    let settle: number | null = null
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return
      const m = embedHeightFromMessage("instagram", e.origin, e.data)
      if (!m) return
      const apply = () => {
        const isFirst = first
        first = false
        setSaid((cur) => nextEmbedHeight(cur, m, isFirst))
        rememberEmbedHeight(src, m)
        setShown(true)
      }
      if (settle) window.clearTimeout(settle)
      if (first) apply()
      else settle = window.setTimeout(apply, 120)
    }
    window.addEventListener("message", onMessage)
    return () => {
      window.removeEventListener("message", onMessage)
      if (settle) window.clearTimeout(settle)
    }
  }, [src])

  const width = instagramFrameWidth(column ?? INSTAGRAM_MAX_WIDTH)
  const scale = column ? column / width : 1
  const box = instagramBox(width, said, open, whole)
  const folded = box.folds && !open
  const r = Math.max(0, Math.min(radius, 16))

  const fold = () => {
    setOpen(false)
    /* The top of the post back on screen if folding it took the page past it. */
    const el = wrapRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <div className="mx-auto w-full" data-compact-post="" data-post-folded={folded ? "" : undefined} data-post-whole={whole ? "" : undefined}>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-white [contain:layout_paint] motion-safe:transition-[height] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ height: Math.ceil(box.height * scale), borderRadius: r }}
        data-post-box=""
      >
        <div aria-hidden className="absolute inset-0 animate-pulse bg-[rgba(127,127,127,0.12)] transition-opacity duration-200 motion-reduce:animate-none" style={{ opacity: shown ? 0 : 1 }} />
        <iframe
          ref={frameRef}
          title={title}
          src={src}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
          allowFullScreen
          /* As tall as its document once Instagram has said: it never scrolls inside itself. */
          scrolling="no"
          onLoad={() => window.setTimeout(() => setShown(true), SHOW_AFTER_LOAD_MS)}
          className="absolute left-0 top-0 block border-0 bg-transparent transition-opacity duration-200"
          style={{
            width,
            height: said ?? box.height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: "0 0",
            colorScheme: "normal",
            opacity: shown ? 1 : 0,
          }}
        />
        {folded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center bg-gradient-to-b from-white/0 via-white/85 to-white pb-3" data-post-fade="">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={false}
              data-post-more=""
              className="pointer-events-auto flex h-9 items-center rounded-full bg-[#111113] px-4 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[#111113] focus-visible:ring-offset-2"
            >
              {tt("View full post")}
            </button>
          </div>
        ) : null}
      </div>
      {box.folds && open ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={fold}
            aria-expanded
            data-post-less=""
            className="flex h-9 items-center rounded-full bg-[#111113] px-4 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[#111113] focus-visible:ring-offset-2"
          >
            {tt("Show less")}
          </button>
        </div>
      ) : null}
    </div>
  )
}
