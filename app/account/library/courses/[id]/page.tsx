import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { loadCoursePlayer } from "@/lib/courses/load"
import { CoursePlayer } from "@/components/courses/course-player"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Course" }

interface CoursePageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lesson?: string }>
}

/**
 * The course player. Who may open it, and which lessons they may watch, is
 * decided on the server from the signed in person's own id (lib/courses/
 * load.ts): the creator, a buyer, or, for a published course with free
 * preview lessons, anybody, who sees those and the rest locked. Every
 * lesson's video is asked for separately and checked again
 * (app/api/courses/lessons/[id]/play), so nothing on this page is a way in.
 */
export default async function CoursePage({ params, searchParams }: CoursePageProps) {
  const [{ id }, { lesson }] = await Promise.all([params, searchParams])
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const load = await loadCoursePlayer(createAdminClient(), user.id, id, lesson ?? null)
  if (load.state === "not-found") notFound()
  if (load.state === "locked") redirect(load.productHref ?? "/account/library/courses")
  return <CoursePlayer data={load.data} />
}
