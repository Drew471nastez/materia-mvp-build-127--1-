import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CourseEditForm } from "@/components/app/course-edit-form"

interface CourseEditPageProps {
  params: Promise<{ id: string }>
}

export default async function CourseEditPage({ params }: CourseEditPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

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

  return <CourseEditForm product={product} />
}
