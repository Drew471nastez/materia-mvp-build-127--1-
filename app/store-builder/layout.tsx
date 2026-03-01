import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { NativeAuthGate } from "@/components/native-auth-gate"

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

  // ── Access gates ───────────────────────────────────────────────────────
  const { data: gateCheck } = await supabase
    .from("profiles")
    .select("email_verified, is_creator, welcome_completed")
    .eq("id", user.id)
    .maybeSingle()

  // Gate 1: email must be verified
  if (!gateCheck?.email_verified) {
    redirect(`/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`)
  }

  // Gate 2: role must be selected
  const roleSelected = gateCheck.is_creator === true || gateCheck.welcome_completed === true
  if (!roleSelected) {
    redirect("/signup/success")
  }

  const { data: creator } = await supabase.from("creators").select("slug").eq("user_id", user.id).single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Full-screen layout without dashboard sidebar
  return <NativeAuthGate>{children}</NativeAuthGate>
}
