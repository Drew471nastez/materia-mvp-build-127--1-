"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, ChevronRight, GripVertical, Info, Loader2, Plus, Search, X } from "lucide-react"
import {
  CATEGORY_INDEX,
  COLOURS,
  CONDITIONS,
  DESCRIPTION_PLACEHOLDER,
  ERAS,
  LISTING_CATEGORIES,
  MAX_PHOTOS,
  MIN_PHOTOS,
  SIZES,
  SOURCES,
  STYLES,
  categoryLabelFor,
  type Option,
} from "@/lib/marketplace/listing-taxonomy"
import { triggerHaptic } from "@/lib/native-bridge"
import { DragSheet } from "@/components/ui/drag-sheet"
import { processListingImage, ImageRejected } from "@/lib/images/pipeline"
import type { ImageVariant } from "@/lib/images/variants"
import { indexAtPoint, moveItem, type Box } from "@/lib/sell/reorder"
import { cn } from "@/lib/utils"

type Photo = {
  id: string
  /** The LARGE variant's public URL — what thumbnail_url/gallery_urls store. */
  url: string | null
  uploading: boolean
  localUrl: string
  /** The optimised pair, sent on publish. Null when the phone could not
   *  re-encode: the listing still works, the card falls back to `url`, and the
   *  backfill fills it in later. */
  variant: ImageVariant | null
}

