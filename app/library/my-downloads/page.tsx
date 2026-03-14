import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, ArrowRight, Download, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DownloadsGrid } from "@/components/library/downloads-grid"
import { getLibraryDownloads } from "@/lib/library/get-library-downloads"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyDownloadsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-neutral-400" />
          <h3 className="mt-4 font-semibold text-neutral-900">Please sign in</h3>
          <p className="mt-1 text-sm text-neutral-500">Sign in to access your downloads.</p>
          <Button asChild className="mt-4 bg-neutral-900 text-white hover:bg-black">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  const downloads = await getLibraryDownloads(user.id)

  return (
    <div className="max-w-5xl mx-auto space-y-5 px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Page header card — matches library main page visual language */}
      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 flex items-center justify-center shadow-sm shrink-0">
              <Download className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-600" />
            </div>
            <Link
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-8 sm:mt-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">My Downloads</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {downloads.length} {downloads.length === 1 ? "product" : "products"} purchased
          </p>
        </div>
      </section>

      {downloads.length > 0 ? (
        <DownloadsGrid items={downloads} />
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <Download className="mx-auto h-12 w-12 text-neutral-400" />
          <h3 className="mt-4 text-lg font-bold text-neutral-900">No downloads yet</h3>
          <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
            Digital products you purchase will appear here for instant download.
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
