import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { loadMyCourses } from "@/lib/courses/load"
import { CoursesIndex } from "@/components/courses/courses-index"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Courses" }

/**
 * Every course the signed in buyer owns, from every creator, with how far
 * through each one they are and where Continue goes (lib/courses/load.ts
 * loadMyCourses). Filtering by creator and by progress happens in the page.
 */
export default async function CoursesPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null
  const courses = await loadMyCourses(createAdminClient(), user.id)
  return <CoursesIndex courses={courses} />
}
