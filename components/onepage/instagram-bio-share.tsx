"use client"

/**
 * SHARE › ADD LINK TO INSTAGRAM BIO (round AR, lib/onepage/instagram-bio).
 * A row in the editor's Share sheet that opens in place, under itself (no
 * second window over the first):
 *
 *   on a computer  a QR code, drawn here from the address with the qrcode
 *                  package already in the app, that opens the steps on the
 *                  phone: storelib.com/instagram-bio/<page>
 *   on a phone     the steps themselves, with Open Instagram: the phone is
 *                  the one that has Instagram on it
 *
 * A page never published has no public address yet, so the row says to
 * publish first instead of drawing a code that would open a 404.
 */
import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { platformOrigin } from "@/lib/onepage/return-address"
import { INSTAGRAM_APP_URL, INSTAGRAM_FALLBACK_MS, INSTAGRAM_WEB_URL, instagramBioUrl } from "@/lib/onepage/instagram-bio"
import { openExternal } from "@/lib/native-bridge"
import { isNativeApp } from "@/lib/platform-utils"

function openInstagram() {
  if (isNativeApp()) {
    window.open(INSTAGRAM_APP_URL, "_system")
    return
  }
  let left = false
  const away = () => {
    if (document.hidden) left = true
  }
  document.addEventListener("visibilitychange", away)
  window.location.href = INSTAGRAM_APP_URL
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", away)
    if (!left) openExternal(INSTAGRAM_WEB_URL)
  }, INSTAGRAM_FALLBACK_MS)
}

/** The code as a data URL, drawn on the first open only (the package loads then). */
function useQr(text: string | null): string | null {
  const [src, setSrc] = useState<{ text: string; src: string } | null>(null)
  useEffect(() => {
    if (!text || src?.text === text) return
    let live = true
    void import("qrcode").then((QR) =>
      QR.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#1a1a2e", light: "#ffffff" } }).then((url) => {
        if (live) setSrc({ text, src: url })
      }),
    ).catch(() => undefined)
    return () => {
      live = false
    }
  }, [text, src?.text])
  return src && src.text === text ? src.src : null
}

export function InstagramBioShare({ slug, published, phone, rowClassName }: { slug: string; published: boolean; phone: boolean; rowClassName: string }) {
  const [open, setOpen] = useState(false)
  const target = published && slug ? instagramBioUrl(platformOrigin(), slug) : null
  const qr = useQr(open && !phone ? target : null)
  return (
    <div data-instagram-bio-share="">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn(rowClassName, "justify-between")} data-instagram-bio-row="">
        <span className="flex items-center gap-3">
          <SocialIcon platform="instagram" tone="brand" size={16} />
          {tt("Add link to Instagram bio")}
        </span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <Reveal open={open}>
        <div className="pt-3" data-instagram-bio-panel="">
          {!published ? (
            <p className="rounded-xl bg-[#f7f7f8] px-4 py-3 text-[13.5px] leading-5 text-[#4b5563]">{tt("Publish your page first. Then its link can go in your bio.")}</p>
          ) : phone ? (
            <div className="space-y-3 rounded-xl bg-[#f7f7f8] p-4">
              <ol className="space-y-2 text-[14px] leading-5 text-[#1a1a2e]">
                <li>{tt("1. Copy your link above.")}</li>
                <li>{tt("2. Open Instagram, tap Edit profile, then Links, then Add external link.")}</li>
                <li>{tt("3. Paste your link and tap Done.")}</li>
              </ol>
              <button type="button" onClick={openInstagram} data-instagram-open="" className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[14px] font-semibold text-[#1a1a2e] transition-[background-color,scale] duration-150 active:scale-[0.98] active:bg-[#f1f2f4]">
                {tt("Open Instagram")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl bg-[#f7f7f8] p-3">
              <div className="grid h-[132px] w-[132px] shrink-0 place-items-center overflow-hidden rounded-lg bg-white" data-instagram-qr={qr ? "" : "loading"}>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn here
                  <img src={qr} alt={tt("QR code for the Instagram bio steps")} width={124} height={124} className="h-[124px] w-[124px]" />
                ) : (
                  <span className="h-[124px] w-[124px] animate-pulse rounded bg-[#f1f2f4] motion-reduce:animate-none" />
                )}
              </div>
              <div className="min-w-0 text-[13.5px] leading-5 text-[#4b5563]">
                <p className="font-medium text-[#1a1a2e]">{tt("Scan with your phone")}</p>
                <p className="mt-1">{tt("It opens three short steps, with your link ready to copy into Instagram.")}</p>
              </div>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  )
}
