"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * A photo, full size.
 *
 * Tapping a picture in a conversation and having nothing happen is the single
 * most obvious thing missing from a chat: half the photos people send are a
 * label, a stain or a serial number, and a 240px bubble is not enough to answer
 * the question they were sent to answer.
 *
 * Dismissed by dragging it down, the way every photo viewer on a phone is. The
 * image follows the finger, the black behind it thins as it goes, and letting go
 * past a threshold — or with any real speed — throws it away. Same decision rule
 * as the sheets elsewhere in the app, because a gesture that behaves differently
 * in two places is two gestures to learn.
 *
 * None of the drag goes through React: the transform and the backdrop's opacity
 * are written straight to the two nodes. Sixty state updates a second holding a
 * full-screen photograph is exactly the shape of a viewer that stutters.
 *
 * It also puts a real history entry behind itself, so the phone's back gesture
 * closes the picture rather than leaving the conversation. Opening a photo and
 * pressing back to find yourself in the inbox is the kind of thing that makes
 * people stop opening photos.
 */

const SPRING = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 320ms ease"
const DISMISS_AT = 110
const DISMISS_VELOCITY = 0.6
const MAX_SCALE = 4

type View = { scale: number; x: number; y: number }
const IDENTITY: View = { scale: 1, x: 0, y: 0 }

