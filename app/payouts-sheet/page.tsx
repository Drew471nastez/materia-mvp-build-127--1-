import type { Metadata, Viewport } from "next"
import { PayoutsSheet } from "./payouts-sheet"

/**
 * STRIPE'S PAYOUT SETUP, IN THE APPS' BROWSER SHEET. The iOS and Android apps
 * open this page in the system's browser sheet over the app (Payouts, Set up
 * payouts): Storelib's frame around Stripe's embedded form. Outside /app,
 * because the sheet has no sign in; the signed link in the #fragment says
 * whose account it is (lib/payments/stripe/app-sheet-link.ts).
 */
export const dynamic = "force-static"

export const metadata: Metadata = {
  title: "Set up payouts",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" }

export default function PayoutsSheetPage() {
  return <PayoutsSheet />
}
