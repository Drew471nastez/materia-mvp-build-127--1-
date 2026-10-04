import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getLibraryDownloads } from "@/lib/library/get-library-downloads"
import { getLibraryExtras } from "@/lib/library/library-extras"
import { assembleLibrary } from "@/lib/library/library-view"
import { LibrarySplashInit } from "@/components/library/splash-init"
import { LibraryHome } from "@/components/library/library-home"
import { currentUserForRequest } from "@/lib/auth/request-scope"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface LibraryPageProps {
  searchParams: Promise<{ purchase?: string; highlight?: string }>
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const { purchase, highlight } = await searchParams

  /**
   * The layout wrapping this page already asked who is signed in. This is the
   * same answer, not a second request. See lib/auth/request-scope.ts.
   */
  const { user } = await currentUserForRequest()

  if (!user) {
    /* The layout's gate restores an app session in the browser; a browser with none is sent to sign in there. */
    return (
      <div className="rounded-2xl border border-[#e4e7ec]/80 bg-white px-6 py-12 text-center">
        <p className="text-[16px] font-semibold text-[#1a1a2e]">Sign in to see your library</p>
        <Link href="/login?redirect=/library" className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white">
          Sign in
        </Link>
      </div>
    )
  }

  const supabase = await createClient()

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE READS, ASKED FOR AT ONCE
    ═══════════════════════════════════════════════════════════════════════
    What they own and its files (three waves deep), everything else the
    library shows about those purchases (two waves: orders, reviews and
    sellers, lib/library/library-extras), and the wishlist count, which
    the empty library points at. None waits for another, so the page waits
    for the slowest, not the sum. The profile row is the account page's
    now (/account); this page no longer draws the buyer's own face.
  */
  const [downloads, extras, { count: wishlistCount }] = await Promise.all([
    getLibraryDownloads(user.id),
    getLibraryExtras(user.id),
    /* Only what is still on sale, as the wishlist itself lists (app/api/wishlist): an archived or deleted product is not counted. */
    supabase
      .from("wishlist_items")
      .select("id, products!inner(status)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("products.status", "published"),
  ])

  const { items, creators } = assembleLibrary(downloads, extras)

  return (
    <div>
      <LibrarySplashInit />
      <LibraryHome
        items={items}
        creators={creators}
        highlight={highlight || null}
        purchased={purchase === "success"}
        toReview={items.filter((i) => i.canReview).length}
        wishlistCount={wishlistCount || 0}
      />
    </div>
  )
}
