import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CoursePlayer } from "@/components/dashboard/course-player"

interface CourseAccessPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lesson?: string }>
}

export default async function CourseAccessPage({ params, searchParams }: CourseAccessPageProps) {
  const { id } = await params
  const { lesson: lessonId } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Check entitlement
  const { data: entitlement } = await supabase
    .from("entitlements")
    .select(
      `
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `,
    )
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .single()

  if (!entitlement) notFound()

  // Fetch course with modules and lessons
  const { data: course } = await supabase.from("courses").select("*").eq("product_id", id).single()

  if (!course) notFound()

  const { data: modules } = await supabase
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
