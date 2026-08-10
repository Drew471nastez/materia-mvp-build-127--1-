"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, ChevronRight, GripVertical, Info, Loader2, Plus, Search, X } from "lucide-react"
import {
  CATEGORY_INDEX,
  COLOURS,
  CONDITIONS,
  ERAS,
  LISTING_CATEGORIES,
  MAX_PHOTOS,
  MIN_PHOTOS,
  SIZES,
  SOURCES,
  STYLES,
  categoryLabelFor,
  categoryShortLabel,
  departmentForGroup,
  groupsForDepartment,
  DEPARTMENTS,
  type CategoryGroup,
  type Option,
} from "@/lib/marketplace/listing-taxonomy"
import { triggerHaptic } from "@/lib/native-bridge"
import { PickerPage } from "@/components/sell/picker-page"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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

/**
 * How a press on a photo becomes a drag rather than a scroll.
 *
 * A finger has to rest for HOLD_MS, and may stray TOUCH_SLOP pixels in that
 * time before the gesture is given back to the browser as the scroll it plainly
 * was. A mouse has nothing to disambiguate, so it only needs to have travelled
 * far enough to be a drag and not a click.
 */
const HOLD_MS = 180
const TOUCH_SLOP = 8
const MOUSE_SLOP = 4
/** The reorder animation, and the dragged tile settling into its new slot. */
const FLIP_MS = 200
const SETTLE_MS = 260

/** One press on one photo, from pointerdown to pointerup. */
type DragGesture = {
  id: string
  pointerId: number
  /** Finger or stylus: needs the hold. A mouse does not. */
  touch: boolean
  /** The slot the tile occupied at the moment the drag committed. */
  originIndex: number
  grabX: number
  grabY: number
  x: number
  y: number
  /** False while the press is still deciding whether it is a drag at all. */
  active: boolean
}

/** How many tiles the photo grid is wide. The empty slots are counted against
 *  it so the grid is always a complete rectangle rather than a ragged row. */
const PHOTO_COLS = 3

/**
 * NOTHING MARKS "REQUIRED" ON THIS FORM, BECAUSE ALMOST EVERYTHING IS.
 *
 * There was an asterisk after every label, then a coloured dot before every
 * heading. Both are the same mistake: on a form where eleven of fourteen
 * fields are required, marking the required ones puts a badge on almost every
 * line and tells you nothing — the mark is only information where it is rare.
 *
 * So the minority is what is marked. Three fields are optional and they say
 * so, quietly, on the right where the value goes; everything else is simply
 * expected, which is what the publish button already enforces and says in
 * plain words when something is missing.
 */
function OptionalTag() {
  return (
    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-[3px] text-[11px] font-medium text-neutral-400">
      Opțional
    </span>
  )
}

/** The heading of one card, with an optional right-hand slot (the photo
 *  count, so far). */
function SectionHeading({
  children,
  trailing,
}: {
  children: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-neutral-900">{children}</h2>
      {trailing}
    </div>
  )
}

/** Every requirement the publish button enforces, as something a control can
 *  be tagged with. */
type GapKey =
  | "photos"
  | "title"
  | "description"
  | "category"
  | "brand"
  | "condition"
  | "size"
  | "colour"
  | "price"
  | "compare"

/**
 * The server's field names, translated to the controls they belong to.
 *
 * A 400 from /api/listings used to be printed verbatim at the bottom of the
 * page — "Mai lipsește: photos, title." — raw English keys, in a sentence, in
 * the one place that says nothing about where to go. The server and the form
 * enforce the same rules, so a refusal can be walked back to its control and
 * shown there, exactly like a local one.
 */
const SERVER_FIELD_TO_GAP: Record<string, GapKey> = {
  photos: "photos",
  photos_min: "photos",
  empty: "title",
  title: "title",
  description: "description",
  category: "category",
  subcategory: "category",
  brand: "brand",
  condition: "condition",
  size: "size",
  colour: "colour",
  price: "price",
  preț: "price",
  compare_at_too_low: "compare",
}

/**
 * The reason a control is holding up the publish, printed at the control.
 *
 * Amber rather than red. Nothing here is broken and nothing has been lost —
 * the form is simply not finished — and red is the colour of something having
 * gone wrong, which is a different message and a worse one to be given eight
 * times on the way to your first listing.
 */
function GapNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] font-medium text-amber-900"
    >
      <Info className="mt-[1px] h-[15px] w-[15px] shrink-0" strokeWidth={2.4} />
      <span>{children}</span>
    </p>
  )
}

/** A tappable row that shows what's chosen and opens its picker. */
function Field({
  label,
  value,
  onClick,
  optional,
  error,
  anchor,
}: {
  label: string
  value: string | null
  onClick: () => void
  /** The rare case, and therefore the one worth marking. */
  optional?: boolean
  /** Printed under the row when a publish was refused because of it. */
  error?: string | null
  anchor?: (el: HTMLElement | null) => void
}) {
  return (
    <div ref={anchor}>
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className="-mx-1 flex w-full items-center justify-between gap-3 rounded-xl border-b border-neutral-100 px-1 py-3.5 text-left transition-colors duration-150 last:border-b-0 active:bg-neutral-50"
    >
      <span className="shrink-0 text-[15px] font-medium text-neutral-900">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {/* A chosen value is the answer, so it is set in the same weight as the
            question; "Alege" is a prompt and stays quiet. */}
        {optional && !value ? (
          <OptionalTag />
        ) : (
          <span
            className={cn(
              "truncate text-[15px]",
              value ? "font-semibold text-neutral-900" : "font-medium text-neutral-400",
            )}
          >
            {value || "Alege"}
          </span>
        )}
        <ChevronRight className="h-[17px] w-[17px] shrink-0 text-neutral-300" strokeWidth={2.4} />
      </span>
    </button>
    {error && <GapNote>{error}</GapNote>}
    </div>
  )
}

/**
 * THE HAIRLINE BETWEEN TWO ROWS, AND WHY IT IS NOT A BORDER.
 *
 * It used to be `border-b` on an inner box that carried the row's padding,
 * with the tint on the button around it. That leaves the tint reaching further
 * than the content does — so a selected row was a violet band with a grey line
 * drawn INSIDE it and a strip of untinted row below that line. The white gap
 * along the bottom edge of a highlighted row was exactly this.
 *
 * Absolutely positioned, the divider is a hairline sitting ON the row rather
 * than a part of its box: the tint fills the whole band, edge to edge, and the
 * line can be removed for a selected row without changing its height by a
 * pixel. A highlighted row with a separator cutting across it is not a thing
 * any phone list does.
 */
function Divider({ hidden }: { hidden?: boolean }) {
  if (hidden) return null
  return <span aria-hidden className="absolute bottom-0 left-4 right-4 h-px bg-neutral-100" />
}

/**
 * One choice in a picker, as a ROW.
 *
 * Every sheet used to write its own: a rounded box with a hover tint, 14.5px
 * text, a check floated to the right, and 2px of padding round the list so the
 * rows sat in from the edges. Six copies of it, none quite the same, and the
 * result read like a web menu dropped into a phone rather than like the
 * platform's own list.
 *
 * So: one row, full-bleed to the sheet's edges, 56px tall — comfortably past
 * the 44pt minimum, and past the point where a list of them is a wall of text.
 * Hairlines INSET to the text rather than run wall to wall, which is how a
 * phone's own lists are drawn and the difference between a list and a table.
 * The selected one is stated twice, in tint and in a mark, because on a phone
 * in daylight a colour alone is not a state.
 *
 * `active:` rather than `hover:`. A phone has no hover, and the hover styles
 * these rows carried were dead weight that also produced a stuck highlight
 * after a tap on iOS.
 *
 * Rows are for choices that need a sentence — the condition ladder, a category
 * with its group underneath it. Anything whose label is one word is a chip; see
 * OptionChip below, and the note there about why that is not just decoration.
 */
function OptionRow({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string
  /** A second line, for a choice that needs qualifying. */
  hint?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(
        "relative flex min-h-[58px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150",
        selected ? "bg-violet-50" : "active:bg-neutral-100",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[16px]",
            selected ? "font-semibold text-[#7c3aed]" : "font-medium text-neutral-900",
          )}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block truncate text-[13px] font-medium text-neutral-400">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-2",
          "transition-[background-color,border-color] duration-200 ease-out",
          selected ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-neutral-300 bg-white text-transparent",
        )}
      >
        <Check
          className={cn(
            "h-[14px] w-[14px] transition-[transform,opacity] duration-200 ease-out",
            selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
          strokeWidth={3.2}
        />
      </span>
      <Divider hidden={selected} />
    </button>
  )
}

/**
 * A row that goes DOWN a level rather than choosing.
 *
 * Visually a sibling of OptionRow, and deliberately so — it is the same list —
 * but it ends in a chevron instead of a check, because those are two different
 * promises: one closes the sheet with an answer, the other asks the next
 * question. Getting that wrong is how a drill-down feels like a trap.
 *
 * The tint marks the branch your current choice lives down, so re-opening the
 * picker shows you where you already are at every level rather than only at
 * the leaf.
 */
