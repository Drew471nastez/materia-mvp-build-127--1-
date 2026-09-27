import { NextResponse } from "next/server"
import { domainOwner } from "@/lib/custom-domains/owner"
import { HOSTNAME_PROBLEM_TEXT, cleanHostname, hostnameProblem } from "@/lib/custom-domains/hostname"
import { HOST_RESERVED_SUFFIXES } from "@/lib/custom-domains/targets"
import { getMainDomain } from "@/lib/url-helpers"

// POST - Can this domain be connected? Read only: the same rules POST /api/domains applies.
export async function POST(request: Request) {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner

    const { domain } = (await request.json().catch(() => ({}))) as { domain?: unknown }
    const cleanDomain = cleanHostname(domain)
    const problem = hostnameProblem(cleanDomain, getMainDomain(), HOST_RESERVED_SUFFIXES)
    if (problem) return NextResponse.json({ available: false, error: HOSTNAME_PROBLEM_TEXT[problem] })

    const { data: existingDomain } = await owner.admin
      .from("custom_domains")
      .select("id, creator_id")
      .eq("domain", cleanDomain)
      .maybeSingle()

    if (existingDomain) {
      if ((existingDomain as { creator_id: string }).creator_id === owner.creatorId) {
        return NextResponse.json({ available: false, owned: true, error: "You already connected this domain." })
      }
      return NextResponse.json({ available: false, error: "This domain is connected to another Storelib account." })
    }

    return NextResponse.json({ available: true, domain: cleanDomain })
  } catch (error) {
    console.error("Domain check error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
