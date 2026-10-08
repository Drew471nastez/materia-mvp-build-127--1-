import type { Metadata } from "next"
import { CheckCircle2 } from "lucide-react"

/**
 * WHERE STRIPE SENDS THE PHONE APP'S SHEET BACK TO. Payout setup and the ID
 * check run on Stripe's page in the sheet that slides over the app
 * (components/app/settings/stripe-connect-embedded.tsx, lib/payments/
 * identity-client.ts). That sheet is the system browser's, without the
 * app's sign in, so this page is outside /app: an /app address there was
 * sent to the log in page. Setup behind the sheet is already asking Stripe
 * how it went, and closes the sheet itself once Stripe is satisfied, so this
 * page only says the creator can go back.
 */
export const dynamic = "force-static"

export const metadata: Metadata = {
  title: "Back to Storelib",
  robots: { index: false, follow: false },
}

export default function StripeDonePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-8 text-center" data-stripe-done="">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
        <CheckCircle2 className="h-7 w-7" strokeWidth={2} />
      </span>
      <h1 className="mt-5 text-[20px] font-semibold text-[#1a1a2e]">You can go back to Storelib</h1>
      <p className="mt-2 max-w-[320px] text-[15px] leading-6 text-[#6b7280]">Tap Done at the top. Your payout setup carries on there.</p>
    </main>
  )
}
