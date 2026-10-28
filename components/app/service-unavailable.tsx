"use client"

/**
 * ===========================================================================
 *  STORELIB DID NOT ANSWER IN TIME. NOT SIGNED OUT, NOT A NEW ACCOUNT.
 * ===========================================================================
 * What the /app shell and Settings draw when a read they cannot do without
 * failed (lib/net/service-error.ts): a timeout, a dropped connection, a 5xx.
 * Before, that read came back as "no row", and the shell sent a seller to
 * /sell or /signup/verify, and Settings to /onboarding.
 *
 * `inline` is Settings' own place; without it, the whole screen, because the
 * shell itself could not be drawn. Try again asks the server again in place
 * (router.refresh), without a reload: whatever the page under it still has
 * stays. It also tries once by itself, a few seconds in, and only once, so a
 * blip clears without a press and an outage is never a loop.
 */
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { tt } from "@/lib/i18n/text"

/** The one retry it makes by itself, with up to a second of jitter so a crowd that hit the same blip does not come back in step. */
export const AUTO_RETRY_MS = 3_000

export function ServiceUnavailable({ inline = false }: { inline?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [asked, setAsked] = useState(0)
  const auto = useRef(false)

  const retry = () => {
    setAsked((n) => n + 1)
    startTransition(() => router.refresh())
  }

  useEffect(() => {
    if (auto.current) return
    auto.current = true
    const t = window.setTimeout(retry, AUTO_RETRY_MS + Math.round(Math.random() * 1000))
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const body = (
    <div className={inline ? "w-full" : "w-full max-w-sm text-center"} role="alert" data-service-unavailable={inline ? "inline" : "screen"}>
      <h1 className={inline ? "text-[16px] font-semibold text-[#1a1a2e]" : "text-[20px] font-bold text-[#1a1a2e]"}>{tt("Storelib is not answering right now")}</h1>
      <p className="mt-2 text-[14px] text-[#6b7280]">{tt("You are still signed in and nothing you saved is lost.")}</p>
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        data-service-retry={asked}
        className={
          inline
            ? "mt-4 h-9 cursor-pointer rounded-lg bg-[#1a1a2e] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            : "mt-5 h-11 w-full cursor-pointer rounded-full bg-[#1a1a2e] text-[15px] font-semibold text-white disabled:opacity-60"
        }
      >
        {tt("Try again")}
      </button>
    </div>
  )

  if (inline) return <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">{body}</div>
  return <div className="flex min-h-svh w-full items-center justify-center bg-[#f8f9fa] p-6">{body}</div>
}
