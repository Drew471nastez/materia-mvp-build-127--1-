/**
 * THE ACCOUNT SHEET, WITH A FINGER ON IT.
 *
 * The three sheets this replaces both re-rendered React on every touchmove and
 * called preventDefault inside a React onTouchMove, which is passive and does
 * nothing. Neither fault is visible in the source unless you already know to
 * look, and both are measurable, so they are measured.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"

/* Outside the component: setting it in the body reset it on every render, so
   a close that really happened read as one that had not. */
;(globalThis as unknown as { __closed: boolean }).__closed = false

function Harness() {
  const [open, setOpen] = React.useState(false)
  ;(globalThis as unknown as { __open: () => void }).__open = () => setOpen(true)
  return (
    <>
      {/* Something tall behind it, so a page that scrolls under the sheet shows up. */}
      <div style={{ height: 3000, background: "linear-gradient(#fff,#ddd)" }} />
      <BottomSheet isOpen={open} onClose={() => { (globalThis as unknown as { __closed: boolean }).__closed = true; setOpen(false) }} label="Account">
        <div style={{ padding: 12 }}>
          {["Settings", "Billing", "Help", "Explore", "Library", "Language", "Logout"].map((l) => (
            <div key={l} style={{ padding: "14px 12px", fontSize: 15 }}>{l}</div>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
