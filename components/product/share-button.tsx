"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Share2, X, Link2, Facebook } from "lucide-react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
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

export function ShareButton({
  productTitle,
  productSlug,
  creatorUsername,
  pageHost,
  className,
  size = "icon",
  iconSize = "h-5 w-5"
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  /**
   * The address a person is about to paste somewhere. `window.location.origin`
   * was wrong on two counts: on a creator's subdomain or custom domain it
   * produced a link to a page that domain does not serve, and it handed out
   * `/p/<slug>`, which now redirects. getProductShareUrl always names the
   * canonical apex address, which is the one that should end up in a message.
   */
  const shareUrl = getProductShareUrl(creatorUsername || "", productSlug, pageHost)

  const shareText = `Check out ${productTitle}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  /**
   * Opens a social share URL.
   * On native (iOS/Android): checks if the target app is installed via
   * Capacitor's App.canOpenUrl(), opens the app directly if available,
   * otherwise falls back to the system browser (which supports universal
   * links so the OS may still route to the native app).
   * On web: opens a new tab.
   */
  const openSocialUrl = async (appScheme: string, webUrl: string) => {
    if (isNativeApp()) {
      try {
        const { App } = await import("@capacitor/app")
        const { value: canOpen } = await App.canOpenUrl({ url: appScheme })
        if (canOpen) {
          await App.openUrl({ url: appScheme })
          return
        }
      } catch {
        // @capacitor/app unavailable — fall through
      }
      // App not installed: open in system browser so universal links can
      // still route to the native app if the user installs it later.
      window.open(webUrl, "_system")
    } else {
      window.open(webUrl, "_blank", "noopener,noreferrer")
    }
  }

  const handleShareTwitter = async () => {
    // Web URL: opens x.com share intent (browser will show X.com or route to X app)
    const webUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    // App URL scheme: opens the X app directly if installed
    const appScheme = `twitter://post?message=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
    await openSocialUrl(appScheme, webUrl)
  }

  const handleShareFacebook = async () => {
    // Web URL: opens Facebook's share dialog with the link pre-filled as a post
    const webUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`
    // App URL scheme: opens the Facebook app's share sheet if installed
    const appScheme = `fb://share?link=${encodeURIComponent(shareUrl)}`
    await openSocialUrl(appScheme, webUrl)
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className={className}
        /* The trigger is an icon and had no name, so it was a button that
           announced nothing. */
        aria-label="Share"
        onClick={() => setIsOpen(true)}
      >
        <Share2 className={iconSize} />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-[240px] p-4 rounded-2xl"
          /**
           * ===================================================================
           *  A SHARE SHEET IS NOT A "STOP AND ANSWER THIS"
           * ===================================================================
           * The shared dialog scrim is `bg-black/50`, which is half of the
           * page painted out — the product, its pictures and the bar at the
           * top all go to a flat grey behind three buttons. That weight is
           * right for a destructive confirmation, where the point is that
           * nothing else matters until you answer.
           *
           * This is a choice of where to send a link. The page it is about
           * should still be the page you are looking at, and the top bar in
           * particular should not read as having been switched off. A quarter
           * is enough separation for a white card with a shadow on it, and
           * leaves the product legible underneath.
           *
           * Only this dialog. `overlayClassName` goes through tailwind-merge,
           * so it replaces the opacity without touching any other layer.
           */
          overlayClassName="bg-black/25"
        >
          <div className="flex flex-col gap-3">
            <Button
              className="w-full justify-center gap-2 h-14 rounded-xl bg-black text-white hover:bg-black/90 text-base font-medium"
              onClick={handleShareTwitter}
            >
              <X className="h-5 w-5" />
              Share on X
            </Button>
            <Button
              className="w-full justify-center gap-2 h-14 rounded-xl bg-[#4267B2] text-white hover:bg-[#4267B2]/90 text-base font-medium"
              onClick={handleShareFacebook}
            >
              <Facebook className="h-5 w-5" />
              Share on Facebook
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center gap-2 h-14 rounded-xl text-base font-medium border-2"
              onClick={handleCopyLink}
            >
              <Link2 className="h-5 w-5" />
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
