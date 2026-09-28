"use client"

/**
 * ===========================================================================
 *  A COURSE'S CURRICULUM ON ITS PRODUCT PAGE, WITH ITS FREE PREVIEWS
 * ===========================================================================
 * What a visitor weighs before buying a course: how much there is and how
 * long it runs, for the whole course and each module, and the lessons the
 * creator lets anyone watch first. A free preview lesson is a button: it
 * opens the lesson in the same player buyers use in their library
 * (./lesson-video.tsx), in a dialog over the page.
 *
 * WHO MAY WATCH is decided where the video is handed out, not here:
 * /api/courses/lessons/<id>/play answers a visitor for a lesson marked as a
 * preview of a published course, and nothing else, with a signed address
 * that runs out (lib/courses/access.ts). The page only knows which lessons
 * are marked, from the public outline, and a lesson that stopped being a
 * preview since the page was cached answers "not available" in the dialog.
 * A visitor's place is not kept (lib/courses/access keepsProgress).
 *
 * The page's theme colours come in as they did for the list drawn inline
 * before (app/(marketing)/p/[slug]/page.tsx), so a themed page keeps them.
 */

import * as React from "react"
import { Loader2, Play } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { LessonVideo, type VideoSource } from "./lesson-video"
import { countLine, courseSeconds, lessonClock, lessonsIn, secondsIn, type OutlineLesson, type OutlineModule } from "@/lib/courses/outline"

export interface OutlineColors {
  heading?: string
  card?: string
  cardBorder?: string
  cardText?: string
  muted?: string
}

type Play =
  | { state: "loading" }
  | { state: "video"; source: VideoSource }
  | { state: "external"; embedUrl: string }
  | { state: "none"; message: string }

async function askToPlay(lessonId: string): Promise<Play> {
  try {
    const res = await fetch(`/api/courses/lessons/${encodeURIComponent(lessonId)}/play`, { cache: "no-store", credentials: "same-origin" })
    const data = (await res.json().catch(() => ({}))) as { kind?: string; url?: string; expiresAt?: number; mime?: string | null; captions?: string | null; embedUrl?: string; error?: string }
    if (res.status === 404) return { state: "none", message: "This preview is not available any more." }
    if (!res.ok) return { state: "none", message: data.error || "This preview could not be opened. Try again." }
    if (data.kind === "video" && data.url) return { state: "video", source: { url: data.url, expiresAt: Number(data.expiresAt) || Date.now() + 3_600_000, mime: data.mime ?? null, captions: data.captions ?? null } }
    if (data.kind === "external" && data.embedUrl) return { state: "external", embedUrl: data.embedUrl }
    return { state: "none", message: "This lesson is to read, and it is in the course." }
  } catch {
    return { state: "none", message: "The connection dropped. Try again." }
  }
}

const noop = () => {}

function PreviewPlayer({ lesson }: { lesson: OutlineLesson }) {
  const [play, setPlay] = React.useState<Play>({ state: "loading" })
  React.useEffect(() => {
    let live = true
    void askToPlay(lesson.id).then((p) => live && setPlay(p))
    return () => {
      live = false
    }
  }, [lesson.id])
  const renew = React.useCallback(async () => {
    const p = await askToPlay(lesson.id)
    return p.state === "video" ? p.source : null
  }, [lesson.id])

  if (play.state === "loading") {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black">
        <Loader2 className="h-7 w-7 animate-spin text-white/70" aria-label="Loading" />
      </div>
    )
  }
  if (play.state === "video") {
    return <LessonVideo source={play.source} startAt={0} autoPlay next={null} renew={renew} onPlace={noop} onNearEnd={noop} onNext={noop} />
  }
  if (play.state === "external") {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <iframe src={play.embedUrl} title={lesson.title} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    )
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center bg-[#1a1a2e] px-6 text-center">
      <p className="text-[15px] font-medium text-white">{play.message}</p>
    </div>
  )
}

