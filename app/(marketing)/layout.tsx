import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden">
      <BodyScrollRestorer />
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
