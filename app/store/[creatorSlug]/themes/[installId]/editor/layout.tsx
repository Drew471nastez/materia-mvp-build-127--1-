import type React from "react"
import { EditorFrame } from "@/components/website-builder/editor-frame"
import { EditorToaster } from "@/components/ui/editor-toaster"

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
