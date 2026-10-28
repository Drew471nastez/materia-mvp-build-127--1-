"use client"

/**
 * ===========================================================================
 *  ANOTHER SERVICE'S POST OR PLAYER, IN ITS OWN FRAME, WITHOUT A JUMP
 * ===========================================================================
 * The owner, round 40: "The X embed has shifted layouts; social media embeds
 * glitch in modals and show an extra container (a white panel beside the
 * embed)." What was happening, and what this does instead:
 *
 *   THE PANEL     the frame sat in a full width box with a grey fill. An X
 *                 post is at most 550px wide and an Instagram post 540px, so
 *                 on a wide page the box showed beside the post. Now the box
 *                 is the post's own width (EMBED_MAX_WIDTH), centred, with
 *                 no fill of its own: only the service's card shows.
 *   THE JUMP      the post grew from the usual height to its own a moment
 *                 after it drew, and X says its height several times while it
 *                 lays out, so everything under it moved more than once. Now
 *                 the frame is kept invisible over a quiet placeholder of the
 *                 usual height until the service has said its height (or a
 *                 moment after it loads), takes that height once, and only
 *                 follows a later change of more than a few pixels, settled.
 *                 The height it ended at is remembered on this browser, so
 *                 the next visit opens at it and nothing moves at all.
 *   IN A SHEET    a frame drawn while its sheet slid in could draw at the
 *                 sheet's first size; the frame is only shown once it has
 *                 loaded and measured, so the slide never shows it half drawn.
 *   THE THEME     on a dark page an X post is asked for X's own dark look
 *                 (lib/onepage/storelib-blocks isDarkColor; creator-blocks).
 *
 * ROUND 41, the owner: "Embeds such as Twitter have the corners cut and
 * still have the white bar on the right side". Three things of ours did it:
 *
 *   CORNERS       the box clipped the post at the page's button radius (up to
 *                 16px) while X draws its card at 12px, so the card's own
 *                 corner and border were cut. A post (X, Instagram) is no
 *                 longer clipped at all: its corners are the service's own.
 *                 Players (a video, a form) are still clipped, they are
 *                 square edged pictures that take the page's corners.
 *   THE STRIP     the frame was the column's width capped at 550 while the
 *                 card inside can be narrower, and anything of the frame
 *                 beside the card showed. X says the card's width with its
 *                 height (embedWidthFromMessage); the frame takes exactly it.
 *   THE CANVAS    a frame whose color-scheme is not its document's gets an
 *                 opaque canvas (white for X's light document) instead of a
 *                 transparent one. The frame says `color-scheme: normal`,
 *                 which is what X's and Instagram's documents use, whatever
 *                 the page around it declares, so the canvas stays see
 *                 through and only the card is drawn. X's own dark look is
 *                 asked for with &theme=dark (creator-blocks EmbedView).
 *
 * Lazy (loading="lazy"): a page with five posts opens as fast as one without.
 */

import * as React from "react"
import { embedHeightFromMessage, embedWidthFromMessage, type EmbedKind } from "@/lib/onepage/creator-blocks"

/** The widest each service draws its card. Wider than this, the service centres it in white. */
export const EMBED_MAX_WIDTH: Partial<Record<EmbedKind, number>> = { instagram: 540, x: 550 }

/** A post: a card the service draws with its own corners and border, never clipped by us. */
export function isPostEmbed(kind: EmbedKind): boolean {
  return kind === "x" || kind === "instagram"
}

/** The corner the placeholder takes before a post arrives: X's card is 12px, Instagram's 4px. */
export const POST_RADIUS: Partial<Record<EmbedKind, number>> = { x: 12, instagram: 4 }

/** A height change smaller than this, after the first, is the service settling, not the post changing. */
export const EMBED_SETTLE_PX = 4
/** Shown this long after load even if the service never says its height. */
const SHOW_AFTER_LOAD_MS = 900
const STORE_PREFIX = "storelib:embed-h:"

function remembered(src: string): number | null {
  try {
    const n = Number(window.localStorage.getItem(STORE_PREFIX + src))
    return Number.isFinite(n) && n > 40 && n < 4000 ? n : null
  } catch {
    return null
  }
}

