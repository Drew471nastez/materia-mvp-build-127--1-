"use client"

/**
 * ===========================================================================
 *  SHARE YOUR STORELIB
 * ===========================================================================
 * The grey address pill on the home page and in Settings, and what it opens.
 *
 * On a computer it opens IN PLACE: a panel that drops from the pill itself,
 * with no dimmed page and no centred box, and closes on a click anywhere
 * else. On a phone it is the app's shared bottom sheet
 * (components/ui/bottom-sheet), so it rises, follows the thumb and closes
 * like every other sheet in /app: a pull down or a tap outside, no X.
 *
 * "Make the Share your Storelib panel more simple to use: it's too
 * complicated, too many things." So it holds what people use it for and
 * nothing else:
 *
 *   the switch    creator page, OnePage, website (the ones that exist)
 *   the address   with Copy, the one action in ink; tapping the address
 *                 selects it
 *   one line      what that address opens, or that the OnePage is not
 *                 published yet
 *   Open, QR code and, where the device has one, Share: the system's own
 *                 share sheet, which already lists every app on the phone
 *
 * and a QR code view, for a code to show somebody or download. What went, and
 * why: the QR card on the share view (the QR code button is the same thing,
 * one press away); "My platforms" and its how to for each app (reading
 * matter, not sharing, and what put the panel past a screen); and the row of
 * eleven share targets (on a phone the system's Share lists the same apps
 * and more; on a computer people copy the address).
 *
 * THE PANEL GROWS FROM THE PILL, AND ONLY GROWS. Its origin is the pill's
 * corner from the first frame (`origin-top-right`, not a value the popover
 * writes a frame later), and no transition runs on it: a `duration-*` class
 * used to give every property a 200ms transition, the origin included, so
 * the origin slid from the panel's middle to its corner while it opened and
 * the panel drifted six pixels to the left and back. Only its own keyframes
 * move it, on opacity and transform.
 *
 * SWITCHING ADDRESSES MOVES NOTHING BUT THE WORDS. Every line of the share
 * view is one line tall whichever address is chosen, so the panel keeps its
 * height; the white thumb slides under the choice and the address and its
 * line fade in over 220ms, on opacity and transform.
 *
 * A TAP CHANGES ONE THING. The views are memoised and every handler is made
 * once. On a phone the sheet is built ahead and kept (BottomSheet
 * keepMounted) with both views in it, the one not showing out of sight
 * (Pane), and nothing goes into the page or out of it on a tap: a tap shows
 * what is already laid out rather than building it first.
 */

import * as React from "react"
import { AppLink } from "@/components/app/app-link"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ArrowLeft, ArrowUpRight, Check, Download, QrCode as QrCodeIcon, Share, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { StorelibMark, STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import { downloadBlob } from "@/lib/platform/save-file"
import { cn } from "@/lib/utils"
import { StorelibTile, StorelibVioletS } from "./storelib-share-marks"
import { SURFACE_HINT, type ConnectedPlatform, type ShareAddress, type ShareSurface } from "./share-data"

/* The sheet's own curve (components/ui/bottom-sheet SHEET_EASE), so a view change moves like the sheet does. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/* ─── The pill ────────────────────────────────────────────────────────── */

/**
 * The address, cut by the room it has rather than by a character count, and
 * faded over its last few letters where it is cut instead of ending on "…".
 * Whether it is cut is measured, so an address that fits is never faded.
 */
function FadeText({ text, className }: { text: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [cut, setCut] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return (
    <span
      ref={ref}
      data-cut={cut ? "" : undefined}
      className={cn(
        "block min-w-0 overflow-hidden whitespace-nowrap",
        cut && "[mask-image:linear-gradient(to_right,#000_calc(100%-26px),transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_calc(100%-26px),transparent)]",
        className,
      )}
    >
      {text}
    </span>
  )
}

/**
 * Light grey, the Storelib S in its own violet with a little depth, the
 * address in a very dark grey, and the share glyph. A hairline and a lit
 * top edge give it the slightest lift off the page. The same pill, the same
 * S, on Home and in Settings, at either size.
 */
export const SharePill = React.memo(function SharePill({
  display,
  onOpen,
  size = "md",
  expanded,
  className,
}: {
  display: string
  onOpen: () => void
  size?: "md" | "sm"
  expanded?: boolean
  className?: string
}) {
  const md = size === "md"
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      /* data-open, not aria-expanded: see the account trigger (components/app/mobile-account-menu.tsx). */
      data-open={expanded ? "" : undefined}
      aria-label={`Share ${display}`}
      title={display}
      data-share-pill=""
      className={cn(
        "inline-flex h-9 min-w-0 max-w-full cursor-pointer select-none items-center rounded-full bg-[#efeff1] text-[#1f1f23] outline-none",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.05]",
        "transition-[background-color,box-shadow] duration-150 hover:bg-[#e8e8eb] active:bg-[#e2e2e6] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]",
        "data-open:bg-[#e6e6ea]",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
        "[-webkit-tap-highlight-color:transparent]",
        md ? "gap-2 pl-3 pr-2.5 text-[13.5px]" : "gap-1.5 pl-2.5 pr-2 text-[12.5px]",
        className,
      )}
    >
      <StorelibVioletS size={md ? 16 : 15} className="shrink-0" />
      <FadeText text={display} className="font-medium tracking-[-0.005em]" />
      <Share className={cn("shrink-0 text-[#3a3a40]", md ? "h-4 w-4" : "h-[15px] w-[15px]")} strokeWidth={1.8} aria-hidden />
    </button>
  )
})

