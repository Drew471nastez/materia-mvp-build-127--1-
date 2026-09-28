import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CommunityFeed } from "@/components/app/community-feed"
import { pageUser } from "@/lib/auth/page-user"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

export default async function CommunityPage() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const { data: creator } = await createAdminClient().from("creators").select("*").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  const { data: posts } = await supabase
    .from("community_posts")
    .select(`*, author:profiles!community_posts_author_id_fkey(${PROFILE_CARD})` as const)
    .eq("creator_id", creator.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  return <CommunityFeed creatorId={creator.id} userId={user.id} posts={posts || []} isCreator={true} />
}
