import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"

// GET - List creator's domains
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const { data: domains, error } = await supabase
      .from("custom_domains")
      .select("*")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching domains:", error)
      return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
    }

    return NextResponse.json({ domains: domains || [] })
  } catch (error) {
    console.error("Domains GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Add a new custom domain
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

    // Clean and validate domain
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "").trim()

    if (!cleanDomain || !cleanDomain.includes(".") || cleanDomain.length < 4) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 })
    }

    // Block storelib.com subdomains
    if (cleanDomain.endsWith(".storelib.com") || cleanDomain === "storelib.com") {
      return NextResponse.json({ error: "Cannot add storelib.com domains" }, { status: 400 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Check if domain is already taken
    const { data: existingDomain } = await supabase
      .from("custom_domains")
      .select("id, creator_id")
      .eq("domain", cleanDomain)
      .maybeSingle()

    if (existingDomain) {
      if (existingDomain.creator_id === creator.id) {
        return NextResponse.json({ error: "You already added this domain" }, { status: 400 })
      }
      return NextResponse.json({ error: "This domain is already connected to another account" }, { status: 400 })
    }

    // Generate verification token
    const verificationToken = `storelib-verify-${crypto.randomBytes(16).toString("hex")}`

    const { data: newDomain, error } = await supabase
      .from("custom_domains")
      .insert({
        creator_id: creator.id,
        domain: cleanDomain,
        status: "pending",
        verification_token: verificationToken,
      })
      .select()
      .single()

    if (error) {
      console.error("Error adding domain:", error)
      return NextResponse.json({ error: "Failed to add domain" }, { status: 500 })
    }

    return NextResponse.json({ domain: newDomain })
  } catch (error) {
    console.error("Domains POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a custom domain
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { domainId } = await request.json()

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const { error } = await supabase
      .from("custom_domains")
      .delete()
      .eq("id", domainId)
      .eq("creator_id", creator.id)

    if (error) {
      console.error("Error removing domain:", error)
      return NextResponse.json({ error: "Failed to remove domain" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Domains DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