function remember(src: string, h: number): void {
  try {
    window.localStorage.setItem(STORE_PREFIX + src, String(Math.round(h)))
  } catch {
    /* a private window: the next visit measures again */
  }
}

/**
 * The next height to draw, given what the frame said: the first measure is
 * taken whatever it is; after that, only a change bigger than the settle.
 * Pure, for the tests.
 */
export function nextEmbedHeight(current: number | null, measured: number, first: boolean): number {
  if (first || current === null) return measured
  return Math.abs(measured - current) > EMBED_SETTLE_PX ? measured : current
}

export function EmbedFrame({
  src,
  kind,
  title,
  height,
  resizes = false,
  radius,
  maxWidth,
}: {
  src: string
  kind: EmbedKind
  title: string
  /** The usual height, or null for a 16:9 box. */
  height: number | null
  /** The service says its own height (Instagram, X). */
  resizes?: boolean
  radius: number
  maxWidth?: number
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const [h, setH] = React.useState<number | null>(null)
  const [w, setW] = React.useState<number | null>(null)
  const post = isPostEmbed(kind)
  const [shown, setShown] = React.useState(false)
  const measuredOnce = React.useRef(false)
  const settle = React.useRef<number | null>(null)

  /* What this browser saw last time, read after the first render so the server's markup and the first client render agree. */
  React.useEffect(() => {
    if (!resizes) return
    const r = remembered(src)
    if (r) setH(r)
  }, [src, resizes])

  React.useEffect(() => {
    if (!resizes) return
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return
      const m = embedHeightFromMessage(kind, e.origin, e.data)
      if (!m) return
      const width = embedWidthFromMessage(kind, e.origin, e.data)
      if (width) setW((cur) => (cur === width ? cur : width))
      const first = !measuredOnce.current
      measuredOnce.current = true
      if (settle.current) window.clearTimeout(settle.current)
      /* The first answer at once (the frame is still hidden); later ones once the service has stopped changing its mind. */
      const apply = () => {
        setH((cur) => {
          const next = nextEmbedHeight(cur, m, first)
          if (next !== cur) remember(src, next)
          return next
        })
        setShown(true)
      }
      if (first) apply()
      else settle.current = window.setTimeout(apply, 120)
    }
    window.addEventListener("message", onMessage)
    return () => {
      window.removeEventListener("message", onMessage)
      if (settle.current) window.clearTimeout(settle.current)
    }
  }, [kind, resizes, src])

  const onLoad = () => {
    if (!resizes) {
      setShown(true)
      return
    }
    window.setTimeout(() => setShown(true), SHOW_AFTER_LOAD_MS)
  }

  const cornerRadius = post ? POST_RADIUS[kind] ?? 12 : radius
  const box: React.CSSProperties =
    height === null
      ? { aspectRatio: "16 / 9", borderRadius: radius, maxWidth }
      : {
          height: h ?? height,
          /* A post: exactly the card's width once the service has said it (X), else the column's, capped at the card's widest. */
          width: post && w ? w : undefined,
          maxWidth: post && w ? "100%" : maxWidth,
          transition: shown ? "height 180ms cubic-bezier(0.32,0.72,0,1)" : undefined,
          ...(post ? {} : { borderRadius: radius }),
        }

  return (
    <div
      data-embed-frame={kind}
      data-embed-shown={shown ? "" : undefined}
      /* A post is not clipped (its corners are the service's own); a player takes the page's corners. */
      className={post ? "relative mx-auto w-full bg-transparent [contain:layout]" : "relative mx-auto w-full overflow-hidden bg-transparent [contain:layout_paint]"}
      style={post && w ? { ...box, width: w } : box}
    >
      <div aria-hidden className="absolute inset-0 animate-pulse bg-[rgba(127,127,127,0.12)] transition-opacity duration-200 motion-reduce:animate-none" style={{ opacity: shown ? 0 : 1, borderRadius: cornerRadius }} />
      <iframe
        ref={frameRef}
        title={title}
        src={src}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
        allowFullScreen
        onLoad={onLoad}
        className="absolute inset-0 block h-full w-full border-0 bg-transparent transition-opacity duration-200"
        /* `normal` is the services' own scheme: matched, the frame's canvas stays transparent (see THE CANVAS). */
        style={{ colorScheme: "normal", opacity: shown ? 1 : 0 }}
      />
    </div>
  )
}
