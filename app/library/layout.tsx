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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username")
    .eq("id", user.id)
    .maybeSingle()

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User"
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  const email = user.email || ""

  return (
    <div className="flex min-h-[100dvh] bg-[#fafafa]">
      <PurchaseSyncProvider />
      <DashboardSidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-h-[100dvh] md:ml-64">
        {/* Top header bar — hidden on mobile (sidebar has mobile header) */}
        <header className="hidden md:flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-8 shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <div className="text-right mr-2">
              <p className="text-sm font-medium text-neutral-900 leading-tight">{displayName}</p>
              <p className="text-xs text-neutral-500 leading-tight">{email}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-neutral-200 overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-neutral-900 text-white text-sm font-semibold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main
          className="flex-1 overflow-y-auto pt-14 md:pt-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="px-4 py-6 sm:px-6 md:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
