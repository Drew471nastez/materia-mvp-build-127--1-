"use client"

import { useCallback, useRef, useState } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * A conversation you can swipe away.
 *
 * The gesture, on a phone, is the whole interface: drag left and a red Șterge
 * comes out from under the row, keep going and it commits on release. Mail,
 * Messages and every inbox since have trained this, and it is the only way to
 * clear a list quickly — a menu behind a button is three taps to do what one
 * drag does.
 *
 * The row tracks the finger in real time and none of it goes through React. A
 * drag is sixty updates a second and this list is the one place in the app where
 * that would re-render a screenful of avatars; the transform is written straight
 * to the node, so a swipe is one composited property on one layer.
 *
 * Two decisions worth naming:
 *
 *   The gesture is claimed on HORIZONTAL intent only, and only after the finger
 *   has committed to it — 12px across and more sideways than down. Anything
 *   else stays with the vertical scroller, permanently, for the rest of that
 *   touch. Without that the list becomes impossible to scroll on a phone, which
 *   is a far worse bug than not having the swipe at all.
 *
 *   Past the action's own width the row resists rather than stopping dead, and
 *   past twice it commits on release without asking. A drag that hits a wall
 *   feels broken; one that gets heavier feels like an object.
 *
 * On a desktop there is no swiping, so the same action is a menu button that
 * appears on hover — discoverable in the way a pointer expects, and out of the
 * way until then.
 */

const ACTION_W = 88
/** Past this, letting go deletes without a second tap. */
const COMMIT_AT = ACTION_W * 2
const SPRING = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)"

export function ConversationRow({
  children,
  onDelete,
  className,
}: {
  children: React.ReactNode
  onDelete: () => void
  className?: string
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const drag = useRef({ armed: false, active: false, startX: 0, startY: 0, dx: 0, base: 0 })
  const swallowClick = useRef(false)

  const place = useCallback((x: number, animate: boolean) => {
    const el = surfaceRef.current
    if (!el) return
    el.style.transition = animate ? SPRING : "none"
    el.style.transform = `translate3d(${x}px, 0, 0)`
  }, [])

  const settle = useCallback(
    (to: "open" | "closed") => {
      place(to === "open" ? -ACTION_W : 0, true)
      setOpen(to === "open")
    },
    [place],
  )

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return
    drag.current = {
      armed: true,
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      base: open ? -ACTION_W : 0,
    }
  }, [open])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d.armed && !d.active) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY

      if (d.armed && !d.active) {
        // Not yet decided. A vertical intent hands the touch to the scroller and
        // never takes it back; only a committed sideways drag is ours.
        if (Math.abs(dy) > Math.abs(dx)) {
          d.armed = false
          return
        }
        if (Math.abs(dx) < 12) return
        d.armed = false
        d.active = true
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      }
      if (!d.active) return

      let x = d.base + dx
      // Rightward past closed, and leftward past the action, both get a quarter
      // of the travel: there is nothing there, and refusing outright feels dead.
      if (x > 0) x *= 0.25
      else if (x < -ACTION_W) x = -ACTION_W + (x + ACTION_W) * 0.35
      d.dx = x
      place(x, false)
    },
    [place],
  )

  const onPointerUp = useCallback(() => {
    const d = drag.current
    d.armed = false
    if (!d.active) return
    d.active = false
    // A swipe must not also open the conversation. The browser fires a click
    // after a touch that did not scroll, and the row's whole surface is a link —
    // so without swallowing exactly one click, every swipe ended on the thread
    // you were trying to file away.
    swallowClick.current = true
    window.setTimeout(() => {
      swallowClick.current = false
    }, 400)
    if (d.dx <= -COMMIT_AT) {
      void triggerHaptic("light")
      // Off the side of the screen, then gone. Deleting a row that is still
      // sitting there is the one thing that makes a list feel unresponsive.
      place(-window.innerWidth, true)
      window.setTimeout(onDelete, 220)
      return
    }
    settle(d.dx < -ACTION_W / 2 ? "open" : "closed")
  }, [onDelete, place, settle])

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Underneath, revealed by the row moving off it. Not animated itself —
          it is simply there, and the row is what travels. */}
      <button
        type="button"
        aria-label="Șterge conversația"
        onClick={() => {
          void triggerHaptic("light")
          onDelete()
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-[13px] font-semibold text-white"
        style={{ width: ACTION_W }}
        tabIndex={open ? 0 : -1}
      >
        <span className="flex flex-col items-center gap-1">
          <Trash2 className="h-[18px] w-[18px]" />
          Șterge
        </span>
      </button>

      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // Captured, so it never reaches the link inside.
          if (swallowClick.current || open) {
            e.preventDefault()
            e.stopPropagation()
            if (open) settle("closed")
          }
        }}
        // Vertical panning stays with the list; horizontal is ours to claim.
        style={{ touchAction: "pan-y" }}
        className="relative bg-white will-change-transform"
      >
        {children}

        {/* The pointer's version of the same action. Hidden until hover, because
            a permanent ⋯ on every row is clutter on a list you mostly read. */}
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 md:block">
          <button
            type="button"
            aria-label="Acțiuni conversație"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-opacity",
              "opacity-0 hover:bg-neutral-100 hover:text-neutral-700 focus:opacity-100 group-hover/row:opacity-100",
              menuOpen && "opacity-100",
            )}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>

          {menuOpen && (
            <>
              {/* Catches the click that closes it, without a listener on the
                  document that would fight the button's own toggle. */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  setMenuOpen(false)
                }}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-[0_8px_28px_rgba(15,15,15,0.14)]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setMenuOpen(false)
                    onDelete()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-[16px] w-[16px]" />
                  Șterge conversația
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
