import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProducts } from "@/lib/library/owned-products"
import { GraduationCap, PlayCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

export default async function DashboardCoursesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(
      `
      *,
      product:products(*),
      creator:creators(${CREATOR_WITH_PROFILE})
    `,
    )
    .eq("buyer_id", user!.id)

  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  const owned = await fillOwnedProducts(createAdminClient(), entitlements)
  const courses = owned.filter((e) => e.product?.type === "course") || []

  // Get progress for each course
  const { data: progress } = await supabase
    .from("course_progress")
    .select("lesson_id, completed")
    .eq("buyer_id", user!.id)

  const completedLessons = new Set(progress?.filter((p) => p.completed).map((p) => p.lesson_id) || [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
        <p className="text-muted-foreground">Continue learning where you left off</p>
      </div>

      {courses.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/courses/${e.product_id}`}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border/80"
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <PlayCircle className="h-12 w-12 text-white" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-medium group-hover:text-primary">{e.product?.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">by {e.creator?.profile?.display_name || "Creator"}</p>
                <div className="mt-3">
                  <Badge variant="secondary" className="text-xs">
                    In progress
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No courses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Courses you enroll in will appear here.</p>
        </div>
      )}
    </div>
  )
}
