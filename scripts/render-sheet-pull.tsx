/**
 * A sheet with a long list and a comment box, as a post opened on a phone
 * is (components/community/member/post-overlay.tsx). Driven by
 * scripts/check-sheet-pull.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"

;(globalThis as unknown as { __closed: boolean }).__closed = false

function Harness() {
  const [open, setOpen] = React.useState(false)
  ;(globalThis as unknown as { __open: () => void }).__open = () => {
    ;(globalThis as unknown as { __closed: boolean }).__closed = false
    setOpen(true)
  }
  return (
    <>
      <div style={{ height: 3000, background: "#0b6e4f" }} />
      <BottomSheet
        isOpen={open}
        onClose={() => {
          ;(globalThis as unknown as { __closed: boolean }).__closed = true
          setOpen(false)
        }}
        label="Post"
        height="640px"
        maxHeight="640px"
        header={<div style={{ height: 44 }}>Introductions</div>}
      >
        <div>
          <textarea id="box" rows={3} style={{ display: "block", width: "100%", height: 60 }} defaultValue={"line\n".repeat(20)} />
          {Array.from({ length: 40 }, (_, i) => (
            <div key={i} data-row={i} style={{ height: 48, borderBottom: "1px solid #eee" }}>
              Comment {i}
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
