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

import { EditorSheet, useSaveThenRefresh } from "@/components/storefront/editor-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { saveCreatorProfile } from "@/lib/storefront/creator-profile-client"
import { mergeArrangement } from "@/lib/store-builder/featured-order"
import { useFormHistory } from "@/lib/store-builder/form-history"
import { cn } from "@/lib/utils"

export interface ArrangeableProduct {
  id: string
  title?: string | null
  thumbnail_url?: string | null
}

export function ArrangeProductsButton({
  products,
  allProducts,
  className,
}: {
  products: ArrangeableProduct[]
  /**
   * The whole catalogue in its current order, when `products` is only part of
   * it (Home's Featured selection). The arranged ones keep the slots they hold
   * in it, so nothing else moves (round 50, lib/store-builder/featured-order).
   */
  allProducts?: ArrangeableProduct[]
  className?: string
}) {
  const { markSaved, onClosed, toast } = useSaveThenRefresh()
  const [open, setOpen] = React.useState(false)
  const [order, setOrder] = React.useState<ArrangeableProduct[]>(products)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /*
    Reopening starts from what the page is showing, not from a stale drag.
    On the way IN only (round 50): it ran again whenever the page handed a new
    `products` array, which a refresh behind an open sheet does, and put the
    rows back under the creator's finger.
  */
  const openSheet = () => {
    /* In the same render as the open, so the sheet's history starts from it. */
    setOrder(products)
    setError(null)
    setOpen(true)
  }

  /** The order to store: the whole catalogue, with these in their new places. */
  const orderToSave = (rows: ArrangeableProduct[]) => {
    const ids = rows.map((p) => p.id)
    return allProducts && allProducts.length > rows.length ? mergeArrangement(allProducts.map((p) => p.id), ids) : ids
  }
  const changed = order.map((p) => p.id).join(",") !== products.map((p) => p.id).join(",")
  /* Each move is a step: a drag, an arrow, an arrow key (lib/store-builder/form-history). */
  const formHistory = useFormHistory(open, { order }, (v) => setOrder(v.order))

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
  /* Where the finger is, and how far the form has scrolled since the press: a drag past the edge scrolls the list (round 50). */
  const pointerY = React.useRef(0)
  const startScroll = React.useRef(0)
  const scroller = () => listRef.current?.closest<HTMLElement>("[data-sheet-scroll]") ?? null
  /*
    THE DROP DOES NOT JUMP (round 50). On release the order changed and every
    row's offset went to 0 in the same commit, with a transition on: each row
    that had stepped aside started its slide from a slot away from where it
    was drawn, and the lifted row slid from wherever the finger let go plus
    the whole distance it had travelled. `settling` takes the transitions off
    for the commit, and the lifted row then glides the last few pixels into
    its slot from exactly where it was let go.
  */
  const [settling, setSettling] = React.useState<{ id: string; residual: number } | null>(null)
  React.useLayoutEffect(() => {
    if (!settling) return
    const el = listRef.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(settling.id)}"]`)
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (el && !reduce && typeof el.animate === "function" && Math.abs(settling.residual) > 0.5) {
      el.animate([{ transform: `translateY(${settling.residual}px) scale(1.02)` }, { transform: "translateY(0) scale(1)" }], { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    }
    const raf = requestAnimationFrame(() => setSettling(null))
    return () => cancelAnimationFrame(raf)
  }, [settling])
  /**
   * The drag, readable synchronously. `onPointerMove` needs the current value
   * to compute the next one, and reading it out of the closure means reading
   * whatever it was when this render's handler was created — which during a
   * fast drag is one frame stale.
   */
  const dragRef = React.useRef<typeof drag>(null)
  dragRef.current = drag
  /**
   * THE LAST SLOT A TICK WAS FIRED FOR.
   *
   * The tick used to be fired from inside the `setDrag` updater, next to the
   * comparison that decides it. A state updater has to be PURE — React is
   * free to call it more than once for one dispatch, and does in development
   * — so a buzz in there is a buzz an unknown number of times. The updater
   * computes; the effect happens out here, once, against a ref.
   */
  const lastTick = React.useRef<number | null>(null)

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
    pointerY.current = event.clientY
    startScroll.current = scroller()?.scrollTop ?? 0
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    /**
     * PICKED UP. On iOS and Android this is a real impact through
     * @capacitor/haptics; in a browser it is navigator.vibrate where that
     * exists and silence where it does not. `hapticTap` is the one place that
     * knows the difference — navigator.vibrate is simply absent in WKWebView,
     * so the obvious guarded call is dead on the platform that matters most.
     */
    hapticTap("medium")
    lastTick.current = index
    setDrag({ id, from: index, dy: 0, to: index, rowHeight: box.height + 6 /* the gap */ })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return
    pointerY.current = event.clientY
    track()
  }

  /** The drag, from where the finger is and how far the list has scrolled under it. */
  const track = () => {
    const current = dragRef.current
    if (!current) return
    const dy = pointerY.current - startY.current + ((scroller()?.scrollTop ?? 0) - startScroll.current)
    /*
      Which slot this lands in, from the distance travelled rather than from
      what is under the pointer: the rows are moving out of the way as it
      goes, so "what is under the pointer" is a moving target and produces a
      list that flickers between two orders.
    */
    const slots = Math.round(dy / current.rowHeight)
    const to = Math.max(0, Math.min(order.length - 1, current.from + slots))
    /**
     * A TICK EACH TIME IT CROSSES A SLOT, and only then. Firing on every
     * pointermove would be a continuous buzz at 120Hz; firing on the landing
     * slot CHANGING is the same event the rows animate on, so the tap and the
     * movement are the same moment.
     */
    if (lastTick.current !== to) {
      lastTick.current = to
      hapticTap("light")
    }
    setDrag({ ...current, dy, to })
  }

  const endDrag = (event: React.PointerEvent) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* The pointer can be gone already; nothing to release. */
    }
    lastTick.current = null
    /* Read the drag out of the ref and act on it HERE, for the same reason
       the move handler does: what follows is two side effects, and a state
       updater has to be pure. */
    const current = dragRef.current
    setDrag(null)
    if (current) {
      /* Put down. Only when it actually moved — a press and release that
         changed nothing has nothing to confirm. */
      if (current.to !== current.from) hapticTap("medium")
      setSettling({ id: current.id, residual: current.dy - (current.to - current.from) * current.rowHeight })
      move(current.from, current.to)
    }
  }

  /*
    A LIST LONGER THAN THE SHEET (round 50). The rows could only be dragged
    as far as the visible part of the form: past its edge nothing scrolled,
    so the bottom of a long catalogue could not be reached by dragging. Near
    the top or bottom edge the form scrolls, faster the closer the finger
    is, and the drag follows it.
  */
  React.useEffect(() => {
    if (!drag) return
    let raf = 0
    const tick = () => {
      const box = scroller()
      if (box) {
        const r = box.getBoundingClientRect()
        const edge = 56
        const y = pointerY.current
        const speed = y < r.top + edge ? -Math.ceil((r.top + edge - y) / 4) : y > r.bottom - edge ? Math.ceil((y - (r.bottom - edge)) / 4) : 0
        if (speed !== 0) {
          const before = box.scrollTop
          box.scrollTop = before + Math.max(-18, Math.min(18, speed))
          if (box.scrollTop !== before) track()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id])

  /*
    THE FOCUS STAYS WITH THE ROW (round 50). React moves a row by taking a DOM
    node out and putting it back, and a focused node that is moved loses its
    focus: a keyboard user moved a product down once and was then nowhere.
    After a keyboard move the same control on the same product has it again,
    or its grip when that control has just become disabled (the top or the
    bottom of the list).
  */
  const refocus = (id: string, which: "grip" | "up" | "down") => {
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"]`)
      const want = row?.querySelector<HTMLButtonElement>(`[data-arrange="${which}"]`)
      ;(want && !want.disabled ? want : row?.querySelector<HTMLButtonElement>('[data-arrange="grip"]'))?.focus()
    })
  }
  const moveBy = (id: string, index: number, step: -1 | 1, which: "grip" | "up" | "down") => {
    move(index, index + step)
    refocus(id, which)
  }

  /** The grip with a keyboard: arrow keys move the row, and the focus stays on it. */
  const onGripKey = (event: React.KeyboardEvent, id: string, index: number) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      moveBy(id, index, event.key === "ArrowUp" ? -1 : 1, "grip")
    }
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
      const { ok, data } = await saveCreatorProfile({ productsOrder: orderToSave(order) }, "product order")
      if (!ok) throw new Error(typeof data.error === "string" ? data.error : "That did not save.")
      setOpen(false)
      /**
       * ===================================================================
       *  RE-READ THE PAGE, DO NOT RELOAD THE BROWSER
       * ===================================================================
       * This was `window.location.reload()`. The order does live in the
       * page's server data, so the page really does have to read it again —
       * but a full reload throws away the document to do it: the sheet, the
       * page behind it and everything painted on it go white, the request
       * goes out, and the whole creator page is built again from scratch.
       * On a phone that is a white screen for as long as the round trip
       * takes, immediately after pressing Save, which is what "it becomes
       * white and disappears" is, and what "a very direct, cheap reset" is.
       *
       * A refresh re-renders the server components in place and reconciles
       * the result into the DOM that is already there, with no white frame at
       * any point.
       *
       * AND IT WAITS FOR THE SHEET. It used to run on the same line as the
       * close, so the reordered grid redrew underneath a sheet that was still
       * animating down — two things at once, neither finishing before the
       * other started. `markSaved` records that there is something to show;
       * `useSaveThenRefresh` in editor-sheet does the refresh, and the
       * workspace's reload with it, once the sheet has actually gone.
       */
      markSaved()
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
        onClick={openSheet}
        /*
          It read as a disabled label sitting next to the sort control: a thin
          hairline, muted weight, no fill. This is the owner's one way into
          the order of their own shop, so it is filled, on the foreground
          colour, and looks like the button it is.
        */
        aria-label="Arrange products"
        title="Arrange products"
        className={cn(
          /*
            IT KEEPS ITS WORD, INCLUDING ON A PHONE.

            This was briefly a 30px square below `sm`, because a probe said
            the labelled button pushed the Products tab's row off the right of
            a 390px screen. The probe was wrong: it was rendering both shapes
            of the sort control at once, having pasted classes that the real
            component merges with tailwind-merge. Measured properly, with a
            full-length category name in the row, the word costs nothing —
            the heading is the same 77px either way.

            The real crowding was the category pill refusing to shrink; that
            is fixed where it lives, in catalog-controls.
          */
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background",
          "shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-transform duration-100 hover:opacity-90 active:scale-[0.97]",
          className,
        )}
      >
        <ListOrdered className="h-4 w-4 shrink-0" aria-hidden />
        Arrange
      </button>

      <EditorSheet
        open={open}
        onClosed={onClosed}
        onClose={() => setOpen(false)}
        title="Arrange products"
        onSave={save}
        busy={saving}
        error={error}
        saveDisabled={!changed}
        history={formHistory}
      >
        <p className="text-sm text-muted-foreground">
          Drag a product by its handle, or use the arrows or arrow keys. This is the order both Home and Products show.
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
                  : settling
                    ? cn("border-border", settling.id === product.id && "relative z-10")
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
                onKeyDown={(e) => onGripKey(e, product.id, index)}
                data-arrange="grip"
                /**
                 * touch-none stops the BROWSER scrolling. It does nothing
                 * about the sheet, which listens for touchmove on itself and
                 * read a downward drag from the top of the list as "pull the
                 * sheet down" — so reordering a product dismissed the editor.
                 * `data-sheet-no-drag` is the sheet's own opt-out, checked at
                 * touchdown; see components/ui/bottom-sheet.
                 */
                data-sheet-no-drag
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
                  data-arrange="up"
                  onClick={() => moveBy(product.id, index, -1, "up")}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${product.title || "product"} down`}
                  disabled={index === order.length - 1}
                  data-arrange="down"
                  onClick={() => moveBy(product.id, index, 1, "down")}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </EditorSheet>
      {/* "Saved", once the sheet has gone (useSaveThenRefresh). */}
      {toast}
    </>
  )
}

/**
 * ===========================================================================
 *  THE OWNER'S CONTROL, IN THE ROW THAT IS ALREADY THERE
 * ===========================================================================
 * This has been in three places now, and each move fixed the last one's
 * problem and introduced its own. It is worth writing down why it ends here.
 *
 * It began in the catalogue header beside the category and sort controls,
 * where it read as a third filter. Moved to its own row above the grid, it
 * stopped reading as a filter and started costing a whole row of vertical
 * space between the heading and the first card — on Home, where the header
 * row is otherwise EMPTY, that is a gap for nothing.
 *
 * So: back into the header row, at the right, where the row already exists
 * and is already `min-h-9`. A 30px button in a 36px row adds no height at
 * all, which is the whole point. What keeps it from reading as a filter is
 * not distance any more, it is weight: the category and sort controls are
 * quiet outlines, this is filled and on the foreground colour, so it reads as
 * the one thing in the row that DOES something rather than as a third way to
 * narrow a list.
 *
 * Nobody but the owner ever renders it. The page decides that from the
 * session, and a visitor's HTML does not contain it.
 */
export function ArrangeProductsControl({
  products,
  allProducts,
  isOwner,
}: {
  products: ArrangeableProduct[]
  /** The whole catalogue in its current order, when `products` is a selection of it. */
  allProducts?: ArrangeableProduct[]
  /** From the session, on the server. Never a client-side guess. */
  isOwner?: boolean
}) {
  if (!isOwner || products.length < 2) return null
  return <ArrangeProductsButton products={products} allProducts={allProducts} />
}