export function CourseOutline({ modules, colors = {} }: { modules: OutlineModule[]; colors?: OutlineColors }) {
  const [watching, setWatching] = React.useState<OutlineLesson | null>(null)
  const total = lessonsIn(modules)
  const muted = colors.muted || "var(--muted-foreground)"

  return (
    <section data-course-outline="" aria-labelledby="course-outline-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="course-outline-title" className="text-lg font-semibold" style={{ color: colors.heading || "var(--foreground)" }}>
          Course curriculum
        </h2>
        <p data-outline-total="" className="text-sm tabular-nums" style={{ color: muted }}>
          {modules.length} {modules.length === 1 ? "module" : "modules"} · {countLine(total, courseSeconds(modules))}
        </p>
      </div>
      <div className="space-y-3">
        {modules.map((module, idx) => {
          const lessons = module.lessons ?? []
          return (
            <div
              key={module.id}
              data-outline-module=""
              className="rounded-lg border"
              style={{ backgroundColor: colors.card || "var(--card)", borderColor: colors.cardBorder || "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3.5">
                <h3 className="min-w-0 font-medium" style={{ color: colors.cardText || "var(--foreground)" }}>
                  {idx + 1}. {module.title}
                </h3>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: muted }}>
                  {countLine(lessons.length, secondsIn(lessons))}
                </span>
              </div>
              {lessons.length ? (
                <ul className="px-1.5 pb-2">
                  {lessons.map((lesson) => {
                    const time = lessonClock(lesson.duration_seconds)
                    const inner = (
                      <>
                        {lesson.is_preview ? (
                          <Play aria-hidden className="h-3.5 w-3.5 shrink-0 fill-current" />
                        ) : (
                          <span aria-hidden className="mx-[5px] h-1.5 w-1.5 shrink-0 rounded-full opacity-60" style={{ backgroundColor: "currentColor" }} />
                        )}
                        <span className="min-w-0 flex-1 break-words text-left">{lesson.title}</span>
                        {lesson.is_preview ? <span className="shrink-0 text-xs font-medium underline underline-offset-2">Preview</span> : null}
                        {time ? <span className="shrink-0 text-xs tabular-nums opacity-80">{time}</span> : null}
                      </>
                    )
                    return (
                      <li key={lesson.id}>
                        {lesson.is_preview ? (
                          <button
                            type="button"
                            data-preview-lesson={lesson.id}
                            onClick={() => setWatching(lesson)}
                            aria-label={`Watch the free preview: ${lesson.title}`}
                            className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-current/40"
                            style={{ color: colors.cardText || "var(--foreground)" }}
                          >
                            {inner}
                          </button>
                        ) : (
                          <div className="flex min-h-10 items-center gap-2.5 px-2.5 py-2 text-sm" style={{ color: muted }}>
                            {inner}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="pb-2" />
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={!!watching} onOpenChange={(open) => !open && setWatching(null)}>
        <DialogContent
          aria-describedby={undefined}
          className="w-[calc(100%-24px)] max-w-[880px] gap-0 overflow-hidden rounded-2xl border-0 bg-black p-0 text-white sm:max-w-[880px] [&>[data-slot=dialog-close]]:rounded-full [&>[data-slot=dialog-close]]:bg-black/50 [&>[data-slot=dialog-close]]:p-1.5 [&>[data-slot=dialog-close]]:text-white [&>[data-slot=dialog-close]]:opacity-90 [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:right-3 [&>[data-slot=dialog-close]]:z-10"
        >
          <DialogTitle className="sr-only">{watching ? `Free preview: ${watching.title}` : "Free preview"}</DialogTitle>
          {watching ? <PreviewPlayer key={watching.id} lesson={watching} /> : null}
          {watching ? (
            <div className="flex items-center justify-between gap-3 bg-[#111] px-4 py-3">
              <p className="min-w-0 truncate text-[14px] font-medium">{watching.title}</p>
              <span className="shrink-0 text-[12px] text-white/60">Free preview</span>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
