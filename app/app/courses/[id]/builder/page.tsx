import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CourseBuilder } from "@/components/app/course-builder"
import { pageUser } from "@/lib/auth/page-user"

interface CourseBuilderPageProps {
  params: Promise<{ id: string }>
}

export default async function CourseBuilderPage({ params }: CourseBuilderPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .eq("type", "course")
    .single()

  if (!product) notFound()

  const { data: course } = await supabase.from("courses").select("*").eq("product_id", product.id).single()

  if (!course) notFound()

  const { data: modules } = await supabase
    .from("course_modules")
    .select("*, lessons:course_lessons(*)")
    .eq("course_id", course.id)
    .order("position")

  // Sort lessons by position
  const sortedModules =
    modules?.map((m) => ({
      ...m,
      lessons: m.lessons?.sort((a: { position: number }, b: { position: number }) => a.position - b.position) || [],
    })) || []

  return <CourseBuilder product={product} course={course} modules={sortedModules} />
}
