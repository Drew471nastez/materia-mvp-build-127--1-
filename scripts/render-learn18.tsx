/**
 * A program's lesson inside a community, for scripts/check-learn18.mjs: the real ProgramPlayer
 * (components/community/learn/program-page.tsx, the course player embedded) with fixture lessons of every kind, inside a
 * stand in for the community's frame at the width the lesson page has there (shell-frame.tsx: the 1360px frame, the
 * middle across both columns). The bar on top is a grey block of the bar's real height. The probe answers the play and
 * progress routes, serves a real video and a stand in for a YouTube embed, and draws the program's cover in a loud
 * colour so a frame that shows it is easy to see.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProgramPlayer } from "@/components/community/learn/program-page"
import type { PlayerData, PlayerLesson } from "@/lib/courses/types"

const lesson = (id: string, moduleId: string, title: string, kind: PlayerLesson["kind"], extra: Partial<PlayerLesson> = {}): PlayerLesson => ({
  id,
  moduleId,
  title,
  durationSeconds: kind === "text" ? null : 60,
  isPreview: false,
  kind,
  notes: null,
  attachments: [],
  hasCaptions: false,
  locked: false,
  ...extra,
})

const L = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`

const NOTES =
  "Before the first pull, wedge the clay until a cut face shows no air at all. Twenty turns is usually enough.\n\nKeep your elbows on your knees and let the wheel do the work. If the clay wobbles, slow the wheel down before you add pressure, never after.\n\nThe tools I use are in the list below. https://example.com/tools"

export const PLAYER: PlayerData = {
  productId: "prog-1",
  courseId: "course-1",
  title: "Wheel throwing, from clay to cup",
  thumbnailUrl: "/__img/cover.svg",
  productHref: null,
  creator: { name: "Salajan Wood", avatarUrl: null, storeHref: null },
  modules: [
    {
      id: "m1",
      title: "Clay and the wheel",
      lessons: [
        lesson(L(1), "m1", "Lesson 1", "video", { notes: NOTES, attachments: [{ id: "a1", name: "Tool list.pdf", size: 184_000 }] }),
        lesson(L(2), "m1", "Centering, slowly", "video", { notes: "Centering is most of throwing. Take your time with this one." }),
        lesson(L(3), "m1", "Opening the form", "external", { notes: "Watch the whole thing once before you try it." }),
        lesson(L(4), "m1", "A reading list", "text", { notes: NOTES + "\n\n" + NOTES }),
      ],
    },
    {
      id: "m2",
      title: "Trimming",
      lessons: [lesson(L(5), "m2", "Leather hard, explained", "video"), lesson(L(6), "m2", "Feet that look right", "video"), lesson(L(7), "m2", "Your first set of four cups", "video", { durationSeconds: 1265 })],
    },
  ],
  progress: [{ lessonId: L(5), completedAt: "2026-09-20T10:00:00Z", positionSeconds: 60, durationSeconds: 60, updatedAt: null }],
  initialLessonId: L(1),
  access: "owner",
  emailsOff: false,
  contact: false,
}

function Frame({ children }: { children: React.ReactNode }) {
  /* The community's frame around the lesson page (shell-frame.tsx), with the bar as a block of its height. */
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] text-[#1a1a2e] [--community-top:99px] lg:[--community-top:65px]">
      <div className="sticky top-0 z-30 h-[99px] border-b border-[#e8eaee] bg-white lg:h-[65px]" data-probe-bar="" />
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div data-community-place="lesson" className="pb-16 pt-4 lg:pt-6">
          <div className="min-w-0" data-community-main="">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <Frame>
    <ProgramPlayer data={PLAYER} learnHref="/community/salajanywood/learn" />
  </Frame>,
)
