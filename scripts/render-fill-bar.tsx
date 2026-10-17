/**
 * The real FillBar, mounted for scripts/check-fill-bar.mjs: one of each size,
 * tone and ground, an announced one and a quiet one, and a harness that draws
 * the same bar again and again with the same value so the probe can watch
 * whether anything moves when nothing changed.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { FillBar } from "@/components/ui/fill-bar"

function Redrawn() {
  const [, bump] = React.useState(0)
  const [value, setValue] = React.useState(40)
  React.useEffect(() => {
    const id = setInterval(() => bump((n) => n + 1), 80)
    ;(window as unknown as { setBarValue: (v: number) => void }).setBarValue = setValue
    return () => clearInterval(id)
  }, [])
  return (
    <div data-case="redrawn">
      <FillBar value={value} label="Redrawn" />
    </div>
  )
}

/**
 * The same bar, thrown away and made again every 80ms (a changing key, which
 * is what a list that re-keys its rows does to a component). A fill that is a
 * transition is simply drawn at its width each time; a fill that is an
 * animation starts over, which is the flicker the owner reported.
 */
function Remounted() {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 80)
    return () => clearInterval(id)
  }, [])
  return (
    <div data-case="remounted">
      <FillBar key={tick} value={40} label="Remounted" />
    </div>
  )
}

function App() {
  return (
    <main style={{ padding: 24, display: "grid", gap: 20, maxWidth: 520 }}>
      <div data-case="thin"><FillBar value={30} label="Thin" size="thin" /></div>
      <div data-case="regular"><FillBar value={30} label="Regular" /></div>
      <div data-case="thick"><FillBar value={30} label="Thick" size="thick" /></div>
      <div data-case="violet"><FillBar value={55} label="Violet" tone="violet" /></div>
      <div data-case="positive"><FillBar value={55} label="Positive" tone="positive" /></div>
      <div data-case="warning"><FillBar value={55} label="Warning" tone="warning" /></div>
      <div data-case="quiet"><FillBar quiet value={70} /></div>
      <div data-case="counted"><FillBar value={7} max={12} label="7 of 12 lessons" /></div>
      <div data-case="floor"><FillBar value={0} max={100} floor={8} label="Just started" /></div>
      <div data-case="over"><FillBar value={250} max={100} label="Over" /></div>
      <div data-case="zero"><FillBar value={0} label="Nothing yet" /></div>
      <div data-case="dark-media" style={{ background: "#111", padding: 12 }}><FillBar quiet value={40} size="thin" on="dark-media" /></div>
      <div data-case="light-media" style={{ background: "#111", padding: 12 }}><FillBar quiet value={40} size="thin" tone="light" on="light-media" /></div>
      <Redrawn />
      <Remounted />
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
