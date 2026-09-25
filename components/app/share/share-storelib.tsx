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
 * like every other sheet in /app: a pull down or a tap outside, no X. Both
 * draw the same three views:
 *
 *   SHARE      which address (creator page, OnePage, website), the address
 *              with Copy, a QR code to scan on a computer, the platforms the
 *              creator is on, and a row of places to post it.
 *   PLATFORM   how to put the link in that platform's bio: a picture of
 *              where it goes, the steps, the link again with Copy, and a way
 *              into the app.
 *   QR CODE    the code large, to download or to show someone.
 *
 * The QR card is left off phones: it asks to be scanned by a phone, and the
 * person holding one is already on it. "My platforms" does that job there.
 *
 * NOTHING INSIDE SCROLLS on a computer. The panel is sized to what it holds,
 * the QR card sits beside its words rather than above them, and the rows of
 * round buttons scroll sideways with no fade over their end.
 *
 * Moving between views, the content slides a short way and the surface eases
 * to its new height, so nothing jumps. Nothing here fetches: every address
 * and platform arrives with the page.
 */

import * as React from "react"
import Link from "next/link"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import type { IconType } from "react-icons"
import {
  SiFacebook,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
  SiReddit,
  SiSnapchat,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiTwitch,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "react-icons/si"
import { ArrowLeft, ArrowUpRight, Check, Download, Mail, MoreHorizontal, QrCode as QrCodeIcon, Share, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { StorelibMark, STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import { downloadBlob } from "@/lib/platform/save-file"
import { cn } from "@/lib/utils"
import { StorelibGlyph, StorelibTile } from "./storelib-share-marks"
import { PlatformArt } from "./platform-art"
import {
  BIO_HOW_TO,
  DEFAULT_BIO_PLATFORMS,
  SHARE_TARGETS,
  SURFACE_HINT,
  shareTargetUrl,
  type BioPlatform,
  type ConnectedPlatform,
  type ShareAddress,
  type ShareSurface,
  type ShareTarget,
} from "./share-data"

/* The sheet's own curve (components/ui/bottom-sheet SHEET_EASE), so a view change moves like the sheet does. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/* ─── Brand marks ─────────────────────────────────────────────────────── */

/**
 * react-icons is typed for React 18's global JSX namespace; React 19 moved it,
 * so its icons need this one cast to be used as components (the same fix as
 * components/social/platform-icons.tsx).
 */
function brand(Icon: IconType) {
  const Mark = Icon as unknown as React.ComponentType<{ size?: number; color?: string; "aria-hidden"?: boolean; focusable?: boolean }>
  return function BrandMark({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
    return <Mark size={size} color={color} aria-hidden focusable={false} />
  }
}

/* A share sheet is where brand colour belongs: each circle is the app it opens. */
const BIO_MARK: Record<BioPlatform, { bg: string; fg: string; Mark: ReturnType<typeof brand> }> = {
  instagram: {
    bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)",
    fg: "#ffffff",
    Mark: brand(SiInstagram),
  },
  tiktok: { bg: "#000000", fg: "#ffffff", Mark: brand(SiTiktok) },
  youtube: { bg: "#ff0033", fg: "#ffffff", Mark: brand(SiYoutube) },
  twitter: { bg: "#000000", fg: "#ffffff", Mark: brand(SiX) },
  facebook: { bg: "#0866ff", fg: "#ffffff", Mark: brand(SiFacebook) },
  threads: { bg: "#000000", fg: "#ffffff", Mark: brand(SiThreads) },
  linkedin: { bg: "#0a66c2", fg: "#ffffff", Mark: brand(SiLinkedin) },
  pinterest: { bg: "#e60023", fg: "#ffffff", Mark: brand(SiPinterest) },
  twitch: { bg: "#9146ff", fg: "#ffffff", Mark: brand(SiTwitch) },
  snapchat: { bg: "#fffc00", fg: "#111111", Mark: brand(SiSnapchat) },
}

const TARGET_MARK: Record<ShareTarget, { bg: string; fg: string; Mark: (p: { size?: number; color?: string }) => React.JSX.Element }> = {
  facebook: { bg: "#0866ff", fg: "#ffffff", Mark: brand(SiFacebook) },
  x: { bg: "#000000", fg: "#ffffff", Mark: brand(SiX) },
  whatsapp: { bg: "#25d366", fg: "#ffffff", Mark: brand(SiWhatsapp) },
  threads: { bg: "#000000", fg: "#ffffff", Mark: brand(SiThreads) },
  pinterest: { bg: "#e60023", fg: "#ffffff", Mark: brand(SiPinterest) },
  linkedin: { bg: "#0a66c2", fg: "#ffffff", Mark: brand(SiLinkedin) },
  telegram: { bg: "#26a5e4", fg: "#ffffff", Mark: brand(SiTelegram) },
  reddit: { bg: "#ff4500", fg: "#ffffff", Mark: brand(SiReddit) },
  email: {
    bg: "#f1f2f4",
    fg: "#1a1a2e",
    Mark: ({ size = 22, color }) => <Mail size={size - 1} color={color} strokeWidth={1.75} aria-hidden />,
  },
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
 * Light grey, the Storelib S and the address in a very dark grey, and the
 * share glyph. A hairline and a lit top edge give it the slightest lift off
 * the page. It gives way before anything beside it does: on a phone it shares
 * a row with the live count and the period, and the address fades out where
 * the room runs out.
 */
export function SharePill({
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
      aria-expanded={expanded}
      aria-label={`Share ${display}`}
      title={display}
      data-share-pill=""
      className={cn(
        "inline-flex h-9 min-w-0 max-w-full cursor-pointer select-none items-center rounded-full bg-[#efeff1] text-[#1f1f23] outline-none",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.05]",
        "transition-[background-color,box-shadow] duration-150 hover:bg-[#e8e8eb] active:bg-[#e2e2e6] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]",
        "aria-expanded:bg-[#e6e6ea]",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
        "[-webkit-tap-highlight-color:transparent]",
        md ? "gap-2 pl-3 pr-2.5 text-[13.5px]" : "gap-1.5 pl-2.5 pr-2 text-[12.5px]",
        className,
      )}
    >
      <StorelibGlyph size={md ? 16 : 15} className="shrink-0 text-[#1f1f23]" />
      <FadeText text={display} className="font-medium tracking-[-0.005em]" />
      <Share className={cn("shrink-0 text-[#3a3a40]", md ? "h-4 w-4" : "h-[15px] w-[15px]")} strokeWidth={1.8} aria-hidden />
    </button>
  )
}

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

/** A step's button names sit between ** marks in share-data; drawn bold. */
function Step({ text }: { text: string }) {
  const parts = text.split("**")
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[#1a1a2e]">
            {part}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
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

function LinkRow({
  address,
  copied,
  onCopy,
  onOpen,
  className,
}: {
  address: ShareAddress
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  className?: string
}) {
  return (
    <div className={cn("flex h-[52px] items-center gap-1 rounded-2xl border border-[#e5e7eb] bg-white pl-3 pr-1.5", className)}>
      <StorelibTile size={24} />
      <button
        type="button"
        onClick={onOpen}
        title={`Open ${address.display}`}
        className="min-w-0 flex-1 cursor-pointer overflow-hidden px-1.5 text-left text-[14px] text-[#1a1a2e] outline-none underline-offset-2 hover:underline focus-visible:underline sm:text-[14.5px]"
      >
        <EaseIn swapKey={address.url} className="block truncate">
          {address.display}
        </EaseIn>
      </button>
      <button type="button" onClick={onOpen} aria-label={`Open ${address.label}`} className={iconButton}>
        <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </button>
      <button type="button" onClick={onCopy} data-share-copy="" className={cn(inkDepth, "h-9 min-w-[70px] rounded-[10px] px-3 text-[14px]")}>
        {copied ? (
          <>
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Copied
          </>
        ) : (
          "Copy"
        )}
      </button>
    </div>
  )
}

/**
 * CREATOR PAGE, ONEPAGE, WEBSITE. A white thumb slides under the one chosen,
 * on the sheet's curve, rather than the highlight jumping from one tab to the
 * next; the address below eases in to match (LinkRow).
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
        className="absolute bottom-1 left-1 top-1 rounded-[9px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1),0_0_0_1px_rgba(16,24,40,0.04)] transition-transform duration-300 will-change-transform motion-reduce:transition-none"
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
 * Drawn as SVG by the qrcode library the OnePage already uses, loaded when a
 * code is first shown. High error correction, so the mark in the middle
 * (under a fifth of the width) never stops it scanning.
 */
function QrCode({ url, size }: { url: string; size: number }) {
  const [svg, setSvg] = React.useState<string | null>(null)
  React.useEffect(() => {
    /* The last code stays up until the new one is drawn, rather than blinking to grey between addresses. */
    let live = true
    import("qrcode")
      .then((q) => q.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 0, color: { dark: QR_INK, light: "#ffffff" } }))
      .then((out) => {
        if (live) setSvg(out)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [url])
  const mark = Math.round(size * 0.2)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`QR code for ${url.replace(/^https?:\/\//, "")}`}>
      {svg ? (
        /* The library's own output for our own address: path data, no text. */
        <div data-share-qr="" className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-[#f1f2f4] motion-reduce:animate-none" />
      )}
      {svg && (
        <span
          className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-white"
          style={{ width: mark + Math.max(6, Math.round(size * 0.05)), height: mark + Math.max(6, Math.round(size * 0.05)) }}
        >
          <span className="block" style={{ width: mark, height: mark }}>
            <StorelibMark className="block h-full w-full" />
          </span>
        </span>
      )}
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

/* ─── A row of round buttons ──────────────────────────────────────────── */

function RoundButton({
  label,
  bg,
  children,
  onClick,
  plain = false,
}: {
  label: string
  bg?: string
  children: React.ReactNode
  onClick: () => void
  /** The circle is drawn by the child (the Storelib tile), not by a background here. */
  plain?: boolean
}) {
  return (
    /*
      NO `group` HERE. globals.css flattens every transform inside a `.group`
      on touch screens, and it bans scale on hover in groups anyway. The
      circle darkens a step on hover and press instead, which reads the same
      and moves nothing.
    */
    <button
      type="button"
      onClick={onClick}
      className="flex w-[68px] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl py-1 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[#8b5cf6] [-webkit-tap-highlight-color:transparent] [&:active>[data-circle]]:brightness-90 [&:hover>[data-circle]]:brightness-95"
    >
      <span
        data-circle=""
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full transition-[filter] duration-150 motion-reduce:transition-none",
          !plain && "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        )}
        style={bg ? { background: bg } : undefined}
      >
        {children}
      </span>
      {/* Not cut: "My Storelib" is a hair wider than its column in some fonts, and the gap beside it has room. */}
      <span className="whitespace-nowrap text-[12px] leading-4 text-[#4b5563]">{label}</span>
    </button>
  )
}

/**
 * A row that scrolls sideways, edge to edge of the surface it sits in, with
 * no fade over its end: the circle the edge cuts is what says there is more.
 * `data-sheet-no-drag` keeps the phone sheet's drag from taking a sideways
 * swipe. A mouse wheel turned over it scrolls it sideways, since a mouse has
 * no other way to.
 */
function SideRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
      if (next === el.scrollLeft) return
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  return (
    <div
      ref={ref}
      data-sheet-no-drag=""
      data-share-row=""
      className={cn("scrollbar-hide flex gap-0.5 overflow-x-auto overscroll-x-contain", className)}
    >
      {children}
    </div>
  )
}

/* ─── Views ───────────────────────────────────────────────────────────── */

type View = { kind: "share" } | { kind: "platform"; key: BioPlatform } | { kind: "qr" }

const QR_HINT_KEY = "storelib:share-qr-hint-hidden"

function ShareView({
  addresses,
  current,
  onSurface,
  platforms,
  phone,
  copied,
  onCopy,
  onOpen,
  onPlatform,
  onQr,
  onTarget,
  canNativeShare,
  onNativeShare,
}: {
  addresses: ShareAddress[]
  current: ShareAddress
  onSurface: (s: ShareSurface) => void
  platforms: ConnectedPlatform[]
  phone: boolean
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  onPlatform: (k: BioPlatform) => void
  onQr: () => void
  onTarget: (t: ShareTarget) => void
  canNativeShare: boolean
  onNativeShare: () => void
}) {
  /* Read on the first render: this view only exists once the panel is open, in the browser, so the card never pops in a frame late. */
  const [qrHidden, setQrHidden] = React.useState(() => {
    if (typeof window === "undefined") return true
    try {
      return localStorage.getItem(QR_HINT_KEY) === "1"
    } catch {
      return false
    }
  })
  const hideQr = () => {
    setQrHidden(true)
    try {
      localStorage.setItem(QR_HINT_KEY, "1")
    } catch {
      /* private mode: hidden for now */
    }
  }
  const shown: ConnectedPlatform[] = platforms.length > 0 ? platforms : DEFAULT_BIO_PLATFORMS.map((key) => ({ key, profileUrl: null }))
  const live = current.live !== false

  return (
    <>
      <div className="px-4 pb-4 sm:px-5">
        {addresses.length > 1 && <SurfaceSwitch addresses={addresses} current={current} onSurface={onSurface} />}

        <LinkRow className={addresses.length > 1 ? "mt-2.5" : undefined} address={current} copied={copied} onCopy={onCopy} onOpen={onOpen} />

        <EaseIn swapKey={current.surface} className="mt-2 block px-1 text-[12.5px] leading-[1.45] text-[#6b7280]">
          {live ? (
            SURFACE_HINT[current.surface]
          ) : (
            <>
              Not live yet. It opens once you publish your OnePage.{" "}
              <Link href="/app/onepage" className="font-medium text-[#1a1a2e] underline underline-offset-2">
                Open OnePage
              </Link>
            </>
          )}
        </EaseIn>

        {!phone && !qrHidden && (
          <div data-share-qr-hint="" className="relative mt-3 flex items-center gap-3.5 rounded-2xl border border-[#e5e7eb] p-3 pr-9">
            <button type="button" onClick={hideQr} aria-label="Hide the QR code" className={cn(iconButton, "absolute right-1.5 top-1.5 h-8 w-8")}>
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onQr}
              aria-label="Show the QR code larger"
              className="shrink-0 cursor-pointer rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]"
            >
              <QrCode url={current.url} size={84} />
            </button>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-5 text-[#1a1a2e]">Add it to your Instagram bio</p>
              <p className="mt-0.5 text-[13px] leading-[1.4] text-[#6b7280]">Scan with your phone to open it there</p>
            </div>
          </div>
        )}

        <p className="mt-4 text-[13px] font-semibold text-[#1a1a2e]">My platforms</p>
        <SideRow className="-mx-4 mt-1.5 px-3 sm:-mx-5 sm:px-4">
          {shown.map((p) => {
            const m = BIO_MARK[p.key]
            return (
              <RoundButton key={p.key} label={BIO_HOW_TO[p.key].name} bg={m.bg} onClick={() => onPlatform(p.key)}>
                <m.Mark size={21} color={m.fg} />
              </RoundButton>
            )
          })}
        </SideRow>
      </div>

      <div className="border-t border-[#eceef1] pb-3 pt-3">
        <SideRow className="px-3 sm:px-4">
          <RoundButton label="My Storelib" plain onClick={onOpen}>
            <StorelibTile size={48} round />
          </RoundButton>
          <RoundButton label="QR code" bg="#f1f2f4" onClick={onQr}>
            <QrCodeIcon className="h-5 w-5 text-[#26262b]" strokeWidth={1.75} aria-hidden />
          </RoundButton>
          {SHARE_TARGETS.map((t) => {
            const m = TARGET_MARK[t.key]
            return (
              <RoundButton key={t.key} label={t.label} bg={m.bg} onClick={() => onTarget(t.key)}>
                <m.Mark size={20} color={m.fg} />
              </RoundButton>
            )
          })}
          {canNativeShare && (
            <RoundButton label="More" bg="#f1f2f4" onClick={onNativeShare}>
              <MoreHorizontal className="h-[21px] w-[21px] text-[#26262b]" strokeWidth={1.75} aria-hidden />
            </RoundButton>
          )}
        </SideRow>
      </div>
    </>
  )
}

function PlatformView({
  platform,
  address,
  copied,
  onCopy,
}: {
  platform: ConnectedPlatform
  address: ShareAddress
  copied: boolean
  onCopy: () => void
}) {
  const how = BIO_HOW_TO[platform.key]
  const m = BIO_MARK[platform.key]
  return (
    <div className="px-4 pb-4 sm:px-5 sm:pb-5">
      <PlatformArt platform={platform.key} address={address.display} />
      {how.needs && (
        <p className="mt-4 rounded-xl bg-[#f7f7f8] px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-[#4b5563]">
          {how.needs.text}
          {how.needs.link && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => openExternal(how.needs!.link!.href)}
                className="cursor-pointer font-medium text-[#1a1a2e] underline underline-offset-2"
              >
                {how.needs.link.label}
              </button>
            </>
          )}
        </p>
      )}
      <ol className="mt-4 space-y-2.5">
        {how.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-[1.45] text-[#374151]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-[12px] font-semibold text-[#4b5563]">{i + 1}</span>
            <span className="pt-[2px]">
              <Step text={step} />
            </span>
          </li>
        ))}
      </ol>
      {how.note && (
        <p className="mt-3 text-[13px] leading-[1.5] text-[#6b7280]">
          <Step text={how.note} />
        </p>
      )}
      <LinkRow className="mt-4" address={address} copied={copied} onCopy={onCopy} onOpen={() => openExternal(address.url)} />
      <button
        type="button"
        onClick={() => openExternal(platform.profileUrl ?? how.home)}
        className={cn(secondaryDepth, "mt-2.5 h-11 w-full gap-2.5 rounded-xl text-[15px]")}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: m.bg }}>
          <m.Mark size={13} color={m.fg} />
        </span>
        Open {how.name}
      </button>
    </div>
  )
}

function QrView({ address, phone, copied, onCopy }: { address: ShareAddress; phone: boolean; copied: boolean; onCopy: () => void }) {
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
        <QrCode url={address.url} size={phone ? 200 : 188} />
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
          {copied ? <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> : null}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
}

/* ─── Moving between views ────────────────────────────────────────────── */

/**
 * The surface eases from the old view's height to the new one's, and the new
 * content slides in a short way from the side it came from. Both on the Web
 * Animations API, so there are no keyframes to add to globals.css; both
 * skipped when the person has asked for less motion.
 */
function Swap({ viewKey, forward, children }: { viewKey: string; forward: boolean; children: React.ReactNode }) {
  const outer = React.useRef<HTMLDivElement>(null)
  const inner = React.useRef<HTMLDivElement>(null)
  const last = React.useRef<number | null>(null)
  const first = React.useRef(true)

  React.useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      last.current = el.offsetHeight
    })
    ro.observe(el)
    last.current = el.offsetHeight
    return () => ro.disconnect()
  }, [])

  React.useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = outer.current
    const content = inner.current
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
    <div ref={outer} className="overflow-hidden">
      <div ref={inner}>{children}</div>
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
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className={iconButton}>
          <ArrowLeft className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <span className={onClose ? "w-2" : "w-1.5"} aria-hidden />
      )}
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

