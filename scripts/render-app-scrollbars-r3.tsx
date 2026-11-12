/**
 * The scrollers /app opens, mounted with the real primitives and the real
 * built CSS, one at a time (location.hash names which), for
 * scripts/check-app-scrollbars-r3.mjs to photograph and measure.
 *
 *   share     the Share your OnePage dialog's frame: components/ui/dialog
 *             with the classes components/onepage/onepage-editor.tsx gives
 *             it, and its 70vh scrolling body
 *   sheet     components/ui/sheet from the right, a long settings list
 *   dropdown  components/ui/dropdown-menu with more rows than fit
 *   dark      a dark panel (#18181b, light text), as the dark sheets draw
 *   hidden    a row that hides its bar on purpose (`scrollbar-hide`)
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const rows = (n: number, label: string) =>
  Array.from({ length: n }, (_, i) => (
    <p key={i} className="py-2 text-[14px] text-[#6b7280]">
      {label} {i + 1}
    </p>
  ))

function Case({ which }: { which: string }) {
  if (which === "share") {
    return (
      <Dialog open>
        <DialogContent className="w-[calc(100%-32px)] max-w-[420px] gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-[#eef0f2] px-5 py-4">
            <DialogTitle className="text-center text-[17px] font-semibold text-[#1a1a2e]">Share your OnePage</DialogTitle>
          </DialogHeader>
          <div data-probe-scroller="" className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-5">
            {rows(40, "Share row")}
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  if (which === "sheet") {
    return (
      <Sheet open>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div data-probe-scroller="" className="min-h-0 flex-1 overflow-y-auto px-4">
            {rows(60, "Setting")}
          </div>
        </SheetContent>
      </Sheet>
    )
  }
  if (which === "dropdown") {
    return (
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <button type="button" style={{ margin: 40 }}>
            Actions
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-probe-scroller="" className="max-h-[240px]">
          {Array.from({ length: 30 }, (_, i) => (
            <DropdownMenuItem key={i}>Action {i + 1}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  if (which === "dark") {
    return (
      /* Inline: the built CSS only has the classes the app's own files use. */
      <div style={{ margin: 40, width: 360, borderRadius: 16, background: "#18181b", color: "#ececee" }}>
        <div data-probe-scroller="" style={{ height: 320, overflowY: "auto", padding: 20 }}>
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} style={{ padding: "8px 0", fontSize: 14 }}>
              Dark row {i + 1}
            </p>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ margin: 40, width: 360, borderRadius: 16, background: "#fff" }}>
      <div data-probe-scroller="" data-expect-hidden="" className="scrollbar-hide flex gap-3 overflow-x-auto p-4">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className="shrink-0 rounded-lg bg-[#f3f4f6] px-4 py-2 text-[14px]">
            Chip {i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Case which={location.hash.slice(1) || "share"} />)
