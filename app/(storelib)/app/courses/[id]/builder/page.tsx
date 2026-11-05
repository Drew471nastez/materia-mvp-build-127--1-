import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

/** The lessons are the product editor's Lessons card now (app/app/products/new/course-editor.tsx). */
export default async function CourseBuilderPage({ params }: Props) {
  const { id } = await params
  redirect(`/app/products/${encodeURIComponent(id)}`)
}
