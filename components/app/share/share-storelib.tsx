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
 * WHAT IT HOLDS: QUICK ACCESS, AS IT WAS. "Make it how it was before, the
 * Quick access, with the Storelib logo on the creator page, the OnePage's
 * mark and the website's." One row an address (the creator page, the
 * OnePage and the website, only the ones that exist): its mark, its name,
 * the address under it and a small Copy pill that turns green for a moment.
 * The row itself opens the page. No tabs, no QR code view, no black button:
 * it answers "what are my addresses?", and a copy is one tap.
 *
 * THE PANEL GROWS FROM THE PILL, AND ONLY GROWS. Its origin is the pill's
 * corner from the first frame (`origin-top-right`, not a value the popover
 * writes a frame later), and no transition runs on it: a `duration-*` class
 * used to give every property a 200ms transition, the origin included, so
 * the origin slid from the panel's middle to its corner while it opened and
 * the panel drifted six pixels to the left and back. Only its own keyframes
 * move it, on opacity and transform.
 *
 * A TAP CHANGES ONE THING. The rows are memoised and every handler is made
 * once. On a phone the sheet is built ahead and kept (BottomSheet
 * keepMounted), so a tap on the pill only slides it up, and the sheet
 * follows the thumb and closes like every other sheet in /app.
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ArrowRight, Check, Copy, ExternalLink, Eye, Globe, Link2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { openExternal } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { StorelibGlyph } from "./storelib-share-marks"
import { type ConnectedPlatform, type ShareAddress, type ShareSurface } from "./share-data"

/* The sheet's own curve (components/ui/bottom-sheet SHEET_EASE), so the panel opens the way the sheet moves. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"


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
 * The handle the desktop pill shows: "@andrewrullz" from
 * storelib.com/andrewrullz, the creator page's last path segment. An address
 * with no path (a domain of its own) is shown as it is, without an @.
 */
export function pillHandle(addresses: ShareAddress[]): string {
  const a = addresses.find((x) => x.surface === "creator") ?? addresses[0]
  if (!a) return ""
  const parts = a.display.split("/").filter(Boolean)
  return parts.length > 1 ? `@${parts[parts.length - 1]}` : a.display
}

/**
 * THE PILL, TWO WAYS.
 *
 * On a computer, the one it was before: "@username" and the open glyph on a
 * white pill with a hairline border and a thin violet light running round
 * its edge. "How it was before ... add just a little bit depth to it, an
 * extremely little bit": a line of light along its top and a one pixel
 * shadow under it, nothing more.
 *
 * On a phone, where there is no room for a name, an eye and "View" on a
 * light grey pill with a little more depth than before: lit along its top,
 * a touch deeper at its foot and a soft shadow under it, so it reads as
 * something to press.
 */
