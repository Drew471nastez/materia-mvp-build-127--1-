import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar } from "@/components/app/sidebar"

export default async function AppLayout({
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

  // Check if user is a creator and get their profile data
  const { data: creator } = await supabase
    .from("creators")
    .select("slug, display_name, avatar_url")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/onboarding")
  }

  return (
    <div className="min-h-svh overflow-x-hidden">
      <AppSidebar
        creatorSlug={creator.slug}
        displayName={creator.display_name || creator.slug}
        avatarUrl={creator.avatar_url}
      />
      <main className="min-h-svh pt-14 md:pl-64 md:pt-0">
        <div className="min-h-[calc(100svh-3.5rem)] md:min-h-svh px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </main>
    </div>
  )
}