function DrillRow({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string
  hint?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(
        "relative flex min-h-[58px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150",
        selected ? "bg-violet-50" : "active:bg-neutral-100",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[16px]",
            selected ? "font-semibold text-[#7c3aed]" : "font-medium text-neutral-900",
          )}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block truncate text-[13px] font-medium text-neutral-400">{hint}</span>}
      </span>
      <ChevronRight className="h-[19px] w-[19px] shrink-0 text-neutral-400" strokeWidth={2.4} />
      <Divider hidden={selected} />
    </button>
  )
}

/**
 * One choice in a picker, as a CHIP.
 *
 * Thirty-one styles, nineteen colours and nine sizes were nine hundred pixels
 * of identical 56px rows each, and every one of them said a single word. A list
 * is the right shape for a choice you have to READ; for a choice you RECOGNISE
 * it is the wrong one twice over — it is four times taller than the word it
 * contains, so most of the options are below the fold on the first paint, and
 * the eye has to travel the full height of the sheet to compare two of them.
 *
 * As a wrapped row of chips the whole vocabulary is usually on screen at once.
 * The sizes fit in two lines instead of nine screens' worth of scrolling, and
 * "which of these am I" becomes a glance rather than a scroll.
 *
 * Selected is the brand fill, not a tick in the margin — at this size the chip
 * IS the control, and a state you can see from across the sheet is worth more
 * than one you have to look for.
 */
function OptionChip({
  label,
  selected,
  onClick,
  swatch,
}: {
  label: string
  selected: boolean
  onClick: () => void
  /** A colour dot, for the palette. */
  swatch?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(
        "flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[14.5px] font-medium",
        "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]",
        selected
          ? "border-transparent bg-[#7c3aed] text-white shadow-[0_2px_10px_-2px_rgba(124,58,237,0.5)]"
          : "border-neutral-200 bg-white text-neutral-800 active:bg-neutral-100",
      )}
    >
      {swatch && (
        <span
          aria-hidden
          className={cn(
            "h-[18px] w-[18px] shrink-0 rounded-full",
            selected ? "ring-2 ring-white/70" : "ring-1 ring-black/10",
          )}
          style={{ background: swatch }}
        />
      )}
      {label}
    </button>
  )
}

/** The wrapper the chips sit in. Its own component so all five chip pickers
 *  are spaced identically without five copies of the same class string. */
function ChipField({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 px-4 pb-6 pt-4">{children}</div>
}

/**
 * The search field at the top of a long picker.
 *
 * It sits ON the sheet's own white rather than in a bordered box of its own —
 * two nested boxes with two radii is what made these read as a web dropdown
 * that had been dropped onto a phone. `enterKeyHint="search"` and
 * `autoCorrect=off` because this is a lookup, not prose, and the keyboard
 * should say so.
 */
function SheetSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="border-b border-neutral-100 bg-white px-4 pb-3 pt-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-neutral-500"
          strokeWidth={2.6}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-[13px] bg-neutral-100 py-3.5 pl-12 pr-4 text-[16px] font-medium outline-none transition-shadow duration-150 placeholder:text-neutral-500 focus:ring-1 focus:ring-neutral-900/15 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
    </div>
  )
}

/** The line under a multi-select sheet's title. It used to be crammed into the
 *  title itself — "Stil · alege până la 3" — where it competed with the name of
 *  the picker for the one line a phone sheet gives it. */
