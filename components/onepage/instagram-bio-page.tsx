"use client"

/**
 * The page a creator's phone opens from the QR code in Share (round AR,
 * lib/onepage/instagram-bio): white, the Storelib mark beside Instagram's,
 * and three steps with the creator's own public address filled in and a
 * Copy button, then Open Instagram (the app, or its website when the app is
 * not there).
 */
import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { tt } from "@/lib/i18n/text"
import { INSTAGRAM_APP_URL, INSTAGRAM_FALLBACK_MS, INSTAGRAM_WEB_URL, shownAddress } from "@/lib/onepage/instagram-bio"

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement("textarea")
    el.value = text
    el.setAttribute("readonly", "")
    el.style.position = "fixed"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(el)
    return ok
  }
}

function openInstagram() {
  let left = false
  const away = () => {
    if (document.hidden) left = true
  }
  document.addEventListener("visibilitychange", away)
  window.location.href = INSTAGRAM_APP_URL
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", away)
    if (!left) window.location.href = INSTAGRAM_WEB_URL
  }, INSTAGRAM_FALLBACK_MS)
}

export function InstagramBioPage({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])
  const step = "flex gap-3.5"
  const num = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-[13px] font-semibold tabular-nums text-[#1a1a2e]"
  return (
    <main className="min-h-[100dvh] bg-white px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))] text-[#1a1a2e]" data-instagram-bio="">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-3" aria-hidden>
          <StorelibLogo size={40} />
          <span className="text-[18px] text-[#c4c7cc]">+</span>
          <span className="grid h-10 w-10 place-items-center">
            <SocialIcon platform="instagram" tone="brand" size={36} />
          </span>
        </div>
        <h1 className="mt-6 text-center text-[24px] font-bold leading-8">{tt("Add your page to your Instagram bio")}</h1>
        <p className="mt-1.5 text-center text-[14px] text-[#6b7280]">{name}</p>

        <ol className="mt-8 space-y-6">
          <li className={step}>
            <span className={num}>1</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-7">{tt("Copy your link")}</p>
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] py-1.5 pl-3.5 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-[15px]" data-bio-url="">
                  {shownAddress(url)}
                </span>
                <button
                  type="button"
                  onClick={() => void copyText(url).then((ok) => setCopied(ok))}
                  data-bio-copy=""
                  aria-live="polite"
                  className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white transition-[background-color,scale] duration-150 active:scale-[0.97] active:bg-[#111113]"
                >
                  {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                  {copied ? tt("Copied") : tt("Copy")}
                </button>
              </div>
            </div>
          </li>
          <li className={step}>
            <span className={num}>2</span>
            <p className="min-w-0 flex-1 text-[15px] leading-7">{tt("Open Instagram, tap Edit profile, then Links, then Add external link.")}</p>
          </li>
          <li className={step}>
            <span className={num}>3</span>
            <p className="min-w-0 flex-1 text-[15px] leading-7">{tt("Paste your link and tap Done.")}</p>
          </li>
        </ol>

        <button
          type="button"
          onClick={openInstagram}
          data-bio-open=""
          className="mt-9 flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-semibold text-[#1a1a2e] transition-[background-color,scale] duration-150 hover:bg-[#f7f7f8] active:scale-[0.98] active:bg-[#f1f2f4]"
        >
          {tt("Open Instagram")}
        </button>
      </div>
    </main>
  )
}
