/**
 * The real useTabReveal, on a strip shaped like the one above both charts:
 * four tabs, each wider than a quarter of a phone, in a row that scrolls
 * sideways. The probe taps them and reads where the row ends up.
 *
 * The widths are the product's: `min-w-[130px]` on a 390px phone, which is
 * why the fourth tab is off the edge in the first place.
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { useTabReveal } from "../components/app/use-tab-reveal"

const ORDER = ["views", "revenue", "orders", "conversion"] as const

function Harness() {
  const [active, setActive] = useState<string>("views")
  const strip = useTabReveal<HTMLDivElement>(active, ORDER)

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div
        id="strip"
        ref={strip}
        style={{ position: "relative", display: "flex", overflowX: "auto", width: "100%" }}
      >
        {ORDER.map((name) => (
          <button
            key={name}
            data-tab={name}
            onClick={() => setActive(name)}
            style={{ minWidth: 130, flexShrink: 0, height: 72, border: "1px solid #eee" }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Harness />)
