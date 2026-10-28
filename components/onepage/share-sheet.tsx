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
 */
import { useEffect, useState } from "react"
import { Check, Link2 } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { isNativeApp } from "@/lib/platform-utils"
import { navigateInApp } from "@/lib/native-bridge"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { OnePageDialog, SheetClose } from "./onepage-dialog"

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

export function OnePageShareSheet({
  open,
  onClose,
  dark,
  pageUrl,
  pageTitle,
  avatarUrl,
  avatarVideoUrl,
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  pageUrl: string
  pageTitle: string
  avatarUrl?: string | null
  avatarVideoUrl?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])
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

  const targets = [
    {
      name: "X",
      icon: <Brand d={X_ICON} />,
      go: () => openShareTarget(`twitter://post?message=${encodeURIComponent(shareText)}`, `https://x.com/intent/post?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`),
    },
    {
      name: "Facebook",
      icon: <Brand d={FB_ICON} />,
      /* The system browser, so a Universal Link or App Link can hand it to the Facebook app; fb:// is unreliable. */
      go: () => openShareTarget(null, `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(pageTitle)}`, true),
    },
    {
      name: "WhatsApp",
      icon: <Brand d={WA_ICON} />,
      go: () => openShareTarget(`whatsapp://send?text=${encodeURIComponent(shareText)}`, `https://wa.me/?text=${encodeURIComponent(shareText)}`),
    },
    {
      name: "Email",
      icon: (
        <svg aria-hidden className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      ),
      go: () => {
        if (isOnePagePreview()) return showPreviewNotice("link")
        window.location.href = `mailto:?subject=${encodeURIComponent(pageTitle)}&body=${encodeURIComponent(pageUrl)}`
      },
    },
    ...(canNativeShare
      ? [
          {
            name: "More",
            icon: (
              <svg aria-hidden className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            ),
            go: () => {
              if (isOnePagePreview()) return showPreviewNotice("link")
              navigator.share({ title: pageTitle, url: pageUrl }).catch(() => {})
            },
          },
        ]
      : []),
  ]

  return (
    <OnePageDialog open={open} onClose={onClose} dark={dark} label={`Share ${pageTitle}`} width={400}>
      <div className="px-5 pb-5 pt-1 sm:px-6 sm:pt-6" data-onepage-share-sheet="">
        <div className="flex items-start gap-3.5">
          {avatarVideoUrl && !avatarUrl ? (
            <video src={avatarVideoUrl} muted autoPlay loop playsInline className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <AppAvatar src={onePageImageSrc(avatarUrl, 56)} name={pageTitle} alt="" size={56} tone={dark ? "dark" : "light"} kind="mark" className="shrink-0" />
          )}
          <div className="min-w-0 flex-1 pt-1.5">
            <p className="truncate text-[17px] font-semibold leading-tight text-[var(--sheet-ink)]">{pageTitle}</p>
            <p className="mt-1 truncate text-[13.5px] text-[var(--sheet-muted)]">{shown}</p>
          </div>
          <SheetClose onClose={onClose} />
        </div>

        <div className="mt-5 flex h-12 items-center gap-2 rounded-2xl bg-[var(--sheet-field)] pl-4 pr-1.5">
          <Link2 aria-hidden className="h-4 w-4 shrink-0 text-[var(--sheet-muted)]" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--sheet-ink)]" data-share-url="">
            {shown}
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--sheet-ink)] px-3.5 text-[13.5px] font-medium text-[var(--sheet-on-ink)] transition-opacity hover:opacity-90 active:scale-[0.98]"
            aria-live="polite"
          >
            {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-5 flex justify-between gap-1">
          {targets.map((t) => (
            <button key={t.name} type="button" onClick={t.go} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl py-1.5 transition-colors">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-ink)] transition-transform group-hover:scale-[1.04] group-active:scale-95">{t.icon}</span>
              <span className="text-[12px] text-[var(--sheet-muted)]">{t.name}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => openExternalUrl("https://storelib.com")}
          className="mt-5 flex w-full items-center gap-3 border-t border-[var(--sheet-rule)] pt-4 text-left"
          data-share-join=""
        >
          <StorelibLogo size={28} />
          <span className="min-w-0 flex-1 text-[13.5px] text-[var(--sheet-muted)]">
            Make a page like this on <span className="font-medium text-[var(--sheet-ink)]">Storelib</span>
          </span>
          <span aria-hidden className="text-[var(--sheet-muted)]">
            &rarr;
          </span>
        </button>
      </div>
    </OnePageDialog>
  )
}
