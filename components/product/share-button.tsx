"use client"

/**
 * ===========================================================================
 *  SHARE, ON A PRODUCT PAGE
 * ===========================================================================
 * It was a centred dialog over a dimmed page with three 56px slabs in it: a
 * black one, a Facebook-blue one and an outlined one, and "Copied!" swapped
 * into the third button's label. A modal is the weight of "stop and answer
 * this", and choosing where to send a link is not that.
 *
 *   ON A PHONE with the system share sheet (iOS, Android, the iOS app), the
 *   button opens that sheet directly: every app the person actually uses,
 *   Messages and WhatsApp included, instead of the two this page guessed.
 *
 *   OTHERWISE, the action list every other menu in Storelib uses
 *   (components/ui/responsive-action-menu): a small white menu anchored to
 *   the button on a computer, the shared bottom sheet on a phone. Share on X,
 *   Share on Facebook, and Copy link after a hairline.
 *
 *   COPYING says so with the dark pill (components/storefront/pill-toast),
 *   the confirmation both public pages use, rather than a label changing
 *   inside a menu that is already closing.
 *
 * The address is getProductShareUrl's: the canonical one, on the creator
 * page's own domain when it has one, never `window.location`.
 */

import { useEffect, useMemo, useState } from "react"
import { Share2, Link2 } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { showPillToast } from "@/components/storefront/pill-toast"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/native-bridge"
import { getProductShareUrl } from "@/lib/url-helpers"

interface ShareButtonProps {
  productTitle: string
  productSlug: string
  /** The seller's handle. Without it the link falls back to `/p/<slug>`. */
  creatorUsername?: string
  /** The creator page's own domain, when it has one: the link is <domain>/<slug>. */
  pageHost?: string | null
  className?: string
  size?: "default" | "sm" | "lg" | "icon"
  iconSize?: string
}

/* The two marks, drawn rather than borrowed: lucide's `X` is a close icon. */
function XMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9.47 6.77L15.04 0.5h-1.32L8.9 5.94 5.04 0.5H0.6l5.84 8.23L0.6 15.5h1.32l5.1-5.83 4.08 5.83h4.44L9.47 6.77zm-1.8 2.07l-.6-.83L2.38 1.5h2.03l3.8 5.36.59.83 4.94 6.97h-2.03L7.67 8.84z" />
    </svg>
  )
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M16 8.05A8 8 0 1 0 6.75 15.95v-5.6H4.72V8.05h2.03V6.3c0-2 1.19-3.1 3.02-3.1.87 0 1.79.15 1.79.15v1.97h-1.01c-.99 0-1.3.62-1.3 1.25v1.48h2.22l-.36 2.3H9.25v5.6A8 8 0 0 0 16 8.05z" />
    </svg>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* An older webview, or a page without clipboard permission. */
    try {
      const area = document.createElement("textarea")
      area.value = text
      area.setAttribute("readonly", "")
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none"
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * On the iOS and Android apps an app scheme opens the X or Facebook app when
 * it is installed; otherwise the system browser, so universal links can
 * still route there.
 */
async function openInApp(appScheme: string, webUrl: string) {
  try {
    const { App } = await import("@capacitor/app")
    const { value: canOpen } = await App.canOpenUrl({ url: appScheme })
    if (canOpen) {
      await App.openUrl({ url: appScheme })
      return
    }
  } catch {
    /* @capacitor/app unavailable: fall through */
  }
  window.open(webUrl, "_system")
}

export function ShareButton({
  productTitle,
  productSlug,
  creatorUsername,
  pageHost,
  className,
  size = "icon",
  iconSize = "h-5 w-5",
}: ShareButtonProps) {
  const shareUrl = getProductShareUrl(creatorUsername || "", productSlug, pageHost)
  const shareText = `Check out ${productTitle}`

  /* Decided after mount: the server knows neither the screen nor the browser. */
  const [systemSheet, setSystemSheet] = useState(false)
  const [native, setNative] = useState(false)
  useEffect(() => {
    setNative(isNativeApp())
    const mq = window.matchMedia?.("(max-width: 639px), (pointer: coarse) and (max-width: 1024px)")
    const sync = () => setSystemSheet(!!mq?.matches && typeof navigator.share === "function")
    sync()
    mq?.addEventListener?.("change", sync)
    return () => mq?.removeEventListener?.("change", sync)
  }, [])

  const copy = async () => {
    const ok = await copyText(shareUrl)
    showPillToast(ok ? "Link copied" : "Could not copy the link", { mark: ok ? "link" : "check" })
  }

  const items = useMemo<ActionMenuItem[]>(() => {
    const xWeb = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    const fbWeb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`
    return [
      native
        ? { label: "Share on X", icon: <XMark />, onClick: () => void openInApp(`twitter://post?message=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, xWeb) }
        : { label: "Share on X", icon: <XMark />, href: xWeb, target: "_blank" as const },
      native
        ? { label: "Share on Facebook", icon: <FacebookMark />, onClick: () => void openInApp(`fb://share?link=${encodeURIComponent(shareUrl)}`, fbWeb) }
        : { label: "Share on Facebook", icon: <FacebookMark />, href: fbWeb, target: "_blank" as const },
      { label: "Copy link", icon: <Link2 />, onClick: () => void copy(), separatorBefore: true },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, shareText, shareUrl])

  const triggerClass = cn(
    "inline-flex shrink-0 select-none items-center justify-center rounded-full text-current outline-none",
    /*
      Round AG, the owner: "the share modal bumps when I click it". The menu opens on pointer down, while the button was
      shrinking under the press (active:scale), so the menu was placed against the smaller button and then slid as it grew
      back. The press now darkens the button instead of moving it; the menu is placed once, where it stays.
    */
    "transition-[background-color] duration-150 hover:bg-current/[0.07] active:bg-current/[0.1] data-[state=open]:bg-current/[0.07]",
    "focus-visible:ring-2 focus-visible:ring-current/25 [-webkit-tap-highlight-color:transparent]",
    size === "icon" && "h-9 w-9",
    size === "sm" && "h-8 w-8",
    size === "lg" && "h-10 w-10",
    size === "default" && "h-9 w-9",
    className,
  )

  if (systemSheet) {
    return (
      <button
        type="button"
        aria-label="Share"
        data-share-trigger="system"
        className={triggerClass}
        onClick={async () => {
          try {
            await navigator.share({ title: productTitle, text: shareText, url: shareUrl })
          } catch (e) {
            /* Closing the sheet is an answer, not a failure. */
            if ((e as Error)?.name === "AbortError") return
            await copy()
          }
        }}
      >
        <Share2 className={iconSize} />
      </button>
    )
  }

  return (
    <ResponsiveActionMenu
      title="Share"
      menuWidth="w-52"
      items={items}
      trigger={
        /* The trigger is an icon, so it is named; it announced nothing once. */
        <button type="button" aria-label="Share" data-share-trigger="menu" className={triggerClass}>
          <Share2 className={iconSize} />
        </button>
      }
    />
  )
}
