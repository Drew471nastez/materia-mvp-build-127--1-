import { NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { matchesSecret } from "@/lib/api/require-secret"

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

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

/**
 * Cleanup expired domain redirects.
 * Called by a cron job to detach old domains from Vercel after the grace period.
 * Protected by a secret key to prevent unauthorized access.
 */
export async function POST(request: Request) {
  // Verify cron secret
  const { secret } = await request.json().catch(() => ({ secret: null }))
  const cronSecret = process.env.CRON_SECRET || process.env.DOMAIN_CLEANUP_SECRET

  /* Fails closed: with neither variable set this used to skip the check and
     serve the route to anyone who posted to it. */
  if (!cronSecret || !matchesSecret(secret, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 })
  }

  try {
    const supabase = createServiceClient(supabaseUrl, supabaseKey)

    // Find all expired redirects (grace period has passed)
    const { data: expiredRedirects, error: fetchError } = await supabase
      .from("domain_redirects")
      .select("id, domain")
      .lt("keep_until", new Date().toISOString())

    if (fetchError) {
      console.error("Error fetching expired redirects:", fetchError)
      return NextResponse.json({ error: "Failed to fetch expired redirects" }, { status: 500 })
    }

    if (!expiredRedirects || expiredRedirects.length === 0) {
      return NextResponse.json({ message: "No expired redirects to clean up", cleaned: 0 })
    }

    let cleaned = 0
    for (const redirect of expiredRedirects) {
      // Remove both apex and www from Vercel
      await removeDomainFromVercel(redirect.domain)
      await removeDomainFromVercel(`www.${redirect.domain}`)

      // Delete the redirect entry
      await supabase
        .from("domain_redirects")
        .delete()
        .eq("id", redirect.id)

      cleaned++
    }

    return NextResponse.json({ message: `Cleaned up ${cleaned} expired domain redirects`, cleaned })
  } catch (error) {
    console.error("Domain cleanup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
