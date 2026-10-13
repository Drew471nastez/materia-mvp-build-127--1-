"use client"

/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S COLOUR PICKER
 * ===========================================================================
 * Every colour the OnePage editor asks for goes through here: the wallpaper,
 * the text, the buttons, the socials, a product block's overrides. What was
 * here before was two different pickers. On a computer it was the browser's
 * own <input type="color">, a grey system dialog that looks different in
 * every browser and has no idea what colours the page already uses. On a
 * phone it was a sheet of its own, with its own drag code and an Apply
 * button, and nothing happened to the page until Apply was pressed.
 *
 * Now there is one, drawn the way the owner pointed at (Linktree's
 * wallpaper colour): a field that shows the swatch and its code, and a panel
 * with
 *
 *   A SQUARE      saturation across, brightness down, over the chosen hue,
 *                 with a hollow ring for a handle so the colour under it
 *                 stays visible.
 *   A HUE STRIP   the rainbow, with a round white thumb.
 *   A CODE        the hex, typed or pasted in any of the usual shapes
 *                 (lib/onepage/color normalizeHex), and an eyedropper where
 *                 the browser has one (window.EyeDropper: Chrome and Edge on a
 *                 computer). Where it has not, the button is not drawn, rather
 *                 than drawn and doing nothing.
 *   SUGGESTED     a few colours that suit the field, passed in by the caller.
 *   RECENT        the last colours chosen anywhere in the editor, on this
 *                 browser (localStorage, read defensively: a private window
 *                 simply has none).
 *
 * The page changes AS YOU DRAG, not on a button. Pointer moves are gathered
 * and handed to the page once per frame, so a fast drag costs one render of
 * the editor per frame at most, and the history (lib/onepage/editor-state
 * recordEdit) folds a drag into one undo step because every move writes the
 * same field.
 *
 * On a computer the panel is a popover under the field. Below 640px it is
 * the app's shared BottomSheet (components/ui/bottom-sheet), with a clear
 * scrim so the page behind is not dimmed while its colour is being chosen.
 * The square and the strip are marked `data-sheet-no-drag`, so a finger on
 * them moves the colour and never the sheet.
 *
 * TWO SIZES, AND THEY ARE NOT THE SAME SIZE FOR A REASON. The popover on a
 * computer used to be built to the phone's measurements: 304px wide, a
 * 172px square, 44px rows, 28px swatches, and a labelled section each for
 * Suggested and Recent. Next to the editor's own rows that panel was taller
 * than the panel it was covering, and picking a colour meant looking away
 * from the page. So `compact` (the phone sheet) keeps every target where a
 * thumb wants it, and the computer's popover is drawn to a mouse: 248px
 * wide, a 124px square, a 20px hue row, a 36px code row, 24px swatches, and
 * the two swatch rows sharing one block under one hairline. Every control
 * is still there, still reachable by keyboard, still with its focus ring.
 * Anything sized by a number rather than a class (the square's handle, the
 * hue thumb) reads that number from `compact` too, so the two stay in step.
 *
 * POINTER EVENTS, NOT MOUSE AND TOUCH. One handler for a mouse, a finger
 * and a pen, with the pointer captured on press so a drag that leaves the
 * square keeps working (it clamps to the edge) until the finger lifts.
 * `touch-action: none` on both, or the browser takes a vertical finger for
 * a scroll and cancels the pointer half way through.
 *
 * NOTHING IN HERE IS MOVED BY `transform`. The handle and the thumb are
 * placed with left and top: app/globals.css removes every transform inside a
 * `.group` on a device without hover, and the editor's rows are groups.
 */
