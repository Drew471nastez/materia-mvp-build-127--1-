"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"

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

export function ImageViewer({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const drag = useRef({ active: false, startY: 0, dy: 0, lastY: 0, lastT: 0, v: 0 })

  const settle = useCallback((to: "open" | "gone") => {
    const img = imgRef.current
    const scrim = scrimRef.current
    if (!img || !scrim) return
    img.style.transition = SPRING
    scrim.style.transition = SPRING
    if (to === "open") {
      img.style.transform = "translate3d(0, 0, 0) scale(1)"
      img.style.opacity = "1"
      scrim.style.opacity = "1"
    } else {
      img.style.transform = "translate3d(0, 60px, 0) scale(0.92)"
      img.style.opacity = "0"
      scrim.style.opacity = "0"
    }
  }, [])

  const close = useCallback(() => {
    settle("gone")
    window.setTimeout(onClose, 260)
  }, [onClose, settle])

  // Open from slightly small and slightly low, on the frame after mount so the
  // browser has two committed styles to animate between.
  useEffect(() => {
    if (!src) return
    setShown(true)
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
      // If we are unmounting for any other reason, take our entry back out so
      // the next Back does not land on a no-op.
      if (window.history.state?.viewer) window.history.back()
    }
    // `close` is stable enough for this: it only depends on onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { active: true, startY: e.clientY, dy: 0, lastY: e.clientY, lastT: performance.now(), v: 0 }
    const img = imgRef.current
    const scrim = scrimRef.current
    if (img) img.style.transition = "none"
    if (scrim) scrim.style.transition = "none"
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    const img = imgRef.current
    const scrim = scrimRef.current
    if (!img || !scrim) return

    const dy = e.clientY - d.startY
    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    d.dy = dy

    // Shrinks as it goes, so the picture reads as being thrown back rather than
    // slid off. Upward is allowed but resisted — there is nothing up there.
    const travel = dy < 0 ? dy * 0.3 : dy
    const scale = Math.max(0.72, 1 - Math.abs(travel) / 1200)
    img.style.transform = `translate3d(0, ${travel}px, 0) scale(${scale})`
    scrim.style.opacity = String(Math.max(0, 1 - Math.abs(travel) / 420))
  }, [])

  const onPointerUp = useCallback(() => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    if (d.dy > DISMISS_AT || d.v > DISMISS_VELOCITY) {
      void triggerHaptic("light")
      close()
    } else {
      settle("open")
    }
  }, [close, settle])

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
        draggable={false}
        className="relative max-h-[88vh] max-w-[94vw] select-none rounded-lg object-contain will-change-transform"
        style={{ transform: "translate3d(0, 60px, 0) scale(0.92)", opacity: 0, touchAction: "none" }}
      />
    </div>,
    document.body,
  )
}
