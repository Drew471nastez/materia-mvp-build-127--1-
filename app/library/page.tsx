import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowRight, CheckCircle, Download, Heart, Package } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DownloadsGrid } from "@/components/library/downloads-grid"
import { getLibraryDownloads } from "@/lib/library/get-library-downloads"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface LibraryPageProps {
  searchParams: Promise<{ purchase?: string; highlight?: string }>
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const { purchase, highlight } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">Please sign in</h3>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your library.</p>
          <Button asChild className="mt-4">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  const downloads = await getLibraryDownloads(user.id)

  const { count: wishlistCount } = await supabase
    .from("wishlist_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  return (
    <div className="px-2 sm:px-0">
      {purchase === "success" && (
        <Alert className="mb-6 border-green-500/50 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Purchase successful!</AlertTitle>
          <AlertDescription>Your purchase is complete. You now have access to your new content below.</AlertDescription>
        </Alert>
      )}

      <section className="mb-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">My Library</h1>
        <p className="mt-1 text-sm text-neutral-500">Overview of your purchased products and saved items.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link href="/library/my-downloads" className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-600">My Downloads</p>
              <Download className="h-4 w-4 text-neutral-500" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-neutral-900">{downloads.length}</p>
            <p className="text-xs text-neutral-500">Digital products purchased</p>
          </Link>

          <Link href="/library/wishlist" className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-600">Wishlist</p>
              <Heart className="h-4 w-4 text-neutral-500" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-neutral-900">{wishlistCount || 0}</p>
            <p className="text-xs text-neutral-500">Products you saved</p>
          </Link>
        </div>
      </section>

      {downloads.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">My Downloads</h2>
            <Link href="/library/my-downloads" className="inline-flex items-center text-sm font-medium text-neutral-600 hover:text-neutral-900">
              View all <ArrowRight className="ml-1 h-4 w-4" />
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
          <h3 className="mt-4 text-lg font-semibold text-neutral-900">No purchases yet</h3>
          <p className="mt-1 text-sm text-neutral-500">Explore creators and discover products you&apos;ll love.</p>
          <Button asChild className="mt-4 bg-violet-600 text-white hover:bg-violet-700">
            <Link href="/explore">
              Explore products <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
