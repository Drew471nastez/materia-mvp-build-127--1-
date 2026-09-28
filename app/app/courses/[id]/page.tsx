import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

/** A course is edited in the product editor, lessons and all. */
export default async function CourseEditPage({ params }: Props) {
  const { id } = await params
  redirect(`/app/products/${encodeURIComponent(id)}`)
}
