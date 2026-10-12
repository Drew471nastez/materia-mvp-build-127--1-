"use client"

/**
 * ===========================================================================
 *  THE COVER, IN THE FRAME THAT CROPS IT, UNDER A FINGER
 * ===========================================================================
 * "Zoom in / zoom out should work on phones. Make it work by touch fingers,
 *  no sliders." And: "the cover banner image is glitching sometimes."
 *
 * One finger moves the picture, two pinch it, a double tap zooms in or back
 * out. On a desktop a mouse drags, a trackpad pinch (which the browser sends
 * as a wheel with ctrl held, or as Safari's gesture events) zooms, and the
 * arrow keys and + and - do both from the keyboard.
 *
 * WHAT THE GLITCHING WAS, and what replaced each part:
 *
 *   EVERY MOVE WAS A RENDER OF THE WHOLE SHEET. The old drag called the
 *   parent's setState on each pointermove, so the profile form, the scheme
 *   picker and eight social fields re-rendered sixty times a second under
 *   the finger. Now a move writes one transform, once per frame, and React
 *   hears about the gesture once, when the last finger lifts.
 *
 *   THE FRAME CHANGED SHAPE AS THE SHEET OPENED. Its aspect started at a
 *   fallback and was corrected by an effect after the first paint, so the
 *   picture jumped while the sheet was still sliding. use-cover-aspect
 *   measures before paint now.
 *
 *   THE PICTURE WAS A LAZY next/image AT 100vw. A lazy image inside a sheet
 *   that starts below the screen starts loading when the sheet arrives, and
 *   pops in mid-slide; and after a save the frame swapped to a different
 *   element and loaded the picture again. It is one plain <img>, eager, at
 *   one URL for the life of the frame, decoded before it is shown.
 *
 * THE FRAME OWNS ITS TOUCHES. `touch-action: none` on the frame and nowhere
 * else, and `data-sheet-no-drag`, which the phone sheet reads at touchdown,
 * so a pinch never scrolls the form or pulls the sheet down.
 *
 * NOT INSIDE A `.group`. app/globals.css strips `transform` from everything
 * inside a `.group` on a touch screen, which is exactly where this has to
 * move a picture.
 */

import * as React from "react"

import {
  DEFAULT_COVER_CROP,
  clampPercent,
  coverCropStyle,
  cropFromGesture,
  cropFromTransform,
  imageRectStyle,
  roundCrop,
  transformBetween,
  zoomAbout,
  type CoverCrop,
  type Pointer,
  type Size,
} from "@/lib/images/cover-crop"
import { SHEET_EASE } from "@/components/ui/bottom-sheet"
import { tt } from "@/lib/i18n/text"

/** A finger has to travel this far before a press becomes a drag. */
const SLOP_PX = 4
/** Two taps this close in time and space are a double tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 24
/** The zoom a double tap goes to from 1. */
const DOUBLE_TAP_ZOOM = 2
/** A trackpad or wheel pinch is committed once it has been still this long. */
const WHEEL_SETTLE_MS = 160

type GestureEvent = Event & { scale: number; clientX: number; clientY: number }

export interface CoverCropFrameProps {
  /** What the <img> loads. One URL for the life of the frame. */
  src: string
  crop: CoverCrop
  /** Given: the frame is the editor. Absent: it is a picture, and `onActivate` is its press. */
  onChange?: (next: CoverCrop) => void
  onActivate?: () => void
  /** The shape of the band on the page, measured (use-cover-aspect). */
  aspect: number
  label: string
  /** The corner controls, drawn over the picture. */
  children?: React.ReactNode
  className?: string
}

