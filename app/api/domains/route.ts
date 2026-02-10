import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

/**
 * Add a domain to Vercel project so it can serve traffic
 */
async function addDomainToVercel(domain: string): Promise<{ success: boolean; error?: string }> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    console.warn("Vercel token or project ID not configured, skipping Vercel domain registration")
    return { success: true } // Don't block domain addition if Vercel not configured
  }

  try {
    const url = VERCEL_TEAM_ID
      ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
      : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    })

    if (res.ok) {
      return { success: true }
    }

    const data = await res.json()

    // Domain already exists on this project - that's fine
    if (data.error?.code === "domain_already_in_use" || data.error?.code === "DOMAIN_ALREADY_IN_USE") {
      return { success: true }
    }

    console.error("Vercel domain add error:", data)
    return { success: false, error: data.error?.message || "Failed to register domain with hosting" }
  } catch (err) {
    console.error("Vercel API error:", err)
    return { success: true } // Don't block on network errors
  }
}

/**
 * Remove a domain from Vercel project
 */
async function removeDomainFromVercel(domain: string): Promise<void> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return

  try {
    const url = VERCEL_TEAM_ID
      ? `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`
      : `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`

    await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
  } catch (err) {
    console.error("Vercel domain remove error:", err)
  }
}

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

    // Add domain to Vercel project first
    const vercelResult = await addDomainToVercel(cleanDomain)
    if (!vercelResult.success) {
      return NextResponse.json({ error: vercelResult.error || "Failed to register domain" }, { status: 500 })
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
      // Try to clean up Vercel domain if DB insert failed
      await removeDomainFromVercel(cleanDomain)
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

    // Get domain name before deleting (for Vercel cleanup)
    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("domain")
      .eq("id", domainId)
      .eq("creator_id", creator.id)
      .single()

    const { error } = await supabase
      .from("custom_domains")
      .delete()
      .eq("id", domainId)
      .eq("creator_id", creator.id)

    if (error) {
      console.error("Error removing domain:", error)
      return NextResponse.json({ error: "Failed to remove domain" }, { status: 500 })
    }

    // Remove from Vercel project
    if (domainRecord?.domain) {
      await removeDomainFromVercel(domainRecord.domain)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Domains DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