import * as React from "react"
import { Pipette } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { primaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { SwatchMark } from "@/components/onepage/choice-marks"
import {
  RECENT_COLORS_KEY,
  hsvFromHex,
  hsvToHex,
  isNearWhite,
  normalizeHex,
  pushRecent,
  readRecent,
  type Hsv,
} from "@/lib/onepage/color"
import { tt } from "@/lib/i18n/text"

/** Used when a field passes no suggestions of its own: quiet colours that sit well on a page. */
export const DEFAULT_SUGGESTIONS = ["#ffffff", "#1a1a2e", "#f4efe9", "#b2846c", "#6b7280", "#2f6f4f", "#e4572e", "#1f4e79"]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/* ── Recent colours, shared by every picker on the page ─────────────────── */

let recentCache: string[] | null = null
const recentListeners = new Set<() => void>()
function getRecent(): string[] {
  if (recentCache) return recentCache
  try {
    recentCache = readRecent(window.localStorage.getItem(RECENT_COLORS_KEY))
  } catch {
    recentCache = []
  }
  return recentCache
}
function rememberColor(hex: string) {
  recentCache = pushRecent(getRecent(), hex)
  try {
    window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentCache))
  } catch {
    /* A private window: remembered for this visit only. */
  }
  recentListeners.forEach((fn) => fn())
}
const EMPTY: string[] = []
function useRecentColors(): string[] {
  return React.useSyncExternalStore(
    (fn) => {
      recentListeners.add(fn)
      return () => recentListeners.delete(fn)
    },
    getRecent,
    () => EMPTY,
  )
}

/* ── The eyedropper, where there is one ─────────────────────────────────── */

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }
function eyeDropper(): EyeDropperCtor | null {
  if (typeof window === "undefined") return null
  return ((window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper as EyeDropperCtor | undefined) ?? null
}

/* ── The panel ──────────────────────────────────────────────────────────── */

/**
 * A pointer drag on an element, reported as a position from 0 to 1 on each
 * axis. The pointer is captured on press, so the drag keeps going outside.
 */
function usePointerDrag(onMove: (x: number, y: number) => void) {
  const ref = React.useRef<HTMLDivElement>(null)
  const move = React.useRef(onMove)
  move.current = onMove
  const report = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    move.current(clamp01((e.clientX - r.left) / Math.max(1, r.width)), clamp01((e.clientY - r.top) / Math.max(1, r.height)))
  }
  return {
    ref,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      e.currentTarget.focus({ preventScroll: true })
      report(e)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) report(e)
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    },
  }
}

