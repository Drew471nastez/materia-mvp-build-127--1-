/**
 * Twenty of the builder's real slider rows (components/website-builder/editor/
 * slider-number-control.tsx) in a scrolling panel the size of the phone
 * sidebar's, for scripts/check-slider-scroll.mjs. Every value a row commits
 * is recorded on window.__values, by row.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"

const w = window as any
w.__values = {} as Record<number, number[]>

function Row({ i }: { i: number }) {
  const [v, setV] = useState(40)
  return (
    <div className="px-4 py-3" data-probe-row={i}>
      <p className="mb-2 text-[13px] font-medium text-[#1a1a2e]">Spacing {i + 1}</p>
      <SliderNumberControl
        value={v}
        min={0}
        max={100}
        unit="px"
        onChange={(n) => {
          ;(w.__values[i] ||= []).push(n)
          setV(n)
        }}
      />
    </div>
  )
}

function Panel() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[120px] flex flex-col rounded-t-[20px] bg-white shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
      <div className="shrink-0 px-4 py-3 text-[15px] font-semibold text-[#1a1a2e]">Section settings</div>
      <div data-probe-scroller="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
        {Array.from({ length: 20 }, (_, i) => (
          <Row key={i} i={i} />
        ))}
        <div className="h-[200px]" />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Panel />)
