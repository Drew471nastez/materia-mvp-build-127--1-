/**
 * The real MetricSlide, with a strip of tabs above it, so the direction it
 * animates can be read off the animation itself rather than described.
 *
 * Nothing about the component is reimplemented: the probe clicks the tabs and
 * asks the browser what animations are running on the element.
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { MetricSlide } from "../components/app/metric-slide"

const ORDER = ["views", "revenue", "orders", "conversion"] as const

function Harness() {
  const [slot, setSlot] = useState<string>("views")
  return (
    <div style={{ fontFamily: "system-ui", padding: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {ORDER.map((name) => (
          <button key={name} id={`tab-${name}`} onClick={() => setSlot(name)}>
            {name}
          </button>
        ))}
      </div>
      <MetricSlide slot={slot} order={ORDER}>
        <div id="panel" style={{ height: 140, background: "#f3f4f6", marginTop: 12 }}>
          {slot}
        </div>
      </MetricSlide>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Harness />)
