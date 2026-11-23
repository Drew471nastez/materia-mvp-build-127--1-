"use client"

import * as React from "react"
import { CheckCircle2 } from "lucide-react"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { BANK_COLLECTION, SETUP_COLLECTION } from "@/lib/payments/stripe/setup-collection"
import { readsLikeStripe } from "@/lib/payments/verify-id"

type Form = "setup" | "bank"

function readFragment(): { token: string; form: Form } | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const token = hash.get("t") || ""
  if (!token) return null
  return { token, form: hash.get("f") === "bank" ? "bank" : "setup" }
}

/**
 * The form, then a quiet "all set". The app behind the sheet asks Stripe how
 * it went while the sheet is open and closes it itself once payouts are on;
 * Done at the top always goes back too.
 */
export function PayoutsSheet() {
  const [link, setLink] = React.useState<{ token: string; form: Form } | null | undefined>(undefined)
  const [finished, setFinished] = React.useState(false)

  React.useEffect(() => {
    const read = readFragment()
    setLink(read)
    /* The token leaves the address bar as soon as it is read: a screenshot or a shared address never carries it. */
    if (read) window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const session = React.useCallback(async () => {
    const res = await fetch("/api/payouts-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: link?.token ?? "" }),
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as { clientSecret?: unknown; publishableKey?: unknown; error?: unknown }
    const clientSecret = typeof data.clientSecret === "string" ? data.clientSecret : ""
    const publishableKey = typeof data.publishableKey === "string" ? data.publishableKey : ""
    if (!res.ok || !clientSecret.startsWith("accs_") || !publishableKey.startsWith("pk_")) {
      /* The server's sentence says what to do; only Stripe's wire is kept out (lib/payments/verify-id). It used to drop any sentence naming Stripe. */
      throw new Error(typeof data.error === "string" && data.error.trim() && !readsLikeStripe(data.error) ? data.error : "Try again in a moment.")
    }
    return { clientSecret, publishableKey }
  }, [link])

  const title = link?.form === "bank" ? "Payout account" : "Set up payouts"

  return (
    <main className="min-h-[100dvh] bg-white" data-payouts-sheet="">
      <header className="sticky top-0 z-10 border-b border-[#f1f2f4] bg-white/95 px-5 pb-3 pt-[max(env(safe-area-inset-top),14px)]">
        <h1 className="text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</h1>
      </header>
      {link === undefined ? null : link === null ? (
        <Note title="This link has run out" body="Tap Done at the top, then Set up payouts again in Storelib." />
      ) : finished ? (
        <Note done title="All set" body="Tap Done at the top to go back to Storelib." />
      ) : (
        <div className="mx-auto w-full max-w-[560px] pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
          <StripeConnectEmbedded
            className="w-full px-3"
            purpose={link.form === "bank" ? "stripe_management" : "stripe_onboarding"}
            collection={link.form === "bank" ? BANK_COLLECTION : SETUP_COLLECTION}
            session={session}
            /* Stripe's script starts loading beside the signed session, not after it (components/app/settings/stripe-connect-warm). */
            publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
            failedTitle="Couldn't load the form"
            onExit={() => setFinished(true)}
          />
        </div>
      )}
    </main>
  )
}

function Note({ title, body, done = false }: { title: string; body: string; done?: boolean }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center">
      {done ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
          <CheckCircle2 className="h-7 w-7" strokeWidth={2} />
        </span>
      ) : null}
      <h2 className="mt-5 text-[20px] font-semibold text-[#1a1a2e]">{title}</h2>
      <p className="mt-2 max-w-[320px] text-[15px] leading-6 text-[#6b7280]">{body}</p>
    </div>
  )
}
