"use client"

import { useLayoutEffect, useRef, useState } from "react"

/**
 * Two panels trading places along Z — the same move the feed's Pentru tine /
 * Urmărești / Salvate switch makes, extracted so the profile's shelf can speak
 * the identical language. One switch grammar per app.
 *
 * The outgoing panel is a SNAPSHOT: the node that was live when `id` changed,
 * which is what lets it keep painting a list for a state that has already
 * moved on. It sits absolutely on top, scales up a whisker and fades; the
 * incoming one starts a whisker small and settles to rest. Depth reads fast —
 * this needs less time than a slide would to feel finished, because nothing
 * has to travel anywhere.
 *
 * Transform and opacity only, so both layers live on the compositor, and the
 * layers are given back when the trade is done.
 */
const SWAP_MS = 300
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export function DepthSwap({ id, children }: { id: string; children: React.ReactNode }) {
  const idRef = useRef(id)
  const lastNode = useRef<React.ReactNode>(null)
  const [out, setOut] = useState<{ key: string; node: React.ReactNode } | null>(null)

  // Deriving state from a changed prop during render is the sanctioned form:
  // React re-runs immediately and the guard makes the second pass a no-op.
  if (id !== idRef.current) {
    setOut({ key: idRef.current, node: lastNode.current })
    idRef.current = id
  }
  lastNode.current = children

  const inRef = useRef<HTMLDivElement>(null)
  const outRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!out) return
    const i = inRef.current
    const o = outRef.current
    if (!i || !o) return
    const move = `transform ${SWAP_MS}ms ${EASE}, opacity ${SWAP_MS}ms ${EASE}`

    i.style.transition = "none"
    i.style.transform = "scale(0.975)"
    i.style.opacity = "0"
    i.style.willChange = "transform, opacity"
    o.style.transition = "none"
    o.style.transform = "scale(1)"
    o.style.opacity = "1"
    o.style.willChange = "transform, opacity"
    // The start state has to be COMPUTED, or both writes collapse into one
    // frame and the panels simply swap.
    void i.offsetHeight

    const raf = requestAnimationFrame(() => {
      i.style.transition = move
      i.style.transform = "scale(1)"
      i.style.opacity = "1"
      o.style.transition = move
      o.style.transform = "scale(1.03)"
      o.style.opacity = "0"
    })
    const t = window.setTimeout(() => {
      i.style.transition = ""
      i.style.transform = ""
      i.style.opacity = ""
      i.style.willChange = ""
      setOut(null)
    }, SWAP_MS + 20)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [out])

  return (
    <div className="relative">
      {out && (
        <div
          key={`out-${out.key}`}
          ref={outRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] overflow-hidden"
        >
          {out.node}
        </div>
      )}
      <div key={idRef.current} ref={inRef}>
        {children}
      </div>
    </div>
  )
}
