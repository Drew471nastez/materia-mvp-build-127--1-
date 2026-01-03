import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PaymentsContent } from "@/components/app/payments-content"

export default async function PaymentsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle()

  if (!creator) redirect("/onboarding")

  return <PaymentsContent creator={creator} />
}
