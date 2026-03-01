import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { NativeAuthGate } from "@/components/native-auth-gate"

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <NativeAuthGate>
    <div className="min-h-svh bg-[#fafafa]">
      <PurchaseSyncProvider />
      <DashboardSidebar />

      {/* Main content column — sits next to sidebar on desktop */}
      <div className="flex min-h-svh flex-col md:ml-64">
        {/* Content area — body scrolls naturally (no internal scroll container) */}
        <main
          className="flex-1 pt-14 md:pt-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="px-4 py-6 sm:px-6 md:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </main>
      </div>
    </div>
    </NativeAuthGate>
  )
}
