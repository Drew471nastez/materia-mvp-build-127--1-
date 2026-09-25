/**
 * A settings panel of sliders beside something as expensive to redraw as the
 * canvas, for scripts/check-slider-drag.mjs.
 *
 * The slider is the real one. `window.__variant` picks it: "new" is
 * components/website-builder/editor/slider-number-control.tsx as it ships,
 * "old" is the Radix slider it replaced, copied by the probe from git so the
 * two are measured on the same page, in the same run, under the same CPU.
 *
 * The canvas is fed a deferred copy of the value, which is how the editor
 * feeds its own. It costs RENDER_MS a render: a page of sections on a phone.
 *
 * THE DRAGGED SLIDER'S OWN RENDERS are what is counted, with a Profiler
 * (hence react-dom's profiling build). It is memoised and handed props that
 * do not change while the finger is down, so every commit the Profiler sees
 * is one the slider asked for itself: that is the per-move cost the drag
 * used to have and is meant not to have now. The canvas still redraws for
 * every value the slider sends, exactly as the editor's does.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { SliderNumberControl as NewSlider } from "@/components/website-builder/editor/slider-number-control"
// @ts-expect-error the probe writes this file before it bundles
import { SliderNumberControl as OldSlider } from "./.slider-old/slider-number-control"

declare global {
  interface Window {
    __variant: "new" | "old"
    __writes: number
    __canvasRenders: number
    __sliderCommits: number
  }
}
window.__writes = 0
window.__canvasRenders = 0
window.__sliderCommits = 0

const RENDER_MS = 40
const Slider = window.__variant === "old" ? OldSlider : NewSlider

const Canvas = React.memo(function Canvas({ value }: { value: number }) {
  window.__canvasRenders++
  const until = performance.now() + RENDER_MS
  while (performance.now() < until) {
    /* a page of sections being drawn */
  }
  return <div style={{ height: 2400, padding: value, background: "#f8f9fa" }} />
})

const onRender: React.ProfilerOnRenderCallback = () => {
  window.__sliderCommits++
}

const Dragged = React.memo(function Dragged({ onChange }: { onChange: (v: number) => void }) {
  return (
    <React.Profiler id="dragged" onRender={onRender}>
      <Slider value={24} onChange={onChange} min={0} max={200} step={1} unit="px" label="Top padding" />
    </React.Profiler>
  )
})

function Panel() {
  const [value, setValue] = React.useState(24)
  const deferred = React.useDeferredValue(value)
  const onChange = React.useCallback((v: number) => {
    window.__writes++
    setValue(v)
  }, [])
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 300, padding: 16, background: "#fff", overflow: "auto" }}>
        <p className="text-sm font-medium" style={{ marginBottom: 8 }}>Top padding</p>
        <Dragged onChange={onChange} />
        {["Bottom padding", "Gap", "Radius", "Width", "Line height"].map((label) => (
          <div key={label} style={{ marginTop: 18 }}>
            <p className="text-sm font-medium" style={{ marginBottom: 8 }}>{label}</p>
            <Slider value={40} onChange={() => {}} min={0} max={100} step={1} unit="px" label={label} />
          </div>
        ))}
      </aside>
      <main style={{ flex: 1, overflow: "auto" }}>
        <Canvas value={deferred} />
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Panel />)
