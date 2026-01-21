import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Apply rounded favicon (8px border radius) to all marketing pages */}
      <DynamicFavicon />

      <Suspense fallback={null}>
        <ConditionalHeader />
      </Suspense>

      <main className="flex-1">{children}</main>

      <Suspense fallback={null}>
        <ConditionalFooter />
      </Suspense>
    </div>
  )
}
