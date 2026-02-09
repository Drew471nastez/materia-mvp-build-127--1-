import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator record
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get invoices for the creator
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select(`
        *,
        subscriptions (
          plan_id,
          subscription_plans (
            name
          )
        )
      `)
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError)
      return NextResponse.json(
        { error: "Failed to fetch invoices" },
        { status: 500 }
      )
    }

    return NextResponse.json({ invoices: invoices || [] })
  } catch (error: any) {
    console.error("Error in GET /api/billing/invoices:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
