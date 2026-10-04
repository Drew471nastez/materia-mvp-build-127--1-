import { redirect } from "next/navigation"

/** Courses moved into the library, with the rest of what a buyer owns (app/library/courses). */
export default function DashboardCoursesPage() {
  redirect("/account/library/courses")
}
