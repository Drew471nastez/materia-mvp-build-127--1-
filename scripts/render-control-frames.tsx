/**
 * The editor's slider, in the editor's sheet, in front of something as
 * expensive to re-render as the canvas is. Driven by
 * scripts/check-control-frames.mjs.
 *
 * The slider and the sheet are the real ones. The canvas is a stand-in with
 * the shape that matters: memoised, fed a deferred copy of the state, and
 * costly enough that rendering it inside a touch is felt. That is how the
 * editor now feeds its own canvas; tests/control-frames.test.ts is what pins
 * the editor to it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"

declare global {
  interface Window {
    __writes: number
    __heavy: number
    __deferred: boolean
    __reset: (v: number) => void
  }
}
window.__writes = 0
window.__heavy = 0
/* Flipped by the probe before it drags, so one run can measure both ways. */
window.__deferred = true

/**
 * A page's worth of work, in the region a settings change repaints.
 *
 * The busy wait is the point, not the rows: a render that fits inside a
 * frame proves nothing, because nothing has to be interrupted. The editor's
 * real canvas is a whole page of sections, and on a phone it is well over a
 * frame. Twenty milliseconds is a modest version of that.
 */
const RENDER_MS = 20

const Canvas = React.memo(function Canvas({ value }: { value: number }) {
  window.__heavy++
  const until = performance.now() + RENDER_MS
  while (performance.now() < until) { /* a page being laid out */ }
  const rows = []
  for (let i = 0; i < 260; i++) {
    rows.push(
      <div
        key={i}
        style={{
          height: 6,
          marginBottom: 2,
          opacity: 0.2 + ((i * value) % 100) / 125,
          background: `hsl(${(i * 7 + value) % 360} 60% 60%)`,
          transform: `translateX(${(value + i) % 5}px)`,
        }}
      />,
    )
  }
  return <div style={{ padding: 8 }}>{rows}</div>
})

function Harness() {
  const [value, setValue] = React.useState(40)
  window.__reset = setValue
  const deferred = React.useDeferredValue(value)
  const forCanvas = window.__deferred ? deferred : value

  return (
    <>
      <div style={{ height: 3000, background: "#fff" }}>
        <Canvas value={forCanvas} />
      </div>
      <MobileEditorSheet open onOpenChange={() => {}}>
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0 min-h-[44px]">
          <span className="text-sm font-semibold truncate">Feature grid</span>
        </div>
        <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll p-4">
          <label className="mb-1 block text-[13px] font-medium">Padding</label>
          <SliderNumberControl
            value={value}
            onChange={(v) => {
              window.__writes++
              setValue(v)
            }}
            min={0}
            max={100}
          />
          <div className="h-[400px]" />
        </div>
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
