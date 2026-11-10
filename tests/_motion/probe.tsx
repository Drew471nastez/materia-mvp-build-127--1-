/**
 * The browser half of tests/motion-islands-p3.test.ts: the real runtime and
 * the real React entry, bundled by esbuild into a fixture page. The test
 * drives them through window.__motion.
 */
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { mountMotionIslands, motionRuntimeState } from "@/components/website-builder/motion-islands/runtime"
import { MotionIslands } from "@/components/website-builder/motion-islands"

declare global {
  interface Window {
    __motion: unknown
  }
}

let stop: (() => void) | null = null
let reactRoot: Root | null = null
const modes: Record<string, string> = {}

window.__motion = {
  mount(inCanvas = false) {
    const root = document.getElementById("fixture")!
    stop = mountMotionIslands(root, {
      inCanvas,
      onMode: (el, kind, mode) => {
        modes[el.id || kind] = mode
      },
    })
  },
  stop() {
    stop?.()
    stop = null
  },
  modes: () => ({ ...modes }),
  state: () => motionRuntimeState(),
  /* The React entry, as StorelibSection mounts it. */
  react(html: string, inCanvas: boolean) {
    const host = document.getElementById("react-host")!
    const root = document.getElementById("react-section")!
    reactRoot ??= createRoot(host)
    flushSync(() => reactRoot!.render(createElement(MotionIslands, { root, html, inCanvas })))
  },
  unreact() {
    flushSync(() => reactRoot?.render(null))
  },
}
