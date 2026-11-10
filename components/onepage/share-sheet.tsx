"use client"

/**
 * ===========================================================================
 *  SHARE, ON A OnePage
 * ===========================================================================
 * What the share button at the top left of a OnePage opens. It was a card
 * with a band in the page's colour drawn edge to edge inside a white card of
 * the same radius, so a hair of white showed round its top corners, and it
 * was the same centred card at every width.
 *
 * Now it is ./onepage-dialog: the app's sheet on a phone, a centred card from
 * 640px, in the page's light or dark, one surface with nothing behind its
 * corners. Inside: who is being shared, the address with Copy beside it,
 * the places to send it, and one quiet line for making a page of your own.
 *
 * How each place is opened (an app first, the web if it is not installed)
 * is unchanged from the card it replaces.
 *
 * ROUND 41, the owner: "Bring back the share modal how it was before (using
 * the actual avatar of the creator)". So it is the card from before round 40
 * again, at every width: a band in the page's own colour with the creator's
 * photo (or their video) large in the middle, their name and address, the
 * four round places to send it, and the Storelib card under them. What was
 * wrong with it is fixed, not brought back:
 *
 *   THE WHITE CORNERS  the band was drawn inside a white card of the same
 *                      radius, so white showed round its top corners. The
 *                      card has no surface of its own now (OnePageDialog
 *                      `bare`): the band and the body are each their own
 *                      colour, and the card's rounded clip cuts both, with
 *                      nothing behind to show at the edge.
 *   THE JUMP           opening it hid the page's scrollbar. Nothing on the page
 *                      is touched now (onepage-dialog useStillPage).
 *   THE BOUNCE         its buttons grew on hover; now only their tint changes.
 */
import { useEffect, useState } from "react"
import { Check, Link2, X as Close } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { isNativeApp } from "@/lib/platform-utils"
import { navigateInApp } from "@/lib/native-bridge"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { PosterVideo } from "./poster-video"
import { OnePageDialog } from "./onepage-dialog"

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* Older browsers and some WebViews. */
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
  }
}

async function openExternalUrl(url: string) {
  /* In the editor's preview nothing leaves it: a note instead (lib/onepage/preview-notice). */
  if (isOnePagePreview()) return showPreviewNotice("link")
  /* Storelib itself opens in the app's own WebView, not a browser over it (lib/native-links.ts). */
  if (navigateInApp(url)) return
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser")
    await Browser.open({ url })
  } else {
    window.open(url, "_blank")
  }
}

/**
 * An app first, the web when it is not installed. In the Storelib app a custom
 * scheme goes to the system synchronously, inside the tap, so the OS accepts
 * it; `preferSystem` sends a web address to the system browser so a Universal
 * Link can still reach the app (Facebook). In a browser the scheme is tried
 * and, if the page is still showing 1.5s later, the web address opens instead.
 */
async function openShareTarget(nativeScheme: string | null, webUrl: string, preferSystem = false) {
  if (isOnePagePreview()) return showPreviewNotice("link")
  if (isNativeApp()) {
    if (nativeScheme) window.open(nativeScheme, "_system")
    else if (preferSystem) window.open(webUrl, "_system")
    else {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url: webUrl })
    }
  } else if (nativeScheme) {
    let appOpened = false
    const onVisibilityChange = () => {
      if (document.hidden) appOpened = true
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.location.href = nativeScheme
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (!appOpened) window.open(webUrl, "_blank")
    }, 1500)
  } else {
    window.open(webUrl, "_blank")
  }
}

const X_ICON = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
const FB_ICON = "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
const WA_ICON = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"

function Brand({ d }: { d: string }) {
  return (
    <svg aria-hidden className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  )
}

/* ── The band's colour and its words ─────────────────────────────────── */

export interface ShareBandInput {
  backgroundType?: "solid" | "gradient" | "image" | "video" | string | null
  backgroundColor?: string | null
  backgroundGradient?: string | null
  accentColor?: string | null
}

function hex6(c: string): string | null {
  const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(c)
  if (!m) return null
  return m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1]
}

