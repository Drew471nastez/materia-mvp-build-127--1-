import { redirect } from "next/navigation"

/**
 * Payments is a TAB in Settings, not a page, the same as Billing: this route
 * stays so a bookmark, an email link or a return from a payment provider
 * lands on it. Stripe's card for a creator on Stripe, Storelib Payments'
 * hub for a creator on Airwallex (components/app/settings/payments-hub).
 */
export default function PaymentsPage() {
  redirect("/app/settings?tab=payments")
}
