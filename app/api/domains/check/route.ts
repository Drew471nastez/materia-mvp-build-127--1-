import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST - Check if a domain is available to claim
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { domain } = await request.json()

    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 })
    }

    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "").trim()

    if (!cleanDomain || !cleanDomain.includes(".") || cleanDomain.length < 4) {
      return NextResponse.json({ available: false, error: "Invalid domain format" })
    }

    // Block storelib.com subdomains
    if (cleanDomain.endsWith(".storelib.com") || cleanDomain === "storelib.com") {
      return NextResponse.json({ available: false, error: "Cannot use storelib.com domains" })
    }

    // Check if domain is already taken in our system
    const { data: existingDomain } = await supabase
      .from("custom_domains")
      .select("id, creator_id, status")
      .eq("domain", cleanDomain)
      .maybeSingle()

    if (existingDomain) {
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (creator && existingDomain.creator_id === creator.id) {
        return NextResponse.json({ available: false, owned: true, error: "You already own this domain" })
      }
      return NextResponse.json({ available: false, error: "Domain is already connected to another account" })
    }

    return NextResponse.json({ available: true, domain: cleanDomain })
  } catch (error) {
    console.error("Domain check error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
