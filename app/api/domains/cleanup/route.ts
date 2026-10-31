import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { matchesSecret } from "@/lib/api/require-secret"
import { removeDomainHosts } from "@/lib/custom-domains/vercel"

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
    /* The shared factory: every request carries a deadline (lib/net/deadline.ts). */
    const supabase = createAdminClient()

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
      /* Unless it was connected again since (by anybody): then it is still in use. */
      const { data: inUse } = await supabase.from("custom_domains").select("id").eq("domain", redirect.domain).maybeSingle()
      if (!inUse) {
        // Every host it had on the project: www and the bare name, or the subdomain itself
        await removeDomainHosts(redirect.domain)
      }

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
