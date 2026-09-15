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

  /**
   * THE ROW FOLLOWS THE FINGER, AND THE OTHERS GET OUT OF THE WAY.
   *
   * The first version reordered the array on every pointer move. It worked,
   * and it felt like nothing: the list re-rendered under a finger that was
   * not attached to anything, so a drag read as a series of jumps.
   *
   * So the array is left ALONE until the finger lifts. What moves during the
   * drag is paint: the row being dragged gets a translateY of however far the
   * pointer has travelled, and every row it has passed gets shifted one slot
   * the other way, with a transition, so they slide aside instead of
   * teleporting. The commit happens once, on release.
   */
  const [drag, setDrag] = React.useState<{
    id: string
    from: number
    /** Live pointer offset from where the press started. */
    dy: number
    /** The slot the row would land in if released now. */
    to: number
    rowHeight: number
  } | null>(null)
  const startY = React.useRef(0)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((current) => {
      const next = [...current]
      const [row] = next.splice(from, 1)
      next.splice(to, 0, row)
      return next
    })
  }

  const rowBoxes = () => {
    const list = listRef.current
    if (!list) return []
    return [...list.querySelectorAll<HTMLLIElement>("li[data-id]")].map((el) => el.getBoundingClientRect())
  }

  const onPointerDown = (event: React.PointerEvent, id: string, index: number) => {
    /* Left button or a touch, not a right-click opening a context menu. */
    if (event.button !== 0) return
    const boxes = rowBoxes()
    const box = boxes[index]
    if (!box) return
    startY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setDrag({ id, from: index, dy: 0, to: index, rowHeight: box.height + 6 /* the gap */ })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    setDrag((current) => {
      if (!current) return current
      const dy = event.clientY - startY.current
      /*
        Which slot this lands in, from the distance travelled rather than from
        what is under the pointer: the rows are moving out of the way as it
        goes, so "what is under the pointer" is a moving target and produces a
        list that flickers between two orders.
      */
      const slots = Math.round(dy / current.rowHeight)
      const to = Math.max(0, Math.min(order.length - 1, current.from + slots))
      return { ...current, dy, to }
    })
  }

  const endDrag = (event: React.PointerEvent) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* The pointer can be gone already; nothing to release. */
    }
    setDrag((current) => {
      if (current) move(current.from, current.to)
      return null
    })
  }

  /** Where a row sits right now: the dragged one follows, the rest step aside. */
  const rowOffset = (index: number) => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return -drag.rowHeight
    if (drag.to < drag.from && index < drag.from && index >= drag.to) return drag.rowHeight
    return 0
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
        /*
          It read as a disabled label sitting next to the sort control: a thin
          hairline, muted weight, no fill. This is the owner's one way into
          the order of their own shop, so it is filled, on the foreground
          colour, and looks like the button it is.
        */
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background",
          "shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-transform duration-100 hover:opacity-90 active:scale-[0.97]",
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
          Drag a product by its handle, or use the arrows. This is the order both Home and Products show.
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
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background p-2",
                drag?.id === product.id
                  ? /* Lifted: above its neighbours, shadowed, and not
                       transitioning, because it is tracking a finger. */
                    "relative z-10 border-foreground/25 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)]"
                  : "border-border transition-transform duration-200 ease-sheet",
              )}
              style={{
                transform: `translateY(${rowOffset(index)}px)`,
                /* A touch of scale on the lifted row, so it reads as picked
                   up rather than as merely moved. */
                ...(drag?.id === product.id ? { transform: `translateY(${drag.dy}px) scale(1.02)` } : null),
              }}
            >
              <button
                type="button"
                aria-label={`Drag ${product.title || "product"}`}
                onPointerDown={(e) => onPointerDown(e, product.id, index)}
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

/**
 * ===========================================================================
 *  THE OWNER'S ROW, ABOVE THE GRID
 * ===========================================================================
 * Arrange used to sit in the catalogue header beside the category selector
 * and the sort control, which put a control that CHANGES the shop in the row
 * of controls that only change what one visitor is looking at. It also only
 * existed on the Products tab, so the arrangement governed one of the two
 * places it was visible.
 *
 * Its own row, directly above the grid, on both tabs. Nobody but the owner
 * ever renders this — the page decides that from the session, and a visitor's
 * HTML does not contain it.
 */
export function ArrangeProductsRow({
  products,
  isOwner,
}: {
  products: ArrangeableProduct[]
  /** From the session, on the server. Never a client-side guess. */
  isOwner?: boolean
}) {
  if (!isOwner || products.length < 2) return null
  return (
    <div className="mb-4 flex justify-end">
      <ArrangeProductsButton products={products} />
    </div>
  )
}
