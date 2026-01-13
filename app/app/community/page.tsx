import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CommunityFeed } from "@/components/app/community-feed"

export default async function CommunityPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  const { data: posts } = await supabase
    .from("community_posts")
    .select("*, author:profiles!community_posts_author_id_fkey(*)")
    .eq("creator_id", creator.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  return <CommunityFeed creatorId={creator.id} userId={user.id} posts={posts || []} isCreator={true} />
}
