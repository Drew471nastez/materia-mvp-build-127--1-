/**
 * THE SHARED SHEET, OPENED FROM A PARENT THAT RENDERS LIKE THE REAL ONES.
 *
 * The account sheet's open state lived in a parent, the sheet's close was an
 * inline arrow, and a document `mousedown` listener closed it from outside.
 * All three are reproduced here, so the probe drives the shape that glitched
 * rather than a tidy one that never could.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"

/**
 * A menu that takes a slow phone's time to draw. On a fast desktop the window
 * between "the sheet is in the DOM" and "the sheet has been moved below the
 * screen" was too short to land on a frame, which is why the glitch was
 * intermittent and why a probe without this passed a sheet that had it.
 */
function SlowRow({ label }: { label: string }) {
  const until = performance.now() + 3
  while (performance.now() < until) { /* a phone's worth of render */ }
  return <div style={{ padding: "14px 12px", fontSize: 15 }}>{label}</div>
}

function Harness() {
  const [open, setOpen] = React.useState(false)
  const rowRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    /* The sidebar's old outside-click listener, which is what a synthesized
       mousedown after a tap reaches. The sheet must be immune to it. */
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-app-sheet]")) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])
  return (
    <>
      <div ref={rowRef} style={{ position: "fixed", top: 0, left: 0, right: 0, height: 68, background: "#111", zIndex: 50 }}>
        <button id="trigger" onClick={() => setOpen((v) => !v)} style={{ margin: 16, padding: "8px 12px", color: "#fff" }}>Account</button>
      </div>
      <div style={{ paddingTop: 68 }}>
        {Array.from({ length: 40 }, (_, i) => <div key={i} style={{ height: 64, margin: 8, background: "#fff", borderRadius: 16 }} />)}
      </div>
      <div data-app-nav-pill="" id="pill" style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto", width: 256, height: 56, marginBottom: 16, borderRadius: 999, background: "#000" }} />
      </div>
      {/* `?kb`: the same sheet asked to sit on the keyboard, which a sheet with a field is. */}
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} label="Account" aboveKeyboard={new URLSearchParams(location.search).has("kb")}>
        <div style={{ padding: 12 }}>
          {["Settings", "Billing", "Help", "Explore", "Library", "Language", "Logout"].map((l) => (
            <SlowRow key={l} label={l} />
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
