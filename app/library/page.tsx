import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppAvatar } from "@/components/app/app-avatar"
import { ArrowRight, CheckCircle, Download, Heart, Package, Settings, ShoppingBag } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DownloadsGrid } from "@/components/library/downloads-grid"
import { getLibraryDownloads } from "@/lib/library/get-library-downloads"
import { LibrarySplashInit } from "@/components/library/splash-init"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface LibraryPageProps {
  searchParams: Promise<{ purchase?: string; highlight?: string }>
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const { purchase, highlight } = await searchParams
  const supabase = await createClient()

  /**
   * The layout wrapping this page already asked who is signed in. This is the
   * same answer, not a second request. See lib/auth/request-scope.ts.
   */
  const { user } = await currentUserForRequest()

  if (!user) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-neutral-400" />
          <h3 className="mt-4 font-semibold text-neutral-900">Please sign in</h3>
          <p className="mt-1 text-sm text-neutral-500">Sign in to access your library.</p>
          <Button asChild className="mt-4 bg-neutral-900 text-white hover:bg-black">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     THREE INDEPENDENT READS, ASKED FOR AT ONCE
    ═══════════════════════════════════════════════════════════════════════
    The downloads, the profile and the wishlist count each need only the user
    id, and each was awaited after the last, so the page waited for the sum of
    three round trips when it only ever had to wait for the longest. On a
    `force-dynamic` route with no cache in front of it, every visit pays that.

    lib/library/get-library-downloads had the same shape inside it and has
    been flattened too, so the slowest of these is now two queries deep rather
    than five in a line. The profile read is the one the layout already made.
  */
  const [downloads, profile, { count: wishlistCount }] = await Promise.all([
    getLibraryDownloads(user.id),
    profileForRequest(user.id),
    /* Only what is still on sale, as the wishlist itself lists (app/api/wishlist): an archived or deleted product is not counted. */
    supabase
      .from("wishlist_items")
      .select("id, products!inner(status)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("products.status", "published"),
  ])

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User"
  /* The profile's photo only (lib/account/avatar): a removed photo stays removed. */
  const avatarUrl = profile?.avatar_url || null
  const email = user.email || ""

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      <LibrarySplashInit />
      {purchase === "success" && (
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800 rounded-xl">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Purchase successful!</AlertTitle>
          <AlertDescription>Your purchase is complete. You now have access to your new content below.</AlertDescription>
        </Alert>
      )}

      {/* Profile header card */}
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="h-24 sm:h-28 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />

        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {/* Avatar overlapping banner */}
          <div className="flex items-end justify-between -mt-8 sm:-mt-10 mb-4">
            {/*
              The shared avatar: any host loads, a photo that fails becomes
              the letters, and a buyer with no name at all gets a plain person
              rather than an empty circle. One letter was all it drew before.
            */}
            <AppAvatar
              src={avatarUrl}
              name={(displayName || "").trim()}
              alt=""
              size={80}
              sizedByClass
              markWhileLoading
              className="h-16 w-16 border-4 border-white shadow-sm sm:h-20 sm:w-20"
            />
            <Link
              href="/library/settings"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 sm:py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-10 sm:mt-0"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">{displayName}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{email}</p>
        </div>
      </section>

      {/* Stats row */}
      <section className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-3">
        <Link
          href="/library/my-downloads"
          className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 transition-all hover:border-neutral-300 hover:shadow-sm group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-neutral-100 flex items-center justify-center group-hover:bg-neutral-200 transition-colors">
              <Download className="h-4 w-4 text-neutral-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-2xl font-bold text-neutral-900">{downloads.length}</p>
          <p className="text-xs text-neutral-500 mt-0.5">Downloads</p>
        </Link>

        <Link
          href="/library/wishlist"
          className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 transition-all hover:border-neutral-300 hover:shadow-sm group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-neutral-100 flex items-center justify-center group-hover:bg-neutral-200 transition-colors">
              <Heart className="h-4 w-4 text-neutral-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-2xl font-bold text-neutral-900">{wishlistCount || 0}</p>
          <p className="text-xs text-neutral-500 mt-0.5">Wishlist</p>
        </Link>

        {/* Explore tab */}
          <Link
            href="/explore"
            className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 transition-all hover:border-neutral-300 hover:shadow-sm group col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-neutral-100 flex items-center justify-center group-hover:bg-neutral-200 transition-colors">
                <ShoppingBag className="h-4 w-4 text-neutral-600" />
              </div>
              <ArrowRight className="h-4 w-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-sm font-semibold text-neutral-900">Explore</p>
            <p className="text-xs text-neutral-500 mt-0.5">Discover products</p>
          </Link>
      </section>

      {/* Recent downloads */}
      {downloads.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-neutral-900">Recent Purchases</h2>
            <Link
              href="/library/my-downloads"
              className="inline-flex items-center text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              View all
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          <DownloadsGrid
            items={downloads.slice(0, 6).map((item) => ({
              ...item,
              highlight: highlight === item.productId,
            }))}
          />
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-neutral-400" />
          <h3 className="mt-4 text-lg font-bold text-neutral-900">No purchases yet</h3>
          <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
            Explore creators and discover digital products you&apos;ll love.
          </p>
            <Button asChild className="mt-4 bg-neutral-900 text-white hover:bg-black">
              <Link href="/explore">
                Explore products <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
      )}
    </div>
  )
}
