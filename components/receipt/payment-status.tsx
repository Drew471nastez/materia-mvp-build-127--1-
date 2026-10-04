"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

/**
 * What a buyer sees between Stripe sending them back and their order being
 * written, or when a payment did not complete. The state always comes from
 * the server (Stripe's own answer, read with the secret key), never from the
 * query string, so a hand-edited URL cannot show "paid".
 *
 * While waiting it asks the server again every few seconds; the server
 * redirects to the receipt as soon as the order exists. After a minute and a
 * half it stops and says the email will follow.
 */
const POLL_MS = 3000
const POLL_LIMIT = 30

export function PaymentStatus({ state }: { state: "waiting" | "unpaid" | "expired" }) {
  const router = useRouter()
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    if (state !== "waiting" || polls >= POLL_LIMIT) return
    const t = setTimeout(() => {
      router.refresh()
      setPolls((n) => n + 1)
    }, POLL_MS)
    return () => clearTimeout(t)
  }, [state, polls, router])

  const gaveUp = state === "waiting" && polls >= POLL_LIMIT

  const title =
    state === "waiting" ? "Finishing your order" : state === "unpaid" ? "The payment is not complete" : "This checkout expired"
  const body =
    state === "waiting"
      ? gaveUp
        ? "Your payment went through and the order is still being written. Your receipt email will arrive in a few minutes with your files, so it is safe to close this page."
        : "Your payment went through. Your receipt and files open here in a few seconds."
      : state === "unpaid"
        ? "Stripe has not confirmed a payment for this checkout, so nothing was charged. Go back to the product to try again."
        : "Nothing was charged. Start again from the product page."

  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa]">
      <div className="mx-auto w-full max-w-[520px] px-4 pt-[max(3rem,env(safe-area-inset-top))] sm:px-6 sm:pt-20">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]" aria-live="polite">
          {body}
        </p>
        {state === "waiting" && !gaveUp ? (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-[#6b7280]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8b5cf6]" aria-hidden />
            Checking again every few seconds
          </p>
        ) : null}
        {state !== "waiting" || gaveUp ? (
          <Link
            href="/account/library"
            className="mt-5 inline-flex h-10 items-center rounded-xl border border-[#e5e7eb] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e] hover:bg-[#f8f9fa]"
          >
            Go to library
          </Link>
        ) : null}
      </div>
    </main>
  )
}
