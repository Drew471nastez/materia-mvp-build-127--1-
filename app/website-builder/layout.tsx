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
    /*
      `fixed inset-0`, for the same reason the editor's own root is: an
      `h-svh` wrapper is content, and the body's safe-area padding sits
      underneath it, making the document taller than the screen by the
      home indicator. Pinned to the viewport it adds no height at all.
    */
    <div className="fixed inset-0 overflow-hidden bg-background">
      {children}
      <Toaster position="bottom-right" />
    </div>
  )
}
