/**
 * The course player (components/courses/course-player.tsx) and the courses
 * list (components/courses/courses-index.tsx) for scripts/check-course-player.mjs:
 * the real components with fixture courses from two creators. The probe
 * answers the lesson and progress routes and serves a real video with Range
 * support, so what plays here is what plays on the site.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CoursePlayer } from "@/components/courses/course-player"
import { CoursesIndex } from "@/components/courses/courses-index"
import type { MyCourse, PlayerData } from "@/lib/courses/types"

const mode = (window as unknown as { __MODE?: string }).__MODE ?? "player"

const lesson = (id: string, moduleId: string, title: string, extra: Partial<PlayerData["modules"][number]["lessons"][number]> = {}) => ({
  id,
  moduleId,
  title,
  durationSeconds: 60,
  isPreview: false,
  kind: "video" as const,
  notes: null,
  attachments: [],
  hasCaptions: true,
  locked: false,
  ...extra,
})

const L = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`

const player: PlayerData = {
  productId: "11111111-1111-4111-8111-111111111111",
  courseId: "22222222-2222-4222-8222-222222222222",
  title: "Watercolour from the first wash to a finished landscape",
  thumbnailUrl: "/__img/thumb-a.jpg",
  productHref: "/ana/watercolour",
  creator: { name: "Ana Ruiz", avatarUrl: null, storeHref: "/ana" },
  modules: [
    {
      id: "m1",
      title: "Getting set up",
      lessons: [
        lesson(L(1), "m1", "Welcome, and what you need", { isPreview: true }),
        lesson(L(2), "m1", "Paper, brushes and the three paints that do everything", {
          notes: "Everything on the list is in the PDF below.\n\nBuy 300gsm cold pressed paper. https://example.com/paper",
          attachments: [
            { id: "a1", name: "Supply list.pdf", size: 184_000 },
            { id: "a2", name: "Colour chart template.pdf", size: 2_400_000 },
          ],
        }),
        lesson(L(3), "m1", "Stretching paper so it stays flat"),
      ],
    },
    {
      id: "m2",
      title: "Washes",
      lessons: [lesson(L(4), "m2", "Flat wash"), lesson(L(5), "m2", "Graded wash"), lesson(L(6), "m2", "Wet on wet skies", { durationSeconds: 1265 })],
    },
    { id: "m3", title: "A finished landscape", lessons: [lesson(L(7), "m3", "Sketching the scene"), lesson(L(8), "m3", "Layering and the last details", { durationSeconds: 2410 })] },
  ],
  progress: [
    { lessonId: L(1), completedAt: "2026-09-20T10:00:00Z", positionSeconds: 60, durationSeconds: 60, updatedAt: null },
    { lessonId: L(2), completedAt: null, positionSeconds: 12, durationSeconds: 60, updatedAt: null },
  ],
  initialLessonId: L(2),
  access: "owner",
  emailsOff: false,
}

const courses: MyCourse[] = [
  {
    productId: "p1",
    title: "Watercolour from the first wash to a finished landscape",
    thumbnailUrl: "/__img/thumb-a.jpg",
    creator: { id: "c1", name: "Ana Ruiz", avatarUrl: null, storeHref: "/ana" },
    total: 8,
    completed: 3,
    percent: 37,
    status: "in_progress",
    totalSeconds: 7400,
    lastOpenedAt: "2026-09-27T10:00:00Z",
    purchasedAt: "2026-09-01T10:00:00Z",
    resume: { lessonId: L(4), title: "Flat wash", number: 4 },
  },
  {
    productId: "p2",
    title: "Lightroom presets, and editing a whole shoot in an hour",
    thumbnailUrl: "/__img/thumb-b.jpg",
    creator: { id: "c2", name: "Marco Bellini", avatarUrl: null, storeHref: "/marco" },
    total: 12,
    completed: 12,
    percent: 100,
    status: "completed",
    totalSeconds: 16200,
    lastOpenedAt: "2026-09-10T10:00:00Z",
    purchasedAt: "2026-08-01T10:00:00Z",
    resume: { lessonId: "x", title: "Import", number: 1 },
  },
  {
    productId: "p3",
    title: "Portrait lighting with one window",
    thumbnailUrl: null,
    creator: { id: "c2", name: "Marco Bellini", avatarUrl: null, storeHref: "/marco" },
    total: 6,
    completed: 0,
    percent: 0,
    status: "not_started",
    totalSeconds: 3000,
    lastOpenedAt: null,
    purchasedAt: "2026-09-25T10:00:00Z",
    resume: { lessonId: "y", title: "The window", number: 1 },
  },
]

function Shell({ children }: { children: React.ReactNode }) {
  /* The library layout's container (app/(storelib)/library/layout.tsx). */
  return (
    <div className="min-h-svh bg-[#fafafa]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Shell>{mode === "index" ? <CoursesIndex courses={courses} /> : <CoursePlayer data={player} />}</Shell>)
