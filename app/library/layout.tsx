import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"

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
    <div className="min-h-[100dvh] bg-background overflow-x-hidden overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <PurchaseSyncProvider />
      <DashboardSidebar />
      <main className="min-h-[100dvh] pt-14 md:ml-64 md:pt-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="px-4 py-6 sm:px-6 md:px-8 pb-[env(safe-area-inset-bottom)]">{children}</div>
      </main>
    </div>
  )
}
