import type * as React from "react"
import type { useSortable } from "@dnd-kit/sortable"

type Sortable = Pick<ReturnType<typeof useSortable>, "transform" | "transition" | "isDragging">

/**
 * How a dnd-kit sortable item moves, as the product editor's media grid moves
 * its tiles (app/app/products/new/media-grid.tsx): on whole pixels both ways,
 * with no transition of its own while it is held (so it follows the finger
 * one to one) and above the others while it is.
 */
export function sortableMove(s: Sortable): React.CSSProperties {
  return {
    transform: s.transform ? `translate3d(${Math.round(s.transform.x)}px, ${Math.round(s.transform.y)}px, 0)` : undefined,
    transition: s.isDragging ? undefined : s.transition,
    zIndex: s.isDragging ? 20 : undefined,
  }
}
