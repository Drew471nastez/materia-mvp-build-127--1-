/**
 * Three real things, mounted in a real browser so they can be driven:
 *
 *   THE EDITOR SHELL, which on a desktop is a drawer at the right edge. What
 *   is worth measuring is not that it is pinned — a class says that — but
 *   that CLOSING it is an animation: Radix has to keep the node mounted with
 *   `data-state="closed"` while the slide plays, and the thing that looked
 *   like a flash for two rounds was a node being deleted on the frame the
 *   state changed.
 *
 *   THE SCHEME PICKER, whose whole bug was a BUMP: a selected button that
 *   changes size pushes its neighbours in a flex-wrap row, sometimes onto the
 *   next line. Only a browser can say whether a box moved.
 *
 *   THE SAFE-AREA SHIELD, which is a cascade question — `html.capacitor::before`
 *   against `html.capacitor:has(.cp-editor)::before` — and a cascade can only
 *   be answered by running it.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { EditorSheet, EditorField } from "@/components/storefront/editor-sheet"
import { SchemePicker } from "@/components/storefront/scheme-picker"

function Harness() {
  const [open, setOpen] = React.useState(false)
  const [scheme, setScheme] = React.useState("default")
  return (
    <div id="page" style={{ minHeight: "200vh", background: "#f1f1f3", padding: 24 }}>
      <button id="open-editor" type="button" onClick={() => setOpen(true)}>
        Open
      </button>

      {/* The shield's opt-out marker, exactly as the workspace carries it. */}
      <div className="cp-editor" style={{ height: 8 }} />

      <div id="picker" style={{ maxWidth: 520, marginTop: 24 }}>
        <SchemePicker value={scheme} onChange={setScheme} />
      </div>

      <EditorSheet
        open={open}
        onClose={() => setOpen(false)}
        title="The bar at the top"
        onSave={() => {}}
      >
        <EditorField label="A field">
          <input className="h-10 w-full rounded-lg border px-3" defaultValue="x" />
        </EditorField>
        {/* Tall enough that the body has to scroll, which is the claim. */}
        <div style={{ height: 1200 }} />
      </EditorSheet>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
