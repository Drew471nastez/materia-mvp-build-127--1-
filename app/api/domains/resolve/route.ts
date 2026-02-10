import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET - Resolve a custom domain to a username (used in server-side rendering)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get("domain")

    if (!domain) {
      return NextResponse.json({ error: "Domain parameter required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Look up the domain
    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id, domain, status")
      .eq("domain", domain.toLowerCase())
      .eq("status", "active")
      .single()

    if (!domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }

    // Get the creator's username
    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    if (!profile?.username) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({
      username: profile.username,
      domain: domainRecord.domain,
      creatorId: domainRecord.creator_id,
    })
  } catch (error) {
    console.error("Domain resolve error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
