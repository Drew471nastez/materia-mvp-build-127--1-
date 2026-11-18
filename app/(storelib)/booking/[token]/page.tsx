import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { readManageToken } from "@/lib/bookings/manage-token"
import { ManageBooking } from "./manage-booking"

export const dynamic = "force-dynamic"

/**
 * /booking/<token>, from the visitor's confirmation email (round AR): their
 * booking, with Change time and Cancel. No sign in: the token is the
 * booking id signed by the server (lib/bookings/manage-token.ts), and a
 * token that fails its signature is a 404. Never indexed, and the address
 * is not sent on as a Referer.
 */
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let valid: string | null = null
  try {
    valid = readManageToken(token)
  } catch {
    valid = null
  }
  if (!valid) notFound()
  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] sm:pt-16">
      <div className="mx-auto w-full max-w-[480px]">
        <ManageBooking token={token} />
      </div>
    </main>
  )
}
