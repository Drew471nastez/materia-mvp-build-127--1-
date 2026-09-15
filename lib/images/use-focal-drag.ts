"use client"

/**
 * ===========================================================================
 *  DRAGGING A PICTURE INSIDE THE FRAME THAT CROPS IT
 * ===========================================================================
 * A cover is uploaded at whatever shape the camera produced and drawn into a
 * 3:1 strip, so most of it is cropped away. Which part survives is decided by
 * `object-position`, and this is how a creator sets it: drag the picture, the
 * band follows.
 *
 * THE PICTURE MOVES THE OPPOSITE WAY TO THE FINGER, because what is being
 * dragged is the image behind a window, not the window. Dragging down brings
 * what is above into view, which means the focal point moves up.
 *
 * It is a hook rather than a component because the control belongs to the
 * upload frame itself. Two boxes — one showing the cover, one below it
 * showing the same cover again to drag — is two pictures of the same picture,
 * and it was not obvious which of them was the real one.
 */
import * as React from "react"

export interface FocalPoint {
  x: number
  y: number
}

export const CENTRE: FocalPoint = { x: 50, y: 50 }

/** How far one arrow key moves it, in percent. */
const STEP = 2

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)))

/**
 * WHERE THE FOCAL POINT LANDS after a drag of `dx, dy` from `from`, inside a
 * frame of this size. Exported and pure because it is the whole of what the
 * control does, and it is the part that is worth checking without a browser:
 * the inversion, the clamp at both ends, and that a drag is measured from
 * where it STARTED rather than accumulated move by move.
 */
export function focalFromDrag(
  from: FocalPoint,
  dx: number,
  dy: number,
  frame: { width: number; height: number },
): FocalPoint {
  if (!frame.width || !frame.height) return { x: clamp(from.x), y: clamp(from.y) }
  return {
    x: clamp(from.x - (dx / frame.width) * 100),
    y: clamp(from.y - (dy / frame.height) * 100),
  }
}

/** One arrow key press. Returns null for a key this control does not own. */
export function nudge(point: FocalPoint, key: string): FocalPoint | null {
  const moves: Record<string, FocalPoint> = {
    ArrowLeft: { x: point.x - STEP, y: point.y },
    ArrowRight: { x: point.x + STEP, y: point.y },
    ArrowUp: { x: point.x, y: point.y - STEP },
    ArrowDown: { x: point.x, y: point.y + STEP },
  }
  const move = moves[key]
  return move ? { x: clamp(move.x), y: clamp(move.y) } : null
}

export function useFocalDrag(value: FocalPoint | null | undefined, onChange: (next: FocalPoint) => void) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const point = value ?? CENTRE

  /**
   * The pointer's own starting position AND the focal point it started from.
   * Deriving the next value from the last one instead accumulates rounding on
   * every pointermove, and a slow drag ends up somewhere the finger never went.
   */
  const start = React.useRef<{ x: number; y: number; from: FocalPoint } | null>(null)

  /** Read through a ref so a moving handler never has to re-bind the drag. */
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      start.current = { x: event.clientX, y: event.clientY, from: point }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const from = start.current
      if (!from) return
      const box = boxRef.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const next = focalFromDrag(from.from, event.clientX - from.x, event.clientY - from.y, rect)
      if (next.x !== point.x || next.y !== point.y) onChangeRef.current(next)
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      start.current = null
      setDragging(false)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* Already released; nothing to do. */
      }
    },
    onPointerCancel: () => {
      start.current = null
      setDragging(false)
    },
    /**
     * THE KEYBOARD WAY IN, and the reason the slider under the box could go.
     * A drag is unreachable without a pointer, and this control decides what
     * a visitor sees first on the page. Arrow keys on the focused frame do
     * the same job without a second control sitting under the picture.
     */
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      const next = nudge(point, event.key)
      if (!next) return
      event.preventDefault()
      onChangeRef.current(next)
    },
  }

  return {
    boxRef,
    dragging,
    point,
    handlers,
    /** Hand straight to the image. */
    objectPosition: `${point.x}% ${point.y}%`,
    centred: point.x === CENTRE.x && point.y === CENTRE.y,
  }
}
