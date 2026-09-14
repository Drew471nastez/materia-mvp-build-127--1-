/**
 * ===========================================================================
 *  THE CREATOR PAGE'S EDITOR, WITH AND WITHOUT A KEYBOARD
 * ===========================================================================
 * Headless Chromium has no software keyboard, so what is simulated here is
 * not the keyboard — it is the STATE the keyboard leaves behind, which is the
 * part the layout actually reads: `html.keyboard-open` and
 * `--keyboard-inset-height`, both written by keyboard-guard.tsx from
 * `innerHeight - visualViewport.offsetTop - visualViewport.height`.
 *
 * That is a fair test of the geometry and not a test of iOS. It is also the
 * only part that was ever wrong: the numbers arrived correctly before this
 * change and the panel ignored them.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EditorSheet, EditorField } from "@/components/storefront/editor-sheet"

function Probe() {
  const [open] = React.useState(true)
  return (
    <EditorSheet open={open} onClose={() => {}} title="Your story" onSave={() => {}} wide>
      {/* Enough to overflow, because a sheet that fits proves nothing. */}
      {Array.from({ length: 12 }, (_, i) => (
        <EditorField key={i} label={`Field ${i + 1}`}>
          <input id={`f${i}`} className="h-10 w-full rounded-md border px-3" defaultValue="text" />
        </EditorField>
      ))}
    </EditorSheet>
  )
}

createRoot(document.getElementById("app")!).render(
  <div style={{ minHeight: "100vh", background: "#ddd" }}>
    <Probe />
  </div>,
)
