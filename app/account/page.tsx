import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { readNewsletter } from "@/lib/account/preferences"
import { getProductInternalPath } from "@/lib/url-helpers"
import { AccountPage, type WishlistPreview } from "@/components/account/account-page"

export const dynamic = "force-dynamic"

/** How many saved products the wishlist row shows before "See all". */
const WISHLIST_PREVIEW = 4

/** The sign in methods an account has, by the name a person knows them by. */
const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" }

/**
 * Everything the account page shows, read in one round of requests: the
 * profile, the creator row (selling or not), the newsletter and the
 * recommendations choice, and the newest saved products with how many there
 * are. Each on the person's own client where row level security answers,
 * and the newsletter with the service role because its table is closed to
 * browsers (app/app/settings/_server.ts reads it the same way).
 */
export default async function AccountRoute() {
  const user = await pageUser("/login?next=%2Faccount")
  /* Supabase did not answer in time: the layout's gate recovers the session
     in the browser (lib/auth/page-user.ts). */
  if (!user) return null

  const supabase = await createClient()
  const [profile, creator, newsletter, personalized, saved] = await Promise.all([
    profileForRequest(user.id),
    creatorForRequest(user.id),
    readNewsletter(createAdminClient(), user.email, user.user_metadata?.storelib_newsletter === true).catch(() => false),
    (async () => {
      const { data } = await supabase.from("profiles").select("personalized_recommendations").eq("id", user.id).maybeSingle()
      const column = (data as { personalized_recommendations?: boolean } | null)?.personalized_recommendations
      /* A column not there yet reads the choice kept on the account, and on without one (app/api/account/preferences). */
      return typeof column === "boolean" ? column : user.user_metadata?.personalized_recommendations !== false
    })().catch(() => true),
    /* Only what is still on sale, as the wishlist itself lists it (app/api/wishlist). */
    supabase
      .from("wishlist_items")
      .select("id, products!inner(id, title, slug, thumbnail_url, status, creators(slug))", { count: "exact" })
      .eq("user_id", user.id)
      .eq("products.status", "published")
      .order("created_at", { ascending: false })
      .limit(WISHLIST_PREVIEW),
  ])

  type SavedRow = { id: string; products: { id: string; title: string | null; slug: string | null; thumbnail_url: string | null; creators: { slug: string | null } | null } | null }
  const wishlist: WishlistPreview = {
    count: saved.count ?? 0,
    items: ((saved.data ?? []) as unknown as SavedRow[]).flatMap((row) =>
      row.products?.slug
        ? [{
            id: row.products.id,
            title: row.products.title || "Product",
            thumbnail: row.products.thumbnail_url,
            href: getProductInternalPath(row.products.slug, row.products.creators?.slug || undefined),
          }]
        : [],
    ),
  }

  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter(Boolean) as string[]
  /* An account that has only ever signed in with Google or Apple has no password to change; it can set one. */
  const hasPassword = providers.length === 0 || providers.includes("email")
  const via = providers.filter((p) => p !== "email").map((p) => PROVIDER_NAMES[p] ?? p).join(" or ")

  return (
    <AccountPage
      userId={user.id}
      email={user.email || ""}
      name={profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || ""}
      avatarUrl={profile?.avatar_url || null}
      createdAt={user.created_at}
      hasPassword={hasPassword}
      via={via}
      /* SELLER ACCESS: a finished seller onboarding, the same fact the
         header reads to show Dashboard (components/platform/platform-header-
         client.tsx). Point this at lib/account/seller-access.ts once it is in. */
      isSeller={creator?.onboarding_completed === true}
      newsletter={newsletter}
      personalized={personalized}
      wishlist={wishlist}
    />
  )
}
