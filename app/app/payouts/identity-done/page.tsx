import { CheckCircle2 } from "lucide-react"

/**
 * WHERE STRIPE'S OWN ID CHECK SENDS SOMEBODY BACK TO. In the phone app the
 * check runs on Stripe's page in the in-app browser sheet; when it is done
 * Stripe comes here, and the sheet is closed by hand or by the app. Setup
 * behind it is already asking Stripe how it went, so this page only has to
 * say it is finished and be calm about it.
 *
 * Nothing is read or decided here: whether Stripe is satisfied is Stripe's
 * answer, read by the form (/api/payments/identity-status).
 */
export const dynamic = "force-static"

export default function IdentityDonePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
        <CheckCircle2 className="h-7 w-7" strokeWidth={2} />
      </span>
      <h1 className="mt-5 text-[20px] font-semibold text-[#1a1a2e]">That is sent</h1>
      <p className="mt-2 max-w-[320px] text-[15px] leading-6 text-[#6b7280]">
        Stripe is checking your ID. You can close this and go back to Storelib; we will tell you the moment it is done.
      </p>
    </main>
  )
}
