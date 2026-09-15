"use client"

/**
 * ===========================================================================
 *  THE CATALOGUE, IN THE ORDER THE CREATOR WANTS IT
 * ===========================================================================
 * The Products tab was newest first and nothing else. This lets the owner
 * drag it into the order they want, and stores that as a list of ids on the
 * shop's header settings.
 *
 * WHY A GRIP AND TWO ARROWS, not just a drag. A drag is what was asked for
 * and it is what most people will use, but it is also the one interaction
 * that is unusable with a keyboard and awkward on a phone with a long list.
 * The arrows are the same operation, reachable by tab, and they cost two
 * buttons per row.
 *
 * POINTER EVENTS, NOT HTML5 DRAG AND DROP. `dragstart` and friends do not
 * fire for touch at all, so the native API would have shipped a feature that
 * works on a desktop and silently does nothing on a phone.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from "lucide-react"

import { EditorSheet } from "@/components/storefront/editor-sheet"
import { cn } from "@/lib/utils"

export interface ArrangeableProduct {
  id: string
  title?: string | null
  thumbnail_url?: string | null
}

export function ArrangeProductsButton({
  products,
  className,
}: {
  products: ArrangeableProduct[]
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [order, setOrder] = React.useState<ArrangeableProduct[]>(products)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /* Reopening starts from what the page is showing, not from a stale drag. */
  React.useEffect(() => {
    if (open) {
      setOrder(products)
      setError(null)
    }
  }, [open, products])

  const listRef = React.useRef<HTMLUListElement>(null)
  const dragging = React.useRef<string | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((current) => {
      const next = [...current]
      const [row] = next.splice(from, 1)
      next.splice(to, 0, row)
      return next
    })
  }

  /*
    Which row is under the pointer, decided from the rows' own boxes rather
    than from a running total of the drag distance. Rows are a fixed height
    here, but reading the real rects means this keeps working if they ever
    stop being.
  */
  const indexAtPoint = (clientY: number) => {
    const list = listRef.current
    if (!list) return -1
    const rows = [...list.querySelectorAll<HTMLLIElement>("li[data-id]")]
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i].getBoundingClientRect()
      if (clientY < box.top + box.height / 2) return i
    }
    return rows.length - 1
  }

  const onPointerDown = (event: React.PointerEvent, id: string) => {
    /* Left button or a touch, not a right-click opening a context menu. */
    if (event.button !== 0) return
    dragging.current = id
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const id = dragging.current
    if (!id) return
    const from = order.findIndex((p) => p.id === id)
    const to = indexAtPoint(event.clientY)
    if (from >= 0 && to >= 0 && to !== from) move(from, to)
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* The pointer can be gone already; nothing to release. */
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productsOrder: order.map((p) => p.id) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "That did not save.")
      }
      setOpen(false)
      /* The order lives in the page's server data, so the page has to re-read it. */
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.")
    } finally {
      setSaving(false)
    }
  }

  if (products.length < 2) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent",
          className,
        )}
      >
        <ListOrdered className="h-4 w-4" aria-hidden />
        Arrange
      </button>

      <EditorSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Arrange products"
        onSave={save}
        busy={saving}
        error={error}
      >
        <p className="text-sm text-muted-foreground">
          Drag a product by its handle, or use the arrows. This is the order the Products tab shows.
        </p>

        <ul
          ref={listRef}
          className="space-y-1.5"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {order.map((product, index) => (
            <li
              key={product.id}
              data-id={product.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
            >
              <button
                type="button"
                aria-label={`Drag ${product.title || "product"}`}
                onPointerDown={(e) => onPointerDown(e, product.id)}
                /* touch-none: without it the browser scrolls the sheet instead
                   of letting the row follow the finger. */
                className="cursor-grab touch-none rounded p-1 text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </button>

              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>

              {product.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.thumbnail_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded-md bg-muted" />
              )}

              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {product.title || "Untitled"}
              </span>

              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={`Move ${product.title || "product"} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${product.title || "product"} down`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </EditorSheet>
    </>
  )
}
