import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppAvatar } from "@/components/app/app-avatar"
import { Users, ArrowRight } from "lucide-react"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

export default async function DashboardCommunitiesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(
      `
      *,
      creator:creators(${CREATOR_WITH_PROFILE})
    `,
    )
    .eq("buyer_id", user!.id)
    .eq("community_access", true)

  // Get unique creators (in case multiple products from same creator)
  const uniqueCreators = new Map()
  entitlements?.forEach((e) => {
    if (e.creator && !uniqueCreators.has(e.creator.id)) {
      uniqueCreators.set(e.creator.id, e.creator)
    }
  })

  const communities = Array.from(uniqueCreators.values())

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Communities</h1>
        <p className="text-muted-foreground">Connect with creators and other members</p>
      </div>

      {communities.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((creator) => {
            return (
              <Link
                key={creator.id}
                href={`/dashboard/communities/${creator.id}`}
                className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80"
              >
                {/* Photo, else initials, else a plain person. Never a "?". */}
                <AppAvatar
                  src={creator.profile?.avatar_url}
                  name={(creator.profile?.display_name || "").trim()}
                  alt=""
                  size={48}
                  tone="theme"
                  markWhileLoading
                />
                <div className="flex-1">
                  <h3 className="font-medium group-hover:text-primary">
                    {creator.profile?.display_name || "Creator"}&apos;s Community
                  </h3>
                  {creator.headline && <p className="mt-0.5 text-sm text-muted-foreground">{creator.headline}</p>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No communities yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Purchase products with community access to join the conversation.
          </p>
        </div>
      )}
    </div>
  )
}
