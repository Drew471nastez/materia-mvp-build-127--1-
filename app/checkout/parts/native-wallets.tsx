"use client"

/**
 * Apple Pay and Google Pay inside the iOS and Android app.
 *
 * ONE BUTTON, THIS PHONE'S WALLET, IN ITS OWN MARK (round 15). An iPhone shows
 * Apple Pay, an Android phone Google Pay, each as the wallet's own black
 * button with its own logo.
 *
 * THE PHONE'S OWN SHEET when the app carries Stripe's native plugin
 * (lib/checkout/native-wallet.ts): the PaymentIntent is made here and the
 * wallet's sheet confirms it over the app, with no bottom sheet and no Stripe
 * page. An app build without the plugin keeps the earlier way: Stripe's
 * hosted checkout in the in-app browser, which can show the wallet the
 * WebView cannot (lib/stripe-nav-guard.ts).
 */
import * as React from "react"
import { Browser } from "@capacitor/browser"
import { Capacitor } from "@capacitor/core"
import { nativeWallet, payWithNativeWallet, type NativeWallet } from "@/lib/checkout/native-wallet"

type WalletAnswer = { url?: string; sessionId?: string; error?: string }

export function NativeWalletButtons({
  busy,
  disabled,
  start,
  onPaid,
  onError,
  payIntent,
  amountCents,
  label,
}: {
  busy: boolean
  disabled: boolean
  /** Creates the hosted checkout and returns its address and session id. */
  start: () => Promise<WalletAnswer>
  onPaid: (paymentIntentId: string, clientSecret: string) => Promise<void>
  onError: (message: string | null) => void
  /** Makes the PaymentIntent the wallet's own sheet confirms (the card form's). */
  payIntent?: () => Promise<{ clientSecret: string; paymentIntentId: string }>
  amountCents?: number
  /** What the wallet's sheet says it is paying for. */
  label?: string
}) {
  const [opening, setOpening] = React.useState<"apple" | "google" | null>(null)
  /* This phone's wallet: through the app's native plugin when it has it, else null (the hosted page). */
  const [native, setNative] = React.useState<NativeWallet | null>(null)
  React.useEffect(() => {
    let live = true
    void nativeWallet().then((w) => live && setNative(w))
    return () => {
      live = false
    }
  }, [])
  const platform = typeof window === "undefined" ? null : Capacitor.getPlatform()
  const wallet: "apple" | "google" = native ?? (platform === "android" ? "google" : "apple")
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
    if (native && payIntent) {
      try {
        const intent = await payIntent()
        const answer = await payWithNativeWallet(native, { clientSecret: intent.clientSecret, amountCents: amountCents ?? 0, label: label || "Storelib" })
        if (answer === "paid") await onPaid(intent.paymentIntentId, intent.clientSecret)
      } catch (e) {
        onError(e instanceof Error ? e.message : "The payment did not go through. Nothing was charged.")
      } finally {
        setOpening(null)
      }
      return
    }
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

  return (
    <div className="mb-4" data-native-wallets="" data-native-wallet-mode={native ? "sheet" : "page"}>
      <button
        type="button"
        onClick={() => void open(wallet)}
        disabled={busy || disabled || !!opening}
        data-native-wallet={wallet}
        aria-label={wallet === "apple" ? "Pay with Apple Pay" : "Pay with Google Pay"}
        className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-[10px] bg-black text-white [-webkit-tap-highlight-color:transparent] transition-opacity active:opacity-85 disabled:opacity-60"
      >
        {opening === wallet ? <span className="text-[15px] font-medium">Opening</span> : wallet === "apple" ? <ApplePayMark /> : <GooglePayMark />}
      </button>
      <p className="mt-3 text-center text-[12px] font-medium tracking-wide text-[#9ca3af]">OR</p>
    </div>
  )
}

/** Apple Pay's own mark: the Apple logo and "Pay", white on black. */
function ApplePayMark() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" className="-mt-[3px]">
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
      </svg>
      <span className="text-[20px] font-medium leading-none tracking-[-0.01em]">Pay</span>
    </span>
  )
}

/** Google Pay's own mark on its dark button: the four colour G and "Pay". */
function GooglePayMark() {
  return (
    <span className="inline-flex items-center gap-[6px]" aria-hidden>
      <svg viewBox="0 0 48 48" width="19" height="19">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span className="text-[19px] font-medium leading-none">Pay</span>
    </span>
  )
}