function PickerNote({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-1 pt-1 text-[13px] font-medium text-neutral-500">{children}</p>
}

/**
 * What each rung of the condition ladder actually means.
 *
 * The five labels are a database constraint and cannot change, but on their own
 * they are five synonyms for "used" — and the difference between them is the
 * difference between a listing that is described accurately and one that comes
 * back. The hint is where the meaning goes.
 */
const CONDITION_HINTS: Record<string, string> = {
  new_with_tags: "Nepurtat, cu eticheta originală",
  new_without_tags: "Nepurtat, dar fără etichetă",
  very_good: "Purtat de câteva ori, fără urme vizibile",
  good: "Purtat, cu urme mici de folosire",
  satisfactory: "Urme vizibile sau un defect descris în anunț",
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
  /**
   * EDITING SOMETHING ALREADY PUBLISHED.
   *
   * The same screen, the same fields, and the same slug — which is the point:
   * a listing people have linked to must not change address because its owner
   * fixed a typo in the title. It differs from a draft in exactly two ways, and
   * both are one line each: where it loads from, and where it saves to.
   */
  const [editId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      return new URLSearchParams(window.location.search).get("edit")
    } catch {
      return null
    }
  })

  /** Filling in from a saved draft or an existing listing. */
  const [loadingDraft, setLoadingDraft] = useState(false)
  /**
   * True once the form holds whatever it is starting FROM.
   *
   * A blank form is ready on the first frame. One resuming a draft is not ready
   * until the row has arrived, and the difference matters because that is the
   * moment "unchanged" is defined — take the baseline a render too early and
   * the draft loading into the fields reads as edits the user never made.
   */
  const [formReady, setFormReady] = useState(false)

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

  /**
   * WHERE YOU ARE INSIDE THE CATEGORY PICKER.
   *
   * Twenty-two groups and about a hundred and sixty leaves used to arrive as
   * one flat scroll, every group heading repeating the department because that
   * was the only thing telling "Bărbați · Încălțăminte" from "Damă ·
   * Încălțăminte". Finding your category meant reading past every category you
   * were not looking for.
   *
   * Three levels now — department, group, leaf — so the first question is the
   * one nobody has to think about and it removes three quarters of the list
   * before the second one is asked. `null` at a level means "not chosen yet",
   * which is also the level being shown.
   *
   * Neither of these is saved anywhere. `products.category` still stores the
   * group id and `products.subcategory` the leaf: the department is a route
   * through the picker, not a value.
   */
  /** The comparison-price explainer. */
  const [priceInfo, setPriceInfo] = useState(false)
  const [catDep, setCatDep] = useState<string | null>(null)
  const [catGroup, setCatGroup] = useState<string | null>(null)
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
    const id = draftId ?? editId
    if (!id) {
      setFormReady(true)
      return
    }
    let alive = true
    setLoadingDraft(true)
    const url = editId
      ? `/api/listings/${encodeURIComponent(editId)}`
      : `/api/listings/drafts/${encodeURIComponent(draftId!)}`
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v = d?.draft ?? d?.listing
        if (!alive || !v) return
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
        if (!alive) return
        setLoadingDraft(false)
        // A separate microtask from the .then above, so the fields it filled in
        // have already been committed by the time this render lands — which is
        // exactly what the baseline needs to see.
        setFormReady(true)
      })
    return () => {
      alive = false
    }
  }, [draftId, editId])

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
   * ── The whole tile is the handle now ──────────────────────────────────────
   * It used to be a 28-pixel grip in the corner, because a drag that starts
   * anywhere on a tile has to be told apart from a page scroll that starts on
   * the same pixel, and `touch-action: none` on the tile would have made the
   * form unscrollable wherever a photo is. But geography is the wrong axis to
   * separate them on. Every native photo grid separates them by TIME:
   *
   *   mouse   — there is nothing to disambiguate; a press is never a scroll.
   *             The drag begins as soon as the pointer has moved 4px.
   *   finger  — the drag begins after a 180ms hold. Move more than 8px before
   *             that and it was a scroll, so the gesture is handed straight
   *             back to the browser and never becomes a drag at all.
   *
   * `touch-action` cannot express that, because it is read once at touch-start
   * and this decision is made later. What CAN express it is a non-passive
   * `touchmove` listener that calls preventDefault only once the hold has
   * fired — at that instant the finger has by definition not travelled, so no
   * scroll has begun and there is none to fight.
   *
   * The grip stays. It is the affordance that says the tiles move at all, and
   * from it a drag starts on the first pixel with no hold.
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

  const photosRef = useRef(photos)
  photosRef.current = photos

  const drag = useRef<DragGesture | null>(null)
  const hold = useRef(0)
  const frameId = useRef(0)

  /**
   * THE SLOTS, measured once when the drag commits.
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
   * change. Measured once and tested against for the whole gesture, the answer
   * depends only on where the finger is, which is the one thing that should
   * decide it.
   */
  const slots = useRef<Box[]>([])

  /**
   * The tiles that are about to move, measured in one batch.
   *
   * `lo`/`hi` bound it to the range a single swap actually disturbs. Moving a
   * photo one place left moves exactly two tiles; measuring all eight was six
   * rects nobody read, and every rect is a synchronous layout flush the browser
   * has to serve mid-drag. Reads stay grouped and come before any write, so it
   * is still one flush rather than one per tile.
   */
  const measureTiles = useCallback((lo = 0, hi = Number.MAX_SAFE_INTEGER) => {
    const m = new Map<string, DOMRect>()
    const list = photosRef.current
    for (let i = Math.max(0, lo); i <= Math.min(hi, list.length - 1); i++) {
      const el = tileEls.current.get(list[i].id)
      if (el) m.set(list[i].id, el.getBoundingClientRect())
    }
    return m
  }, [])

  /**
   * Where the dragged tile has to be drawn — from the finger AND from which
   * slot the tile has since been moved into.
   *
   * The old version re-anchored: after every swap it cleared the transform,
   * forced a reflow and treated the pointer's current position as a new grab
   * point, a frame late. That is three main-thread writes per swap and it is
   * only ever approximately right, because the frame it skips is a frame in
   * which the tile is drawn a whole slot away from the finger.
   *
   * This is the closed form of the same thing. A transform is relative to where
   * layout put the element, so if the tile started in slot `origin` and layout
   * has since put it in slot `now`, the offset that keeps it under the finger
   * is simply the finger's travel plus the distance between those two slots.
   * Exact, one style write, and no frame in which it is anywhere else.
   */
  const paintDragged = useCallback(() => {
    const d = drag.current
    if (!d?.active) return
    const el = tileEls.current.get(d.id)
    if (!el) return
    const at = photosRef.current.findIndex((p) => p.id === d.id)
    const home = slots.current[d.originIndex]
    const now = slots.current[at < 0 ? d.originIndex : at]
    const cx = home && now ? home.left - now.left : 0
    const cy = home && now ? home.top - now.top : 0
    el.style.transform = `translate3d(${d.x - d.grabX + cx}px, ${d.y - d.grabY + cy}px, 0)`
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
    // The dragged tile's slot may have changed in this very commit, so its
    // offset is recomputed here — before paint — rather than a frame later.
    paintDragged()

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
      // The layer has to exist BEFORE the frame the movement starts on, or the
      // browser builds it on that frame — which is the one frame of a 200ms
      // animation anybody would notice.
      el.style.willChange = "transform"
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        el.style.transform = "translate3d(0, 0, 0)"
      })
      // And given back afterwards: a promoted layer per tile, held for the life
      // of the form, is memory the compositor cannot reuse. `once` because a
      // swap during the animation re-arms it from the top of this block.
      el.addEventListener(
        "transitionend",
        () => {
          if (drag.current?.id !== id) el.style.willChange = ""
        },
        { once: true },
      )
    })
  })

  const cancelFrame = useCallback(() => {
    if (frameId.current) {
      cancelAnimationFrame(frameId.current)
      frameId.current = 0
    }
  }, [])

  /**
   * ONE WRITE PER FRAME, not one per event.
   *
   * A finger on a 120Hz screen produces pointermove far faster than the
   * compositor draws, and a stylus faster still. Painting on the event handler
   * therefore does the same work several times for a single visible frame and
   * runs the hit test just as often — and the hit test is the expensive half,
   * because a swap re-renders the form. Coalescing into a rAF means exactly one
   * transform write and one hit test per frame that is actually shown.
   */
  const frame = useCallback(() => {
    frameId.current = 0
    const d = drag.current
    if (!d?.active) return
    paintDragged()
    const from = photosRef.current.findIndex((p) => p.id === d.id)
    if (from < 0) return
    // Against the slots, which are where the finger is aiming — not against the
    // tiles, which are what the answer moves.
    const to = indexAtPoint(slots.current, d.x, d.y)
    if (to < 0 || to === from) return
    flipFrom.current = measureTiles(Math.min(from, to), Math.max(from, to))
    setPhotos((p) => moveItem(p, from, to))
    void triggerHaptic("light")
  }, [measureTiles, paintDragged])

  const schedule = useCallback(() => {
    if (frameId.current) return
    frameId.current = requestAnimationFrame(frame)
  }, [frame])

  /**
   * POINTER CAPTURE DOES NOT SURVIVE THE REORDER, so the drag does not use it.
   *
   * The obvious build was `setPointerCapture` on the tile. It fails, and it
   * fails on the very first swap: reordering a keyed list makes React MOVE the
   * existing DOM nodes (insertBefore), moving a node detaches and re-attaches
   * it, and an element that leaves the document loses its capture. So the tile
   * stopped receiving pointermove the moment the first reorder happened.
   *
   * Caught by driving it with real pointer events: exactly two moves arrived,
   * the second of them after the drag had already ended, and the order came out
   * 123546 instead of 412356 — one swap, then nothing.
   *
   * The listeners go on `window` for the length of the gesture instead. Window
   * cannot be reordered out from under them, and the events arrive by bubbling
   * from whatever is under the finger, which is exactly what a drag is.
   *
   * Everything below closes over refs only, so it is built once and its
   * identity never changes — which is what makes adding and removing the window
   * listeners by hand safe.
   */
  const photoDrag = useMemo(() => {
    function disarm() {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onEnd)
      window.removeEventListener("pointercancel", onEnd)
      window.removeEventListener("touchmove", blockScroll)
    }

    /**
     * The one thing `touch-action` cannot say: "this was a scroll until 180ms
     * ago, and it is a drag now." Registered at pointerdown, before the browser
     * has been asked to scroll anything, and silent until the hold has fired.
     */
    function blockScroll(e: TouchEvent) {
      if (drag.current?.active && e.cancelable) e.preventDefault()
    }

    /** A drag that ends over the bin must not also press the bin. */
    function swallowNextClick() {
      const eat = (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener("click", eat, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0)
    }

    function begin(id: string) {
      const d = drag.current
      if (!d || d.active || d.id !== id) return
      const at = photosRef.current.findIndex((p) => p.id === id)
      if (at < 0) return
      slots.current = photosRef.current.map((ph) => {
        const t = tileEls.current.get(ph.id)
        const r = t?.getBoundingClientRect()
        return r
          ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
          : { left: -1e6, top: -1e6, right: -1e6, bottom: -1e6 }
      })
      d.originIndex = at
      d.active = true
      // The tile does not jump by the handful of pixels it took to decide this
      // was a drag: wherever the pointer is now IS the grab point.
      d.grabX = d.x
      d.grabY = d.y
      const el = tileEls.current.get(id)
      if (el) {
        el.style.transition = "none"
        el.style.zIndex = "30"
        el.style.willChange = "transform"
        el.style.transform = "translate3d(0, 0, 0)"
      }
      setDragId(id)
      void triggerHaptic("medium")
    }

    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d || e.pointerId !== d.pointerId) return
      d.x = e.clientX
      d.y = e.clientY

      if (!d.active) {
        const far = Math.abs(e.clientX - d.grabX) + Math.abs(e.clientY - d.grabY)
        if (d.touch) {
          // Travelled before the hold fired, so it was a scroll all along. Hand
          // the gesture back rather than fighting the browser for it.
          if (far > TOUCH_SLOP) release(false)
          return
        }
        if (far < MOUSE_SLOP) return
        begin(d.id)
        if (!drag.current?.active) return
      }

      if (e.cancelable) e.preventDefault()
      schedule()
    }

    /** A second finger landing and lifting elsewhere is not this drag ending. */
    function onEnd(e: PointerEvent) {
      if (drag.current && e.pointerId !== drag.current.pointerId) return
      release(true)
    }

    function release(settle: boolean) {
      if (hold.current) {
        window.clearTimeout(hold.current)
        hold.current = 0
      }
      const d = drag.current
      drag.current = null
      disarm()
      cancelFrame()
      if (!d || !d.active) return
      setDragId(null)
      const el = tileEls.current.get(d.id)
      if (el) {
        // Settles into the slot it now occupies rather than snapping to it, and
        // ends on an identity transform rather than `none` so the compositor
        // layer survives the last frame of the movement.
        el.style.transition = settle ? `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none"
        el.style.transform = "translate3d(0, 0, 0)"
        const clear = () => {
          el.style.transition = ""
          el.style.transform = ""
          el.style.zIndex = ""
          el.style.willChange = ""
        }
        if (settle) window.setTimeout(clear, SETTLE_MS + 20)
        else clear()
      }
      swallowNextClick()
      void triggerHaptic("light")
    }

    function arm(id: string, e: React.PointerEvent, instant: boolean) {
      if (e.button > 0) return
      const photo = photosRef.current.find((p) => p.id === id)
      // Nothing to reorder with one photo, and a tile still uploading has no
      // stable identity to move.
      if (!photo || photo.uploading || photosRef.current.length < 2) return
      release(false)
      const touch = e.pointerType !== "mouse"
      drag.current = {
        id,
        pointerId: e.pointerId,
        touch,
        originIndex: 0,
        grabX: e.clientX,
        grabY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
      }
      window.addEventListener("pointermove", onMove, { passive: false })
      window.addEventListener("pointerup", onEnd)
      window.addEventListener("pointercancel", onEnd)
      window.addEventListener("touchmove", blockScroll, { passive: false })
      if (instant) begin(id)
      else if (touch) {
        hold.current = window.setTimeout(() => {
          hold.current = 0
          begin(id)
        }, HOLD_MS)
      }
      // A mouse on the tile needs neither: MOUSE_SLOP in onMove decides.
    }

    return {
      /** Press and hold anywhere on the photo. */
      tile: (id: string) => (e: React.PointerEvent) => {
        const t = e.target as HTMLElement | null
        // The chips ON the tile are buttons. A press on one of them is that
        // button being pressed, not the beginning of a drag.
        if (t?.closest("button, a, input, textarea")) return
        if (e.pointerType === "mouse") e.preventDefault()
        arm(id, e, false)
      },
      /** The grip: a drag from the first pixel, no hold. */
      grip: (id: string) => (e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        arm(id, e, true)
      },
      dispose: () => release(false),
    }
  }, [cancelFrame, schedule])

  useEffect(() => () => photoDrag.dispose(), [photoDrag])

  /**
   * The same operation without a drag: promote a photo to the cover.
   *
   * Kept alongside the drag, not replaced by it. Dragging is the general tool;
   * this is the one move anybody actually makes, it is a single tap, and it is
   * the only one of the two that a keyboard or an assistive device can perform.
   */
  const makeCover = useCallback((id: string) => {
    const at = photosRef.current.findIndex((ph) => ph.id === id)
    if (at <= 0) return
    flipFrom.current = measureTiles(0, at)
    setPhotos((p) => moveItem(p, at, 0))
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

  /**
   * ── IS SOMEBODY TYPING? ────────────────────────────────────────────────
   *
   * Driven by FOCUS, not by the keyboard's height, and that is the whole
   * reason this works in the app.
   *
   * There are two keyboard detectors in this codebase and both measure the
   * same thing: `window.innerHeight - visualViewport.height`. In a browser the
   * layout viewport stays tall while the visual one shrinks, so that
   * difference IS the keyboard. In the Capacitor WebView it is not: the
   * Keyboard plugin resizes the web view itself, so `innerHeight` shrinks
   * along with `visualViewport.height` and the difference stays at roughly
   * zero. `data-keyboard="open"` is therefore never set in the native app,
   * which is exactly where the bar was still sitting under the keyboard.
   *
   * Focus needs no arithmetic and no platform. A text field has focus or it
   * does not, and on a phone a focused text field means a keyboard — that is
   * also precisely how the request was phrased: "when I click on the input".
   *
   * Written straight onto the node for the same reason the motion classes are:
   * this component is 1,400 lines and re-rendering it every time a field takes
   * focus is work nobody asked for.
   */
  const typing = useRef(false)
  const setTyping = useCallback((on: boolean) => {
    if (typing.current === on) return
    typing.current = on
    sheetRef.current?.classList.toggle("sell-typing", on)
  }, [])

  /**
   * Moving between two fields must not flash the bar back for a frame.
   *
   * `focusout` fires before `focusin`, so a blur followed immediately by a
   * focus would collapse and re-expand the bar between two taps. The blur is
   * deferred by a tick and cancelled if focus lands somewhere else that types.
   */
  const blurTimer = useRef<number | null>(null)
  const isTextField = (el: EventTarget | null): boolean => {
    const node = el as HTMLElement | null
    if (!node) return false
    const tag = node.tagName
    if (tag === "TEXTAREA") return true
    if (tag !== "INPUT") return false
    // A checkbox takes focus and opens no keyboard. Collapsing the bar because
    // somebody ticked the box that lives ON the bar would be absurd.
    const type = (node as HTMLInputElement).type
    return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit"
  }
  const onFieldFocus = useCallback(
    (e: React.FocusEvent) => {
      if (blurTimer.current !== null) {
        window.clearTimeout(blurTimer.current)
        blurTimer.current = null
      }
      if (isTextField(e.target)) setTyping(true)
    },
    [setTyping],
  )
  const onFieldBlur = useCallback(() => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null
      setTyping(false)
    }, 80)
  }, [setTyping])

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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  CLOSING A FORM YOU HAVE WRITTEN IN
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * The X threw everything away without a word. Three photographs, a title and
   * a price, gone to a tap in the corner — and the only thing that could have
   * saved them was a "Salvează" button sharing the bottom bar with Publish,
   * where it read as a second, lesser way to finish rather than as the thing it
   * was: the exit that keeps your work.
   *
   * So the button is gone from the bar and the question moved to where the work
   * is actually at risk. Leaving with something written asks once, in the
   * middle of the screen, with the two answers it has: keep it as a draft, or
   * discard it. Leaving an untouched form asks nothing, because there is
   * nothing to lose and a dialog with no stakes is a dialog people learn to
   * dismiss without reading.
   */
  /**
   * DIRTY IS "DIFFERENT FROM WHAT I OPENED", not "has anything in it".
   *
   * A count of filled fields is the obvious version and it is wrong the moment
   * the form can be RESUMED: opening a draft fills every field from the server,
   * so looking at one and leaving would ask whether to save changes you never
   * made. The baseline is taken once the form has whatever it is starting from
   * — nothing, or a loaded draft — and everything after that is compared
   * against it.
   */
  const snapshot = useMemo(
    () =>
      JSON.stringify([
        photos.map((p) => p.url ?? p.localUrl),
        title.trim(),
        description.trim(),
        group,
        item,
        brand,
        condition,
        colour,
        size,
        era,
        sources,
        styles,
        price.trim(),
        compareAt.trim(),
      ]),
    [photos, title, description, group, item, brand, condition, colour, size, era, sources, styles, price, compareAt],
  )
  const baseline = useRef<string | null>(null)
  useEffect(() => {
    if (formReady && baseline.current === null) baseline.current = snapshot
  }, [formReady, snapshot])
  const dirty = baseline.current !== null && snapshot !== baseline.current

  const [askOnClose, setAskOnClose] = useState(false)
  /** `submit` is declared far below this point and closes over half the form;
   *  a ref is how the close path reaches it without hoisting either. */
  const submitRef = useRef<((draft: boolean) => Promise<void>) | null>(null)

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

  /**
   * The X, "Renunță", and Escape all come through here.
   *
   * An untouched form closes immediately: a dialog with nothing at stake is one
   * people learn to dismiss without reading, and then the one that mattered
   * gets dismissed too. An EDIT is also allowed straight out — its work is
   * already saved on the server, and "keep this as a draft" is not a thing you
   * can do to something that is already published.
   */
  const requestClose = useCallback(() => {
    if (!dirty || editId) {
      close()
      return
    }
    void triggerHaptic("light")
    setAskOnClose(true)
  }, [dirty, editId, close])

  /** "Salvează" in that dialog: the draft save, from the one place it now
   *  lives. The dialog closes first so the sheet's slide is not competing with
   *  a dialog fading out on top of it. */
  const saveAndClose = useCallback(() => {
    setAskOnClose(false)
    void submitRef.current?.(true)
  }, [])

  // ---- brand search ----
  /**
   * WARMED ON MOUNT, NOT ON OPEN.
   *
   * Brand is a required field, so this picker WILL be opened — and a request
   * that starts when the sheet does is a request the opening animation has to
   * wait for, which is why the list used to appear a beat after the sheet did.
   * Fetching the default list while somebody is still choosing photographs
   * costs one small query and makes the first tap instant.
   *
   * It never overwrites a list that is already there: a search result that came
   * back first must not be replaced by the defaults arriving late.
   */
  useEffect(() => {
    let cancelled = false
    fetch("/api/brands?q=", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.brands)) setBrands((b) => (b.length ? b : d.brands))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (sheet !== "brand") return
    let cancelled = false
    // A debounce is for a keystroke that another keystroke is about to replace.
    // Opening the sheet, or clearing the field, is neither — those want the
    // answer now.
    const id = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(brandQuery)}`)
        .then((r) => (r.ok ? r.json() : { brands: [] }))
        .then((d) => {
          if (!cancelled) setBrands(Array.isArray(d?.brands) ? d.brands : [])
        })
        .catch(() => {})
    }, brandQuery ? 180 : 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sheet, brandQuery])

  /**
   * Opening the picker lands where the choice was made, not at the top.
   *
   * Coming back to change "Damă · Rochii midi" to "Rochii maxi" and being made
   * to answer "who is it for" again is the drill-down charging you for a
   * decision you already made. With nothing chosen there is nothing to restore
   * and it opens at the first question, which is where it should be.
   */
  const openCategory = useCallback(() => {
    const dep = departmentForGroup(group)
    setCatDep(dep)
    setCatGroup(dep && group ? group : null)
    setCatQuery("")
    setSheet("category")
  }, [group])

  /** One level back, and out of the sheet from the first one. */
  const categoryBack = useCallback(() => {
    if (catGroup) setCatGroup(null)
    else if (catDep) setCatDep(null)
    else setSheet(null)
  }, [catGroup, catDep])

  const catGroups: CategoryGroup[] = useMemo(
    () => (catDep ? groupsForDepartment(catDep) : []),
    [catDep],
  )
  const catItems: CategoryGroup | null = useMemo(
    () => (catGroup ? (catGroups.find((g) => g.id === catGroup) ?? null) : null),
    [catGroup, catGroups],
  )

  /**
   * WHICH LIST IS SHOWING, AND HOW DEEP IT IS.
   *
   * The panel animates between these two the way it animates itself: a change
   * of `catLevel` is a push, and `catDepth` is the only thing that says which
   * direction. A search is depth 0 whatever you had drilled to, so clearing the
   * field walks you back rather than sideways.
   */
  const catSearching = catQuery.trim().length > 0
  const catLevel = catSearching ? "search" : catItems ? `item:${catGroup}` : catDep ? `grp:${catDep}` : "dep"
  const catDepth = catSearching ? 0 : catItems ? 2 : catDep ? 1 : 0

  /** The sheet's own title, which is the breadcrumb — there is nowhere else on
   *  a phone sheet to put one. */
  const categoryTitle = catItems
    ? categoryShortLabel(catItems)
    : catDep
      ? (DEPARTMENTS.find((d) => d.id === catDep)?.label ?? "Categorie")
      : "Categorie"

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

  /**
   * How many empty slots the photo grid draws after the photos.
   *
   * Rounded up to a whole number of rows and capped at MAX_PHOTOS, so the grid
   * is always a complete rectangle and never a ragged half-row: three empty
   * slots on an untouched form, and the last row filling in as photos are
   * added. `+ 1` is what keeps at least one slot visible until the listing is
   * actually full.
   */
  const emptySlots = Math.max(
    0,
    Math.min(MAX_PHOTOS, Math.max(PHOTO_COLS, Math.ceil((photos.length + 1) / PHOTO_COLS) * PHOTO_COLS)) -
      photos.length,
  )

  const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100)
  const compareCents = compareAt ? Math.round(parseFloat(compareAt.replace(",", ".")) * 100) : null

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  WHAT IS MISSING, AND WHERE IT IS MISSING FROM
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * It used to be one sentence — "Mai lipsește: titlu, brand, preț." — printed
   * next to the Publish button, which is at the very bottom of a form four
   * screens long. So the message about the empty title was as far from the
   * title as it is possible to be on that page, and the only way to find out
   * WHERE to type was to read a list of nouns and go hunting.
   *
   * Every gap now knows which control it belongs to. On a failed publish the
   * form scrolls the first one into the middle of the screen and prints the
   * reason directly under it. Fix it and the note goes, because the list is
   * derived from the same state the form is.
   *
   * `label` is for the one-line summary; `message` is what gets printed at the
   * control, and it is written as an instruction rather than as a complaint —
   * "Adaugă un titlu" tells you what to do, "titlu" tells you what you failed
   * to do.
   */
  const gaps = useMemo(() => {
    const g: { key: GapKey; label: string; message: string }[] = []
    if (uploaded.length < MIN_PHOTOS)
      g.push({
        key: "photos",
        label: `cel puțin ${MIN_PHOTOS} fotografii`,
        message: `Adaugă cel puțin ${MIN_PHOTOS} fotografii ca să poți publica.`,
      })
    if (!title.trim()) g.push({ key: "title", label: "titlu", message: "Adaugă un titlu." })
    if (description.trim().length < 10)
      g.push({ key: "description", label: "descriere", message: "Scrie o descriere de cel puțin 10 caractere." })
    if (!group || !item) g.push({ key: "category", label: "categorie", message: "Alege o categorie." })
    if (!brand) g.push({ key: "brand", label: "brand", message: "Alege un brand." })
    if (!condition) g.push({ key: "condition", label: "stare", message: "Alege starea articolului." })
    if (!size) g.push({ key: "size", label: "mărime", message: "Alege mărimea." })
    if (!colour) g.push({ key: "colour", label: "culoare", message: "Alege culoarea." })
    if (!Number.isFinite(priceCents) || priceCents < 0)
      g.push({ key: "price", label: "preț", message: "Adaugă prețul." })
    if (compareCents !== null && Number.isFinite(priceCents) && compareCents <= priceCents)
      g.push({
        key: "compare",
        label: "prețul comparativ",
        message: "Prețul comparativ trebuie să fie mai mare decât prețul cerut.",
      })
    return g
  }, [uploaded.length, title, description, group, item, brand, condition, colour, size, priceCents, compareCents])

  /** Nothing is marked until a publish has actually been refused. A form that
   *  turns red while you are still filling it in is telling you off for not
   *  having finished yet. */
  const [showGaps, setShowGaps] = useState(false)
  const gapEls = useRef(new Map<GapKey, HTMLElement>())
  const setGapEl = useCallback((key: GapKey, el: HTMLElement | null) => {
    if (el) gapEls.current.set(key, el)
    else gapEls.current.delete(key)
  }, [])
  /**
   * An empty form has one more thing to say than a half-written one, and only
   * when it is being SAVED rather than published — so it is not in `gaps`,
   * which is the publish checklist. It replaces the title's message rather
   * than adding a second note under the same field.
   */
  const emptyDraft = showGaps && !title.trim() && uploaded.length === 0
  const gapFor = useCallback(
    (key: GapKey) => {
      if (!showGaps) return null
      if (key === "title" && emptyDraft) return "Adaugă un titlu sau o fotografie ca să poți salva ciorna."
      return gaps.find((g) => g.key === key)?.message ?? null
    },
    [showGaps, gaps, emptyDraft],
  )

  /**
   * Take them to the first thing that is missing.
   *
   * `block: "center"` rather than "start": the form has a sticky header on a
   * phone and a sticky action card on a desktop, and "start" puts the control
   * underneath one of them often enough to be worse than not scrolling at all.
   * A frame's delay so the notes have been laid out first — scrolling to an
   * element that is about to get 40px taller lands in the wrong place.
   */
  /** The catch-all sentence, when it does appear, is scrolled to — a message
   *  nobody sees is a save that looks like it did nothing. */
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!error) return
    const id = requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    return () => cancelAnimationFrame(id)
  }, [error])

  const showFirstGap = useCallback((key: GapKey) => {
    requestAnimationFrame(() => {
      gapEls.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [])

  const submit = useCallback(
    async (draft: boolean) => {
      setError(null)
      /**
       * SAVING A DRAFT ASKS FOR LESS, BUT IT STILL ASKS.
       *
       * It asked for nothing at all: pressing Salvează on an untouched form
       * created an empty row, took you to the drafts list, and left you looking
       * at "Fără titlu — Fără preț" wondering what you had just saved. And
       * because the button never refused, it never scrolled anywhere either —
       * so the one control on this screen that CAN be pressed by accident was
       * also the one that gave you no feedback.
       *
       * One thing is enough to make a draft worth keeping. Below that it is not
       * a half-written listing, it is an empty one, and it says so at the title
       * — the same note in the same place the publish gaps use.
       */
      if (draft && !title.trim() && uploaded.length === 0) {
        setShowGaps(true)
        showFirstGap("title")
        void triggerHaptic("medium")
        return
      }
      if (!draft && gaps.length) {
        // The note goes AT the control, and the form goes to it. The one-line
        // summary by the button is gone: it was the whole of the feedback, and
        // it was as far from the empty title as it is possible to be.
        setShowGaps(true)
        showFirstGap(gaps[0].key)
        void triggerHaptic("medium")
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
        const target = editId
          ? `/api/listings/${encodeURIComponent(editId)}`
          : draftId
            ? `/api/listings/drafts/${encodeURIComponent(draftId)}`
            : "/api/listings"
        const res = await fetch(target, {
          method: editId || draftId ? "PATCH" : "POST",
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
          // A field refusal is walked back to its control and shown there,
          // exactly like a local one — the server and the form enforce the
          // same rules, so the mapping is total in practice. The sentence at
          // the bottom is only for failures that have no control to stand at.
          const mapped: GapKey[] = Array.isArray(data?.fields)
            ? data.fields.map((f: string) => SERVER_FIELD_TO_GAP[f]).filter(Boolean)
            : []
          if (mapped.length) {
            setShowGaps(true)
            showFirstGap(mapped[0])
            void triggerHaptic("medium")
            setSaving(null)
            return
          }
          setError(
            data?.message
              ? `Nu am putut salva anunțul: ${data.message}`
              : "Nu am putut salva anunțul. Încearcă din nou.",
          )
          setSaving(null)
          return
        }
        /**
         * EDITING IS NOT PUBLISHING, AND DOES NOT GET THE CONFIRMATION.
         *
         * The full-screen "anunțul tău e live" veil is for the moment a listing
         * first exists. Playing it again because somebody fixed a typo says the
         * wrong thing, and it takes over the whole screen to say it. An edit
         * closes the sheet and puts you back on the listing, which is where you
         * came from and the only place the change can be checked.
         */
        if (editId) {
          setMotion("armed")
          requestAnimationFrame(() => setMotion("leave"))
          void triggerHaptic("light")
          window.setTimeout(() => {
            router.replace(data?.slug ? `/products/${data.slug}` : "/profile")
            router.refresh()
          }, 316)
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
            if (draft) router.replace("/profile")
            else if (data?.slug) router.replace(`/products/${data.slug}`)
            else router.replace("/")
          }, 316)
        }, 1100)
      } catch {
        setError("Ceva n-a mers. Verifică conexiunea și încearcă din nou.")
        setSaving(null)
      }
    },
    [gaps, showFirstGap, uploaded, title, description, priceCents, compareCents, group, item, brand, condition, colour, size, era, sources, styles, postAnother, router, setMotion, draftId, editId],
  )
  // The close path needs `submit` and is declared far above it, closing over
  // half the form. A ref reaches it without hoisting either.
  submitRef.current = submit

  // One definition rendered in two places — the phone's pinned bottom bar and
  // the desktop sticky card — so the two sets of controls can never drift
  // apart in copy, state, or behaviour.
  const actionControls = (
    <>
      {/* A row, not a floating label. It shares the buttons' left edge exactly
          because it is in the same padded column, and it is 40px tall so it is
          a target rather than a 16px box you have to aim at.

          Absent while editing: "publish and add another" is about the moment a
          listing is created, and there is no second listing coming out of a
          typo fix. */}
      {!editId && (
        <label className="-mx-1 flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl px-1 text-[13.5px] font-medium text-neutral-600 active:bg-neutral-50">
          <input
            type="checkbox"
            checked={postAnother}
            onChange={(e) => setPostAnother(e.target.checked)}
            className="h-[18px] w-[18px] shrink-0 accent-[#7c3aed]"
          />
          <span className="min-w-0">Publică și adaugă încă un articol</span>
        </label>
      )}

      <div className="flex gap-2.5">
        {/* NOT "Salvează".
            It sat here reading as a second, lesser way to FINISH — and it was
            not: it was the exit that keeps your work, which is a different verb
            entirely and belongs on the way out rather than beside Publish.
            Leaving is what this button does now, and leaving is what asks
            whether to keep the draft. */}
        <button
          type="button"
          onClick={requestClose}
          disabled={saving !== null}
          className="h-12 flex-1 rounded-lg bg-neutral-100 text-[15px] font-semibold text-neutral-700 transition-colors duration-150 active:bg-neutral-200 disabled:opacity-60"
        >
          Renunță
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
          className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-[#7c3aed] text-[15.5px] font-semibold text-white transition-colors duration-150 active:bg-[#6d28d9] disabled:opacity-60"
        >
          {saving === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editId ? "Actualizează anunțul" : "Publică anunțul"}
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
        // BOTH of these read from a ref, and both have to.
        //
        // React owns this `className`, so every render rewrites the whole
        // attribute — and a class written straight onto the node with
        // `classList` is wiped by the next render that happens for any other
        // reason. `sell-typing` was written that way and NOT read back here,
        // and this form re-renders on every keystroke because the title and the
        // description are state. So the bar collapsed the moment a field took
        // focus and came back the moment the first character was typed, which
        // is exactly "sometimes it appears".
        //
        // Reading the refs here means a render recomputes the same classes the
        // element already has rather than clearing them.
        MOTION_CLASS[motion.current],
        typing.current && "sell-typing",
        // THE SCREEN BEHIND GIVES WAY. A subpage that slides in over a form
        // sitting perfectly still is a rectangle appearing on top of another
        // rectangle — the two frames are unrelated, which is why it read as
        // abrupt however long the slide was. Moving the form a little to the
        // left while the panel comes across is what turns those two rectangles
        // into one navigation: the thing you were on goes away and the thing
        // you asked for arrives. It is a transform, so it costs a layer and
        // nothing else, and the panel is opaque — you only ever see it during
        // the travel, which is the only place it does any work.
        "sell-pushable",
        sheet !== null && "sell-pushed",
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
            onClick={requestClose}
            aria-label="Închide"
            className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
          >
            <X className="h-[23px] w-[23px]" strokeWidth={2.2} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
            {editId ? "Editează anunțul" : "Vinde un articol"}
          </h1>
        </div>
      </header>

      {/* The one scroller. */}
      <div
        ref={scrollerRef}
        // React's onFocus/onBlur are focusin/focusout, so they bubble from
        // whichever field was tapped — one pair of handlers for the whole form
        // rather than a pair on every input.
        onFocus={onFieldFocus}
        onBlur={onFieldBlur}
        className="min-h-0 flex-1 overflow-y-auto [overflow-x:clip] overscroll-contain md:overflow-visible"
      >
      {/* The page column. Mobile is untouched — max-w-2xl at 16px gutters is the
          sheet it has always been. Above md it becomes a page: wider, with
          gutters that grow with the window rather than staying at phone size on
          a 27-inch monitor. */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 sm:pt-9 md:max-w-5xl md:px-6 lg:max-w-6xl lg:px-8">
      <header className="mb-6 hidden md:block lg:mb-8">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px]">
          {editId ? "Editează anunțul" : "Listează un articol"}
        </h1>
        <p className="mt-1 text-[14.5px] font-medium text-neutral-500">
          Completează detaliile și anunțul tău apare instant în feed.
        </p>
      </header>

      {/* Desktop splits the form in two: media and prose on the left, the
          attribute pickers and price on the right. On phones the grid
          collapses back to the exact single-column order it always had, and
          the columns must NOT be items-start: the right column has to stretch
          to the full row height so the sticky action card inside it has room
          to travel while the long left column scrolls. */}
      {/* The left column takes slightly more than half: it holds the photo
          grid and the description, both of which are the better for the width,
          against a right column of fixed-height rows that gains nothing from
          it. `minmax(0,…)` on both, or a long unbroken title in a Field row
          would blow the track out past the container. */}
      <div className="md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-6 lg:gap-8">
      <div className="min-w-0">
      {/* ---- Photos ---- */}
      {/**
        * The photo step.
        *
        * It was a row of 3:4 thumbnails at a quarter of the width — about 78px
        * across on a phone — with a 24px delete target in the corner of each,
        * and a line of copy underneath promising you could drag them to
        * reorder. On touch you could not: the reordering was HTML5
        * drag-and-drop, which a finger does not produce. So the instruction was
        * wrong, the pictures were too small to judge, and the only control on
        * them was easier to hit by accident than on purpose.
        *
        * ── Every slot is drawn, not just the ones with a photo in them ──────
        * The empty state used to be a single full-width dashed panel, which
        * says "put a photo here" and nothing else. A row of empty slots says
        * how many the listing wants, and it is the same grid you end up
        * looking at — so nothing re-arranges under your thumb between the
        * first photo and the second.
        *
        * The count is rounded up to a whole number of rows and capped at
        * MAX_PHOTOS, so the grid is always a complete rectangle: three empty
        * slots to begin with, and the last row filling in as you add. Every
        * one of them opens the picker, so there are no dead tiles.
        *
        * ── One grid, and position 1 is a place like any other ───────────────
        * An earlier version gave the cover its own full-width panel with the
        * rest in a strip underneath. That reads well and reorders badly: there
        * is no coherent way to drag a small tile into a big slot, and "first"
        * stops being a position you can drag to. With one grid, dragging
        * anything into the first slot makes it the cover — which is the whole
        * of what reordering is for here.
        */}
      <section
        ref={(el) => setGapEl("photos", el)}
        className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 md:mb-5"
      >
        <SectionHeading
          trailing={
            <span className="rounded-full bg-neutral-900 px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.03em] tabular-nums text-white">
              {photos.length > 0 ? `${photos.length}/${MAX_PHOTOS}` : `max ${MAX_PHOTOS}`}
            </span>
          }
        >
          Fotografii
        </SectionHeading>
        <p className="mt-1.5 text-[13px] font-medium text-neutral-500">
          {photos.length === 0
            ? `Minimum ${MIN_PHOTOS}. Prima fotografie este coperta anunțului.`
            : "Ține apăsat pe o fotografie și trage ca să schimbi ordinea."}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {photos.map((p, i) => (
            /* The OUTER element is the layout box and nothing else: it holds
               the grid cell, it is what gets measured, and the drag writes its
               translate straight onto it. Keeping it free of the scale matters
               — a scaled rect would poison both the slot measurement and the
               FLIP, and every number here would be 6% wrong. */
            <div
              key={p.id}
              ref={(el) => setTileEl(p.id, el)}
              onPointerDown={photoDrag.tile(p.id)}
              onContextMenu={(e) => e.preventDefault()}
              className="relative aspect-[3/4] select-none [-webkit-touch-callout:none]"
            >
              {/* The INNER element is everything you can see, and the lift is
                  its own transition — so picking a tile up and putting it down
                  is animated by the compositor while the translate stays
                  under the finger with no transition at all. */}
              <div
                className={cn(
                  "absolute inset-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-inset ring-black/[0.07]",
                  "transition-[transform,box-shadow] duration-200 ease-out",
                  i === 0 && "ring-[2.5px] ring-neutral-900",
                  dragId === p.id &&
                    "z-10 scale-[1.06] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.45)] ring-[2.5px] ring-neutral-900 will-change-transform",
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
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
                  </div>
                )}

                {/* The cover is the photograph the whole marketplace sees, so
                    it is said in the brand colour rather than in a grey pill
                    that reads as a caption. */}
                {i === 0 && !p.uploading && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-neutral-900 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-white shadow-[0_2px_6px_rgba(0,0,0,0.28)]">
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
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-transform active:scale-90"
                >
                  <X className="h-[15px] w-[15px]" strokeWidth={2.6} />
                </button>

                {/* The grip is no longer the only way in — the whole tile
                    drags after a short hold — but it is the affordance that
                    says so, and from here the drag starts on the first pixel
                    with no hold at all. `touch-action: none` lives on these 32
                    pixels and nowhere else, so the form scrolls normally
                    everywhere it matters. */}
                {!p.uploading && photos.length > 1 && (
                  <button
                    type="button"
                    aria-label="Mută fotografia"
                    onPointerDown={photoDrag.grip(p.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ touchAction: "none" }}
                    className="absolute bottom-1.5 left-1.5 flex h-8 w-8 cursor-grab items-center justify-center rounded-full bg-black/55 text-white active:cursor-grabbing"
                  >
                    <GripVertical className="h-[15px] w-[15px]" strokeWidth={2.4} />
                  </button>
                )}

                {/* One tap to the front, for the move everybody actually makes
                    — and the only one of the two a keyboard can perform. */}
                {i !== 0 && !p.uploading && (
                  <button
                    type="button"
                    onClick={() => {
                      void triggerHaptic("light")
                      makeCover(p.id)
                    }}
                    className="absolute bottom-1.5 right-1.5 rounded-full bg-white/95 px-2 py-1.5 text-[10.5px] font-bold leading-none text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-transform active:scale-90"
                  >
                    Copertă
                  </button>
                )}
              </div>
            </div>
          ))}

          {Array.from({ length: emptySlots }).map((_, n) => (
            /* THE REFERENCE'S MEDIA TILE.
               A chunky rounded square in light grey, ringed in white with a
               soft shadow under it — the shape of the thing it stands for,
               and the ring is what stops a light glyph on a light tile from
               disappearing into it. A flat circle read as a generic "add"
               button rather than as a picture that is not there yet. */
            <button
              key={`slot-${n}`}
              type="button"
              onClick={() => {
                void triggerHaptic("light")
                fileRef.current?.click()
              }}
              aria-label="Adaugă fotografii"
              className={cn(
                "flex aspect-[3/4] flex-col items-center justify-center gap-2.5 rounded-2xl border",
                "transition-[transform,background-color,border-color] duration-150 active:scale-[0.97]",
                n === 0
                  ? "border-neutral-300 bg-neutral-50 active:border-neutral-400 active:bg-neutral-100"
                  : "border-neutral-200 bg-neutral-50/60 active:border-neutral-300 active:bg-neutral-100",
              )}
            >
              <span
                className={cn(
                  "flex h-[52px] w-[52px] items-center justify-center rounded-[17px]",
                  "ring-[3px] ring-white shadow-[0_3px_10px_-2px_rgba(0,0,0,0.12)]",
                  n === 0 ? "bg-neutral-200/80 text-neutral-600" : "bg-neutral-100 text-neutral-400",
                )}
              >
                {n === 0 && photos.length === 0 ? (
                  <Camera className="h-[23px] w-[23px]" strokeWidth={1.8} />
                ) : (
                  <Plus className="h-[23px] w-[23px]" strokeWidth={2} />
                )}
              </span>
              {/* Only the first one says it. Eight tiles each captioned
                  "Adaugă" is the same word printed eight times to say one
                  thing, and the icon has already said it on the other seven. */}
              {n === 0 && <span className="text-[12.5px] font-semibold text-neutral-600">Adaugă</span>}
            </button>
          ))}
        </div>

        {gapFor("photos") && <GapNote>{gapFor("photos")}</GapNote>}

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
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 md:mb-5">
        <div ref={(el) => setGapEl("title", el)}>
        <label className="block text-[15px] font-semibold text-neutral-900">Titlu</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Adaugă un titlu"
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] font-medium outline-none transition-colors duration-150 focus:border-neutral-900 focus:bg-white"
        />
        {gapFor("title") && <GapNote>{gapFor("title")}</GapNote>}
        </div>

        <div ref={(el) => setGapEl("description", el)} className="mt-6">
        <label className="block text-[15px] font-semibold text-neutral-900">Descriere</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder="Adaugă o descriere"
          className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] font-medium leading-relaxed outline-none transition-colors duration-150 focus:border-neutral-900 focus:bg-white"
        />
        {gapFor("description") && <GapNote>{gapFor("description")}</GapNote>}
        <p className="mt-1.5 text-[12.5px] font-medium text-neutral-400">
          Spune starea, materialul și cum vine pe corp. Anunțurile detaliate se vând mai repede.
        </p>
        </div>
      </section>
      </div>

      <div className="min-w-0">
      {/* ---- Price ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 md:mb-5">
        <SectionHeading>Preț</SectionHeading>
        <div className="mt-3 flex gap-3">
          <div className="flex-1" ref={(el) => setGapEl("price", el)}>
            <label className="block text-[13px] font-medium text-neutral-500">Preț</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] font-medium outline-none transition-colors duration-150 focus:border-neutral-900 focus:bg-white"
            />
          </div>
          <div className="flex-1" ref={(el) => setGapEl("compare", el)}>
            <label className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500">
              Preț comparativ
              {/* A TAP, NOT A HOVER. This was a tooltip that appeared on
                  `group-hover` and was hidden below md — so on a phone, which
                  is where almost every listing is written, the icon was a
                  decoration you could press forever and learn nothing from.
                  A sheet is the phone's own answer to "tell me more". */}
              <button
                type="button"
                onClick={() => {
                  void triggerHaptic("light")
                  setPriceInfo(true)
                }}
                aria-label="Ce înseamnă prețul comparativ"
                className="-m-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors duration-150 active:bg-neutral-100"
              >
                <Info className="h-[15px] w-[15px]" strokeWidth={2.4} />
              </button>
            </label>
            <input
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="Opțional"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] font-medium outline-none transition-colors duration-150 focus:border-neutral-900 focus:bg-white"
            />
          </div>
        </div>
        {gapFor("price") && <GapNote>{gapFor("price")}</GapNote>}
        {gapFor("compare") && <GapNote>{gapFor("compare")}</GapNote>}
      </section>

      {/* ---- Details ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 md:mb-5">
        <SectionHeading>Detalii</SectionHeading>
        <div className="mt-1">
          <Field label="Categorie" value={categoryLabelFor(group, item)} onClick={openCategory} error={gapFor("category")} anchor={(el) => setGapEl("category", el)} />
          <Field label="Brand" value={brand} onClick={() => setSheet("brand")} error={gapFor("brand")} anchor={(el) => setGapEl("brand", el)} />
          <Field label="Stare" value={label(CONDITIONS, condition)} onClick={() => setSheet("condition")} error={gapFor("condition")} anchor={(el) => setGapEl("condition", el)} />
          <Field label="Mărime" value={label(SIZES, size)} onClick={() => setSheet("size")} error={gapFor("size")} anchor={(el) => setGapEl("size", el)} />
          <Field label="Culoare" value={label(COLOURS, colour)} onClick={() => setSheet("colour")} error={gapFor("colour")} anchor={(el) => setGapEl("colour", el)} />
          <Field label="Tip" optional value={sources.length ? sources.map((s) => label(SOURCES, s)).join(", ") : null} onClick={() => setSheet("source")} />
          <Field label="Epocă" optional value={label(ERAS, era)} onClick={() => setSheet("era")} />
          <Field label="Stil" optional value={styles.length ? styles.map((s) => label(STYLES, s)).join(", ") : null} onClick={() => setSheet("style")} />
        </div>
      </section>

      {error && (
        <p ref={errorRef} className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] font-medium text-rose-700 md:hidden">
          {error}
        </p>
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
      {/* ── IT GETS OUT OF THE WAY OF THE KEYBOARD ────────────────────────
          Writing a description on a phone leaves about four visible lines of
          the field you are typing into. Two buttons and a checkbox pinned
          under it were taking a third of what was left to offer an action
          nobody can want while mid-sentence — and neither of them is reachable
          without dismissing the keyboard anyway.

          A grid with ONE row, transitioned 1fr → 0fr. That is the only way to
          animate to a height nobody has measured: a pixel value would be a
          guess that clips the row the moment the safe-area inset differs, and
          `height: auto` does not transition at all. The space it gives up goes
          straight to the scroller above it, because the sheet is a flex column
          — so the field grows into it rather than a gap appearing.

          `data-keyboard` is published on <html> by components/viewport-vars,
          which the conversation composer has used since it had this same
          problem. */}
      <div className="sell-actions shrink-0 grid md:hidden">
        <div className="overflow-hidden">
          <div className="border-t border-neutral-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3">
            <div className="mx-auto w-full max-w-2xl space-y-2.5">{actionControls}</div>
          </div>
        </div>
      </div>

      {/* ---- Pickers ---- */}
      {/* THREE LEVELS: who it is for, what kind of thing, which thing.
          Search cuts across all of them — somebody who already knows the word
          should not have to walk the tree to reach it — so a query replaces the
          whole drill-down for as long as there is one. */}
      <PickerPage
        open={sheet === "category"}
        title={catSearching ? "Categorie" : categoryTitle}
        onClose={() => setSheet(null)}
        onBack={!catSearching && (catDep || catGroup) ? categoryBack : undefined}
        level={catLevel}
        depth={catDepth}
        sticky={() => <SheetSearch value={catQuery} onChange={setCatQuery} placeholder="Caută categoria" />}
      >{() => (
        <>
        {!catSearching && !catGroup && (
          <PickerNote>Categoria decide unde apare anunțul și ce filtre îl găsesc.</PickerNote>
        )}

        {catResults ? (
          <div className="pb-6">
            {catResults.map((c) => (
              <OptionRow
                key={`${c.groupId}-${c.item.id}`}
                label={c.item.label}
                hint={c.groupLabel}
                selected={group === c.groupId && item === c.item.id}
                onClick={() => {
                  setGroup(c.groupId)
                  setItem(c.item.id)
                }}
              />
            ))}
            {catResults.length === 0 && (
              <p className="px-4 py-10 text-center text-[14.5px] font-medium text-neutral-400">Nicio categorie găsită</p>
            )}
          </div>
        ) : catItems ? (
          <div className="pb-6">
            {catItems.items.map((it) => (
              <OptionRow
                key={it.id}
                label={it.label}
                selected={group === catItems.id && item === it.id}
                onClick={() => {
                  setGroup(catItems.id)
                  setItem(it.id)
                }}
              />
            ))}
          </div>
        ) : catDep ? (
          <div className="pb-6">
            {catGroups.map((g) => (
              <DrillRow
                key={g.id}
                label={categoryShortLabel(g)}
                hint={`${g.items.length} opțiuni`}
                selected={group === g.id}
                onClick={() => setCatGroup(g.id)}
              />
            ))}
          </div>
        ) : (
          <div className="pb-6">
            {DEPARTMENTS.map((d) => (
              <DrillRow
                key={d.id}
                label={d.label}
                selected={departmentForGroup(group) === d.id && !!group}
                onClick={() => setCatDep(d.id)}
              />
            ))}
          </div>
        )}
        </>
      )}
      </PickerPage>

      <PickerPage
        open={sheet === "brand"}
        title="Brand"
        onClose={() => setSheet(null)}
        sticky={() => <SheetSearch value={brandQuery} onChange={setBrandQuery} placeholder="Caută brandul" />}
      >{() => (
        <>
        <div className="pb-6">
          {/* Skeleton rows rather than an empty sheet. A blank list under a
              search box reads as "no brands", which is a wrong answer; rows
              that are the right height and the right count read as "not yet",
              and they hold the layout so nothing jumps when the names land. */}
          {brands.length === 0 &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={`skel-${i}`} className="flex h-[56px] items-center px-4">
                <span
                  className="h-[13px] animate-pulse rounded-full bg-neutral-100"
                  style={{ width: `${38 + ((i * 17) % 42)}%` }}
                />
              </div>
            ))}
          {brands.map((b) => (
            <OptionRow
              key={b.slug}
              label={b.name}
              selected={brand === b.name}
              onClick={() => setBrand(b.name)}
            />
          ))}
          {/* Always available, never a row in the table — a brand directory can
              never be complete, and a missing brand shouldn't block a listing. */}
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              setBrand("Altele")
            }}
            className="mt-2 flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-4 text-left text-[15px] font-medium text-neutral-600 transition-colors duration-150 active:bg-neutral-100"
          >
            <span className="flex-1">Nu găsesc brandul — Altele</span>
            {brand === "Altele" && <Check className="h-[19px] w-[19px] shrink-0 text-[#7c3aed]" strokeWidth={2.8} />}
          </button>
        </div>
        </>
      )}
      </PickerPage>

      {/* The condition ladder is the one picker whose choices need reading
          rather than recognising — "nou, fără etichetă" and "foarte bună" are
          a sentence apart, not a word — so it stays a list, and each rung says
          what it means. */}
      <PickerPage open={sheet === "condition"} title="Stare" onClose={() => setSheet(null)}>{() => (
        <>
        {CONDITIONS.map((c) => (
          <OptionRow
            key={c.id}
            label={c.label}
            hint={CONDITION_HINTS[c.id]}
            selected={condition === c.id}
            onClick={() => setCondition(c.id)}
          />
        ))}
        </>
      )}
      </PickerPage>

      <PickerPage open={sheet === "size"} title="Mărime" onClose={() => setSheet(null)}>{() => (
        <>
        <ChipField>
          {SIZES.map((c) => (
            <OptionChip
              key={c.id}
              label={c.label}
              selected={size === c.id}
              onClick={() => setSize(c.id)}
            />
          ))}
        </ChipField>
        </>
      )}
      </PickerPage>

      <PickerPage open={sheet === "colour"} title="Culoare" onClose={() => setSheet(null)}>{() => (
        <>
        <ChipField>
          {COLOURS.map((c) => (
            <OptionChip
              key={c.id}
              label={c.label}
              swatch={c.hex}
              selected={colour === c.id}
              onClick={() => setColour(c.id)}
            />
          ))}
        </ChipField>
        </>
      )}
      </PickerPage>

      <PickerPage open={sheet === "source"} title="Tip" onClose={() => setSheet(null)}>{() => (
        <>
        <PickerNote>Alege până la 2</PickerNote>
        <ChipField>
          {SOURCES.map((o) => (
            <OptionChip
              key={o.id}
              label={o.label}
              selected={sources.includes(o.id)}
              onClick={() => setSources((l) => toggleIn(l, o.id, 2))}
            />
          ))}
        </ChipField>
        </>
      )}
      </PickerPage>

      <PickerPage open={sheet === "era"} title="Epocă" onClose={() => setSheet(null)}>{() => (
        <>
        <ChipField>
          {ERAS.map((c) => (
            <OptionChip
              key={c.id}
              label={c.label}
              selected={era === c.id}
              onClick={() => setEra(c.id)}
            />
          ))}
        </ChipField>
        </>
      )}
      </PickerPage>

      <PickerPage open={sheet === "style"} title="Stil" onClose={() => setSheet(null)}>{() => (
        <>
        <PickerNote>Alege până la 3</PickerNote>
        <ChipField>
          {STYLES.map((o) => (
            <OptionChip
              key={o.id}
              label={o.label}
              selected={styles.includes(o.id)}
              onClick={() => setStyles((l) => toggleIn(l, o.id, 3))}
            />
          ))}
        </ChipField>
        </>
      )}
      </PickerPage>

      {/* LEAVING WITH SOMETHING WRITTEN. Two answers, and the scrim is not one
          of them — see components/ui/confirm-dialog.tsx for why this is a
          centred alert rather than a sheet. */}
      <ConfirmDialog
        open={askOnClose}
        title="Salvezi schimbările înainte de a închide?"
        body="O poți continua oricând din profilul tău, unde apare cu eticheta Ciornă."
        onDismiss={() => setAskOnClose(false)}
        actions={[
          { label: "Salvează ciorna", onClick: saveAndClose, primary: true, busy: saving !== null },
          {
            label: "Renunță la modificări",
            danger: true,
            onClick: () => {
              setAskOnClose(false)
              close()
            },
          },
        ]}
      />

      {/* WHAT A COMPARISON PRICE IS, AS A SHEET.
          Short enough to be read standing up, and it says the one thing that
          actually stops people using it wrongly: it is what the item used to
          cost, not what you think it is worth. */}
      <BottomSheet open={priceInfo} onClose={() => setPriceInfo(false)} label="Preț comparativ">
        <div className="px-5 pb-8 pt-5">
          <h2 className="text-[20px] font-bold tracking-[-0.02em] text-neutral-900">Preț comparativ</h2>
          <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-neutral-600">
            Este prețul de dinainte de reducere. Pe anunț apare tăiat, lângă prețul cerut, cu o etichetă
            de reducere — așa cumpărătorii văd cât economisesc.
          </p>
          <ul className="mt-4 space-y-3">
            {[
              "Trebuie să fie mai mare decât prețul cerut.",
              "Este opțional — dacă îl lași gol, anunțul arată doar prețul cerut.",
              "Folosește-l pentru prețul real de dinainte, nu pentru unul inventat: cumpărătorii compară.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5 text-[14.5px] font-medium leading-relaxed text-neutral-600">
                <span aria-hidden className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-neutral-300" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPriceInfo(false)}
            className="mt-6 h-12 w-full rounded-lg bg-neutral-900 text-[15.5px] font-semibold text-white transition-colors duration-150 active:bg-neutral-800"
          >
            Am înțeles
          </button>
        </div>
      </BottomSheet>

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
