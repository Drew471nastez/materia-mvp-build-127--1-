"use client"

/**
 * Apple Pay and Google Pay inside the iOS and Android app.
 *
 * The webview cannot draw Stripe's own wallet buttons: the frame they need
 * navigates the whole app away (lib/stripe-nav-guard.ts). Stripe's hosted
 * checkout, opened in the in-app browser, can. The card form under these
 * stays in the app. Both buttons open the same page; that page shows
 * whichever wallet this phone actually has.
 */
import * as React from "react"
import { Browser } from "@capacitor/browser"

type WalletAnswer = { url?: string; sessionId?: string; error?: string }

export function NativeWalletButtons({
  busy,
  disabled,
  start,
  onPaid,
  onError,
}: {
  busy: boolean
  disabled: boolean
  /** Creates the hosted checkout and returns its address and session id. */
  start: () => Promise<WalletAnswer>
  onPaid: (paymentIntentId: string, clientSecret: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [opening, setOpening] = React.useState<"apple" | "google" | null>(null)
  const sessionRef = React.useRef<string | null>(null)
  const finishing = React.useRef(false)

  const finishIfPaid = React.useCallback(async () => {
    const id = sessionRef.current
    if (!id || finishing.current) return
    finishing.current = true
    try {
      const res = await fetch(`/api/checkout/wallet-status?session_id=${encodeURIComponent(id)}`)
      const data = (await res.json().catch(() => ({}))) as { paid?: boolean; paymentIntentId?: string; clientSecret?: string }
      if (data.paid && data.paymentIntentId && data.clientSecret) {
        sessionRef.current = null
        await onPaid(data.paymentIntentId, data.clientSecret)
      }
    } catch {
      /* The webhook still makes the order. Closing the browser is not a failure. */
    } finally {
      finishing.current = false
      setOpening(null)
    }
  }, [onPaid])

  React.useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null
    void Browser.addListener("browserFinished", () => {
      void finishIfPaid()
    }).then((h) => {
      handle = h
    }).catch(() => null)
    return () => {
      void handle?.remove()
    }
  }, [finishIfPaid])

  const open = async (which: "apple" | "google") => {
    if (busy || disabled || opening) return
    onError(null)
    setOpening(which)
    try {
      const answer = await start()
      if (!answer.url || !answer.sessionId) throw new Error(answer.error || "Apple Pay and Google Pay could not be opened. Nothing was charged.")
      sessionRef.current = answer.sessionId
      await Browser.open({ url: answer.url, presentationStyle: "popover" })
    } catch (e) {
      setOpening(null)
      onError(e instanceof Error ? e.message : "Apple Pay and Google Pay could not be opened. Nothing was charged.")
    }
  }

  const button = (which: "apple" | "google", label: string) => (
    <button
      type="button"
      onClick={() => void open(which)}
      disabled={busy || disabled || !!opening}
      data-native-wallet={which}
      className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] bg-black text-[15px] font-medium text-white [-webkit-tap-highlight-color:transparent] active:bg-[#1a1a1a] disabled:opacity-60"
    >
      {opening === which ? "Opening" : label}
    </button>
  )

  return (
    <div className="mb-4" data-native-wallets="">
      <div className="flex gap-2">
        {button("apple", "Apple Pay")}
        {button("google", "Google Pay")}
      </div>
      <p className="mt-3 text-center text-[12px] font-medium tracking-wide text-[#9ca3af]">OR</p>
    </div>
  )
}
