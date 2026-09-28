import { CoursesSkeleton } from "@/components/library/library-skeletons"
import { TAB_SKELETON } from "../loading"

/** The list's shape while it is read (components/courses/courses-index.tsx). */
export default function CoursesLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <CoursesSkeleton />
    </div>
  )
}
