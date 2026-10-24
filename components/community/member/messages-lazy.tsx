"use client"

/**
 * The Messages panel, loaded when it is first wanted (round 39). The frame
 * draws this on every community page; the panel (messages.tsx, and through it
 * the chat screen, the lightbox and the video player) is its own chunk,
 * fetched once the page is idle so the first press finds it here, and drawn
 * from the first opening on (it stays, so it can ease out when closed).
 */
import { Suspense, lazy, useEffect, useState, type ComponentProps } from "react"
import type { MessagesPanel as Panel } from "./messages"

const MessagesPanel = lazy(() => import("./messages").then((m) => ({ default: m.MessagesPanel })))

export function MessagesPanelLazy(props: ComponentProps<typeof Panel>) {
  const [wanted, setWanted] = useState(props.open)
  useEffect(() => {
    if (props.open) setWanted(true)
  }, [props.open])
  useEffect(() => {
    const go = () => void import("./messages").catch(() => undefined)
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 5000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(go, 2500)
    return () => window.clearTimeout(t)
  }, [])
  if (!wanted && !props.open) return null
  return (
    <Suspense fallback={null}>
      <MessagesPanel {...props} />
    </Suspense>
  )
}
