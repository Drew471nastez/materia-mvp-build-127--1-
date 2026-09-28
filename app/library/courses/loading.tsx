import { CoursesSkeleton } from "@/components/library/library-skeletons"
import { TAB_SKELETON } from "../loading"

/**
 * The list's shape while it is read (components/courses/courses-index.tsx):
 * the progress filter, the count line, then rows in the library's card. No
 * heading block: "Library" above the pills is the only heading, so the
 * skeleton does not draw one that the loaded screen then takes away.
 */
export default function CoursesLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <CoursesSkeleton />
    </div>
  )
}
