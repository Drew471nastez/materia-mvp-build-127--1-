/**
 * A course's curriculum as its product page draws it
 * (components/courses/course-outline.tsx), for scripts/check-course-outline.mjs:
 * two modules, a free preview with a video, a preview that stopped being
 * one since the page was cached, and lessons with and without a length.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CourseOutline } from "@/components/courses/course-outline"

const modules = [
  {
    id: "m1",
    title: "Getting started",
    lessons: [
      { id: "00000000-0000-4000-8000-000000000001", title: "Welcome, and what you will make", duration_seconds: 245, is_preview: true },
      { id: "00000000-0000-4000-8000-000000000002", title: "The kit list", duration_seconds: null, is_preview: false },
      { id: "00000000-0000-4000-8000-000000000003", title: "Setting up the camera", duration_seconds: 912, is_preview: false },
    ],
  },
  {
    id: "m2",
    title: "Shooting in low light, handheld, without a flash or a tripod",
    lessons: [
      { id: "00000000-0000-4000-8000-000000000004", title: "Reading the light", duration_seconds: 1830, is_preview: true },
      { id: "00000000-0000-4000-8000-000000000005", title: "A long lesson title that has to wrap on a phone without pushing the time off the row", duration_seconds: 3725, is_preview: false },
    ],
  },
]

createRoot(document.getElementById("app")!).render(
  <div className="min-h-svh bg-white">
    <div className="mx-auto max-w-[760px] px-4 py-8">
      <CourseOutline modules={modules} />
    </div>
  </div>,
)
