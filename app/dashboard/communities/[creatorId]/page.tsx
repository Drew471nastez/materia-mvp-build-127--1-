import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CommunityFeed } from "@/components/app/community-feed"
import { pageUser } from "@/lib/auth/page-user"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

interface CommunityPageProps {
  params: Promise<{ creatorId: string }>
}

export default async function CommunityPage({ params }: CommunityPageProps) {
  const { creatorId } = await params
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  // Check entitlement
  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("*")
    .eq("buyer_id", user.id)
    .eq("creator_id", creatorId)
    .eq("community_access", true)
    .limit(1)
    .single()

  if (!entitlement) notFound()

  // Fetch creator
  const { data: creator } = await supabase
    .from("creators")
    .select(CREATOR_WITH_PROFILE)
    .eq("id", creatorId)
    .single()

  if (!creator) notFound()

  // Fetch posts
  const { data: posts } = await supabase
    .from("community_posts")
    .select(`*, author:profiles!community_posts_author_id_fkey(${PROFILE_CARD})` as const)
    .eq("creator_id", creatorId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  return (
    <div>
      <div className="border-b border-border bg-muted/30 px-8 py-6">
        <h1 className="text-xl font-semibold">{(creator.profile as unknown as { display_name?: string | null } | null)?.display_name || "Creator"}&apos;s Community</h1>
        {creator.headline && <p className="mt-1 text-muted-foreground">{creator.headline}</p>}
      </div>
      <CommunityFeed creatorId={creatorId} userId={user.id} posts={posts || []} isCreator={false} />
    </div>
  )
}