/* ─── Small pieces ────────────────────────────────────────────────────── */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* The Android web view and older Safari: the old way. */
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

const iconButton = cn(
  "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-[#4b5563] outline-none transition-colors duration-100",
  "hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#e7e8eb]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "[-webkit-tap-highlight-color:transparent]",
)

/* Near black with the same light and shade as the app's other buttons: the one action here, Copy. */
const inkDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap bg-[#1a1a2e] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#2a2a40] active:bg-[#0f0f1c] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
  "[-webkit-tap-highlight-color:transparent]",
)

function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null)
  const timer = React.useRef<number | null>(null)
  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  const copy = React.useCallback(async (url: string) => {
    const ok = await copyText(url)
    if (!ok) return
    setCopied(url)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(null), 1800)
  }, [])
  return { copied, copy }
}

/**
 * Whatever is inside eases in (a short rise and a fade) each time `swapKey`
 * changes: the address when the switch above it moves, so the new one
 * arrives rather than blinking into place. On the Web Animations API, so it
 * runs on the compositor and needs no keyframes in globals.css.
 */
function EaseIn({ swapKey, children, className }: { swapKey: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const first = React.useRef(true)
  React.useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (reducedMotion()) return
    ref.current?.animate(
      [
        { opacity: 0, transform: "translateY(3px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 220, easing: EASE },
    )
  }, [swapKey])
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  )
}