/**
 * The pill, and the panel or sheet it opens. Each pill owns its own: the home
 * page draws one for computers and one for phones, and whichever is on screen
 * is the one that is tapped.
 */
export function ShareStorelib({
  addresses,
  platforms,
  size = "md",
  openSignal = 0,
  className,
}: {
  /** The creator page first: it is what the pill shows and what is selected on open. */
  addresses: ShareAddress[]
  platforms: ConnectedPlatform[]
  size?: "md" | "sm"
  /**
   * Opens it from elsewhere on the page each time the number goes up (the
   * home page's "Make your first sale"). Only the pill that is on screen
   * answers, so of a page's computer and phone pills exactly one opens.
   */
  openSignal?: number
  className?: string
}) {
  const phone = useIsPhone()
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>({ kind: "share" })
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
      setView({ kind: "share" })
      setForward(true)
      setSurface(addresses[0]?.surface ?? null)
    }
  }

  const current = addresses.find((a) => a.surface === surface) ?? addresses[0]
  if (!current) return null

  const close = () => setOpen(false)
  const go = (next: View) => {
    setForward(true)
    setView(next)
  }
  const back = () => {
    setForward(false)
    setView({ kind: "share" })
  }
  const openPage = () => openExternal(current.url)
  const onTarget = (t: ShareTarget) => {
    const href = shareTargetUrl(t, current.url)
    if (t === "email" && !isNativeApp()) window.location.href = href
    else openExternal(href)
  }
  const onNativeShare = () => {
    navigator.share?.({ url: current.url }).catch(() => {
      /* dismissed */
    })
  }
  const platform =
    view.kind === "platform"
      ? platforms.find((p) => p.key === view.key) ?? { key: view.key, profileUrl: null }
      : null

  const title = view.kind === "platform" ? BIO_HOW_TO[view.key].name : view.kind === "qr" ? "QR code" : "Share your Storelib"
  const viewKey = view.kind === "platform" ? `platform:${view.key}` : view.kind
  const isCopied = copied === current.url

  const body = (
    <Swap viewKey={viewKey} forward={forward}>
      {view.kind === "share" && (
        <ShareView
          addresses={addresses}
          current={current}
          onSurface={setSurface}
          platforms={platforms}
          phone={phone}
          copied={isCopied}
          onCopy={() => copy(current.url)}
          onOpen={openPage}
          onPlatform={(key) => go({ kind: "platform", key })}
          onQr={() => go({ kind: "qr" })}
          onTarget={onTarget}
          canNativeShare={canNativeShare}
          onNativeShare={onNativeShare}
        />
      )}
      {platform && <PlatformView platform={platform} address={current} copied={isCopied} onCopy={() => copy(current.url)} />}
      {view.kind === "qr" && <QrView address={current} phone={phone} copied={isCopied} onCopy={() => copy(current.url)} />}
    </Swap>
  )

  const sheetOpen = open && phone
  const panelOpen = open && !phone

  return (
    <>
      <PopoverPrimitive.Root open={panelOpen} onOpenChange={(next) => !next && close()}>
        <PopoverPrimitive.Anchor asChild>
          <span ref={anchorRef} className={cn("inline-flex min-w-0 max-w-full", className)}>
            <SharePill size={size} display={addresses[0].display} expanded={open} onOpen={() => setOpen((v) => !v)} />
          </span>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            ref={panelRef}
            data-share-sheet=""
            data-surface="panel"
            data-view={view.kind}
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
              "origin-(--radix-popover-content-transform-origin) duration-200",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-top-1",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-150",
              "motion-reduce:animate-none",
            )}
            style={{ animationTimingFunction: EASE }}
          >
            <Header title={title} onBack={view.kind === "share" ? undefined : back} onClose={close} />
            {body}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={close}
        label={title}
        hideFrom="md"
        scrollKey={viewKey}
        header={<Header title={title} onBack={view.kind === "share" ? undefined : back} />}
      >
        <div data-share-sheet="" data-surface="sheet" data-view={view.kind}>
          {body}
        </div>
      </BottomSheet>
    </>
  )
}
