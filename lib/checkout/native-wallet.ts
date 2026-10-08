"use client"

/**
 * ===========================================================================
 *  APPLE PAY AND GOOGLE PAY, THE PHONE'S OWN SHEET, INSIDE THE APP
 * ===========================================================================
 * A page in the app's WebView cannot show either wallet: iOS turns Apple Pay
 * off in any WebView that injects scripts (Capacitor's bridge is one), and
 * Android's WebView has no Google Pay for pages. Stripe's native plugin
 * (@capacitor-community/stripe, registered by the app as "Stripe") shows the
 * real wallet sheet over the app and confirms the same PaymentIntent the card
 * form uses, with no bottom sheet and no Stripe page.
 *
 * Reached through the bridge by name, so nothing of it is in the web bundle,
 * and asked for only when the app says it has it: an app build without the
 * plugin answers null and the checkout keeps its other way to pay.
 */
import { Capacitor, registerPlugin } from "@capacitor/core"

export type NativeWallet = "apple" | "google"

interface SummaryItem {
  label: string
  amount: number
}

interface StripeNative {
  initialize(o: { publishableKey: string }): Promise<void>
  isApplePayAvailable(): Promise<void>
  createApplePay(o: { paymentIntentClientSecret: string; paymentSummaryItems: SummaryItem[]; merchantIdentifier: string; countryCode: string; currency: string }): Promise<void>
  presentApplePay(): Promise<{ paymentResult: string }>
  isGooglePayAvailable(): Promise<void>
  createGooglePay(o: { paymentIntentClientSecret: string; paymentSummaryItems: SummaryItem[]; merchantIdentifier: string; countryCode: string; currency: string }): Promise<void>
  presentGooglePay(): Promise<{ paymentResult: string }>
}

const Stripe = registerPlugin<StripeNative>("Stripe")

/** The Apple Pay merchant id the app is signed for (Xcode, Signing & Capabilities, Apple Pay). */
const APPLE_MERCHANT_ID = process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID || "merchant.com.storelib.app"

let ready: Promise<NativeWallet | null> | null = null

/** Which wallet this phone can pay with through the app, or null (no plugin in this build, no card in the wallet, not the app). */
export function nativeWallet(): Promise<NativeWallet | null> {
  ready ??= (async () => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Stripe")) return null
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) return null
    try {
      await Stripe.initialize({ publishableKey: key })
      if (Capacitor.getPlatform() === "ios") {
        await Stripe.isApplePayAvailable()
        return "apple"
      }
      if (Capacitor.getPlatform() === "android") {
        await Stripe.isGooglePayAvailable()
        return "google"
      }
    } catch {
      /* Not set up on this phone: the checkout's other way stays. */
    }
    return null
  })()
  return ready
}

/** Shows the wallet's own sheet for a PaymentIntent. "paid", "cancelled", or throws with what went wrong. */
export async function payWithNativeWallet(
  wallet: NativeWallet,
  o: { clientSecret: string; amountCents: number; label: string; currency?: string; countryCode?: string },
): Promise<"paid" | "cancelled"> {
  const currency = (o.currency || "usd").toLowerCase()
  const countryCode = o.countryCode || "US"
  const paymentSummaryItems = [{ label: o.label, amount: Math.round(o.amountCents) / 100 }]
  if (wallet === "apple") {
    await Stripe.createApplePay({ paymentIntentClientSecret: o.clientSecret, paymentSummaryItems, merchantIdentifier: APPLE_MERCHANT_ID, countryCode, currency })
    const { paymentResult } = await Stripe.presentApplePay()
    if (/completed/i.test(paymentResult)) return "paid"
    if (/cancel/i.test(paymentResult)) return "cancelled"
    throw new Error("Apple Pay did not go through. Nothing was charged.")
  }
  await Stripe.createGooglePay({ paymentIntentClientSecret: o.clientSecret, paymentSummaryItems, merchantIdentifier: "Storelib", countryCode, currency })
  const { paymentResult } = await Stripe.presentGooglePay()
  if (/completed/i.test(paymentResult)) return "paid"
  if (/cancel/i.test(paymentResult)) return "cancelled"
  throw new Error("Google Pay did not go through. Nothing was charged.")
}