export function ColorPickerPanel({
  value,
  onChange,
  suggestions = DEFAULT_SUGGESTIONS,
  compact = false,
}: {
  value: string
  onChange: (hex: string) => void
  suggestions?: string[]
  /** In a phone sheet: bigger targets, full width. */
  compact?: boolean
}) {
  const current = normalizeHex(value) ?? "#000000"
  const [hsv, setHsv] = React.useState<Hsv>(() => hsvFromHex(current))
  /* The colour the square last produced. When `value` changes to something
     else (undo, a swatch, another field), the square follows it; when it is
     only our own drag coming back, the square keeps its hue (greys). */
  const lastOut = React.useRef(current)
  React.useEffect(() => {
    if (current !== lastOut.current) {
      lastOut.current = current
      setHsv((prev) => hsvFromHex(current, prev.h))
    }
  }, [current])

  /* One write to the page per frame, however fast the pointer moves. */
  const pending = React.useRef<string | null>(null)
  const frame = React.useRef<number | null>(null)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const flush = React.useCallback(() => {
    frame.current = null
    const hex = pending.current
    pending.current = null
    if (hex) onChangeRef.current(hex)
  }, [])
  React.useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    flush()
  }, [flush])
  const emit = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    lastOut.current = hex
    pending.current = hex
    if (frame.current === null) frame.current = requestAnimationFrame(flush)
  }
  /** A whole colour at once (a swatch, a code, the eyedropper): written straight away. */
  const pick = (raw: string) => {
    const hex = normalizeHex(raw)
    if (!hex) return
    lastOut.current = hex
    setHsv((prev) => hsvFromHex(hex, prev.h))
    pending.current = null
    onChangeRef.current(hex)
  }

  const square = usePointerDrag((x, y) => emit({ h: hsv.h, s: x, v: 1 - y }))
  const strip = usePointerDrag((x) => emit({ ...hsv, h: Math.min(359.9, x * 360) }))

  const onSquareKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (!d) return
    e.preventDefault()
    emit({ h: hsv.h, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) })
  }
  const onStripKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key]
    if (d === undefined) return
    e.preventDefault()
    emit({ ...hsv, h: Math.min(359.9, Math.max(0, hsv.h + d)) })
  }

  /* The code box: what is typed stays as typed until it is a colour. */
  const shown = hsvToHex(hsv)
  const [text, setText] = React.useState(shown.toUpperCase())
  const typing = React.useRef(false)
  React.useEffect(() => {
    if (!typing.current) setText(shown.toUpperCase())
  }, [shown])
  const [bad, setBad] = React.useState(false)
  const commitText = () => {
    typing.current = false
    const hex = normalizeHex(text)
    if (hex) {
      setBad(false)
      pick(hex)
      setText(hex.toUpperCase())
    } else {
      setBad(text.trim() !== "")
      setText(shown.toUpperCase())
    }
  }

  /* Decided after mounting, so the server's HTML and the first render agree. */
  const [dropper, setDropper] = React.useState<EyeDropperCtor | null>(null)
  React.useEffect(() => setDropper(() => eyeDropper()), [])

  const recent = useRecentColors()
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  /* The code row and the eyedropper beside it: a thumb's 48px, a mouse's 36px. */
  const targets = compact ? "h-12" : "h-9"
  /* The square's handle and the hue thumb are placed by arithmetic, so their
     size is a number here rather than a class. */
  const handle = compact ? 18 : 14
  const thumb = compact ? 22 : 16

  return (
    <div data-color-picker="" className={cn("flex flex-col", compact ? "gap-4" : "gap-2.5")}>
      <div
        ref={square.ref}
        role="slider"
        tabIndex={0}
        aria-label={tt("Saturation and brightness")}
        aria-valuetext={tt("Saturation {value}%, brightness {value2}%", { value: Math.round(hsv.s * 100), value2: Math.round(hsv.v * 100) })}
        data-sheet-no-drag=""
        data-color-square=""
        onPointerDown={square.onPointerDown}
        onPointerMove={square.onPointerMove}
        onPointerUp={square.onPointerUp}
        onPointerCancel={square.onPointerUp}
        onKeyDown={onSquareKey}
        className={cn(
          "relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl outline-none",
          "focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
          compact ? "h-[200px]" : "h-[124px]",
        )}
        style={{ backgroundColor: hueColor, backgroundImage: "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))" }}
      >
        <span
          aria-hidden
          className={cn("pointer-events-none absolute rounded-full border-white shadow-[0_0_0_1px_rgba(0,0,0,0.18),0_1px_4px_rgba(0,0,0,0.3)]", compact ? "border-[2.5px]" : "border-2")}
          style={{ height: handle, width: handle, left: `calc(${hsv.s * 100}% - ${handle / 2}px)`, top: `calc(${(1 - hsv.v) * 100}% - ${handle / 2}px)` }}
        />
      </div>

      <div
        ref={strip.ref}
        role="slider"
        tabIndex={0}
        aria-label={tt("Hue")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        data-sheet-no-drag=""
        data-color-hue=""
        onPointerDown={strip.onPointerDown}
        onPointerMove={strip.onPointerMove}
        onPointerUp={strip.onPointerUp}
        onPointerCancel={strip.onPointerUp}
        onKeyDown={onStripKey}
        /* The strip is thin, the place to press is not: 28px of row for a thumb,
           20px for a mouse, with the colour drawn in the middle of either. */
        className={cn(
          "relative flex w-full cursor-pointer touch-none select-none items-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
          compact ? "h-7" : "h-5",
        )}
      >
        <span
          aria-hidden
          className={cn("w-full rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]", compact ? "h-3" : "h-2.5")}
          style={{ background: "linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)" }}
        />
        <span
          aria-hidden
          className={cn("pointer-events-none absolute top-1/2 rounded-full border-white shadow-[0_0_0_1px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.22)]", compact ? "border-[3px]" : "border-2")}
          style={{ height: thumb, width: thumb, marginTop: -thumb / 2, left: `calc(${(hsv.h / 360) * 100}% - ${thumb / 2}px)`, backgroundColor: hueColor }}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className={cn("flex min-w-0 flex-1 items-center rounded-full border bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]", targets, compact ? "px-4" : "px-3", bad ? "border-[#e5484d]" : "border-[#e3e4e8]")}>
          <span className="sr-only">{tt("Colour code")}</span>
          <span aria-hidden className={cn("mr-2 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]", compact ? "h-5 w-5" : "h-4 w-4")} style={{ backgroundColor: shown }} />
          <input
            value={text}
            data-color-hex=""
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={9}
            onChange={(e) => {
              typing.current = true
              setBad(false)
              setText(e.target.value)
              /* A whole code typed out applies at once; a half typed one waits. */
              const hex = /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) ? normalizeHex(e.target.value) : null
              if (hex) pick(hex)
            }}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitText()
              }
            }}
            /* 16px on a phone, or iOS zooms the page to type. */
            className={cn("min-w-0 flex-1 bg-transparent font-medium uppercase tabular-nums tracking-[0.02em] text-[#1a1a2e] outline-none", compact ? "text-[16px]" : "text-[13px]")}
          />
        </label>
        {dropper ? (
          <button
            type="button"
            aria-label={tt("Pick a colour from the screen")}
            title={tt("Pick a colour from the screen")}
            data-color-eyedropper=""
            onClick={async () => {
              try {
                const r = await new dropper().open()
                pick(r.sRGBHex)
              } catch {
                /* Escape pressed: nothing chosen. */
              }
            }}
            className={cn("grid shrink-0 cursor-pointer place-items-center rounded-full border border-[#e3e4e8] bg-white text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] active:bg-[#f1f2f4]", compact ? "h-12 w-12" : "h-9 w-9")}
          >
            <Pipette className={cn(compact ? "h-[18px] w-[18px]" : "h-4 w-4")} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      {/* Suggested and Recent are one block under one hairline, not two sections
          with a rule and a full gap between them. Each keeps its own small
          caption, because a row of colours with no name is a guess. */}
      <div className={cn("flex flex-col border-t border-[#eef0f2]", compact ? "gap-3 pt-3" : "gap-1.5 pt-2.5")}>
        <SwatchRow title={tt("Suggested")} colors={suggestions} value={shown} onPick={pick} compact={compact} />
        {recent.length ? <SwatchRow title={tt("Recent")} colors={recent} value={shown} onPick={pick} compact={compact} /> : null}
      </div>
    </div>
  )
}

