import type React from "react"
import { EditorToaster } from "@/components/ui/editor-toaster"
import { EditorFrame } from "@/components/website-builder/editor-frame"
/* The editor's own layout (app/website-builder/layout.tsx) without its sign in check. */
export default function L({ children }: { children: React.ReactNode }) {
  return <EditorFrame>{children}<EditorToaster /></EditorFrame>
}
