"use client"

import { createRoot, type Root } from "react-dom/client"

import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { createExitHold, type ExitHold } from "@/lib/website-builder/exit-hold"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE "GOING BACK" SCREEN, WHICH OUTLIVES THE EDITOR
 * ===========================================================================
 * The screen has to stay up after the editor is gone: the push goes on the
 * press, the page behind loads while the screen is up, and the editor is
 * unmounted the moment that page arrives, a second or two before the
 * screen's minimum is over (lib/website-builder/exit-hold.ts, EXIT_MIN_MS).
 * Drawn inside the editor it went with it, in a cut. So it is its own small
 * root on <body>, made on the press and taken away by its own timer, after
 * a fade over the page that has arrived.
 *
 * It looks like the screen the editor opens with: the nine squares and one
 * line on white (the canvas loader in the editor), not the dark glass it
 * replaced.
 */
let node: HTMLDivElement | null = null
let root: Root | null = null
let hold: ExitHold | null = null
let watching = false

function get(): ExitHold | null {
  if (typeof window === "undefined") return null
  if (hold) return hold
  hold = createExitHold({
    now: () => performance.now(),
    after: (cb, ms) => window.setTimeout(cb, ms),
    clear: (id) => window.clearTimeout(id),
    show() {
      node = document.createElement("div")
      node.className = "wb-exit-screen"
      node.setAttribute("data-exit-screen", "")
      document.body.appendChild(node)
      root = createRoot(node)
      root.render(<BuilderLoader tone="light" lines={[tt("Going back")]} />)
    },
    fade() {
      node?.setAttribute("data-leaving", "")
    },
    remove() {
      const r = root
      const n = node
      root = null
      node = null
      /* Not in the middle of somebody else's render or effect. */
      window.setTimeout(() => {
        r?.unmount()
        n?.remove()
      }, 0)
    },
  })
  return hold
}

export const exitScreen = {
  /** Up, on the press. False when it is already up: the same exit pressed twice. */
  start(): boolean {
    const h = get()
    if (!h) return false
    if (!watching) {
      watching = true
      /* Brought back from the back/forward cache with the screen still on it: the editor is in use again. */
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) get()?.cancel()
      })
    }
    return h.start()
  },
  /** The editor has been replaced by where it was going: the screen goes once its minimum is over. */
  arrived(): void {
    get()?.arrived()
  },
  /** The exit did not happen: the screen goes now. */
  cancel(): void {
    get()?.cancel()
  },
  /** Up, or fading off. */
  isUp(): boolean {
    const p = get()?.phase()
    return p === "holding" || p === "fading"
  },
}
