/**
 * The Library's courses (components/courses/courses-index.tsx) with three
 * courses in their three states, for scripts/check-community-round26.mjs.
 */
import { createRoot } from "react-dom/client"
import { CoursesIndex } from "@/components/courses/courses-index"
import type { MyCourse } from "@/lib/courses/types"

function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${ground}"/><circle cx="470" cy="120" r="50" fill="${ink}" opacity="0.55"/><path d="M0 300 L220 180 L380 270 L520 210 L640 270 L640 360 L0 360Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const creator = (id: string, name: string) => ({ id, name, avatarUrl: null, storeHref: null })
const course = (o: Partial<MyCourse> & Pick<MyCourse, "productId" | "title" | "status" | "percent" | "completed" | "total">): MyCourse =>
  ({ thumbnailUrl: null, creator: creator("cr1", "Ana Popescu"), totalSeconds: 5400, resume: null, ...o }) as unknown as MyCourse

const courses: MyCourse[] = [
  course({ productId: "p1", title: "Trimming feet that look made", status: "in_progress", percent: 42, completed: 5, total: 12, thumbnailUrl: picture("#f3e7dc", "#c96f3b"), resume: { lessonId: "l6", number: 6, title: "A foot ring in one pass" } as never }),
  course({ productId: "p2", title: "Glazes from scratch: cone 6 in a small studio", status: "not_started", percent: 0, completed: 0, total: 9, thumbnailUrl: picture("#e3ecf2", "#3f6f8f"), creator: creator("cr2", "Jonas Berg") }),
  course({ productId: "p3", title: "Throwing bowls", status: "completed", percent: 100, completed: 8, total: 8, thumbnailUrl: picture("#ecebe3", "#6b6a3a") }),
]

createRoot(document.getElementById("app")!).render(
  <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6">
    <CoursesIndex courses={courses} />
  </div>,
)