/** The address, and Copy. A tap on the address selects all of it, for somebody who would rather copy it by hand. */
function LinkRow({ address, copied, onCopy, className }: { address: ShareAddress; copied: boolean; onCopy: () => void; className?: string }) {
  return (
    <div className={cn("flex h-[52px] items-center gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white pl-3 pr-1.5", className)}>
      <StorelibTile size={24} />
      <EaseIn swapKey={address.url} className="block min-w-0 flex-1 select-all truncate text-[14px] text-[#1a1a2e] sm:text-[14.5px]">
        <span data-share-address="">{address.display}</span>
      </EaseIn>
      <button type="button" onClick={onCopy} data-share-copy="" className={cn(inkDepth, "h-9 min-w-[70px] rounded-[10px] px-3 text-[14px]")}>
        {/* The check is always there and shown or hidden by its `hidden`
            attribute: an element put in or taken out under a sheet, or a
            class that hides it, is a change the page's :has() rules answer
            by restyling the whole document (scripts/check-app-sheets-frames.mjs). */}
        <span hidden={!copied} className="inline-flex">
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

/**
 * CREATOR PAGE, ONEPAGE, WEBSITE. A white thumb slides under the one chosen,
 * on the sheet's curve and on transform only, rather than the highlight
 * jumping from one tab to the next; the address below eases in to match
 * (LinkRow).
 */
function SurfaceSwitch({
  addresses,
  current,
  onSurface,
}: {
  addresses: ShareAddress[]
  current: ShareAddress
  onSurface: (s: ShareSurface) => void
}) {
  const index = Math.max(0, addresses.findIndex((a) => a.surface === current.surface))
  return (
    <div role="tablist" aria-label="What to share" className="relative grid auto-cols-fr grid-flow-col rounded-xl bg-[#f1f2f4] p-1">
      <span
        aria-hidden
        data-share-thumb=""
        className="absolute bottom-1 left-1 top-1 rounded-[9px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1),0_0_0_1px_rgba(16,24,40,0.04)] transition-transform duration-300 motion-reduce:transition-none"
        style={{
          width: `calc((100% - 8px) / ${addresses.length})`,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: EASE,
        }}
      />
      {addresses.map((a) => {
        const active = a.surface === current.surface
        return (
          <button
            key={a.surface}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSurface(a.surface)}
            className={cn(
              "relative z-[1] h-8 min-w-0 cursor-pointer truncate rounded-[9px] px-2 text-[13px] font-medium outline-none transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[#8b5cf6] [-webkit-tap-highlight-color:transparent]",
              active ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── The QR code ─────────────────────────────────────────────────────── */

const QR_INK = "#1a1a2e"

/**
 * Drawn as SVG by the qrcode library the OnePage already uses, loaded the
 * first time a code is wanted (`draw`). High error correction, so the mark in
 * the middle (under a fifth of the width) never stops it scanning.
 *
 * THE CODE CHANGES, THE ELEMENTS DO NOT. It is an <img> of the library's SVG
 * that is always there, hidden until the first code arrives, so a new code
 * (another address, or the first one) is a new `src` and a `hidden` that
 * goes: nothing goes into the page or out of it, which under a sheet is a
 * change the page's :has() rules answer by restyling the whole document
 * (scripts/check-app-sheets-frames.mjs). That is what lets a phone keep the
 * QR view built and out of sight until the QR code button shows it.
 */
function QrCode({ url, size, draw }: { url: string; size: number; draw: boolean }) {
  const [armed, setArmed] = React.useState(draw)
  if (draw && !armed) setArmed(true)
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!armed) return
    /* The last code stays up until the new one is drawn, rather than blinking to grey between addresses. */
    let live = true
    import("qrcode")
      .then((q) => q.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 0, color: { dark: QR_INK, light: "#ffffff" } }))
      .then((out) => {
        if (live) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(out)}`)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [url, armed])
  const mark = Math.round(size * 0.2)
  return (
    <div className="relative shrink-0 rounded-lg bg-[#f1f2f4]" style={{ width: size, height: size }} role="img" aria-label={`QR code for ${url.replace(/^https?:\/\//, "")}`}>
      {/* The library's own output for our own address: path data, no text. */}
      <img data-share-qr="" src={src ?? undefined} hidden={!src} alt="" width={size} height={size} draggable={false} className="block h-full w-full" />
      <span
        hidden={!src}
        className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-white"
        style={{ width: mark + Math.max(6, Math.round(size * 0.05)), height: mark + Math.max(6, Math.round(size * 0.05)) }}
      >
        <span className="block" style={{ width: mark, height: mark }}>
          <StorelibMark className="block h-full w-full" />
        </span>
      </span>
    </div>
  )
}

/** The code as a 1024px PNG with the mark in the middle, the same as on screen. */
async function qrPng(url: string): Promise<Blob | null> {
  const q = await import("qrcode")
  const canvas = document.createElement("canvas")
  await q.toCanvas(canvas, url, { width: 1024, margin: 2, errorCorrectionLevel: "H", color: { dark: QR_INK, light: "#ffffff" } })
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const size = canvas.width
  const logo = size * 0.18
  const pad = size * 0.02
  const at = (size - logo) / 2
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r)
    else ctx.rect(x, y, w, h)
  }
  ctx.fillStyle = "#ffffff"
  round(at - pad, at - pad, logo + pad * 2, logo + pad * 2, (logo + pad * 2) * 0.22)
  ctx.fill()
  ctx.save()
  ctx.translate(at, at)
  ctx.scale(logo / 200, logo / 200)
  ctx.fillStyle = "#8B56FA"
  round(4, 1.5, 192, 197, 34)
  ctx.fill()
  const [tx, ty] = STORELIB_S_TRANSFORM.match(/-?[\d.]+/g)!.map(Number)
  ctx.translate(tx, ty)
  ctx.fillStyle = "#FDFDFF"
  ctx.fill(new Path2D(STORELIB_S_PATH))
  ctx.restore()
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
}

/* ─── Views ───────────────────────────────────────────────────────────── */

type View = "share" | "qr"

/** A secondary action under the address: an icon and a word, all the same width. */
const actionButton = cn(secondaryDepth, "h-10 gap-2 rounded-xl px-2 text-[14px]")

const ShareView = React.memo(function ShareView({
  addresses,
  current,
  onSurface,
  copied,
  onCopy,
  onOpen,
  onQr,
  canNativeShare,
  onNativeShare,
}: {
  addresses: ShareAddress[]
  current: ShareAddress
  onSurface: (s: ShareSurface) => void
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  onQr: () => void
  canNativeShare: boolean
  onNativeShare: () => void
}) {
  const live = current.live !== false
  return (
    <div className="px-4 pb-4 sm:px-5 sm:pb-5">
      {addresses.length > 1 && <SurfaceSwitch addresses={addresses} current={current} onSurface={onSurface} />}

      <LinkRow className={addresses.length > 1 ? "mt-2.5" : undefined} address={current} copied={copied} onCopy={onCopy} />

      {/* One line, whichever address: the panel keeps its height when the switch moves. Both
          lines are there and one is shown, so no element comes or goes (see LinkRow's check). */}
      <EaseIn swapKey={current.surface} className="mt-2 block truncate px-1 text-[12.5px] leading-[18px] text-[#6b7280]">
        <span hidden={!live}>{SURFACE_HINT[current.surface]}</span>
        <span hidden={live}>
          Not published yet.{" "}
          <AppLink href="/app/onepage" className="font-medium text-[#1a1a2e] underline underline-offset-2">
            Open OnePage
          </AppLink>
        </span>
      </EaseIn>

      <div data-share-actions="" className={cn("mt-4 grid gap-2", canNativeShare ? "grid-cols-3" : "grid-cols-2")}>
        <button type="button" onClick={onOpen} className={actionButton}>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[#4b5563]" strokeWidth={1.9} aria-hidden />
          Open
        </button>
        <button type="button" onClick={onQr} className={actionButton}>
          <QrCodeIcon className="h-4 w-4 shrink-0 text-[#4b5563]" strokeWidth={1.9} aria-hidden />
          QR code
        </button>
        {canNativeShare && (
          <button type="button" onClick={onNativeShare} className={actionButton}>
            <Share className="h-4 w-4 shrink-0 text-[#4b5563]" strokeWidth={1.9} aria-hidden />
            Share
          </button>
        )}
      </div>
    </div>
  )
})

const QrView = React.memo(function QrView({
  address,
  phone,
  copied,
  onCopy,
  draw,
}: {
  address: ShareAddress
  phone: boolean
  copied: boolean
  onCopy: () => void
  /** Whether the code is wanted yet: the view is showing, or a phone's sheet has finished arriving. */
  draw: boolean
}) {
  const [saving, setSaving] = React.useState(false)
  /* A blob download does nothing in the app's web view (lib/platform/save-file), so it is a browser button. */
  const [canDownload] = React.useState(() => typeof window !== "undefined" && !isNativeApp())
  const download = async () => {
    if (saving) return
    setSaving(true)
    try {
      const blob = await qrPng(address.url)
      if (blob) downloadBlob(blob, `storelib-qr-${address.surface}.png`)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-col items-center px-4 pb-5 text-center sm:px-5">
      <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4">
        <QrCode url={address.url} size={phone ? 200 : 188} draw={draw} />
      </div>
      <p className="mt-3.5 max-w-full truncate text-[15px] font-medium text-[#1a1a2e]">{address.display}</p>
      <p className="mt-1 text-[13.5px] text-[#6b7280]">Point a phone camera at it to open your page.</p>
      <div className={cn("mt-4 grid w-full gap-2.5", canDownload ? "grid-cols-2" : "grid-cols-1")}>
        {canDownload && (
          <button type="button" onClick={download} disabled={saving} className={cn(secondaryDepth, "h-11 rounded-xl text-[15px]")}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Download
          </button>
        )}
        <button type="button" onClick={onCopy} className={cn(inkDepth, "h-11 rounded-xl text-[15px]")}>
          <span hidden={!copied} className="inline-flex">
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
})

/* ─── Moving between views ────────────────────────────────────────────── */

/**
 * The surface eases from the old view's height to the new one's, and the new
 * content slides in a short way from the side it came from. Both on the Web
 * Animations API, so there are no keyframes to add to globals.css; both
 * skipped when the person has asked for less motion. Only between the share
 * view and the QR code: switching addresses changes no height.
 *
 * What slides in is the view that is showing: the Pane that is not away.
 */
function Swap({ viewKey, forward, children }: { viewKey: string; forward: boolean; children: React.ReactNode }) {
  const outer = React.useRef<HTMLDivElement>(null)
  const last = React.useRef<number | null>(null)
  const first = React.useRef(true)

  /*
    THE HEIGHT ARRIVES, IT IS NOT ASKED FOR. Reading offsetHeight as the view
    mounted made the browser lay the whole page out in the middle of the
    sheet's first frame, before the sheet could start to rise: at phone speed
    the largest part of the pause between the tap and the movement. The
    observer reports the size once layout has happened anyway, and a view
    change is always long after that.
  */
  React.useEffect(() => {
    const el = outer.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0]
      last.current = box ? box.blockSize : el.offsetHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = outer.current
    const content = Array.from(el?.querySelectorAll<HTMLElement>(":scope > [data-share-pane]") ?? []).find((p) => p.style.visibility !== "hidden")
    if (!el || !content || reducedMotion()) return
    const from = last.current
    const to = el.offsetHeight
    if (from != null && from !== to) {
      el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 280, easing: EASE })
    }
    content.animate(
      [
        { opacity: 0, transform: `translateX(${forward ? 14 : -14}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: 240, easing: EASE },
    )
    last.current = to
  }, [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={outer} className="relative overflow-hidden">
      {children}
    </div>
  )
}

/**
 * BOTH VIEWS ARE THERE ON A PHONE, ONE OUT OF SIGHT.
 *
 * Every tap that changed the view took the old view out of the page and
 * built the new one: React rendered it, and the browser styled and laid out
 * every element in it before the next frame could be drawn, and the page's
 * :has() rules restyled the whole document for the insertion, which on a
 * phone's CPU was most of the pause after a tap
 * (scripts/check-app-sheets-frames.mjs). Now the share view and the QR code
 * are built with the sheet while the page is idle, and the one not showing
 * is out of sight and out of the flow: `visibility`, which the browser hands
 * down without restyling what is inside, and `content-visibility: hidden`
 * where the browser has it, which keeps its styles and layout and skips its
 * rendering until it shows. Showing it is those properties, set as a style
 * and not as classes: a class that changes is a change the :has() rules
 * answer by restyling the whole document, a style is not.
 */
const PANE_AWAY: React.CSSProperties = {
  visibility: "hidden",
  pointerEvents: "none",
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  contentVisibility: "hidden",
}

function Pane({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    /* No aria-hidden: out of sight is out of the accessibility tree, and an
       aria-hidden that changed would be a change under the page's :has(). */
    <div data-share-pane="" style={on ? undefined : PANE_AWAY}>
      {children}
    </div>
  )
}

function Header({
  title,
  onBack,
  onClose,
}: {
  title: string
  onBack?: () => void
  /** A computer's panel has a close button; a phone's sheet does not, it is pulled down or tapped away. */
  onClose?: () => void
}) {
  const heading = <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-6 text-[#1a1a2e]">{title}</h2>
  return (
    <div className={cn("flex items-center gap-1.5", onClose ? "h-14 px-2.5 sm:px-3" : "h-12 px-2.5")}>
      {/* Both are always there and one is hidden: a button put in or taken
          out on every change of view was a change the page's :has() rules
          answer by restyling the whole document (scripts/check-app-sheets-frames.mjs). */}
      <button type="button" onClick={onBack} aria-label="Back" hidden={!onBack} className={iconButton}>
        <ArrowLeft className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden />
      </button>
      <span hidden={!!onBack} className={onClose ? "w-2" : "w-1.5"} aria-hidden />
      {heading}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className={cn(iconButton, "h-8 w-8 bg-[#f1f2f4] hover:bg-[#e7e8eb]")}>
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  )
}

/* ─── The pill and what it opens ──────────────────────────────────────── */

type ShareStorelibProps = {
  /** The creator page first: it is what the pill shows and what is selected on open. */
  addresses: ShareAddress[]
  /** No longer shown (see the top of this file); accepted so a caller that still passes it keeps compiling. */
  platforms?: ConnectedPlatform[]
  size?: "md" | "sm"
  /**
   * Opens it from elsewhere on the page each time the number goes up (the
   * home page's "Make your first sale"). Only the pill that is on screen
   * answers, so of a page's computer and phone pills exactly one opens.
   */
  openSignal?: number
  className?: string
}

/**
 * The pill, and the panel or sheet it opens. Each pill owns its own: the home
 * page draws one for computers and one for phones, and whichever is on screen
 * is the one that is tapped.
 *
 * Memoised: the page around the pill (the home page's figures and chart,
 * which redraw on their own) does not draw the pill and its sheet again.
 * `platforms` is left out of the comparison because nothing here reads it.
 */
export const ShareStorelib = React.memo(function ShareStorelib({
  addresses,
  size = "md",
  openSignal = 0,
  className,
}: ShareStorelibProps) {
  const phone = useIsPhone()
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>("share")
  const [forward, setForward] = React.useState(true)
  const [surface, setSurface] = React.useState<ShareSurface | null>(addresses[0]?.surface ?? null)
  const { copied, copy } = useCopy()
  const [canNativeShare, setCanNativeShare] = React.useState(false)
  React.useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])
  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!openSignal) return
    const anchor = anchorRef.current
    /* A pill under display: none has no boxes: that is the other width's. */
    if (!anchor || anchor.getClientRects().length === 0) return
    const b = anchor.getBoundingClientRect()
    if (b.top < 0 || b.bottom > window.innerHeight) anchor.scrollIntoView({ block: "nearest" })
    setOpen(true)
  }, [openSignal])

  /* Every open starts at the share view on the creator page. Set during render, like the sheet's own open state, so no frame shows the last view. */
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      if (view !== "share") setView("share")
      setForward(true)
      setSurface(addresses[0]?.surface ?? null)
    }
  }

  const current = addresses.find((a) => a.surface === surface) ?? addresses[0]

  /**
   * A TAP CHANGES ONE THING. Every handler here is made once and reads the
   * address in use from a ref, and the views are memoised, so a tap on QR
   * code renders the header and the view it opens, and the share view it
   * leaves does not render at all.
   */
  const currentRef = React.useRef(current)
  currentRef.current = current
  const close = React.useCallback(() => setOpen(false), [])
  const toggle = React.useCallback(() => setOpen((v) => !v), [])
  const onQr = React.useCallback(() => {
    setForward(true)
    setView("qr")
  }, [])
  const back = React.useCallback(() => {
    setForward(false)
    setView("share")
  }, [])
  const copyCurrent = React.useCallback(() => {
    if (currentRef.current) copy(currentRef.current.url)
  }, [copy])
  const openPage = React.useCallback(() => {
    if (currentRef.current) openExternal(currentRef.current.url)
  }, [])
  const onNativeShare = React.useCallback(() => {
    const url = currentRef.current?.url
    if (!url) return
    navigator.share?.({ url }).catch(() => {
      /* dismissed */
    })
  }, [])

  /* A phone's QR view is built with its sheet; its code is drawn once the sheet has finished arriving, so the QR code button only shows it. */
  const [qrWarm, setQrWarm] = React.useState(false)
  const warmQr = React.useCallback(() => setQrWarm(true), [])

  /**
   * THE PHONE'S SHEET IS BUILT AHEAD AND KEPT (BottomSheet keepMounted), so
   * the tap on the pill only slides it up. Only the pill that is on screen
   * keeps one: the home page draws a pill for each width, and the one under
   * display: none has no boxes.
   */
  const [onScreen, setOnScreen] = React.useState(false)
  React.useEffect(() => {
    const anchor = anchorRef.current
    setOnScreen(!!anchor && anchor.getClientRects().length > 0)
  }, [phone])
  /* It goes back to the start once it is out of sight, so the next open has nothing to change. */
  const first = addresses[0]?.surface ?? null
  const onSheetClosed = React.useCallback(() => {
    setView("share")
    setForward(true)
    setSurface(first)
  }, [first])

  if (!current) return null

  const title = view === "qr" ? "QR code" : "Share your Storelib"
  const isCopied = copied === current.url

  const body = (
    <Swap viewKey={view} forward={forward}>
      {(phone || view === "share") && (
        <Pane on={view === "share"}>
          <ShareView
            addresses={addresses}
            current={current}
            onSurface={setSurface}
            copied={isCopied}
            onCopy={copyCurrent}
            onOpen={openPage}
            onQr={onQr}
            canNativeShare={canNativeShare}
            onNativeShare={onNativeShare}
          />
        </Pane>
      )}
      {(phone || view === "qr") && (
        <Pane on={view === "qr"}>
          <QrView address={current} phone={phone} copied={isCopied} onCopy={copyCurrent} draw={view === "qr" || qrWarm} />
        </Pane>
      )}
    </Swap>
  )

  const sheetOpen = open && phone
  const panelOpen = open && !phone

  return (
    <>
      <PopoverPrimitive.Root open={panelOpen} onOpenChange={(next) => !next && close()}>
        <PopoverPrimitive.Anchor asChild>
          <span ref={anchorRef} className={cn("inline-flex min-w-0 max-w-full", className)}>
            <SharePill size={size} display={addresses[0].display} expanded={open} onOpen={toggle} />
          </span>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            ref={panelRef}
            data-share-sheet=""
            data-surface="panel"
            data-view={view}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            align="end"
            side="bottom"
            sideOffset={10}
            collisionPadding={16}
            /* Focus goes to the panel itself, not its first button, so nothing is ringed on a click. */
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              panelRef.current?.focus({ preventScroll: true })
            }}
            /* A click on the pill is the pill's to answer (it toggles), not an outside click that closes and then reopens. */
            onInteractOutside={(e) => {
              if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
            }}
            className={cn(
              "scrollbar-hide z-[200] w-[min(396px,calc(100vw-32px))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-[20px] border border-[#e5e7eb] bg-white outline-none",
              "shadow-[0_18px_48px_-16px_rgba(17,24,39,0.28),0_4px_12px_-4px_rgba(17,24,39,0.08)]",
              /* Grown from the pill's corner, from the first frame; no transition on anything (see the top of this file). */
              "origin-top-right transition-none",
              "data-[state=open]:animate-in data-[state=open]:animation-duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-top-1",
              "data-[state=closed]:animate-out data-[state=closed]:animation-duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]",
              "motion-reduce:animate-none",
            )}
            style={{ animationTimingFunction: EASE }}
          >
            <Header title={title} onBack={view === "share" ? undefined : back} onClose={close} />
            {body}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={close}
        label={title}
        hideFrom="md"
        scrollKey={view}
        keepMounted={phone && onScreen}
        onOpened={warmQr}
        onClosed={onSheetClosed}
        header={<Header title={title} onBack={view === "share" ? undefined : back} />}
      >
        <div data-share-sheet="" data-surface="sheet" data-view={view}>
          {body}
        </div>
      </BottomSheet>
    </>
  )
}, (a, b) => a.addresses === b.addresses && a.size === b.size && a.openSignal === b.openSignal && a.className === b.className)
