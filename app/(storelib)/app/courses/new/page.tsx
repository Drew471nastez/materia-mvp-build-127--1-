import { redirect } from "next/navigation"

/** A new course is a new product that starts with lessons instead of files (app/app/products/new/course-editor.tsx). */
export default function NewCoursePage() {
  redirect("/app/products/new?type=course")
}
