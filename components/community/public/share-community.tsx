"use client"

/**
 * ===========================================================================
 *  SHARE, ON THE COMMUNITY CARD'S COVER (round 26, the owner's section 8)
 * ===========================================================================
 * A small round button in the upper right of the info card's cover, on the About page's side card and on the member's
 * card in the community. It opens Storelib's action list (components/ui/responsive-action-menu: a small menu anchored
 * to the button on a computer, the shared bottom sheet on a phone):
 *
 *   Share...    the system's share sheet, where the browser has one (every app the person uses)
 *   Copy link   the community's address, and the dark pill saying so (components/storefront/pill-toast)
 *   QR code     the same address as a code to scan, in the dialog that is a sheet on a phone
 *
 * ONLY THE PUBLIC ADDRESS. https://storelib.com/community/<slug>, the address the page itself and the card's copy line
 * carry: never an invite link, never a post. Whether the button is drawn at all is about-facts.ts canShareCommunity
 * (published, not archived; a private community only for the people who run it); the caller decides, this draws.
 * The address's preview (title, picture, description) is the page's own metadata (seo.ts and share.png).
 */
import * as React from "react"
import { Link2, QrCode, Share2, Upload } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { showPillToast } from "@/components/storefront/pill-toast"
import { cn } from "@/lib/utils"
import { communityPath } from "./paths"

/** The address a shared community link always carries (the card's copy line, member/wall.tsx WallAddress, says the same). */
export function communityShareUrl(slug: string): string {
  return `https://storelib.com${communityPath(slug)}`
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

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

/** The code, drawn once the dialog opens (qrcode is loaded then, never with the page). */
function QrImage({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    let gone = false
    void import("qrcode").then((lib) =>
      lib
        .toDataURL(url, { width: 400, margin: 1, color: { dark: "#1a1a2e", light: "#ffffff" }, errorCorrectionLevel: "M" })
        .then((data) => {
          if (!gone) setSrc(data)
        })
        .catch(() => undefined),
    )
    return () => {
      gone = true
    }
  }, [url])
  return (
    /* White in both looks: a code needs its light ground to scan. */
    <div className="mx-auto flex h-[216px] w-[216px] items-center justify-center rounded-2xl border border-[#eceef1] bg-white p-2.5" data-own-look="" data-community-qr="">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR code for ${name}`} width={196} height={196} className="h-full w-full" data-keep-bright="" />
      ) : (
        <span aria-hidden className="h-7 w-7 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/50 motion-reduce:animate-none" />
      )}
    </div>
  )
}

export function CommunityShareButton({ slug, name, className, onCover = false }: { slug: string; name: string; className?: string; /** Round 27, the owner: on a cover picture it is quieter (smaller, softer, see through until it is pointed at). */ onCover?: boolean }) {
  const url = communityShareUrl(slug)
  const phone = usePhone()
  const [qrOpen, setQrOpen] = React.useState(false)
  /* Decided after mount: the server knows nothing of the browser. */
  const [system, setSystem] = React.useState(false)
  React.useEffect(() => setSystem(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])

  const copy = React.useCallback(async () => {
    const ok = await copyText(url)
    showPillToast(ok ? "Link copied" : "Could not copy the link", { mark: ok ? "link" : "check" })
  }, [url])

  const items = React.useMemo<ActionMenuItem[]>(() => {
    const out: ActionMenuItem[] = []
    if (system) {
      out.push({
        label: "Share…",
        icon: <Upload />,
        onClick: () =>
          void navigator.share({ title: name, url }).catch((e: unknown) => {
            /* Closing the sheet is an answer, not a failure. */
            if ((e as Error)?.name !== "AbortError") void copy()
          }),
      })
    }
    out.push({ label: "Copy link", icon: <Link2 />, onClick: () => void copy() })
    out.push({ label: "QR code", icon: <QrCode />, onClick: () => setQrOpen(true) })
    return out
  }, [system, name, url, copy])

  return (
    <div className={cn("pointer-events-auto", className)} data-community-share="">
      <ResponsiveActionMenu
        title="Share"
        menuWidth="w-48"
        items={items}
        trigger={
          <button
            type="button"
            aria-label="Share"
            title="Share"
            /* 40px to a thumb around a 32px disc: the disc is drawn by the span, the button is the target. */
            className="group/share -m-1 flex h-10 w-10 items-center justify-center rounded-full outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full transition-[background-color,color] duration-150 group-focus-visible/share:ring-2 group-focus-visible/share:ring-[#1a1a2e]/30 motion-reduce:transition-none",
                onCover
                  ? "h-7 w-7 bg-white/75 text-[#4b5563] shadow-[0_0_0_0.5px_rgba(16,24,40,0.10)] group-hover/share:bg-white group-hover/share:text-[#1a1a2e] group-active/share:bg-[#eef0f2] group-data-[state=open]/share:bg-white group-data-[state=open]/share:text-[#1a1a2e]"
                  : "h-8 w-8 bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.18),0_0_0_1px_rgba(16,24,40,0.06)] group-hover/share:bg-[#f6f7f8] group-active/share:bg-[#eef0f2] group-data-[state=open]/share:bg-[#eef0f2]",
              )}
              data-share-quiet={onCover ? "" : undefined}
            >
              <Share2 aria-hidden className={onCover ? "h-[13px] w-[13px]" : "h-[15px] w-[15px]"} strokeWidth={onCover ? 2.1 : 2} />
            </span>
          </button>
        }
      />
      <SheetDialog open={qrOpen} onClose={() => setQrOpen(false)} phone={phone} label={`QR code for ${name}`} className="gap-0 rounded-2xl p-6 sm:max-w-[340px]">
        <div className={phone ? "px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-1" : ""}>
          <SheetDialogTitle className="text-center text-[17px] font-semibold text-[#1a1a2e]">{name}</SheetDialogTitle>
          <p className="mt-1 truncate text-center text-[13px] text-[#6b7280]">{url.replace(/^https:\/\//, "")}</p>
          <div className="mt-4">
            <QrImage url={url} name={name} />
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e3e5e9] bg-white text-[14.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color] duration-150 hover:bg-[#f6f7f8] active:bg-[#eef0f2] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
          >
            <Link2 aria-hidden className="h-4 w-4" />
            Copy link
          </button>
        </div>
      </SheetDialog>
    </div>
  )
}
