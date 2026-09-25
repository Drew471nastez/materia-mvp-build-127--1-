import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isMissingColumn } from "@/lib/custom-domains/store"

// GET - Resolve a custom domain to a username (used in server-side rendering)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get("domain")

    if (!domain) {
      return NextResponse.json({ error: "Domain parameter required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Strip www. prefix for lookup - domains are stored without www
    const lookupDomain = domain.toLowerCase().replace(/^www\./, "")

    // Look up the domain - match active or ssl_provisioning (DNS is verified for both)
    let { data: domainRecord, error: lookupError } = await supabase
      .from("custom_domains")
      .select("creator_id, domain, status, purpose")
      .eq("domain", lookupDomain)
      .in("status", ["active", "ssl_provisioning"])
      .maybeSingle()
    /* Before the purpose column exists every domain is a website domain. */
    if (lookupError && isMissingColumn(lookupError)) {
      ;({ data: domainRecord } = await supabase
        .from("custom_domains")
        .select("creator_id, domain, status")
        .eq("domain", lookupDomain)
        .in("status", ["active", "ssl_provisioning"])
        .maybeSingle() as never)
    }

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
      purpose: (domainRecord as { purpose?: string }).purpose === "creator_page" ? "creator_page" : "website",
    })
  } catch (error) {
    console.error("Domain resolve error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
