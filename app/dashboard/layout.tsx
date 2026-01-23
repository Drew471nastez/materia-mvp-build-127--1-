import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"

export default async function DashboardLayout({
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <DashboardSidebar />
      <main className="min-h-screen pt-14 md:ml-64 md:pt-0">
        <div className="px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </main>
    </div>
  )
}