/** A tappable row that shows what's chosen and opens its picker. */
function Field({
  label,
  value,
  onClick,
  required,
}: {
  label: string
  value: string | null
  onClick: () => void
  required?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 py-3.5 text-left last:border-b-0"
    >
      <span className="shrink-0 text-[15px] text-neutral-900">
        {label}
        {required && <span className="ml-0.5 text-[#7c3aed]">*</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-[15px]", value ? "text-neutral-900" : "text-neutral-400")}>
          {value || "Alege"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
      </span>
    </button>
  )
}

/**
 * One choice in a picker.
 *
 * Every sheet was writing its own: a rounded box with a hover tint, 14.5px
 * text, a check floated to the right, and 2px of padding round the list so the
 * rows sat in from the edges. Six copies of it, none quite the same, and the
 * result read like a web menu dropped into a phone rather than like the
 * platform's own list — which is what "the option selector styles" is.
 *
 * So: one row, full-bleed to the sheet's edges, 54px tall — comfortably past
 * the 44pt minimum, and past the point where a list of them is a wall of text.
 * Hairlines between rows rather than a gap, so the list reads as one surface.
 * The selected one is stated twice, in tint and in a check, because on a phone
 * in daylight a colour alone is not a state.
 *
 * `active:` rather than `hover:`. A phone has no hover, and the hover styles
 * these rows carried were dead weight that also produced a stuck highlight
 * after a tap on iOS.
 */
function OptionRow({
  label,
  selected,
  onClick,
  swatch,
  multi,
}: {
  label: string
  selected: boolean
  onClick: () => void
  /** A colour chip, for the palette. */
  swatch?: string
  /** Ticks stay put and the sheet stays open — the caller closes it. */
  multi?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(
        "flex w-full items-center gap-3 border-b border-neutral-100 px-4 text-left transition-colors duration-150 last:border-b-0 active:bg-neutral-100",
        selected && "bg-violet-50/70",
      )}
      style={{ minHeight: 54 }}
    >
      {swatch && (
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 rounded-full border border-black/10"
          style={{ background: swatch }}
        />
      )}
      <span className={cn("min-w-0 flex-1 truncate text-[15.5px]", selected ? "font-semibold text-[#7c3aed]" : "text-neutral-900")}>
        {label}
      </span>
      {multi ? (
        <span
          aria-hidden
          className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150",
            selected ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-neutral-300",
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      ) : (
        selected && <Check className="h-[18px] w-[18px] shrink-0 text-[#7c3aed]" strokeWidth={2.6} />
      )}
    </button>
  )
}

/**
 * The four things the sheet can be doing, and the class for each.
 *
 *   enter  sliding up. On the element from the server render, so the sheet is
 *          off-screen before hydration rather than drawn in place first.
 *   armed  not moving yet, but the compositor layer exists and the blurs are
 *          off — one frame of this before a close, so the layer is not being
 *          built on the frame the movement starts.
 *   leave  sliding down.
 *   idle   arrived. No layer held, no blurs suspended.
 */
/** How long the confirmation takes to fade off an emptied form. */
const POSTED_OUT_MS = 260

type SheetMotion = "enter" | "armed" | "leave" | "idle"

const MOTION_CLASS: Record<SheetMotion, string> = {
  enter: "sell-sheet-enter",
  armed: "sell-sheet-armed",
  leave: "sell-sheet-leave",
  idle: "",
}

export function NewListingForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  /** The sheet's one scroller — sent back to the top when a second listing starts. */
  const scrollerRef = useRef<HTMLDivElement>(null)

  /**
   * The draft being finished, if this is one.
   *
   * Read once at first client render from the URL, not with `useSearchParams`:
   * that hook forces a Suspense boundary around this component, so the sheet
   * would mount, suspend and mount AGAIN — playing its slide twice. The same
   * reasoning, and the same fix, as the listing page's `origin` breadcrumb.
   */
  const [draftId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      return new URLSearchParams(window.location.search).get("draft")
    } catch {
      return null
    }
  })
  /** Filling in from a saved draft. Distinct from "no photos yet". */
  const [loadingDraft, setLoadingDraft] = useState(false)

  const [photos, setPhotos] = useState<Photo[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [group, setGroup] = useState<string | null>(null)
  const [item, setItem] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [condition, setCondition] = useState<string | null>(null)
  const [colour, setColour] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [era, setEra] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [styles, setStyles] = useState<string[]>([])
  const [price, setPrice] = useState("")
  const [compareAt, setCompareAt] = useState("")
  const [postAnother, setPostAnother] = useState(false)

  const [sheet, setSheet] = useState<null | "category" | "brand" | "condition" | "colour" | "size" | "era" | "source" | "style">(null)
  const [catQuery, setCatQuery] = useState("")
  const [brandQuery, setBrandQuery] = useState("")
  const [brands, setBrands] = useState<{ name: string; slug: string }[]>([])
  const [saving, setSaving] = useState<null | "draft" | "post">(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * The confirmation: absent, arriving, or leaving.
   *
   * It used to be a boolean, and "publish and add another" took it off by
   * flipping that boolean to false — a full-screen white veil disappearing
   * between two frames, which is the most visible possible place for a hard
   * cut because at that moment it is the only thing on screen. Three states
   * mean it can fade out over the emptied form instead.
   */
  const [posted, setPosted] = useState<false | "in" | "out">(false)

  /**
   * Fill the form in from a saved draft.
   *
   * The photos come back as URLs that are already uploaded, so they are marked
   * `uploading: false` with their url in place — the form's own upload path is
   * for files being chosen NOW, and re-running it against something already in
   * storage would upload it a second time.
   *
   * A draft that cannot be loaded — deleted on another device, or somebody
   * else's id in the URL — leaves an empty form rather than an error page. The
   * worst case is writing a listing from scratch, which is what the screen is
   * for anyway.
   */
  useEffect(() => {
    if (!draftId) return
    let alive = true
    setLoadingDraft(true)
    fetch(`/api/listings/drafts/${encodeURIComponent(draftId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.draft) return
        const v = d.draft
        const urls: string[] = [v.thumbnail_url, ...(Array.isArray(v.gallery_urls) ? v.gallery_urls : [])].filter(
          (u: unknown): u is string => typeof u === "string" && !!u,
        )
        const variants = Array.isArray(v.image_variants) ? v.image_variants : []
        setPhotos(
          urls.map((url, i) => ({
            id: `draft-${i}-${url.slice(-12)}`,
            url,
            uploading: false,
            localUrl: url,
            variant: variants[i] ?? null,
          })),
        )
        setTitle(v.title ?? "")
        setDescription(v.description ?? "")
        setGroup(v.category ?? null)
        setItem(v.subcategory ?? null)
        setBrand(v.brand ?? null)
        setCondition(v.condition ?? null)
        setColour(v.colour ?? null)
        setSize(v.size ?? null)
        setEra(v.era ?? null)
        setSources(Array.isArray(v.source_tags) ? v.source_tags : [])
        setStyles(Array.isArray(v.style_tags) ? v.style_tags : [])
        // Minor units back to what somebody typed. 0 is "no price yet" on a
        // draft, and must not come back as the string "0".
        setPrice(v.price_cents > 0 ? String(v.price_cents / 100) : "")
        setCompareAt(v.compare_at_cents > 0 ? String(v.compare_at_cents / 100) : "")
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingDraft(false)
      })
    return () => {
      alive = false
    }
  }, [draftId])

  // ---- photos ----
  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    const staged: Photo[] = chosen.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: null,
      uploading: true,
      // Shown immediately from the local file, so the tile is never an empty
      // box waiting on a network round trip.
      localUrl: URL.createObjectURL(f),
      variant: null,
    }))
    setPhotos((p) => [...p, ...staged])

    /**
     * SEQUENTIAL, not Promise.all — and that is the change that matters here.
     *
     * Each photo is now decoded, rotated upright, cropped to 4:5 and encoded
     * twice before it is sent. Eight 12-megapixel photos doing that at once is
     * where a phone runs out of memory and the tab is killed, which takes the
     * half-filled form with it. One at a time, with the thread handed back
     * between them, keeps the form usable while the tiles fill in.
     */
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i]
      const id = staged[i].id
      try {
        // Two files out of one: the 4:5 card crop and the full-ratio large
        // version. Never throws for a photo it cannot process — it passes the
        // original through — so the only rejections are the deliberate ones
        // (too big, wrong type). See lib/images/pipeline.ts.
        const out = await processListingImage(file)

        const fd = new FormData()
        fd.append("file", out.large)
        if (!out.passthrough) {
          fd.append("thumb", out.thumb)
          fd.append("width", String(out.width))
          fd.append("height", String(out.height))
          fd.append("thumbWidth", String(out.thumbWidth))
          fd.append("thumbHeight", String(out.thumbHeight))
          fd.append("focal", JSON.stringify(out.focal))
        }

        const res = await fetch("/api/listings/photo", { method: "POST", body: fd, credentials: "include" })
        const data = await res.json()
        setPhotos((p) =>
          p.map((ph) =>
            ph.id === id
              ? { ...ph, url: data?.url ?? null, variant: data?.variant ?? null, uploading: false }
              : ph,
          ),
        )
      } catch (e) {
        // A file the pipeline REFUSED (over 20 MB, not an image) is worth
        // saying so about — silently dropping a tile reads as the app losing
        // the photo. Anything else is a network failure and the tile goes.
        if (e instanceof ImageRejected) {
          setError(
            e.reason === "too-large"
              ? "Una dintre imagini depășește 20 MB."
              : "Una dintre imagini nu a putut fi citită.",
          )
        }
        setPhotos((p) => p.filter((ph) => ph.id !== id))
      }
      // Hand the main thread back between photos.
      await new Promise((r) => setTimeout(r, 0))
    }
  }, [photos.length])

  const removePhoto = useCallback((id: string) => {
    setPhotos((p) => p.filter((ph) => ph.id !== id))
  }, [])

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  DRAG TO REORDER — one implementation, three platforms
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * It was HTML5 drag-and-drop: `draggable`, `onDragStart`, `onDragOver`. That
   * is a desktop-mouse API. A finger does not produce those events at all, so
   * on iOS, on Android and in every mobile browser the tiles simply could not be
   * moved — under a caption that told you to drag them.
   *
   * Pointer events are the one input model all three share. A mouse, a finger
   * and a stylus all arrive as pointerdown / pointermove / pointerup with the
   * same coordinates, so there is one code path here and no branch on platform
   * anywhere in it.
   *
   * ── Why a handle, and not the tile ────────────────────────────────────────
   * A drag that starts anywhere on the tile has to be told apart from a page
   * scroll that starts on the tile, and every way of doing that is a
   * compromise: `touch-action: none` makes the form unscrollable wherever a
   * photo is, and a long-press adds a delay to every drag and still misfires.
   * A handle has no ambiguity — the browser is told `touch-action: none` on
   * 28 pixels, the rest of the tile and the whole form scroll exactly as they
   * did, and the same handle is what a mouse grabs. It is also what Reminders
   * and Files use, for the same reason.
   *
   * ── Why pointer capture ───────────────────────────────────────────────────
   * Once the drag starts the handle owns the pointer, so moves keep arriving
   * even when the finger is over a different tile — which it is, immediately,
   * because that is what dragging is. Without it the events go to whatever is
   * under the pointer and the drag dies on the first tile boundary.
   *
   * ── Why the list reorders during the drag, not at the end ─────────────────
   * So you can see where it will land. The tiles that move are animated with
   * FLIP (measure, invert, play) because a grid re-flows by LAYOUT — the tiles
   * do not translate, they are simply somewhere else on the next frame, and
   * without this they teleport.
   */
  const tileEls = useRef(new Map<string, HTMLElement>())
  const setTileEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tileEls.current.set(id, el)
    else tileEls.current.delete(id)
  }, [])

  /** Rects captured immediately BEFORE a reorder, replayed after it. */
  const flipFrom = useRef<Map<string, DOMRect> | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const drag = useRef<{ id: string; grabX: number; grabY: number } | null>(null)

  const measureTiles = useCallback(() => {
    const m = new Map<string, DOMRect>()
    tileEls.current.forEach((el, id) => m.set(id, el.getBoundingClientRect()))
    return m
  }, [])

  /** Where the dragged tile should sit for the pointer's current position. */
  const paintDragged = useCallback((x: number, y: number) => {
    const d = drag.current
    if (!d) return
    const el = tileEls.current.get(d.id)
    if (!el) return
    el.style.transition = "none"
    el.style.transform = `translate3d(${x - d.grabX}px, ${y - d.grabY}px, 0) scale(1.06)`
  }, [])

  /**
   * FLIP, after the array has changed.
   *
   * A layout effect, so it runs after React has moved the tiles and before the
   * browser paints them there: each one is put back where it was with no
   * transition, and released a frame later. In a passive effect the browser
   * paints the new positions first, which is the teleport this exists to
   * prevent.
   */
  useLayoutEffect(() => {
    const before = flipFrom.current
    flipFrom.current = null
    if (!before) return
    const dragging = drag.current?.id
    tileEls.current.forEach((el, id) => {
      if (id === dragging) return // that one is following the finger
      const from = before.get(id)
      if (!from) return
      const to = el.getBoundingClientRect()
      const dx = from.left - to.left
      const dy = from.top - to.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      el.style.transition = "none"
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      requestAnimationFrame(() => {
        el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
        el.style.transform = ""
      })
    })
  })

  /**
   * POINTER CAPTURE DOES NOT SURVIVE THE REORDER, so the drag does not use it.
   *
   * The obvious build was `setPointerCapture` on the grip. It fails, and it
   * fails on the very first swap: reordering a keyed list makes React MOVE the
   * existing DOM nodes (insertBefore), moving a node detaches and re-attaches
   * it, and an element that leaves the document loses its capture. So the grip
   * stopped receiving pointermove the moment the first reorder happened.
   *
   * Caught by driving it with real pointer events: exactly two moves reached
   * the grip, the second of them after the drag had already ended, and the
   * order came out 123546 instead of 412356 — one swap, then nothing.
   *
   * The listeners go on `window` for the length of the drag instead. Window
   * cannot be reordered out from under them, and the events arrive by bubbling
   * from whatever is under the finger, which is exactly what a drag is.
   *
   * The gesture is still ours on touch without capture, because `touch-action:
   * none` on the grip is evaluated at touch-start against the element the
   * gesture BEGAN on. The browser therefore never claims it for a scroll,
   * however far the finger travels afterwards.
   */
  const photosRef = useRef(photos)
  photosRef.current = photos

  /**
   * THE SLOTS, measured once when the drag starts.
   *
   * Hit-testing against the tiles' LIVE rects oscillates, and the trace of a
   * single upward drag shows it plainly — 3→4, 4→3, 3→0, 0→3, 3→0, 0→3 — the
   * list flipping back and forth under a finger moving steadily in one
   * direction. The cause is that reordering moves the tiles, so the geometry
   * you are testing against is changed by the answer you just gave: the item
   * arrives at slot 0, everything shifts, and now a different tile is nearest.
   *
   * A grid's SLOTS do not move. The number of items does not change during a
   * drag, so the cells stay exactly where they were — only their contents
   * change. Measured once at pointerdown and tested against for the whole
   * gesture, the answer depends only on where the finger is, which is the one
   * thing that should decide it.
   */
  const slots = useRef<Box[]>([])

  const onGripDown = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      // Never let the browser turn this into a scroll, a text selection or a
      // native image drag.
      e.preventDefault()
      e.stopPropagation()
      const el = tileEls.current.get(id)
      if (!el) return
      drag.current = { id, grabX: e.clientX, grabY: e.clientY }
      slots.current = photosRef.current.map((ph) => {
        const t = tileEls.current.get(ph.id)
        const r = t?.getBoundingClientRect()
        return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: -1e6, top: -1e6, right: -1e6, bottom: -1e6 }
      })
      setDragId(id)
      el.style.zIndex = "20"
      el.style.willChange = "transform"
      void triggerHaptic("light")
    },
    [],
  )

  useEffect(() => {
    if (!dragId) return

    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      // Non-passive, so this actually suppresses whatever the platform would
      // otherwise do with a finger travelling across the page.
      e.preventDefault()
      paintDragged(e.clientX, e.clientY)

      const from = photosRef.current.findIndex((p) => p.id === d.id)
      if (from < 0) return
      // Against the slots, which are where the finger is aiming — not against
      // the tiles, which are what the answer moves.
      const to = indexAtPoint(slots.current, e.clientX, e.clientY)
      if (to < 0 || to === from) return

      flipFrom.current = measureTiles()
      setPhotos((p) => moveItem(p, from, to))

      // The dragged tile's own slot has moved, so re-anchor it to the finger:
      // clear the transform, then treat the pointer's current position as the
      // new grab point. Without this the picture jumps by one slot on every
      // swap. A frame later, so React has committed the new positions first.
      const el = tileEls.current.get(d.id)
      if (el) {
        requestAnimationFrame(() => {
          const cur = drag.current
          if (!cur || cur.id !== d.id) return
          el.style.transition = "none"
          el.style.transform = "none"
          void el.offsetWidth
          cur.grabX = e.clientX
          cur.grabY = e.clientY
          paintDragged(e.clientX, e.clientY)
        })
      }
    }

    const end = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      setDragId(null)
      const el = tileEls.current.get(d.id)
      if (el) {
        // Settles into the slot it now occupies rather than snapping to it.
        el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
        el.style.transform = ""
        window.setTimeout(() => {
          el.style.zIndex = ""
          el.style.willChange = ""
          el.style.transition = ""
        }, 240)
      }
      void triggerHaptic("light")
    }

    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [dragId, measureTiles, paintDragged])

  /**
   * The same operation without a drag: promote a photo to the cover.
   *
   * Kept alongside the drag, not replaced by it. Dragging is the general tool;
   * this is the one move anybody actually makes, it is a single tap, and it is
   * the only one of the two that a keyboard or an assistive device can perform.
   */
  const makeCover = useCallback((id: string) => {
    flipFrom.current = measureTiles()
    setPhotos((p) => moveItem(p, p.findIndex((ph) => ph.id === id), 0))
  }, [measureTiles])

  /**
   * THE SLIDE UP.
   *
   * `useState(true)` — not false-then-true. The old approach set entering in a
   * LAYOUT EFFECT, which runs before paint but AFTER the initial commit. On the
   * intercepted route the SSR HTML lands with `entering=false` and no
   * `sell-sheet-enter` class, so the sheet is technically drawn at its
   * destination position — translate(0) — for the frame between HTML delivery
   * and React hydration. On a fast device the layout effect fires first and
   * nobody notices; on a slow one the sheet snaps into place and then plays
   * its slide from off-screen over the top, which is the "flash" — a frame of
   * the sheet in position, followed by a frame of it below the screen,
   * followed by the animation.
   *
   * Starting at `true` means both the SSR HTML and the first client paint
   * carry the class, so the sheet is off-screen from the very first pixel.
   *
   * Taken off on a timer. The animation ends at `transform: none` so nothing
   * is left behind, but `will-change: transform` would keep a full-screen
   * compositor layer alive for as long as the form is open — the screen where
   * you least want one, because every keypress in a textarea repaints against
   * it.
   */
  /**
   * ── MOTION IS A REF, NOT STATE ─────────────────────────────────────────────
   *
   * Every class this element wears during the slide used to be React state, so
   * starting the close RE-RENDERED a 1,381-line component on the very frame the
   * animation began — reconciling the whole form while the compositor was meant
   * to be doing nothing but moving a layer. That is main-thread work landing in
   * the worst possible frame, and it is the last thing between this and a slide
   * that never touches the main thread at all.
   *
   * The ref is the source of truth and the class is written straight onto the
   * node. `className` still reads the ref, so the server render carries the
   * enter class from the very first painted pixel, and any re-render this
   * component happens to do for its own reasons — an upload finishing, a brand
   * search returning — recomputes the SAME class rather than wiping the one the
   * animation is using.
   */
  const sheetRef = useRef<HTMLDivElement>(null)
  const motion = useRef<SheetMotion>("enter")

  /** Swap the class on the node itself. No render, no reconciliation. */
  const setMotion = useCallback((next: SheetMotion) => {
    const el = sheetRef.current
    if (el) {
      const from = MOTION_CLASS[motion.current]
      const to = MOTION_CLASS[next]
      if (from) el.classList.remove(from)
      if (to) el.classList.add(to)
    }
    motion.current = next
  }, [])

  /**
   * THE SLIDE UP starts from the first painted frame — the class is in the
   * server HTML, so the sheet is off-screen before hydration rather than being
   * drawn in place and then sent back down, which was the old flash.
   *
   * Taken off once it has arrived. The animation ends at translate3d(0,0,0) so
   * nothing is left out of place, but `will-change: transform` would keep a
   * full-screen compositor layer alive for as long as the form is open — the
   * screen where you least want one, because every keypress in a textarea
   * repaints against it.
   *
   * On `animationend` rather than a timer: the browser knows exactly when it
   * finished and a number does not. A timer set to 460 for a 420ms animation
   * was both a guess and 40ms of a layer nobody needed.
   */
  const onSheetAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      if (motion.current === "enter") setMotion("idle")
    },
    [setMotion],
  )

  const closing = useRef(false)
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true

    // Armed for one frame first: `will-change` only exists while one of the
    // motion classes is on the element, and the enter class comes off when the
    // sheet arrives. Without this the browser has to BUILD a full-screen
    // compositor layer on the very frame the close starts, and that build is
    // the hitch. Arming also suspends every backdrop-filter inside — see the
    // note in globals.css.
    setMotion("armed")
    // A frame, not a guessed delay. rAF is exactly "after the browser has had a
    // chance to act on what I just set", which is the entire requirement.
    requestAnimationFrame(() => setMotion("leave"))

    /**
     * 296 — one frame INSIDE the animation rather than on its last.
     *
     * The leave runs 300ms and starts a frame after this timer is set. Firing
     * the navigation on the tick the sheet reaches the bottom puts the route
     * commit and the last frame in the same slot, and on a slow frame they land
     * in the wrong order: the sheet is unmounted while it still has a pixel or
     * two of travel left, so the last thing you see is it disappearing rather
     * than leaving. Landing just inside means the commit is already in flight
     * when the animation finishes.
     *
     * It cannot go much earlier without the opposite problem — the screen
     * behind appearing while the sheet is still visibly over it.
     *
     * Where it goes: back if there is anywhere to go back to, the feed
     * otherwise. A sheet opened from the + always has history behind it, so
     * back returns you to whatever you were looking at — the difference between
     * a sheet closing and a navigation happening. A cold arrival has nothing to
     * pop, and `router.back()` on an empty stack does nothing at all, which
     * would leave the only way out of a full-screen form dead.
     */
    window.setTimeout(() => {
      if (typeof window !== "undefined" && window.history.length > 1) router.back()
      else router.push("/")
    }, 296)
  }, [router, setMotion])

  // ---- brand search ----
  useEffect(() => {
    if (sheet !== "brand") return
    let cancelled = false
    const id = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(brandQuery)}`)
        .then((r) => (r.ok ? r.json() : { brands: [] }))
        .then((d) => {
          if (!cancelled) setBrands(Array.isArray(d?.brands) ? d.brands : [])
        })
        .catch(() => {})
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sheet, brandQuery])

  const catResults = useMemo(() => {
    const q = catQuery.trim().toLowerCase()
    if (!q) return null
    return CATEGORY_INDEX.filter(
      (c) => c.item.label.toLowerCase().includes(q) || c.groupLabel.toLowerCase().includes(q),
    ).slice(0, 40)
  }, [catQuery])

  const toggleIn = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]

  const label = (opts: Option[], id: string | null) => opts.find((o) => o.id === id)?.label ?? null

  const uploaded = photos.filter((p) => p.url)
  const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100)
  const compareCents = compareAt ? Math.round(parseFloat(compareAt.replace(",", ".")) * 100) : null

  const missing = useMemo(() => {
    const m: string[] = []
    if (uploaded.length < MIN_PHOTOS) m.push(`cel puțin ${MIN_PHOTOS} fotografii`)
    if (!title.trim()) m.push("titlu")
    if (description.trim().length < 10) m.push("descriere")
    if (!group || !item) m.push("categorie")
    if (!brand) m.push("brand")
    if (!condition) m.push("stare")
    if (!colour) m.push("culoare")
    if (!size) m.push("mărime")
    if (!Number.isFinite(priceCents) || priceCents < 0) m.push("preț")
    if (compareCents !== null && Number.isFinite(priceCents) && compareCents <= priceCents)
      m.push("prețul comparativ trebuie să fie mai mare decât prețul")
    return m
  }, [uploaded.length, title, description, group, item, brand, condition, colour, size, priceCents, compareCents])

  const submit = useCallback(
    async (draft: boolean) => {
      setError(null)
      if (!draft && missing.length) {
        setError(`Mai lipsește: ${missing.join(", ")}.`)
        return
      }
      setSaving(draft ? "draft" : "post")
      try {
        // FINISHING A DRAFT UPDATES THE ROW IT CAME FROM.
        //
        // POSTing again would create a SECOND listing and leave the draft
        // behind — so saving twice would leave two half-listings, and
        // publishing would leave a live listing next to the draft it came
        // from, both of which are things somebody then has to tidy up by hand.
        // It also mints a fresh slug, breaking any link already shared.
        const res = await fetch(draftId ? `/api/listings/drafts/${encodeURIComponent(draftId)}` : "/api/listings", {
          method: draftId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            draft,
            // The PATCH route asks the question the other way round, because
            // "am I publishing" is what it has to decide about.
            publish: !draft,
            photos: uploaded.map((p) => p.url),
            // Positionally aligned with `photos`, so index 0 is the cover in
            // both. A null element is a photo the phone could not re-encode —
            // the server keeps the alignment and the card falls back to the
            // url above. See lib/images/variants.ts.
            image_variants: uploaded.map((p) => p.variant),
            title: title.trim(),
            description: description.trim(),
            price_cents: Number.isFinite(priceCents) ? priceCents : 0,
            compare_at_cents: compareCents,
            category: group,
            subcategory: item,
            brand,
            condition,
            colour,
            size,
            era,
            source_tags: sources,
            style_tags: styles,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login?redirect=/products/new")
            return
          }
          // Show what the server actually said. "Try again" told you nothing
          // and repeating the same request would have failed the same way.
          setError(
            data?.fields?.length
              ? `Mai lipsește: ${data.fields.join(", ")}.`
              : data?.message
                ? `Nu am putut publica anunțul: ${data.message}`
                : "Nu am putut publica anunțul. Încearcă din nou.",
          )
          setSaving(null)
          return
        }
        setPosted("in")

        /**
         * WHAT HAPPENS AFTER "Publică anunțul".
         *
         * ── Another one ───────────────────────────────────────────────────
         * `window.location.assign("/products/new")` — a full document load, to
         * arrive at the screen you were already on. It threw away the React
         * tree, the router cache and the sheet itself, took a second or more,
         * and on the way it turned the intercepted overlay back into a plain
         * page, so the next listing you wrote had no screen behind it and no
         * slide to close with.
         *
         * Nothing needs to navigate. "Another one" is an empty form, and this
         * component can simply be empty: the fields are cleared in place, the
         * scroller goes back to the top, and the confirmation stays up while
         * that happens. No load, no route change, nothing to go wrong.
         *
         * ── The listing you just made ─────────────────────────────────────
         * That IS a navigation, and the sheet should leave the way it arrived
         * rather than being deleted out from under you — pushing straight to
         * the listing empties the modal slot, so the sheet vanished in a frame.
         * It slides down first and the route change goes on the end of it.
         *
         * `replace`, not `push`: /products/new must not be left in the history
         * behind the listing, or the back gesture out of a listing you have
         * just published reopens the form you published it from.
         */
        window.setTimeout(() => {
          if (postAnother && !draft) {
            setPhotos([])
            setTitle("")
            setDescription("")
            setGroup(null)
            setItem(null)
            setBrand(null)
            setCondition(null)
            setColour(null)
            setSize(null)
            setEra(null)
            setSources([])
            setStyles([])
            setPrice("")
            setCompareAt("")
            setError(null)
            setSaving(null)
            // INSTANT, and while the veil still covers everything.
            //
            // It was a SMOOTH scroll, fired on the same tick the veil was
            // removed — so you watched a form that had just lost most of its
            // height slide back to the top, with the scroll position clamping
            // under it as the content shrank. That is the layout shift: a
            // deliberate animation of a container whose size was changing
            // beneath it. Behind the veil there is nothing to animate for.
            scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" })
            void triggerHaptic("light")
            // Then the veil fades off the empty form rather than being deleted.
            setPosted("out")
            window.setTimeout(() => setPosted(false), POSTED_OUT_MS)
            return
          }
          // The other way the sheet leaves, and it gets the same treatment:
          // armed a frame early so the layer is waiting, and driven off React
          // so publishing does not reconcile the form under the animation.
          setMotion("armed")
          requestAnimationFrame(() => setMotion("leave"))
          window.setTimeout(() => {
            if (draft) router.replace("/products/drafts")
            else if (data?.slug) router.replace(`/products/${data.slug}`)
            else router.replace("/")
          }, 316)
        }, 1100)
      } catch {
        setError("Ceva n-a mers. Verifică conexiunea și încearcă din nou.")
        setSaving(null)
      }
    },
    [missing, uploaded, title, description, priceCents, compareCents, group, item, brand, condition, colour, size, era, sources, styles, postAnother, router, setMotion, draftId],
  )

  // One definition rendered in two places — the phone's pinned bottom bar and
  // the desktop sticky card — so the two sets of controls can never drift
  // apart in copy, state, or behaviour.
  const actionControls = (
    <>
      {/* A row, not a floating label. It shares the buttons' left edge exactly
          because it is in the same padded column, and it is 40px tall so it is
          a target rather than a 16px box you have to aim at. */}
      <label className="-mx-1 flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl px-1 text-[13.5px] text-neutral-600 active:bg-neutral-50">
        <input
          type="checkbox"
          checked={postAnother}
          onChange={(e) => setPostAnother(e.target.checked)}
          className="h-[18px] w-[18px] shrink-0 accent-[#7c3aed]"
        />
        <span className="min-w-0">Publică și adaugă încă un articol</span>
      </label>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("light")
            void submit(true)
          }}
          disabled={saving !== null}
          className="h-12 flex-1 rounded-full bg-neutral-100 text-[15px] font-semibold text-neutral-700 transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
        >
          Salvează
        </button>
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("light")
            void submit(false)
          }}
          disabled={saving !== null}
          // And no purple halo under the button either. A coloured glow around
          // a solid fill is the same mistake as the bar's shadow at a smaller
          // size: the button is already the only saturated thing on a white
          // strip, so the glow adds no separation and reads as a smudge under
          // it — which on a bar sitting at the very bottom edge of the screen
          // is the most conspicuous place to have one.
          className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
        >
          {saving === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publică anunțul
        </button>
      </div>
    </>
  )

  return (
    /**
     * A SHEET ON A PHONE, A PAGE ON A MONITOR.
     *
     * `fixed inset-0` and a flex column: header, one scroller, footer. Three
     * things follow from that and all three were problems before.
     *
     * It is genuinely full screen. It used to be a page inside the app shell,
     * under the search-and-categories strip and above the tab bar, so the form
     * you were filling in had about two thirds of the screen and two rows of
     * chrome belonging to other parts of the app.
     *
     * Nothing inside it is `position: fixed` any more. The Publish bar was
     * `fixed bottom-[62px] z-90`, a number chosen to clear a tab bar that is no
     * longer there — and a fixed child cannot survive the slide, because a
     * transformed ancestor becomes its containing block. As a flex row at the
     * bottom of the column it is simply always at the bottom, with no magic
     * numbers and nothing to re-anchor.
     *
     * And the scroll belongs to the middle. `min-h-0` is what makes that work:
     * a flex child will not shrink below its content without it, so the
     * scroller grows instead of scrolling and the footer is pushed off the
     * bottom of the screen.
     *
     * From `md` up every one of those reverts and it is the ordinary two-column
     * page it was.
     */
    <div
      ref={sheetRef}
      onAnimationEnd={onSheetAnimationEnd}
      className={cn(
        "sell-sheet fixed inset-0 z-[95] flex flex-col bg-[#f6f6f7] md:static md:z-auto md:block md:pb-20",
        // Read from the ref, so the server render carries the enter class and a
        // re-render for any other reason recomputes the same one the animation
        // is already using rather than wiping it.
        MOTION_CLASS[motion.current],
      )}
    >
      {/* The header. An X and a title, like every sheet on a phone — and it
          pays the status-bar inset itself, because the strip that used to do
          that for this route is gone. */}
      <header
        // Opaque, and NO backdrop blur. It sits directly on the sheet's own
        // solid background, so there was never anything behind it to blur —
        // the filter cost a full re-composite on every frame of the slide and
        // bought a visual difference of precisely nothing.
        className="shrink-0 border-b border-neutral-200/80 bg-white md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="relative flex h-14 items-center justify-center px-2">
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              close()
            }}
            aria-label="Închide"
            className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
          >
            <X className="h-[23px] w-[23px]" strokeWidth={2.2} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
            Vinde un articol
          </h1>
        </div>
      </header>

      {/* The one scroller. */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto [overflow-x:clip] overscroll-contain md:overflow-visible"
      >
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 sm:pt-9 md:max-w-5xl">
      <header className="mb-5 hidden md:block">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px]">
          Listează un articol
        </h1>
        <p className="mt-1 text-[14.5px] text-neutral-500">
          Completează detaliile și anunțul tău apare instant în feed.
        </p>
      </header>

      {/* Desktop splits the form in two: media and prose on the left, the
          attribute pickers and price on the right. On phones the grid
          collapses back to the exact single-column order it always had, and
          the columns must NOT be items-start: the right column has to stretch
          to the full row height so the sticky action card inside it has room
          to travel while the long left column scrolls. */}
      <div className="md:grid md:grid-cols-2 md:gap-6">
      <div className="min-w-0">
      {/* ---- Photos ---- */}
      {/**
        * The photo step, rebuilt.
        *
        * It was a row of 3:4 thumbnails at a quarter of the width — about 78px
        * across on a phone — with a 24px delete target in the corner of each,
        * and a line of copy underneath promising you could drag them to
        * reorder. On touch you could not: the reordering is HTML5 drag-and-drop,
        * which a finger does not produce. So the instruction was wrong, the
        * pictures were too small to judge, and the only control on them was
        * easier to hit by accident than on purpose.
        *
        * What matters here is which photograph is the COVER — it is the one the
        * whole marketplace sees — and that was a 10px pill on a 78px tile.
        *
        * So the cover is now a photograph you can actually look at, full width
        * of the card and in the 3:4 the grid crops to, with its role stated on
        * it. The others sit under it in a three-across strip, each with a
        * one-tap "Copertă" that promotes it — which is the reordering people
        * actually want, done in a way that works with a finger, instead of a
        * drag that only ever worked with a mouse.
        */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">
            Fotografii<span className="ml-0.5 text-[#7c3aed]">*</span>
          </h2>
          <span className="text-[13px] tabular-nums text-neutral-400">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-neutral-500">
          {photos.length === 0
            ? `Adaugă minimum ${MIN_PHOTOS}. Prima este coperta anunțului.`
            : "Prima este coperta. Trage de mâner ca să le rearanjezi."}
        </p>

        {/* Nothing yet: one target the size of the job. Aiming at a thumbnail
            before a single photo exists is backwards, and the first photo is
            the whole reason anybody opens this screen. */}
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              fileRef.current?.click()
            }}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50/60 px-4 py-10 transition-colors active:border-[#7c3aed] active:bg-violet-50/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#7c3aed] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Camera className="h-[22px] w-[22px]" />
            </span>
            <span className="text-[15.5px] font-semibold text-neutral-900">Adaugă fotografii</span>
            <span className="text-[12.5px] text-neutral-500">Lumină bună, fundal simplu</span>
          </button>
        ) : (
          /* ONE GRID, every tile the same and every tile draggable.
             The previous version gave the cover its own full-width panel and
             put the rest in a strip underneath. That reads well and reorders
             badly: there is no coherent way to drag a small tile into a big
             slot, and "first" stops being a position you can drag to. With one
             grid, position 1 is a place like any other and dragging anything
             into it makes it the cover — which is the whole of what reordering
             is for here. Three across is ~105px a tile on a phone, against the
             78px of the four-across it replaces. */
          <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {photos.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => setTileEl(p.id, el)}
                className={cn(
                  "relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100",
                  dragId === p.id && "shadow-[0_10px_28px_-6px_rgba(0,0,0,0.35)] ring-2 ring-[#7c3aed]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url || p.localUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full select-none object-cover"
                />

                {p.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}

                {i === 0 && !p.uploading && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-sm">
                    Copertă
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    void triggerHaptic("light")
                    removePhoto(p.id)
                  }}
                  aria-label="Șterge fotografia"
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform active:scale-90"
                >
                  <X className="h-[15px] w-[15px]" strokeWidth={2.6} />
                </button>

                {/* THE HANDLE. `touch-action: none` lives here and nowhere else,
                    so the form scrolls normally everywhere except these 28
                    pixels. Same element for a mouse and a finger. */}
                {!p.uploading && photos.length > 1 && (
                  <button
                    type="button"
                    aria-label="Mută fotografia"
                    onPointerDown={onGripDown(p.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ touchAction: "none" }}
                    className="absolute bottom-1.5 left-1.5 flex h-8 w-8 cursor-grab items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:cursor-grabbing"
                  >
                    <GripVertical className="h-[15px] w-[15px]" strokeWidth={2.4} />
                  </button>
                )}

                {/* One tap to the front, for the move everybody actually makes —
                    and the only one of the two a keyboard can perform. */}
                {i !== 0 && !p.uploading && (
                  <button
                    type="button"
                    onClick={() => {
                      void triggerHaptic("light")
                      makeCover(p.id)
                    }}
                    className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-2 py-1.5 text-[10.5px] font-semibold leading-none text-white backdrop-blur-sm transition-transform active:scale-90"
                  >
                    Copertă
                  </button>
                )}
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => {
                  void triggerHaptic("light")
                  fileRef.current?.click()
                }}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/60 text-neutral-400 transition-colors active:border-[#7c3aed] active:bg-violet-50/50 active:text-[#7c3aed]"
              >
                <Plus className="h-6 w-6" strokeWidth={2.2} />
                <span className="text-[11.5px] font-medium">Adaugă</span>
              </button>
            )}
          </div>
        )}

        {/* `capture` is deliberately absent: without it iOS offers the full
            sheet — camera, photo library, files — which is what people expect. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </section>

      {/* ---- Title + description ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <label className="block text-[15px] font-semibold text-neutral-900">
          Titlu<span className="ml-0.5 text-[#7c3aed]">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Ex: Hanorac Nike vintage verde"
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
        />

        <label className="mt-6 block text-[15px] font-semibold text-neutral-900">
          Descriere<span className="ml-0.5 text-[#7c3aed]">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder={DESCRIPTION_PLACEHOLDER}
          className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] leading-relaxed outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
        <p className="mt-1.5 text-[12.5px] text-neutral-400">
          Spune starea, materialul și cum vine pe corp. Anunțurile detaliate se vând mai repede.
        </p>
      </section>
      </div>

      <div className="min-w-0">
      {/* ---- Details ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">Detalii</h2>
        <div className="mt-1">
          <Field label="Categorie" required value={categoryLabelFor(group, item)} onClick={() => setSheet("category")} />
          <Field label="Brand" required value={brand} onClick={() => setSheet("brand")} />
          <Field label="Stare" required value={label(CONDITIONS, condition)} onClick={() => setSheet("condition")} />
          <Field label="Mărime" required value={label(SIZES, size)} onClick={() => setSheet("size")} />
          <Field label="Culoare" required value={label(COLOURS, colour)} onClick={() => setSheet("colour")} />
          <Field label="Tip" value={sources.length ? sources.map((s) => label(SOURCES, s)).join(", ") : null} onClick={() => setSheet("source")} />
          <Field label="Epocă" value={label(ERAS, era)} onClick={() => setSheet("era")} />
          <Field label="Stil" value={styles.length ? styles.map((s) => label(STYLES, s)).join(", ") : null} onClick={() => setSheet("style")} />
        </div>
      </section>

      {/* ---- Price ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">Preț</h2>
        <div className="mt-3 flex gap-3">
          <div className="flex-1">
            <label className="block text-[13px] text-neutral-500">
              Preț<span className="ml-0.5 text-[#7c3aed]">*</span>
            </label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[13px] text-neutral-500">
              Preț comparativ
              <span className="group relative inline-flex">
                <Info className="h-3.5 w-3.5 text-neutral-400" />
                <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1.5 hidden w-56 rounded-lg bg-neutral-800 px-2.5 py-2 text-[11.5px] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block">
                  Prețul de dinainte de reducere. Trebuie să fie mai mare decât prețul cerut — apare tăiat, cu o etichetă de reducere pe anunț.
                </span>
              </span>
            </label>
            <input
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="Opțional"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] text-rose-700 md:hidden">{error}</p>
      )}

      {/* ---- Actions (desktop) ---- */}
      {/* Sticky inside the stretched right column, so Publish stays reachable
          however far down the photo grid and description have pushed the page.
          The error lives in here too — on desktop this card is where your eye
          is when a submit fails. */}
      <div className="hidden md:sticky md:top-24 md:block">
        <div className="space-y-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
          {error && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] text-rose-700">{error}</p>
          )}
          {actionControls}
        </div>
      </div>
      </div>{/* /right column */}
      </div>{/* /md:grid */}
      </div>{/* /mx-auto max-w-2xl */}
      </div>{/* /THE ONE SCROLLER — and the footer below is its SIBLING */}

      {/* ---- Actions (phone) ---- */}
      {/* A flex row at the bottom of the sheet, not a fixed bar.
          It used to be `fixed bottom-[calc(inset + 62px)] z-90`, where 62 was
          the height of a tab bar that this screen no longer shows — a magic
          number tracking another component's geometry. As the last child of the
          column it is simply always at the bottom, it cannot be drawn over, and
          it survives the sheet's slide, which a fixed child could not. */}
      {/* Opaque white, not white/95 with a blur.
          A translucent bar over a scrolling form is a strip of moving text
          behind the two controls you are about to press, and `backdrop-filter`
          on a bar pinned above a scroller is a filter recomputed against fresh
          content on every frame of that scroll — the most expensive thing on
          the screen, in service of an effect nobody asked for. A hairline and a
          soft lift separate it from the form perfectly well.

          It also cannot be scrolled away from or drawn over: it is the last
          flex row of the sheet, so it is exactly as sticky as the sheet is.

          NO DROP SHADOW. I added one to "lift" the bar off the form and it was
          the wrong instinct twice over: it is a blur recomputed against
          whatever card happens to be under it as you scroll, and it made the
          bottom of the screen look smudged rather than layered. The bar is
          already unmistakably a separate surface — opaque white against a grey
          form, with a hairline along the top. A shadow on top of that is a
          third statement of something already said twice. */}
      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 md:hidden">
       <div className="mx-auto w-full max-w-2xl space-y-2.5">{actionControls}</div>
      </div>

      {/* ---- Pickers ---- */}
      <DragSheet open={sheet === "category"} title="Categorie" onClose={() => setSheet(null)}>
        <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={catQuery}
              onChange={(e) => setCatQuery(e.target.value)}
              placeholder="Caută categoria"
              className="w-full rounded-full bg-neutral-100 py-2.5 pl-9 pr-3 text-[14.5px] outline-none"
            />
          </div>
        </div>
        {catResults ? (
          <div className="p-2">
            {catResults.map((c) => (
              <button
                key={`${c.groupId}-${c.item.id}`}
                type="button"
                onClick={() => {
                  setGroup(c.groupId)
                  setItem(c.item.id)
                  setSheet(null)
                  setCatQuery("")
                }}
                className="flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="text-[14.5px] text-neutral-900">{c.item.label}</span>
                <span className="text-[12px] text-neutral-400">{c.groupLabel}</span>
              </button>
            ))}
            {catResults.length === 0 && (
              <p className="px-3 py-6 text-center text-[14px] text-neutral-400">Nicio categorie găsită</p>
            )}
          </div>
        ) : (
          <div className="p-2">
            {LISTING_CATEGORIES.map((g) => (
              <div key={g.id} className="mb-3">
                <p className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
                  {g.label}
                </p>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setGroup(g.id)
                      setItem(it.id)
                      setSheet(null)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50"
                  >
                    {it.label}
                    {group === g.id && item === it.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </DragSheet>

      <DragSheet open={sheet === "brand"} title="Brand" onClose={() => setSheet(null)}>
        <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder="Caută brandul"
              className="w-full rounded-full bg-neutral-100 py-2.5 pl-9 pr-3 text-[14.5px] outline-none"
            />
          </div>
        </div>
        <div className="p-2">
          {brands.map((b) => (
            <button
              key={b.slug}
              type="button"
              onClick={() => {
                setBrand(b.name)
                setSheet(null)
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50"
            >
              {b.name}
              {brand === b.name && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
          {/* Always available, never a row in the table — a brand directory can
              never be complete, and a missing brand shouldn't block a listing. */}
          <button
            type="button"
            onClick={() => {
              setBrand("Altele")
              setSheet(null)
            }}
            className="mt-1 flex w-full items-center justify-between rounded-lg border-t border-neutral-100 px-3 py-3 text-left text-[14.5px] font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Nu găsesc brandul — Altele
            {brand === "Altele" && <Check className="h-4 w-4 text-[#7c3aed]" />}
          </button>
        </div>
      </DragSheet>

      <DragSheet open={sheet === "condition"} title="Stare" onClose={() => setSheet(null)}>
        {CONDITIONS.map((c) => (
          <OptionRow
            key={c.id}
            label={c.label}
            selected={condition === c.id}
            onClick={() => { setCondition(c.id); setSheet(null) }}
          />
        ))}
      </DragSheet>

      <DragSheet open={sheet === "size"} title="Mărime" onClose={() => setSheet(null)}>
        {SIZES.map((c) => (
          <OptionRow
            key={c.id}
            label={c.label}
            selected={size === c.id}
            onClick={() => { setSize(c.id); setSheet(null) }}
          />
        ))}
      </DragSheet>

      <DragSheet open={sheet === "colour"} title="Culoare" onClose={() => setSheet(null)}>
        {COLOURS.map((c) => (
          <OptionRow
            key={c.id}
            label={c.label}
            swatch={c.hex}
            selected={colour === c.id}
            onClick={() => { setColour(c.id); setSheet(null) }}
          />
        ))}
      </DragSheet>

      <DragSheet open={sheet === "source"} title="Tip · alege până la 2" onClose={() => setSheet(null)}>
        {SOURCES.map((o) => (
          <OptionRow
            key={o.id}
            label={o.label}
            multi
            selected={sources.includes(o.id)}
            onClick={() => setSources((l) => toggleIn(l, o.id, 2))}
          />
        ))}
      </DragSheet>

      <DragSheet open={sheet === "era"} title="Epocă" onClose={() => setSheet(null)}>
        {ERAS.map((c) => (
          <OptionRow
            key={c.id}
            label={c.label}
            selected={era === c.id}
            onClick={() => { setEra(c.id); setSheet(null) }}
          />
        ))}
      </DragSheet>

      <DragSheet open={sheet === "style"} title="Stil · alege până la 3" onClose={() => setSheet(null)}>
        {STYLES.map((o) => (
          <OptionRow
            key={o.id}
            label={o.label}
            multi
            selected={styles.includes(o.id)}
            onClick={() => setStyles((l) => toggleIn(l, o.id, 3))}
          />
        ))}
      </DragSheet>

      {/* Posted confirmation — the only signal the listing is live, so it gets a
          moment of its own before the redirect. It is `fixed`, so it covers the
          screen from wherever it sits in the tree. */}
      {posted && (
        <div
          // Opaque, and no backdrop blur. A full-screen `backdrop-filter` is
          // recomputed on every frame of the fade it sits under, and there is
          // nothing worth seeing through it — the form behind is either about
          // to be left or about to be emptied.
          className="fixed inset-0 z-[130] flex items-center justify-center bg-white"
          style={{
            animation:
              posted === "out"
                ? `posted-out ${POSTED_OUT_MS}ms ease-out both`
                : "posted-veil 300ms ease-out both",
          }}
        >
          <div
            className="flex flex-col items-center gap-3"
            style={{ animation: "posted-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7c3aed] text-white">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            {/* Three outcomes, three sentences. It said "Anunț publicat / Te
                ducem la anunțul tău" for all of them — including saving a
                DRAFT, which publishes nothing, and including "add another",
                where nothing takes you anywhere at all. A confirmation that
                describes something other than what just happened is worse than
                no confirmation. */}
            <p className="text-[16px] font-semibold text-neutral-900">
              {saving === "draft" ? "Ciornă salvată" : "Anunț publicat"}
            </p>
            <p className="text-[13.5px] text-neutral-500">
              {saving === "draft"
                ? "Te ducem la ciornele tale…"
                : postAnother
                  ? "Poți adăuga următorul articol."
                  : "Te ducem la anunțul tău…"}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
