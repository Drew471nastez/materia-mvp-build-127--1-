import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Toaster } from "sonner"

// Full-screen layout for Website Builder editor & code editor pages.
// No app sidebar — the editor has its own top bar.
export default async function WebsiteBuilderEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="h-svh overflow-hidden bg-background">
      {children}
      <Toaster position="bottom-right" />
    </div>
  )
}