export function ImageViewer({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  /**
   * Where the picture is, in one object, written straight to the node.
   *
   * A zoom is two fingers changing three numbers sixty times a second. Through
   * React that is sixty renders of a full-screen photograph, which is precisely
   * how a viewer ends up feeling like a web page rather than a photo app — so
   * the transform is composed here and applied to the element, and React is only
   * told when the gesture ENDS and something durable has changed.
   */
  const view = useRef<View>({ ...IDENTITY })
  const [zoomed, setZoomed] = useState(false)

  const paint = useCallback((animate: boolean) => {
    const img = imgRef.current
    if (!img) return
    const v = view.current
    img.style.transition = animate ? SPRING : "none"
    img.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
  }, [])

  const setView = useCallback(
    (next: View, animate: boolean) => {
      // Clamped here rather than at every call site, so no gesture can leave the
      // picture smaller than the frame or dragged off the edge of it.
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale))
      const img = imgRef.current
      let { x, y } = next
      if (scale <= 1.001) {
        x = 0
        y = 0
      } else if (img) {
        // Past the edges there is nothing to look at, so panning stops where the
        // picture does.
        const maxX = ((scale - 1) * img.clientWidth) / 2
        const maxY = ((scale - 1) * img.clientHeight) / 2
        x = Math.max(-maxX, Math.min(maxX, x))
        y = Math.max(-maxY, Math.min(maxY, y))
      }
      view.current = { scale, x, y }
      paint(animate)
      setZoomed(scale > 1.001)
    },
    [paint],
  )

  /**
   * Where the picture actually is when a dismiss drag ends.
   *
   * A ref rather than state because it is written on every pointermove — sixty
   * times a second — and the only thing that ever reads it is the dismiss
   * animation, one frame later. Reset on every open so a viewer never inherits
   * the last one's ending position.
   */
  const drop = useRef({ x: 0, y: 0, scale: 1 })

  const settle = useCallback(
    (to: "open" | "gone") => {
      const img = imgRef.current
      const scrim = scrimRef.current
      if (!img || !scrim) return
      img.style.transition = SPRING
      scrim.style.transition = SPRING
      if (to === "open") {
        view.current = { ...IDENTITY }
        drop.current = { x: 0, y: 0, scale: 1 }
        img.style.transform = "translate3d(0, 0, 0) scale(1)"
        img.style.opacity = "1"
        scrim.style.opacity = "1"
      } else {
        // FROM WHERE THE FINGER LEFT IT, not from a canonical position.
        //
        // This used to animate to a fixed `translate3d(0, 60px)` whatever the
        // drag had done — so letting go 200px down snapped the photo back UP to
        // 60 and then faded it, and a flick sideways teleported it back to
        // centre first. That contradiction between the gesture and what follows
        // it is the whole of "it feels cheap": the picture stops being the
        // thing you were holding.
        //
        // Continuing 140px past wherever it already is, on the axis it was
        // already travelling, is what makes the release read as letting go of
        // something rather than as an animation starting.
        const from = drop.current
        img.style.transform = `translate3d(${from.x}px, ${from.y + 140}px, 0) scale(${Math.max(0.7, from.scale - 0.08)})`
        img.style.opacity = "0"
        scrim.style.opacity = "0"
      }
    },
    [],
  )

  const close = useCallback(() => {
    settle("gone")
    window.setTimeout(onClose, 260)
  }, [onClose, settle])

  useEffect(() => {
    if (!src) return
    setShown(true)
    view.current = { ...IDENTITY }
    setZoomed(false)
    const raf = requestAnimationFrame(() => settle("open"))
    return () => cancelAnimationFrame(raf)
  }, [src, settle])

  // The phone's back gesture closes the picture, not the conversation.
  useEffect(() => {
    if (!src) return
    window.history.pushState({ viewer: true }, "")
    const onPop = () => close()
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (window.history.state?.viewer) window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // ---- gestures -------------------------------------------------------------
  //
  // One pointer does two different jobs depending on whether the picture is
  // zoomed, and that is the whole design: at 1x a drag is "put this away",
  // zoomed in it is "look over there". Two pointers are always a pinch.
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    mode: "none" as "none" | "drag" | "pinch",
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    lastY: 0,
    lastT: 0,
    v: 0,
    dy: 0,
  })

  const centreOf = () => {
    const list = [...pts.current.values()]
    if (!list.length) return { x: 0, y: 0 }
    return {
      x: list.reduce((a, p) => a + p.x, 0) / list.length,
      y: list.reduce((a, p) => a + p.y, 0) / list.length,
    }
  }
  const spreadOf = () => {
    const list = [...pts.current.values()]
    if (list.length < 2) return 0
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y)
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const img = imgRef.current
    if (img) img.style.transition = "none"
    if (scrimRef.current) scrimRef.current.style.transition = "none"

    if (pts.current.size === 2) {
      g.mode = "pinch"
      g.startDist = spreadOf() || 1
      g.startScale = view.current.scale
      const c = centreOf()
      g.originX = c.x
      g.originY = c.y
      g.startX = view.current.x
      g.startY = view.current.y
      return
    }
    g.mode = "drag"
    g.startX = e.clientX
    g.startY = e.clientY
    g.originX = view.current.x
    g.originY = view.current.y
    g.lastY = e.clientY
    g.lastT = performance.now()
    g.v = 0
    g.dy = 0
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pts.current.has(e.pointerId)) return
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gesture.current
      const img = imgRef.current
      const scrim = scrimRef.current
      if (!img || !scrim) return

      if (g.mode === "pinch" && pts.current.size >= 2) {
        const dist = spreadOf() || 1
        const scale = g.startScale * (dist / g.startDist)
        const c = centreOf()
        // The point under the fingers stays under the fingers: without
        // anchoring, a pinch zooms towards the middle of the image and whatever
        // you were actually looking at slides away from you.
        setView(
          {
            scale,
            x: g.startX + (c.x - g.originX),
            y: g.startY + (c.y - g.originY),
          },
          false,
        )
        return
      }

      if (g.mode !== "drag") return
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY

      if (view.current.scale > 1.001) {
        // Zoomed: this is a pan, and there is nothing to dismiss.
        setView({ scale: view.current.scale, x: g.originX + dx, y: g.originY + dy }, false)
        return
      }

      const now = performance.now()
      const dt = now - g.lastT
      if (dt > 0) g.v = (e.clientY - g.lastY) / dt
      g.lastY = e.clientY
      g.lastT = now
      g.dy = dy

      // BOTH AXES. A dismiss drag that only moves vertically is a picture stuck
      // on a rail: your finger goes one way and the photo goes another, which
      // is the single clearest tell that a gesture is being interpreted rather
      // than followed. Every photo viewer worth the comparison lets it track
      // sideways too — it is the same picture, in your hand.
      //
      // Upward travel is damped to a third because there is nothing up there to
      // dismiss to; sideways is damped a little as well, so the drag still
      // reads as being ABOUT going down.
      const travel = dy < 0 ? dy * 0.3 : dy
      const slide = dx * 0.6
      const scale = Math.max(0.72, 1 - Math.abs(travel) / 1200)
      drop.current = { x: slide, y: travel, scale }
      img.style.transform = `translate3d(${slide}px, ${travel}px, 0) scale(${scale})`
      scrim.style.opacity = String(Math.max(0, 1 - Math.abs(travel) / 420))
    },
    [setView],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pts.current.delete(e.pointerId)
      const g = gesture.current
      if (pts.current.size === 1 && g.mode === "pinch") {
        // One finger lifted mid-pinch — carry on as a pan from where it is.
        const remaining = [...pts.current.values()][0]
        g.mode = "drag"
        g.startX = remaining.x
        g.startY = remaining.y
        g.originX = view.current.x
        g.originY = view.current.y
        return
      }
      if (pts.current.size > 0) return

      if (g.mode === "pinch") {
        // Under 1x it springs back rather than staying small.
        setView(view.current, true)
        g.mode = "none"
        return
      }
      if (g.mode === "drag" && view.current.scale <= 1.001) {
        if (g.dy > DISMISS_AT || g.v > DISMISS_VELOCITY) {
          void triggerHaptic("light")
          close()
        } else {
          settle("open")
        }
      }
      g.mode = "none"
    },
    [close, settle, setView],
  )

  /** Double tap, and double click: the one gesture everybody tries first. */
  const lastTap = useRef(0)
  const toggleZoom = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current
      if (!img) return
      if (view.current.scale > 1.001) {
        setView({ ...IDENTITY }, true)
        return
      }
      const rect = img.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const target = 2.5
      // Zoom towards what was tapped, not towards the middle.
      setView({ scale: target, x: (cx - clientX) * (target - 1), y: (cy - clientY) * (target - 1) }, true)
      void triggerHaptic("light")
    },
    [setView],
  )

  /** Desktop: the wheel zooms, anchored under the cursor. */
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const img = imgRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const v = view.current
      const next = Math.min(MAX_SCALE, Math.max(1, v.scale * (1 - e.deltaY / 400)))
      const k = next / v.scale
      setView({ scale: next, x: cx - (cx - v.x - cx) * k - cx + (v.x + (cx - e.clientX) * (k - 1)), y: v.y + (cy - e.clientY) * (k - 1) }, false)
    },
    [setView],
  )

  if (!src || !shown || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center" role="dialog" aria-modal="true">
      <div ref={scrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0 }} onClick={close} />

      <button
        type="button"
        aria-label="Închide"
        onClick={close}
        className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition-transform active:scale-90"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt || "Fotografie"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={(e) => toggleZoom(e.clientX, e.clientY)}
        onClick={(e) => {
          // Touch has no dblclick, so it is measured here.
          const now = Date.now()
          if (now - lastTap.current < 280) {
            lastTap.current = 0
            toggleZoom(e.clientX, e.clientY)
          } else {
            lastTap.current = now
          }
        }}
        draggable={false}
        className={cn(
          "relative max-h-[88vh] max-w-[94vw] select-none rounded-lg object-contain will-change-transform",
          zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
        )}
        style={{ transform: "translate3d(0, 60px, 0) scale(0.92)", opacity: 0, touchAction: "none" }}
      />
    </div>,
    document.body,
  )
}
