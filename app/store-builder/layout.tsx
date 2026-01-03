import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function StoreBuilderLayout({
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

  const { data: creator } = await supabase.from("creators").select("slug").eq("user_id", user.id).single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Full-screen layout without dashboard sidebar
  return <>{children}</>
}
