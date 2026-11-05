import { personName } from "@/lib/profile/display-name"
import { permanentRedirect, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CREATOR_WITH_PROFILE, PROFILE_CARD, attachCreatorProfiles } from "@/lib/security/public-columns"

interface CreatorPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CreatorPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: creator } = await supabase
    .from("creators")
    .select(CREATOR_WITH_PROFILE)
    .eq("slug", slug)
    .single()

  if (!creator) {
    return { title: "Creator Not Found" }
  }
  const [face] = await attachCreatorProfiles(supabase, [creator as typeof creator & { profile?: { display_name?: string | null } | null }])

  return {
    title: personName({ name: face?.profile?.display_name, slug: (creator as { slug?: string | null }).slug }),
    description: creator.headline || creator.bio || "Check out this creator on Storelib",
  }
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Find creator by slug and get their username
  const { data: found } = await supabase
    .from("creators")
    .select("user_id")
    .eq("slug", slug)
    .single()
  /* Their username is on their profile, its own read: creators.user_id points at auth.users, so a profile cannot be embedded here. */
  const [creator] = found ? await attachCreatorProfiles(supabase, [found as { user_id?: string | null; profile?: { username?: string | null } | null }]) : [null]

  if (creator?.profile?.username) {
    /* The old address of a creator's page, moved for good: a 308, so a search
       engine moves what it knows to /<username>. */
    permanentRedirect(`/${creator.profile.username}`)
  }

  // Fallback to the slug as username. A guess, not a known move, so it stays temporary.
  redirect(`/${slug}`)

  // Fetch creator with profile
  // const { data: creator } = await supabase
  //   .from("creators")
  //   .select("*, profile:profiles!creators_user_id_fkey(*)")
  //   .eq("slug", slug)
  //   .single()

  // if (!creator) {
  //   notFound()
  // }

  // await trackStoreView(creator.id)

  // // Fetch published products
  // const { data: products } = await supabase
  //   .from("products")
  //   .select(
  //     `
  //     *,
  //     creator:creators!products_creator_id_fkey(
  //       *,
  //       profile:profiles!creators_user_id_fkey(*)
  //     )
  //   `,
  //   )
  //   .eq("creator_id", creator.id)
  //   .eq("status", "published")
  //   .order("created_at", { ascending: false })

  // // Count customers (unique buyers)
  // const { count: customersCount } = await supabase
  //   .from("entitlements")
  //   .select("buyer_id", { count: "exact", head: true })
  //   .eq("creator_id", creator.id)

  // const initials = creator.profile?.display_name
  //   ?.split(" ")
  //   .map((n: string) => n[0])
  //   .join("")
  //   .toUpperCase()

  // return (
  //   <div className="mx-auto max-w-4xl px-4 py-12">
  //     {/* Creator Header */}
  //     <div className="flex flex-col items-center text-center">
  //       <Avatar className="h-24 w-24">
  //         <AvatarImage src={creator.profile?.avatar_url || undefined} alt={creator.profile?.display_name || ""} />
  //         <AvatarFallback className="text-2xl">{initials || "?"}</AvatarFallback>
  //       </Avatar>
  //       <h1 className="mt-4 text-2xl font-semibold">{creator.profile?.display_name || "Creator"}</h1>
  //       {creator.headline && <p className="mt-1 text-muted-foreground">{creator.headline}</p>}

  //       {creator.niche_tags && creator.niche_tags.length > 0 && (
  //         <div className="mt-4 flex flex-wrap justify-center gap-2">
  //           {creator.niche_tags.map((tag: string) => (
  //             <Badge key={tag} variant="secondary">
  //               {tag}
  //             </Badge>
  //           ))}
  //         </div>
  //       )}

  //       {creator.bio && <p className="mt-6 max-w-xl text-sm text-muted-foreground">{creator.bio}</p>}

  //       {/* Stats */}
  //       <div className="mt-6 flex gap-8">
  //         <div className="flex items-center gap-2 text-sm text-muted-foreground">
  //           <Package className="h-4 w-4" />
  //           <span>{products?.length || 0} products</span>
  //         </div>
  //         <div className="flex items-center gap-2 text-sm text-muted-foreground">
  //           <Users className="h-4 w-4" />
  //           <span>{customersCount || 0} customers</span>
  //         </div>
  //       </div>
  //     </div>

  //     {/* Products Grid */}
  //     <div className="mt-12">
  //       <h2 className="mb-6 text-xl font-semibold">Products</h2>
  //       {products && products.length > 0 ? (
  //         <div className="grid gap-6 sm:grid-cols-2">
  //           {products.map((product) => (
  //             <ProductCard key={product.id} product={product} />
  //           ))}
  //         </div>
  //       ) : (
  //         <div className="rounded-lg border border-dashed border-border p-12 text-center">
  //           <p className="text-muted-foreground">No products published yet.</p>
  //         </div>
  //       )}
  //     </div>

  //     {/* Community Preview (Locked) */}
  //     <div className="mt-12">
  //       <h2 className="mb-6 text-xl font-semibold">Community</h2>
  //       <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
  //         <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
  //         <p className="mt-4 font-medium">Members only</p>
  //         <p className="mt-1 text-sm text-muted-foreground">
  //           Purchase a product with community access to join the conversation.
  //         </p>
  //       </div>
  //     </div>
  //   </div>
  // )
}