function nearWhite(c: string): boolean {
  const h = hex6(c)
  if (!h) return false
  return [0, 2, 4].every((i) => parseInt(h.slice(i, i + 2), 16) > 200)
}

/**
 * The band's background, as before round 40: the page's gradient, else its
 * own colour (white is no band), else the button colour (unless near white),
 * else Storelib's ink. Pure, for the tests.
 */
export function shareBandBackground(t: ShareBandInput): string {
  if (t.backgroundType === "gradient" && t.backgroundGradient) return t.backgroundGradient
  if (t.backgroundType === "solid" && t.backgroundColor && t.backgroundColor.toLowerCase() !== "#ffffff") return t.backgroundColor
  /* A photo or a video page: the colour it was given as its ground. */
  if ((t.backgroundType === "image" || t.backgroundType === "video") && t.backgroundColor && !nearWhite(t.backgroundColor)) return t.backgroundColor
  if (t.accentColor && hex6(t.accentColor) && !nearWhite(t.accentColor)) return t.accentColor
  return "#1a1a2e"
}

/** White words on a dark band, ink on a light one (the first colour of a gradient decides). */
export function shareBandInk(band: string): "light" | "dark" {
  const h = hex6(band)
  if (!h) return "dark"
  const lin = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return L > 0.35 ? "dark" : "light"
}

/**
 * Wave 10: the band over the sheet's surface, its bottom 48px fading into that surface (--sheet-bg), so there is no
 * line where the band ends. The words sit above that last stretch (the band's pb-14, 56px), so they keep the band's contrast.
 */
export function shareBandBlend(band: string): string {
  return `linear-gradient(180deg, transparent calc(100% - 48px), var(--sheet-bg, #ffffff) 100%), ${band}`
}

