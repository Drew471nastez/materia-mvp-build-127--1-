import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Resolve a custom domain to a creator's username
 * Used server-side for routing custom domain requests to the correct store/OnePage
 */
export async function resolveCustomDomain(domain: string): Promise<{
  username: string
  creatorId: string
} | null> {
  try {
    const supabase = createAdminClient()

    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id")
      .eq("domain", domain.toLowerCase())
      .in("status", ["active", "ssl_provisioning"])
      .single()

    if (!domainRecord) return null

    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    if (!profile?.username) return null

    return {
      username: profile.username,
      creatorId: domainRecord.creator_id,
    }
  } catch (error) {
    console.error("resolveCustomDomain error:", error)
    return null
  }
}

/**
 * Get active custom domain for a creator
 * Used to display the custom domain in settings/sharing UI
 */
export async function getCreatorCustomDomain(creatorId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient()

    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("domain")
      .eq("creator_id", creatorId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    return domainRecord?.domain || null
  } catch (error) {
    console.error("getCreatorCustomDomain error:", error)
    return null
  }
}
