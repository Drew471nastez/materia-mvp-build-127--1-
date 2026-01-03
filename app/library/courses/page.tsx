import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { GraduationCap, ArrowLeft } from "lucide-react"

export default async function LibraryCoursesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", user!.id)
    .order("created_at", { ascending: false })

  const courses = entitlements?.filter((e) => e.product?.type === "course") || []

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/library"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
        <p className="text-muted-foreground">{courses.length} courses</p>
      </div>

      {courses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((e) => (
            <Link
              key={e.id}
              href={`/library/courses/${e.product_id}`}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
            >
              <div className="relative aspect-video bg-muted">
                {e.product?.thumbnail_url ? (
                  <Image
                    src={e.product.thumbnail_url || "/placeholder.svg"}
                    alt={e.product.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium group-hover:text-primary">{e.product?.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  by {(e.creator?.profile as { display_name?: string })?.display_name || "Creator"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Acquired {new Date(e.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No courses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Explore and enroll in courses.</p>
        </div>
      )}
    </div>
  )
}