export function CoverCropFrame({ src, crop, onChange, onActivate, aspect, label, children, className }: CoverCropFrameProps) {
  const editable = !!onChange
  const frameRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  /* The photograph's own shape, once it is known. Until then the frame draws
     the crop as a box (coverCropStyle), which looks the same and cannot be
     dragged, because a drag needs to know where the picture's edges are. */
  const [natural, setNatural] = React.useState<Size | null>(null)
  const [moving, setMoving] = React.useState(false)

  /* ── Refs, so a gesture never needs a render ──────────────────────── */
  const restRef = React.useRef<CoverCrop>(crop)
  const liveRef = React.useRef<CoverCrop>(crop)
  const naturalRef = React.useRef<Size | null>(null)
  const pointers = React.useRef(new Map<number, Pointer>())
  const baseRef = React.useRef<{ crop: CoverCrop; mid: Pointer; dist: number; frame: Size; origin: Pointer } | null>(null)
  const draggingRef = React.useRef(false)
  const rafRef = React.useRef<number | null>(null)
  const animRef = React.useRef<{ anim: Animation; target: CoverCrop } | null>(null)
  const lastTapRef = React.useRef<{ t: number; x: number; y: number } | null>(null)
  const downAtRef = React.useRef(0)
  const wheelTimer = React.useRef<number | null>(null)
  /*
    The latest props, for the handlers below. They are read at the moment a
    gesture ends rather than captured when a handler was made, so the
    handlers never have to be made again: a native listener re-bound in the
    middle of a trackpad pinch lost the timer that ends it.
  */
  const onChangeRef = React.useRef(onChange)
  const cropRef = React.useRef(crop)
  const aspectRef = React.useRef(aspect)
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange
    cropRef.current = crop
    aspectRef.current = aspect
  })

  /* The parent's value is the truth whenever no finger is down. */
  React.useLayoutEffect(() => {
    /*
      A value that arrives while a glide is still running came from outside
      it (Reset, say): the glide is abandoned, not finished, or its last
      frame would put back the crop that was just replaced.
    */
    const running = animRef.current
    if (running) {
      animRef.current = null
      running.anim.cancel()
      const img = imgRef.current
      if (img) { img.style.transform = ""; img.style.willChange = "" }
    }
    if (draggingRef.current) return
    restRef.current = crop
    liveRef.current = crop
  }, [crop])

  /** The photograph's own shape, once the browser knows both sides of it. */
  const readNatural = (img: HTMLImageElement | null): Size | null =>
    img && img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null

  /* A new picture: its shape is unknown until it loads. */
  React.useLayoutEffect(() => {
    const n = imgRef.current?.complete ? readNatural(imgRef.current) : null
    naturalRef.current = n
    setNatural(n)
  }, [src])

  const onLoad = () => {
    const n = readNatural(imgRef.current)
    if (!n) return
    naturalRef.current = n
    setNatural(n)
  }

  /**
   * The frame's inside, to the fraction of a pixel. Not clientWidth and
   * clientHeight: those are whole pixels, the frame's height is a ratio of
   * its width and almost never whole, and the picture is laid out in
   * percentages of the real size. Measured as whole pixels, a pinch drew
   * the picture a pixel and a half short of the frame's bottom edge, times
   * the zoom.
   */
  const frameBox = (): { w: number; h: number; x: number; y: number } | null => {
    const el = frameRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const bl = parseFloat(cs.borderLeftWidth) || 0
    const bt = parseFloat(cs.borderTopWidth) || 0
    const w = r.width - bl - (parseFloat(cs.borderRightWidth) || 0)
    const h = r.height - bt - (parseFloat(cs.borderBottomWidth) || 0)
    return w > 0 && h > 0 ? { w, h, x: r.left + bl, y: r.top + bt } : null
  }
  const frameSize = (): Size | null => {
    const b = frameBox()
    return b ? { w: b.w, h: b.h } : null
  }

  /** Write the picture where `live` puts it, relative to where it is laid out. */
  const paint = React.useCallback(() => {
    rafRef.current = null
    const img = imgRef.current
    const n = naturalRef.current
    const f = baseRef.current?.frame ?? frameSize()
    if (!img || !n || !f) return
    img.style.transform = transformBetween(f, n, restRef.current, liveRef.current)
  }, [])

  const schedule = React.useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint)
  }, [paint])

  /**
   * THE HAND-BACK. The laid-out position becomes the live one and the
   * transform goes, in the same frame, so the picture does not move; then the
   * parent is told, and its render writes the same numbers again.
   *
   * With nobody to tell (an upload started under the finger, so the frame
   * stopped being the editor), the picture goes back to the parent's crop:
   * what is on screen is never a crop that will not be saved.
   */
  const commit = React.useCallback((next: CoverCrop) => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const img = imgRef.current
    const n = naturalRef.current
    const current = cropRef.current
    const notify = onChangeRef.current
    const rounded = notify ? roundCrop(next) : current
    if (img) {
      Object.assign(img.style, n ? imageRectStyle(aspectRef.current, n.w / n.h, rounded) : coverCropStyle(rounded))
      img.style.transform = ""
      img.style.willChange = ""
    }
    restRef.current = rounded
    liveRef.current = rounded
    const changed = rounded.x !== current.x || rounded.y !== current.y || rounded.zoom !== current.zoom
    if (changed) notify?.(rounded)
  }, [])

  /**
   * A finger landing mid glide: the glide stops, and the picture stays
   * exactly where it had got to, read off the running transform.
   */
  const stopAnimation = React.useCallback(() => {
    const running = animRef.current
    if (!running) return
    animRef.current = null
    const img = imgRef.current
    const n = naturalRef.current
    const f = frameSize()
    let here = running.target
    if (img && n && f) {
      const t = getComputedStyle(img).transform
      if (t && t !== "none") {
        const m = new DOMMatrixReadOnly(t)
        here = cropFromTransform(f, n, restRef.current, { tx: m.m41, ty: m.m42, k: m.m11 })
      }
    }
    commit(here)
    running.anim.cancel()
    /* frameSize reads refs only. */
  }, [commit])

  /** A double tap, or a key: glide to `target` on the compositor, then hand back. */
  const glideTo = React.useCallback((target: CoverCrop) => {
    const img = imgRef.current
    const n = naturalRef.current
    const f = frameSize()
    if (!img || !n || !f) return
    const to = transformBetween(f, n, restRef.current, target)
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce || typeof img.animate !== "function") { commit(target); return }
    img.style.willChange = "transform"
    const a = img.animate([{ transform: img.style.transform || "none" }, { transform: to }], {
      duration: 260,
      easing: SHEET_EASE,
      fill: "forwards",
    })
    animRef.current = { anim: a, target }
    a.onfinish = () => {
      if (animRef.current?.anim !== a) return
      animRef.current = null
      commit(target)
      a.cancel()
    }
  }, [commit])

  /* ── Pointers: one finger drags, two pinch ─────────────────────────── */
  const rebase = () => {
    const b = frameBox()
    if (!b) { baseRef.current = null; return }
    const f = { w: b.w, h: b.h }
    const pts = [...pointers.current.values()].slice(0, 2)
    if (!pts.length) { baseRef.current = null; return }
    const origin = { x: b.x, y: b.y }
    const mid = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length - origin.x,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length - origin.y,
    }
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    baseRef.current = { crop: liveRef.current, mid, dist, frame: f, origin }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return
    if (e.pointerType === "mouse" && e.button !== 0) return
    if ((e.target as HTMLElement).closest("button")) return
    stopAnimation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable; moves still arrive */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      downAtRef.current = performance.now()
      draggingRef.current = false
    }
    rebase()
    if (pointers.current.size > 1) startMoving()
    e.preventDefault()
  }

  const startMoving = () => {
    if (draggingRef.current) return
    draggingRef.current = true
    if (imgRef.current) imgRef.current.style.willChange = "transform"
    setMoving(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const base = baseRef.current
    const n = naturalRef.current
    if (!base || !n) return
    const pts = [...pointers.current.values()].slice(0, 2)
    const mid = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length - base.origin.x,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length - base.origin.y,
    }
    if (!draggingRef.current) {
      if (Math.hypot(mid.x - base.mid.x, mid.y - base.mid.y) < SLOP_PX) return
      startMoving()
    }
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    liveRef.current = cropFromGesture(base.frame, n, base.crop, { mid: base.mid, dist: base.dist }, { mid, dist })
    schedule()
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) {
      /* Two fingers to one: carry on from here with the one that is left. */
      rebase()
      return
    }
    baseRef.current = null
    if (draggingRef.current) {
      draggingRef.current = false
      setMoving(false)
      commit(liveRef.current)
      lastTapRef.current = null
      return
    }
    /* A tap. Two in a row zoom in on that spot, or back out. A cancel or a
       lost capture is not a tap: the system took the finger. */
    if (e.type !== "pointerup") return
    const now = performance.now()
    if (now - downAtRef.current > 400) { lastTapRef.current = null; return }
    const last = lastTapRef.current
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX) {
      lastTapRef.current = null
      const b = frameBox()
      const n = naturalRef.current
      if (!b || !n) return
      const f = { w: b.w, h: b.h }
      const at = { x: e.clientX - b.x, y: e.clientY - b.y }
      const from = restRef.current
      glideTo(zoomAbout(f, n, from, (from.zoom > 1.05 ? 1 : DOUBLE_TAP_ZOOM) / from.zoom, at))
      return
    }
    lastTapRef.current = { t: now, x: e.clientX, y: e.clientY }
  }

  /* ── Wheel and Safari's trackpad gestures: native, non-passive ─────── */
  React.useEffect(() => {
    const el = frameRef.current
    if (!el || !editable) return
    const settle = () => {
      if (wheelTimer.current != null) window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null
        draggingRef.current = false
        setMoving(false)
        commit(liveRef.current)
      }, WHEEL_SETTLE_MS)
    }
    const local = (x: number, y: number): Pointer => {
      const b = frameBox()
      return b ? { x: x - b.x, y: y - b.y } : { x: 0, y: 0 }
    }
    const onWheel = (e: WheelEvent) => {
      /* A plain wheel scrolls the form. Only a pinch (ctrl, which is how a
         trackpad pinch arrives) or a deliberate cmd/ctrl + wheel zooms. */
      if (!e.ctrlKey && !e.metaKey) return
      const f = frameSize()
      const n = naturalRef.current
      if (!f || !n) return
      e.preventDefault()
      stopAnimation()
      /* A trackpad pinch arrives as many small deltas that are close to a
         hundred times the log of the scale; one wheel notch is a hundred or
         more in one go, so a single event is held to half an e-fold. */
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? f.h : 1
      const delta = Math.max(-50, Math.min(50, e.deltaY * unit))
      const factor = Math.exp(-delta / 100)
      if (!draggingRef.current) startMoving()
      liveRef.current = zoomAbout(f, n, liveRef.current, factor, local(e.clientX, e.clientY))
      schedule()
      settle()
    }
    let gestureStart: CoverCrop | null = null
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      /* On a touch screen the pointers already carry the pinch. */
      if (pointers.current.size > 0) return
      stopAnimation()
      gestureStart = liveRef.current
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      if (pointers.current.size > 0 || !gestureStart) return
      const g = e as GestureEvent
      const f = frameSize()
      const n = naturalRef.current
      if (!f || !n) return
      if (!draggingRef.current) startMoving()
      liveRef.current = zoomAbout(f, n, gestureStart, g.scale || 1, local(g.clientX, g.clientY))
      schedule()
    }
    const onGestureEnd = (e: Event) => {
      e.preventDefault()
      if (!gestureStart) return
      gestureStart = null
      settle()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("gesturestart", onGestureStart)
    el.addEventListener("gesturechange", onGestureChange)
    el.addEventListener("gestureend", onGestureEnd)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("gesturestart", onGestureStart)
      el.removeEventListener("gesturechange", onGestureChange)
      el.removeEventListener("gestureend", onGestureEnd)
      /* A pinch still settling is finished now, not dropped with its timer. */
      if (wheelTimer.current != null) {
        window.clearTimeout(wheelTimer.current)
        wheelTimer.current = null
        if (pointers.current.size === 0) {
          draggingRef.current = false
          setMoving(false)
          commit(liveRef.current)
        }
      }
    }
    /* Every handler reads refs (see onChangeRef), so only `editable` re-binds them. */
  }, [editable, commit, schedule, stopAnimation])

  React.useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    animRef.current?.anim.cancel()
    animRef.current = null
  }, [])

  /* ── The keyboard way in ───────────────────────────────────────────── */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editable) {
      if (onActivate && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault()
        onActivate()
      }
      return
    }
    const f = frameSize()
    const n = naturalRef.current
    if (!f || !n) return
    stopAnimation()
    const c = restRef.current
    const STEP = 2
    let next: CoverCrop | null = null
    switch (e.key) {
      case "ArrowLeft": next = { ...c, x: clampPercent(c.x - STEP) }; break
      case "ArrowRight": next = { ...c, x: clampPercent(c.x + STEP) }; break
      case "ArrowUp": next = { ...c, y: clampPercent(c.y - STEP) }; break
      case "ArrowDown": next = { ...c, y: clampPercent(c.y + STEP) }; break
      case "+": case "=": next = zoomAbout(f, n, c, 1.15); break
      case "-": case "_": next = zoomAbout(f, n, c, 1 / 1.15); break
      case "0": next = DEFAULT_COVER_CROP; break
    }
    if (!next) return
    e.preventDefault()
    commit(next)
  }

  const imgStyle: React.CSSProperties = natural
    ? imageRectStyle(aspect, natural.w / natural.h, crop)
    : coverCropStyle(crop)

  return (
    <div
      ref={frameRef}
      role={editable ? "group" : onActivate ? "button" : undefined}
      tabIndex={editable || onActivate ? 0 : undefined}
      aria-label={editable ? tt("{label}. Drag to move it, pinch or use + and - to zoom, arrow keys to nudge.", { label }) : label}
      data-cover-crop-frame=""
      data-sheet-no-drag={editable ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      /* A capture the browser takes away without an up or a cancel would
         leave a finger in the map for good, and the next touch would pinch
         against it. */
      onLostPointerCapture={onPointerEnd}
      onClick={!editable && onActivate ? (e) => { if (!(e.target as HTMLElement).closest("button")) onActivate() } : undefined}
      onKeyDown={onKeyDown}
      /*
        SIDEWAYS, NEVER MORE THAN 30% OF THE SCREEN TALL. The frame keeps
        every touch that starts on it, and on a phone turned sideways a frame
        the width of the sheet was taller than most of the form's scroller,
        so the form could hardly be scrolled. In landscape it is capped by
        height, its width following from the band's shape so the crop is
        unchanged, and centred. Upright, and in a desktop window of any
        ordinary height, the cap is never reached.
      */
      className={`relative mx-auto w-full landscape:max-w-[calc(30vh*var(--cover-aspect))] select-none overflow-hidden rounded-lg bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        editable ? (moving ? "cursor-grabbing" : "cursor-grab") : onActivate ? "cursor-pointer" : ""
      } ${className ?? ""}`}
      style={{
        aspectRatio: String(aspect),
        ["--cover-aspect" as string]: String(aspect),
        /* The one element on the sheet that keeps every touch for itself. */
        touchAction: editable ? "none" : undefined,
        /* Nothing inside can change the size of anything outside. */
        contain: "layout paint",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- one URL for the life of the frame, decoded before it is drawn; see the note at the top */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        onLoad={onLoad}
        data-keep-transform=""
        className="pointer-events-none select-none"
        style={{ ...imgStyle, transformOrigin: "0 0" }}
      />
      {/*
        THE EDGE IS DRAWN OVER THE PICTURE, NOT AROUND IT. A real border
        takes two pixels out of the inside, and `aspect-ratio` sizes the
        border box, so the inside was never the band's shape: 2.05:1 against
        a 2.03:1 band, and a picture sized for the band came up a pixel and a
        half short of the bottom edge. With the line on top, the inside is
        exactly the band's shape.
      */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg border border-border" />
      {children}
    </div>
  )
}