/** Wave 10: the band's first colour (a gradient's first stop), for the grip's strip above it: one tone, no step. */
export function shareBandTop(band: string): string {
  if (!/gradient\(/i.test(band)) return band
  const m = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/i.exec(band)
  return m ? m[1] : band
}

export function OnePageShareSheet({
  open,
  onClose,
  dark,
  pageUrl,
  pageTitle,
  avatarUrl,
  avatarVideoUrl,
  band: bandInput = {},
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  pageUrl: string
  pageTitle: string
  avatarUrl?: string | null
  avatarVideoUrl?: string | null
  /** The page's colours, for the band (shareBandBackground). */
  band?: ShareBandInput
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    await copyText(pageUrl)
    setCopied(true)
  }
  const shareText = `${pageTitle} ${pageUrl}`
  const shown = pageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
  const band = shareBandBackground(bandInput)
  const onBand = shareBandInk(band) === "light"

  const targets = [
    {
      name: copied ? "Copied" : "Copy link",
      color: copied ? "#22c55e" : dark ? "#d4d4d8" : "#6b7280",
      icon: copied ? <Check aria-hidden className="h-5 w-5" /> : <Link2 aria-hidden className="h-5 w-5" />,
      go: copy,
      live: true,
    },
    {
      name: "X",
      color: dark ? "#f4f4f5" : "#000000",
      icon: <Brand d={X_ICON} />,
      go: () => openShareTarget(`twitter://post?message=${encodeURIComponent(shareText)}`, `https://x.com/intent/post?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`),
    },
    {
      name: "Facebook",
      color: "#1877F2",
      icon: <Brand d={FB_ICON} />,
      /* The system browser, so a Universal Link or App Link can hand it to the Facebook app; fb:// is unreliable. */
      go: () => openShareTarget(null, `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(pageTitle)}`, true),
    },
    {
      name: "WhatsApp",
      color: "#25D366",
      icon: <Brand d={WA_ICON} />,
      go: () => openShareTarget(`whatsapp://send?text=${encodeURIComponent(shareText)}`, `https://wa.me/?text=${encodeURIComponent(shareText)}`),
    },
  ]

  /*
    ROUND AP, THE OWNER: "on mobile devices, the share modal as a mobile bottom sheet, like the subscribe to
    creator mobile bottom sheet". On a phone it is the sheet every OnePage window is (./onepage-dialog: the app's
    BottomSheet, its rise, drag and flick), the band in the page's colour from the sheet's top edge, grip and
    all (`phoneTop`), so no strip of white sits over it; from 640px the centred card as before. The band is the
    sheet's header, so on a phone it is what the sheet is held by.
  */
  /* The band: the page's own colour, its corners the card's (the card clips; nothing is behind it). */
  const header = (
    /*
      Wave 10 (legible), the owner's phone: "get rid of the cuts in the colours". The band ended on a hard line, the
      actions were another tone under it and a white strip showed at the bottom. Now the band's last 48px (inside its
      bottom padding, under the words) melt into the sheet's surface (shareBandBlend), the sheet itself is that
      surface to its very bottom, safe area included (components/onepage/onepage-dialog), and its grip strip wears the
      band's top colour (shareBandTop), so the sheet is one piece from the grip to the home indicator.
    */
    <div className="relative px-6 pb-14 pt-5 text-center sm:pt-8" style={{ background: shareBandBlend(band) }} data-share-band="" data-onepage-share-sheet="">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={`absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full transition-colors ${onBand ? "bg-white/20 text-white hover:bg-white/30" : "bg-black/10 text-[#1f2937] hover:bg-black/15"}`}
      >
        <Close aria-hidden className="h-4 w-4" />
      </button>
      <div className="relative mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.3),0_12px_28px_rgba(0,0,0,0.22)]" data-share-avatar="">
        {avatarVideoUrl ? (
          <PosterVideo src={avatarVideoUrl} fallback={onePageImageSrc(avatarUrl, 160)} alt={pageTitle} />
        ) : (
          <AppAvatar waitForPhoto src={onePageImageSrc(avatarUrl, 160)} name={pageTitle} alt={pageTitle} size={80} kind="mark" sizedByClass className={`flex h-20 w-20 bg-white/25 text-3xl font-bold ${onBand ? "text-white" : "text-[#1f2937]"}`} />
        )}
      </div>
      <p className={`truncate text-[20px] font-bold leading-[25px] ${onBand ? "text-white" : "text-[#111827]"}`}>{pageTitle}</p>
      <p className={`mx-auto mt-1 max-w-[240px] truncate text-[14px] leading-5 ${onBand ? "text-white/80" : "text-[#4b5563]"}`} data-share-url="">
        {shown}
      </p>
    </div>
  )
  return (
    <OnePageDialog open={open} onClose={onClose} dark={dark} label={`Share ${pageTitle}`} width={380} bare phoneTop={shareBandTop(band)} header={header}>
    {/* The body: one surface in the page's light or dark, the band melting into it (no seam). */}
    <div className="bg-[var(--sheet-bg)] px-5 pb-6 pt-2" data-share-body="">
      <div className="flex items-start justify-center gap-3">
        {targets.map((t) => (
          <button
            key={t.name === "Copied" ? "Copy link" : t.name}
            type="button"
            onClick={t.go}
            aria-live={t.live ? "polite" : undefined}
            className="flex w-[76px] flex-col items-center gap-1.5 rounded-xl p-2 transition-opacity duration-150 hover:opacity-75 active:opacity-60"
            data-share-target={t.name}
          >
            <span className="grid h-[46px] w-[46px] place-items-center rounded-full" style={{ backgroundColor: `${t.color}1f`, color: t.color }}>
              {t.icon}
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium text-[var(--sheet-muted)]">{t.name}</span>
          </button>
        ))}
      </div>

      <div
        role="link"
        tabIndex={0}
        onClick={() => openExternalUrl("https://storelib.com")}
        onKeyDown={(e) => {
          if (e.key === "Enter") openExternalUrl("https://storelib.com")
        }}
        className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--sheet-field)] p-4"
        data-share-join=""
      >
        <StorelibLogo size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--sheet-ink)]">Create your own page</p>
          <p className="truncate text-[12px] text-[var(--sheet-muted)]">Build your store with Storelib</p>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-xl bg-[var(--sheet-ink)] px-4 text-[14px] font-semibold text-[var(--sheet-on-ink)]">Join</span>
      </div>
    </div>
    </OnePageDialog>
  )
}