function SwatchRow({ title, colors, value, onPick, compact }: { title: string; colors: string[]; value: string; onPick: (hex: string) => void; compact: boolean }) {
  const list = Array.from(new Set(colors.map(normalizeHex).filter((c): c is string => !!c)))
  if (!list.length) return null
  return (
    <div data-swatches={title.toLowerCase()}>
      <p className={cn("font-medium", compact ? "mb-2 text-[13px] text-[#1a1a2e]" : "mb-1 text-[11px] leading-[14px] text-[#6b7280]")}>{title}</p>
      {/* Eight to a row, each as wide as the row allows (up to 40px), so a phone's row never wraps one swatch onto a line of its own. */}
      <div className={cn("grid grid-cols-8", compact ? "gap-2.5" : "gap-1")}>
        {list.map((c) => {
          const on = c === value
          return (
            <button
              key={c}
              type="button"
              aria-label={c.toUpperCase()}
              aria-pressed={on}
              data-swatch={c}
              onClick={() => onPick(c)}
              className={cn(
                "relative cursor-pointer rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
                compact ? "aspect-square w-full max-w-10" : "aspect-square w-full",
                isNearWhite(c) ? "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
              )}
              style={{ backgroundColor: c }}
            >
              {/* The ring round the chosen colour fades and grows in; the last one's fades out (editor-kit SwatchMark). */}
              <SwatchMark on={on} className="rounded-full" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── The field that opens it ────────────────────────────────────────────── */

export interface ColorFieldProps {
  value: string | null | undefined
  onChange: (hex: string) => void
  /** Names the sheet on a phone and the button for a screen reader. */
  label: string
  suggestions?: string[]
  /**
   * "pill": the swatch and its code, for a row with a label beside it.
   * "swatch": the swatch alone, sized by `className` (the older call sites).
   */
  variant?: "pill" | "swatch"
  /** Shown instead of a code when there is no value (a colour that falls back to the theme's). */
  emptyLabel?: string
  /** What the swatch shows while there is no value. */
  fallback?: string
  className?: string
  align?: "start" | "end" | "center"
}

export function ColorField({
  value,
  onChange,
  label,
  suggestions,
  variant = "pill",
  emptyLabel,
  fallback = "#ffffff",
  className,
  align = "end",
}: ColorFieldProps) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const hex = normalizeHex(value)
  const swatch = hex ?? normalizeHex(fallback) ?? "#ffffff"
  /* What it was when it opened: a colour that changed is remembered as recent when it closes. */
  const openedWith = React.useRef<string | null>(null)
  const latest = React.useRef(hex)
  latest.current = hex
  const setShown = (o: boolean) => {
    if (o) openedWith.current = latest.current
    else if (latest.current && latest.current !== openedWith.current) rememberColor(latest.current)
    setOpen(o)
  }

  const trigger = (
    <button
      type="button"
      aria-label={`${label}: ${hex ? hex.toUpperCase() : emptyLabel || tt("not set")}`}
      aria-haspopup="dialog"
      data-color-field=""
      data-open={open ? "" : undefined}
      onClick={phone ? () => setShown(true) : undefined}
      className={cn(
        "cursor-pointer select-none outline-none [-webkit-tap-highlight-color:transparent]",
        "focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
        variant === "pill"
          ? "inline-flex h-11 min-w-[132px] shrink-0 items-center gap-2.5 rounded-full border border-[#e3e4e8] bg-white pl-1.5 pr-4 text-[14px] font-medium tabular-nums text-[#1a1a2e] transition-[border-color,background-color] duration-150 hover:border-[#c9cbd1] data-[open]:border-[#1a1a2e]"
          : "block h-12 w-12 shrink-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] transition-shadow data-[open]:shadow-[0_0_0_2px_#fff,0_0_0_3.5px_#1a1a2e]",
        className,
      )}
      style={variant === "swatch" ? { backgroundColor: swatch } : undefined}
    >
      {variant === "pill" ? (
        <>
          <span
            aria-hidden
            className={cn("h-8 w-8 shrink-0 rounded-full", isNearWhite(swatch) ? "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]")}
            style={{ backgroundColor: swatch }}
          />
          <span className={cn("truncate", !hex && "text-[#6b7280]")}>{hex ? hex.toUpperCase() : emptyLabel || tt("Choose")}</span>
        </>
      ) : null}
    </button>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet
          isOpen={open}
          onClose={() => setShown(false)}
          title={label}
          scrim="clear"
          header={
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <p className="text-[17px] font-semibold text-[#1a1a2e]">{label}</p>
              <button type="button" onClick={() => setShown(false)} className={cn(primaryDepth, "h-10 rounded-full px-5 text-[14px]")}>
                {tt("Done")}
              </button>
            </div>
          }
        >
          <div className="px-5 pb-5 pt-1">
            <ColorPickerPanel value={hex ?? swatch} onChange={onChange} suggestions={suggestions} compact />
          </div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setShown}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        collisionPadding={12}
        /* 248px and p-3: the panel sits beside the editor's rows rather than over them. */
        className="w-[248px] rounded-2xl border border-[#e3e4e8] bg-white p-3 text-[#1a1a2e] shadow-[0_16px_48px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ColorPickerPanel value={hex ?? swatch} onChange={onChange} suggestions={suggestions} />
      </PopoverContent>
    </Popover>
  )
}
