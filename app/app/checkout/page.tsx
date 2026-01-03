import { Suspense } from "react"
import CheckoutClient from "./CheckoutClient"

export default function CheckoutPage() {
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
