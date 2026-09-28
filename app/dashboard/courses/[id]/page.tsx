import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProduct } from "@/lib/library/owned-products"
import { CoursePlayer } from "@/components/dashboard/course-player"
import { pageUser } from "@/lib/auth/page-user"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

interface CourseAccessPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lesson?: string }>
}

export default async function CourseAccessPage({ params, searchParams }: CourseAccessPageProps) {
  const { id } = await params
  const { lesson: lessonId } = await searchParams
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  // Check entitlement
  const { data: read } = await supabase
    .from("entitlements")
    .select(
      `
      *,
      product:products(*),
      creator:creators(${CREATOR_WITH_PROFILE})
    `,
    )
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .single()

  if (!read) notFound()

  /*
    A COURSE THE CREATOR HAS SINCE ARCHIVED IS STILL THEIRS. The course, its
    modules and its lessons are readable under row level security only
    through a PUBLISHED product (or by its creator), so an archived course
    read as not found for the people who paid for it. The entitlement above
    is the buyer's own, read with their session; once it is there, the
    product and the course are read with the server's client
    (lib/library/owned-products).
  */
  const admin = createAdminClient()
  const entitlement = (await fillOwnedProduct(admin, read))!

  // Fetch course with modules and lessons
  const { data: course } = await admin.from("courses").select("*").eq("product_id", id).single()

  if (!course) notFound()

  const { data: modules } = await admin
    .from("course_modules")
    .select("*, lessons:course_lessons(*)")
    .eq("course_id", course.id)
    .order("position")

  const sortedModules =
    modules?.map((m) => ({
      ...m,
      lessons: m.lessons?.sort((a: { position: number }, b: { position: number }) => a.position - b.position) || [],
    })) || []

  // Get progress
  const { data: progress } = await supabase.from("course_progress").select("*").eq("buyer_id", user.id)

  const progressMap = new Map(progress?.map((p) => [p.lesson_id, p]) || [])

  // Find current lesson
  let currentLesson = null
  if (lessonId) {
    for (const module of sortedModules) {
      const found = module.lessons.find((l: { id: string }) => l.id === lessonId)
      if (found) {
        currentLesson = found
        break
      }
    }
  }

  // Default to first lesson
  if (!currentLesson && sortedModules.length > 0 && sortedModules[0].lessons.length > 0) {
    currentLesson = sortedModules[0].lessons[0]
  }

  return (
    <CoursePlayer
      product={entitlement.product!}
      creator={entitlement.creator!}
      modules={sortedModules}
      currentLesson={currentLesson}
      progressMap={progressMap}
      userId={user.id}
      communityAccess={entitlement.community_access}
    />
  )
}