export const SharePill = React.memo(function SharePill({
  display,
  handle,
  onOpen,
  size = "md",
  expanded,
  className,
}: {
  display: string
  handle?: string
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
      data-share-pill={md ? "address" : "view"}
      className={cn(
        "relative inline-flex min-w-0 max-w-full cursor-pointer select-none items-center rounded-full outline-none",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
        "[-webkit-tap-highlight-color:transparent]",
        md
          ? cn(
              "h-8 gap-1.5 overflow-hidden border border-[#e5e7eb] bg-white px-3 text-[12.5px] font-medium text-[#4b5563]",
              "shadow-[inset_0_1px_0_rgba(255,255,255,1),0_1px_1px_rgba(16,24,40,0.04)]",
              "transition-[color,border-color,background-color] duration-150 hover:border-[#d1d5db] hover:text-[#111827] data-open:border-[#d1d5db] data-open:text-[#111827]",
            )
          : cn(
              "h-9 gap-1.5 bg-[#f4f4f6] bg-[linear-gradient(180deg,#f8f8fa_0%,#f0f0f3_100%)] px-3.5 text-[13.5px] font-medium text-[#1f1f23] ring-1 ring-black/[0.06]",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.05),0_1px_2px_rgba(16,24,40,0.07),0_2px_6px_-2px_rgba(16,24,40,0.08)]",
              "transition-[background-color,box-shadow] duration-150 active:bg-[#e8e8ec] active:bg-none active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] data-open:bg-[#ececef] data-open:bg-none",
            ),
        className,
      )}
    >
      {md ? (
        <>
          {/* The light running round its edge, as it was: a quarter turn of violet in a slow spin, under a white inner pill. */}
          <span aria-hidden className="pointer-events-none absolute -inset-px rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)] opacity-45 animate-[spin_12s_linear_infinite] motion-reduce:animate-none" />
          <span aria-hidden className="pointer-events-none absolute inset-px rounded-full bg-white/95" />
          <FadeText text={handle || display} className="relative tracking-[-0.005em]" />
          <ExternalLink className="relative h-3.5 w-3.5 shrink-0 text-[#9ca3af]" strokeWidth={2} aria-hidden />
        </>
      ) : (
        <>
          <Eye className="h-4 w-4 shrink-0 text-[#3a3a40]" strokeWidth={1.9} aria-hidden />
          <span className="font-medium">View</span>
        </>
      )}
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

/* ─── Quick access ────────────────────────────────────────────────────── */

/**
 * The mark each address starts with, three circles with the same light and
 * shade (lit along the top, a hairline ring inside the edge, a darker foot
 * and a soft shadow in their own colour): the white Storelib S on the logo's
 * violet for the creator page, the link on a brighter violet gradient for
 * the OnePage, and a plain globe on near black for the website. "The
 * website's looks too complex" (it was a screen and a phone), "the creator
 * page should be a circle with the Storelib logo", "the OnePage ... more
 * depth and more gradient". Drawn inline: no request, no layout shift.
 */
const MARK: Record<ShareSurface, { fill: string; shade: string }> = {
  creator: { fill: "linear-gradient(180deg,#9a6bfb 0%,#8b56fa 55%,#7a45ea 100%)", shade: "76,29,149" },
  onepage: { fill: "linear-gradient(160deg,#b89bff 0%,#8b5cf6 48%,#6d3ae6 100%)", shade: "76,29,149" },
  website: { fill: "linear-gradient(180deg,#34344a 0%,#1a1a2e 60%,#121222 100%)", shade: "15,15,30" },
}

function SurfaceMark({ surface, size }: { surface: ShareSurface; size: number }) {
  const { fill, shade } = MARK[surface] ?? MARK.website
  const glyph = Math.round(size * 0.46)
  return (
    <span
      aria-hidden
      data-mark={surface}
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: fill,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.34), inset 0 0 0 1px rgba(${shade},0.18), inset 0 -1.5px 0 rgba(${shade},0.3), 0 1px 2px rgba(${shade},0.26), 0 3px 8px -3px rgba(${shade},0.32)`,
      }}
    >
      {surface === "creator" ? (
        <StorelibGlyph size={Math.round(size * 0.5)} className="text-white" style={{ filter: `drop-shadow(0 0.5px 0.5px rgba(${shade},0.4))` }} />
      ) : surface === "onepage" ? (
        <Link2 className="text-white" style={{ width: glyph, height: glyph, filter: `drop-shadow(0 0.5px 0.5px rgba(${shade},0.4))` }} strokeWidth={2.4} />
      ) : (
        <Globe className="text-white" style={{ width: glyph, height: glyph }} strokeWidth={2} />
      )}
    </span>
  )
}

/**
 * ONE ADDRESS: its mark, its name, the address under it, and a small Copy
 * pill that turns green and says Copied for a moment. The row itself opens
 * the page. A OnePage that is not published yet says so, and its pill is
 * Set up, to the OnePage editor. Both states of the pill are always there
 * and one is hidden, so a copy puts nothing into the page or takes anything
 * out (scripts/check-app-sheets-frames.mjs).
 */
const QuickRow = React.memo(function QuickRow({
  address,
  copied,
  onCopy,
  onOpen,
  onSetup,
  phone,
}: {
  address: ShareAddress
  copied: boolean
  onCopy: (url: string) => void
  onOpen: (url: string) => void
  onSetup: () => void
  phone: boolean
}) {
  const live = address.live !== false
  const open = () => (live ? onOpen(address.url) : onSetup())
  return (
    <div
      role="button"
      tabIndex={0}
      data-share-row={address.surface}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 text-left outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent]",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-[#8b5cf6]",
        phone
          ? "rounded-2xl border border-[#ececf1] p-3.5 active:bg-[#f4f4f5]"
          : "rounded-xl p-3 hover:bg-[#f7f7f8] active:bg-[#f1f1f3]",
      )}
    >
      <span className={phone ? "h-9 w-9" : "h-7 w-7"}>
        <SurfaceMark surface={address.surface} size={phone ? 36 : 28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-semibold text-[#111827]", phone ? "text-[15px]" : "text-[13.5px]")}>{address.label}</span>
        <span data-share-address="" className={cn("block truncate text-[#6b7280]", phone ? "text-[12.5px]" : "text-[12px]")}>
          {live ? address.display : "Publish your OnePage to get its link"}
        </span>
      </span>
      <button
        type="button"
        data-share-copy=""
        aria-label={live ? (copied ? "Copied" : `Copy the ${address.label} address`) : `Set up your ${address.label}`}
        onClick={(e) => {
          e.stopPropagation()
          if (live) onCopy(address.url)
          else onSetup()
        }}
        className={cn(
          "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent]",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
          !live
            ? "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]"
            : copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f8fafc]",
        )}
      >
        <span hidden={!live} className="inline-flex items-center gap-1.5">
          <span hidden={copied} className="inline-flex">
            <Copy className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          </span>
          <span hidden={!copied} className="inline-flex">
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </span>
          <span>{copied ? "Copied" : phone ? "Copy link" : "Copy"}</span>
        </span>
        <span hidden={live} className="inline-flex items-center gap-1">
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Set up
        </span>
      </button>
    </div>
  )
})

/* ─── The pill and what it opens ──────────────────────────────────────── */

type ShareStorelibProps = {
  /** The creator page first: it is what the pill shows. */
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
 * The pill, and the Quick access it opens: a panel that drops from the pill
 * on a computer, the app's bottom sheet on a phone. Each pill owns its own:
 * the home page draws one for computers and one for phones, and whichever
 * is on screen is the one that is tapped.
 *
 * Memoised: the page around the pill (the home page's figures and chart,
 * which redraw on their own) does not draw the pill and its sheet again.
 */
export const ShareStorelib = React.memo(function ShareStorelib({
  addresses,
  size = "md",
  openSignal = 0,
  className,
}: ShareStorelibProps) {
  const phone = useIsPhone()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const { copied, copy } = useCopy()
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

  const close = React.useCallback(() => setOpen(false), [])
  const toggle = React.useCallback(() => setOpen((v) => !v), [])
  const openUrl = React.useCallback((url: string) => {
    openExternal(url)
    setOpen(false)
  }, [])
  const setup = React.useCallback(() => {
    setOpen(false)
    router.push("/app/onepage")
  }, [router])

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

  if (!addresses[0]) return null
  const handle = pillHandle(addresses)

  const rows = (asPhone: boolean) => (
    <div className={asPhone ? "space-y-2 px-4 pb-5 pt-3" : "p-1.5 pt-0"}>
      {addresses.map((a) => (
        <QuickRow key={a.surface} address={a} copied={copied === a.url} onCopy={copy} onOpen={openUrl} onSetup={setup} phone={asPhone} />
      ))}
    </div>
  )

  const sheetOpen = open && phone
  const panelOpen = open && !phone

  return (
    <>
      <PopoverPrimitive.Root open={panelOpen} onOpenChange={(next) => !next && close()}>
        <PopoverPrimitive.Anchor asChild>
          <span ref={anchorRef} className={cn("inline-flex min-w-0 max-w-full", className)}>
            <SharePill size={size} display={addresses[0].display} handle={handle} expanded={open} onOpen={toggle} />
          </span>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            ref={panelRef}
            data-share-sheet=""
            data-surface="panel"
            role="dialog"
            aria-label="Quick access"
            tabIndex={-1}
            align="end"
            side="bottom"
            sideOffset={8}
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
              "z-[200] w-[min(320px,calc(100vw-32px))] rounded-2xl border border-[#e5e7eb] bg-white outline-none",
              "shadow-[0_16px_40px_-14px_rgba(17,24,39,0.24),0_4px_10px_-4px_rgba(17,24,39,0.08)]",
              /* Grown from the pill's corner, from the first frame; no transition on anything (see the top of this file). */
              "origin-top-right transition-none",
              "data-[state=open]:animate-in data-[state=open]:animation-duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-top-1",
              "data-[state=closed]:animate-out data-[state=closed]:animation-duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]",
              "motion-reduce:animate-none",
            )}
            style={{ animationTimingFunction: EASE }}
          >
            <p className="px-4 pb-1.5 pt-3 text-[11.5px] font-medium text-[#6b7280]">Quick access</p>
            {rows(false)}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={close}
        label="Quick access"
        hideFrom="md"
        keepMounted={phone && onScreen}
        header={<h2 className="px-4 pt-2 text-[16px] font-semibold leading-6 text-[#1a1a2e]">Quick access</h2>}
      >
        <div data-share-sheet="" data-surface="sheet">
          {rows(true)}
        </div>
      </BottomSheet>
    </>
  )
}, (a, b) => a.addresses === b.addresses && a.size === b.size && a.openSignal === b.openSignal && a.className === b.className)
