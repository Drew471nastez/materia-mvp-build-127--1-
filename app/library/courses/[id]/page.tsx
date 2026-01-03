import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import { CoursePlayer } from "@/components/dashboard/course-player"

interface CourseAccessPageProps {
  params: Promise<{ id: string }>
}

export default async function CourseAccessPage({ params }: CourseAccessPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .single()

  if (!entitlement) notFound()

  const { data: course } = await supabase.from("courses").select("id").eq("product_id", id).single()

  const modules: Array<{
    id: string
    title: string
    position: number
    lessons: Array<{
      id: string
      title: string
      video_url: string | null
      content_text: string | null
      position: number
    }>
  }> = []

  if (course) {
    const { data: courseModules } = await supabase
      .from("course_modules")
      .select("id, title, position")
      .eq("course_id", course.id)
      .order("position")

    if (courseModules) {
      for (const module of courseModules) {
        const { data: lessons } = await supabase
          .from("course_lessons")
          .select("id, title, video_url, content_text, position")
          .eq("module_id", module.id)
          .order("position")

        modules.push({
          ...module,
          lessons: lessons || [],
        })
      }
    }
  }

  const { data: progress } = await supabase
    .from("course_progress")
    .select("lesson_id, completed")
    .eq("buyer_id", user.id)

  const completedLessonIds = new Set(progress?.filter((p) => p.completed).map((p) => p.lesson_id) || [])

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/library/courses"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to courses
        </Link>
        <h1 className="text-2xl font-semibold">{entitlement.product?.title}</h1>
        <p className="text-muted-foreground">
          by {(entitlement.creator?.profile as { display_name?: string })?.display_name || "Creator"}
        </p>
      </div>

      <CoursePlayer modules={modules} completedLessonIds={completedLessonIds} userId={user.id} />
    </div>
  )
}
