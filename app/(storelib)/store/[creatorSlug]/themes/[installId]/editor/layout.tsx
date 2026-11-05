import type React from "react"
import type { Viewport } from "next"
import { EditorFrame } from "@/components/website-builder/editor-frame"
import { EditorToaster } from "@/components/ui/editor-toaster"

/*
  NO ZOOM IN THE EDITOR (round 20), as on /website-builder (app/website-builder/layout.tsx). iOS zooms the page into a field whose
  text is under 16px when it is tapped, and into whatever is double tapped,
  and leaves it zoomed: the owner's phone showed Ask Storelib's sheet with
  its header and thread pushed in and cut off at the right. The editor is a
  tool laid out for the screen it is on, so the page stays at its own scale
  (Safari still lets a pinch zoom; the app's web view does not). The rest of
  the root's viewport (width, the notch) is kept: Next merges this into it.
*/
export const viewport: Viewport = { maximumScale: 1 }

/**
 * THE CANONICAL EDITOR ADDRESS, DRESSED LIKE THE OTHER ONE. It had no layout
 * of its own, so two things /website-builder's layout gives the same editor
 * were missing here: the frame under it (the editor faded in over the
 * page's white body, the white flash on the way into the builder), and the
 * toaster (the editor's Saved, Published and error toasts were raised with
 * nothing on this route to draw them).
 */
export default function StoreThemeEditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <EditorFrame>
      {children}
      <EditorToaster />
    </EditorFrame>
  )
}
