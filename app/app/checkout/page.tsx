import { Suspense } from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import CheckoutClient from "./CheckoutClient"

// iOS App Store compliance (Guideline 3.1.1):
// Any in-app checkout flow using external payment methods is not permitted on
// the iOS App Store. Detect Capacitor iOS builds and redirect away.
async function isCapacitorIOS(): Promise<boolean> {
  const headersList = await headers()
  const ua = headersList.get("user-agent") || ""
  const isCapacitor = /StorelibApp|Capacitor/.test(ua)
  const isAndroid = /Android/.test(ua)
  return isCapacitor && !isAndroid
}

export default async function CheckoutPage() {
  if (await isCapacitorIOS()) {
    redirect("/app")
  }

  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutClient />
    </Suspense>
  )
}

function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-[#2b2b2b] text-white flex items-center justify-center">
      <div className="text-sm opacity-70">Loading checkout…</div>
    </div>
  )
}
