import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  /* The bar Storelib is set to in /admin, like every other page with this header; these three were always dark. */
  const buyerHeaderLight = await isBuyerHeaderLight()
  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden">
      <Suspense fallback={null}><ConditionalHeader buyerHeaderLight={buyerHeaderLight} /></Suspense>
      <main className="flex-1">{children}</main>
      <Suspense fallback={null}><ConditionalFooter /></Suspense>
    </div>
  )
}
