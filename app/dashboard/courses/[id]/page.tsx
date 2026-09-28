import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lesson?: string }>
}

/**
 * The course player lives at /library/courses/<id> now (app/library/courses/[id]).
 * Receipts and emails sent before the move still link here, so this sends
 * them on, with the lesson they asked for.
 */
export default async function DashboardCoursePage({ params, searchParams }: Props) {
  const [{ id }, { lesson }] = await Promise.all([params, searchParams])
  const q = lesson && /^[0-9a-f-]{36}$/i.test(lesson) ? `?lesson=${lesson}` : ""
  redirect(`/library/courses/${encodeURIComponent(id)}${q}`)
}
