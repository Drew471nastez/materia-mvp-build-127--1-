import type { Metadata, Viewport } from "next"
import { VerifyIdOnPhone } from "@/components/app/settings/verify-id-phone"

/*
 * Verify ID on a phone, opened from the QR code setup shows on a computer.
 * The token in the address is the only key (lib/payments/stripe/id-handoff.ts):
 * the page works without signing in, and can only add photos of that ID.
 */
export const metadata: Metadata = {
  title: "Verify your ID | Storelib",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <VerifyIdOnPhone token={token} />
}
