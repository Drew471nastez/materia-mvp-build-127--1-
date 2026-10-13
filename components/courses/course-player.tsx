"use client"

/**
 * ===========================================================================
 *  A COURSE, TAKEN
 * ===========================================================================
 * /library/courses/[id]. The lesson on the left with its notes and files
 * under it, the curriculum on the right; on a phone the video runs edge to
 * edge and the curriculum is a sheet that slides up from "Lessons".
 *
 * The page opens on the lesson asked for (?lesson=) or where the buyer left
 * off, at the second they left off. Moving between lessons happens here,
 * without a page load; the address follows so a reload or a shared link
 * lands on the same lesson.
 *
 * The buyer's place goes to the server (app/api/courses/progress) when a
 * lesson opens, every fifteen seconds while it plays, on pause, at 90%
 * (which finishes the lesson), on Mark as complete, and as a beacon when the
 * page is hidden or closed. The check marks and the percentage are counted
 * here from the same rows the server keeps (lib/courses/progress), so they
 * move the moment a lesson is done.
 */

import { cleanStoredHtml, looksLikeHtml } from "@/lib/rich-text/html"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, ListVideo, Loader2, Lock, Mail, Paperclip, Play, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { LessonVideo, type VideoSource } from "./lesson-video"
import { downloadAttachment } from "./download-attachment"
import { clock, isDone, lengthInWords, lessonNumber, progressMap, resumeAt, summarize, type LessonProgress } from "@/lib/courses/progress"
import type { PlayerData, PlayerLesson } from "@/lib/courses/types"
import { mediaKindOf } from "@/lib/communities/post-media"
import { slugifyHandle } from "@/lib/profile/username-rules"

type Play =
  | { state: "loading" }
  | { state: "video"; source: VideoSource }
  | { state: "external"; embedUrl: string; provider: string }
  | { state: "text" }
  | { state: "locked" }
  | { state: "error"; message: string }

/** The one radius every rectangular button here uses: the header's Log in button's. */
const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/50"
const PRIMARY = `${BTN} bg-[#8b5cf6] text-white hover:bg-[#7c3aed]`
const QUIET = `${BTN} border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]`
/* In a community the action is the community's ink, and Completed is the quiet face with the check filled. */
const INK_BOX = "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25"
const INK = `${INK_BOX} bg-[#1a1a2e] text-white transition-[background-color,color,box-shadow] duration-200 hover:bg-[#2a2a40] active:bg-[#0f0f1c] touch-manipulation`
const INK_DONE = `${INK_BOX} border border-[#e5e7eb] bg-white text-[#1a1a2e] transition-[background-color,color,box-shadow] duration-200 hover:bg-[#f8f9fa] active:bg-[#f1f2f4] touch-manipulation`

/*
  EVERY LESSON'S MEDIA ASKED FOR ONCE (round 15: "the media loads too hard"). What a lesson plays is kept for the visit: a
  lesson opened again, or the next one read ahead while this one is watched, starts with no wait. A video's address is
  signed and expires, so it is used again only while it has more than a minute left.
*/
const playKept = new Map<string, Play>()
function keptPlay(lessonId: string): Play | null {
  const p = playKept.get(lessonId)
  if (!p) return null
  if (p.state === "video" && p.source.expiresAt - Date.now() < 60_000) {
    playKept.delete(lessonId)
    return null
  }
  return p.state === "video" || p.state === "external" || p.state === "text" ? p : null
}
async function readPlay(lessonId: string): Promise<Play> {
  const kept = keptPlay(lessonId)
  if (kept) return kept
  const p = await fetchPlay(lessonId)
  if (p.state === "video" || p.state === "external" || p.state === "text") playKept.set(lessonId, p)
  return p
}

async function fetchPlay(lessonId: string): Promise<Play> {
  try {
    const res = await fetch(`/api/courses/lessons/${lessonId}/play`, { cache: "no-store", credentials: "same-origin" })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return res.status === 404 ? { state: "locked" } : { state: "error", message: String(body.error || "This lesson did not load. Try again.") }
    if (body.kind === "video" && typeof body.url === "string")
      return { state: "video", source: { url: body.url, expiresAt: Number(body.expiresAt) || Date.now() + 3_000_000, mime: (body.mime as string) || null, captions: (body.captions as string) || null } }
    if (body.kind === "external" && typeof body.embedUrl === "string") return { state: "external", embedUrl: body.embedUrl, provider: String(body.provider) }
    return { state: "text" }
  } catch {
    return { state: "error", message: "This lesson did not load. Check your connection and try again." }
  }
}

/** What a lesson's stage can show on the render that opens it, before anything is asked for. */
function firstPlay(l: PlayerLesson | null): Play {
  if (!l) return { state: "loading" }
  if (l.locked) return { state: "locked" }
  if (l.kind === "text") return { state: "text" }
  return keptPlay(l.id) ?? { state: "loading" }
}

function sendPlace(body: Record<string, unknown>, beacon = false): Promise<Record<string, unknown> | null> {
  const json = JSON.stringify(body)
  if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/courses/progress", new Blob([json], { type: "application/json" }))
    return Promise.resolve(null)
  }
  return fetch("/api/courses/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true, credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
    .catch(() => null)
}

/** `backHref` is where the arrow at the top goes: the library, or a community's classroom. */
export function CoursePlayer({
  data,
  backHref = "/account/library/courses",
  backLabel = "All courses",
  /** Inside a community shell: wider stage, lighter chrome, curriculum only from lg up. */
  embedded = false,
  /** A press on the arrow, when the page decides where it goes (a community's Learn: back through history when it came from there). */
  onBack,
}: {
  data: PlayerData
  backHref?: string
  backLabel?: string
  embedded?: boolean
  onBack?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const lessons = useMemo(() => data.modules.flatMap((m) => m.lessons), [data.modules])
  const outline = data.modules
  const keeps = data.access !== "preview"
  const [progress, setProgress] = useState<Map<string, LessonProgress>>(() => progressMap(data.progress))
  const [lessonId, setLessonId] = useState<string | null>(data.initialLessonId)
  const [autoPlay, setAutoPlay] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [emailsOff, setEmailsOff] = useState(data.emailsOff)
  const live = useRef({ position: 0, duration: 0 })

  const lesson = lessons.find((l) => l.id === lessonId) ?? null
  /*
    WHAT THE STAGE SHOWS BELONGS TO ONE LESSON (round 18). It was one piece of state for whichever lesson was open, so the
    render that changed the lesson still drew the last lesson's video under the new title, and then the program's cover
    while the new one was asked for. Now it is held with its lesson's id; a lesson without its own yet starts from what is
    already known on that same render: a locked or a text lesson needs nothing, a lesson read ahead is in hand.
  */
  const [held, setHeld] = useState<{ id: string | null; play: Play }>(() => ({ id: lesson?.id ?? null, play: firstPlay(lesson) }))
  const play: Play = lesson && held.id === lesson.id ? held.play : firstPlay(lesson)
  const topRef = useRef<HTMLDivElement>(null)
  const summary = summarize(outline, progress)
  const open = lessons.filter((l) => !l.locked)
  const at = lesson ? open.findIndex((l) => l.id === lesson.id) : -1
  const prev = at > 0 ? open[at - 1] : null
  const next = at >= 0 && at + 1 < open.length ? open[at + 1] : null
  const done = lesson ? isDone(progress.get(lesson.id)) : false
  const startAt = lesson ? resumeAt(progress.get(lesson.id), lesson.durationSeconds) : 0
  /* Read once per lesson: the saved place moves while it plays, and the player must not restart for it. */
  const startRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 })
  if (startRef.current.id !== lessonId) startRef.current = { id: lessonId, at: startAt }

  const mark = useCallback((id: string, patch: Partial<LessonProgress>) => {
    setProgress((m) => {
      const nextMap = new Map(m)
      const was = m.get(id) ?? { lessonId: id, completedAt: null, positionSeconds: 0, durationSeconds: null, updatedAt: null }
      nextMap.set(id, { ...was, ...patch })
      return nextMap
    })
  }, [])

  /* The lesson's video, text or link; and the server told this is the lesson they are in. */
  useEffect(() => {
    if (!lesson) return
    let cancelled = false
    live.current = { position: 0, duration: 0 }
    const id = lesson.id
    const now = firstPlay(lesson)
    setHeld({ id, play: now })
    if (lesson.locked) return
    if (now.state === "loading") void readPlay(id).then((p) => !cancelled && setHeld({ id, play: p }))
    if (keeps) void sendPlace({ lessonId: lesson.id, opened: true })
    const url = new URL(window.location.href)
    const base = slugifyHandle(lesson.title, 60) || "lesson"
    const dup = lessons.some((l) => l.id !== lesson.id && (slugifyHandle(l.title, 60) || "lesson") === base)
    const lessonKey = dup ? `${base}-${lesson.id.replace(/-/g, "").slice(0, 4)}` : base
    if (url.searchParams.get("lesson") !== lessonKey) {
      url.search = `lesson=${encodeURIComponent(lessonKey)}`
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  /* The next lesson's media, read once this one has what it plays, so Next starts at once. */
  useEffect(() => {
    if (play.state === "loading" || !next || next.locked) return
    const t = window.setTimeout(() => void readPlay(next.id), 800)
    return () => window.clearTimeout(t)
  }, [play.state, next])

  /* Hidden or closed: the place goes as a beacon, which the browser sends even as the page goes. */
  useEffect(() => {
    if (!keeps || !lesson) return
    const flush = () => {
      const { position, duration } = live.current
      if (position > 0) sendPlace({ lessonId: lesson.id, position, duration }, true)
    }
    const onVisibility = () => document.visibilityState === "hidden" && flush()
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      flush()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [keeps, lesson])

  const goTo = useCallback(
    (l: PlayerLesson | null, withPlay: boolean) => {
      if (!l) return
      setAutoPlay(withPlay)
      setLessonId(l.id)
      setSheet(false)
      if (typeof window === "undefined") return
      if (embedded) return void toLessonTop(topRef.current)
      if (window.matchMedia?.("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [embedded],
  )

  const onPlace = useCallback(
    (position: number, duration: number) => {
      if (!keeps || !lesson) return
      mark(lesson.id, { positionSeconds: position, durationSeconds: duration || null })
      void sendPlace({ lessonId: lesson.id, position, duration })
    },
    [keeps, lesson, mark],
  )

  const setComplete = useCallback(
    (id: string, complete: boolean) => {
      if (!keeps) return
      mark(id, { completedAt: complete ? new Date().toISOString() : null })
      void sendPlace({ lessonId: id, complete, position: live.current.position || undefined, duration: live.current.duration || undefined }).then((r) => {
        /* The server's answer wins: it keeps the first time a lesson was finished. */
        if (r && "completedAt" in r) mark(id, { completedAt: (r.completedAt as string | null) ?? null })
      })
    },
    [keeps, mark],
  )

  const onNearEnd = useCallback(() => {
    if (lesson && keeps && !isDone(progress.get(lesson.id))) setComplete(lesson.id, true)
  }, [lesson, keeps, progress, setComplete])

  const renew = useCallback(async () => {
    if (!lesson) return null
    playKept.delete(lesson.id)
    const p = await readPlay(lesson.id)
    return p.state === "video" ? p.source : null
  }, [lesson])

  const toggleEmails = async () => {
    const off = !emailsOff
    setEmailsOff(off)
    const res = await fetch("/api/courses/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: data.productId, emailsOff: off }) }).catch(() => null)
    if (!res?.ok) setEmailsOff(!off)
  }

  const nextInfo = next ? { title: next.title, number: lessonNumber(outline, next.id) } : null
  const panel = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
  const notesWrap = embedded ? "mt-5 border-t border-[#f0f1f3] pt-5" : "mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5 sm:py-5"
  const grid = embedded
    ? "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-7"
    : "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6"
  const shell = embedded ? "w-full min-w-0" : ""
  const stage = (
    <Stage
      embedded={embedded}
      play={play}
      lesson={lesson}
      productHref={data.productHref}
      startAt={startRef.current.at}
      autoPlay={autoPlay}
      next={nextInfo}
      renew={renew}
      onPlace={onPlace}
      live={live}
      onNearEnd={onNearEnd}
      onNext={() => goTo(next, true)}
      onRetry={() => lesson && void fetchPlay(lesson.id).then((p) => setHeld({ id: lesson.id, play: p }))}
    />
  )

  if (embedded) {
    /*
      A LESSON INSIDE A COMMUNITY (round 18). One card for the lesson: its video or embed across the top (none for a lesson
      that is text), then where it sits in the program, its title, its text at a reading width, its files, and at the foot
      Mark as complete with the lessons either side named, so the next step is one press and says where it goes. The
      lessons stay beside it on a computer and sit under it on a phone, in the page, never in a sheet. The program's title
      and how far through it the member is head the page; on a computer the list beside carries the progress.
    */
    const moduleTitle = lesson && outline.length > 1 ? (outline.find((m) => m.id === lesson.moduleId)?.title ?? null) : null
    const progressText = summary.percent >= 100 ? "Completed" : `${summary.completed} of ${summary.total} done`
    return (
      <div data-course-player="embedded" className="mx-auto w-full min-w-0 max-w-[1120px] pb-8 sm:pb-10">
        <header className="mb-3 flex items-center gap-3 sm:mb-5">
          <BackButton href={backHref} label={backLabel} onBack={onBack} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[#1a1a2e] sm:text-[20px] sm:font-bold lg:line-clamp-2 lg:whitespace-normal" data-program-title="">
              {data.title}
            </h1>
            {keeps ? (
              <div className="mt-1 flex items-center gap-2 lg:hidden" data-progress-label="">
                <span className="text-[12.5px] font-medium tabular-nums text-[#6b7280]">{progressText}</span>
                <ProgressBar percent={summary.percent} className="w-16" />
              </div>
            ) : null}
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-7">
          <article
            ref={topRef}
            data-lesson-column=""
            className="min-w-0 scroll-mt-[calc(var(--community-top,65px)+12px)] overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-16px_rgba(16,24,40,0.12)]"
          >
            {stage ? <div data-lesson-stage="">{stage}</div> : null}
            {lesson ? (
              <>
                <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
                  <p className="truncate text-[12.5px] font-medium tabular-nums text-[#6b7280]">
                    {lessons.length > 1 ? `Lesson ${lessonNumber(outline, lesson.id)} of ${lessons.length}` : "Lesson"}
                    {moduleTitle ? <span className="text-[#9ca3af]"> · {moduleTitle}</span> : null}
                  </p>
                  <h2 className="mt-1 text-[20px] font-bold leading-[1.25] tracking-[-0.015em] text-[#1a1a2e] sm:text-[24px]" data-lesson-title="">
                    {lesson.title}
                  </h2>
                  {lesson.notes ? (
                    <div className="mt-3 max-w-[68ch] sm:mt-4" data-lesson-text="">
                      <Notes text={lesson.notes} />
                    </div>
                  ) : lesson.kind === "text" && !lesson.locked ? (
                    <p className="mt-3 text-[14px] text-[#6b7280]" data-lesson-text="">
                      Nothing is written for this lesson yet.
                    </p>
                  ) : null}
                  {lesson.attachments.length > 0 ? <Attachments lesson={lesson} embedded /> : null}
                </div>
                <footer className="border-t border-[#eef0f2] px-4 py-4 sm:px-6" data-lesson-foot="">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {keeps && !lesson.locked ? (
                      <button
                        type="button"
                        data-mark-complete
                        aria-pressed={done}
                        onClick={() => setComplete(lesson.id, !done)}
                        className={`${done ? INK_DONE : INK} h-12 w-full shrink-0 sm:w-auto sm:px-5`}
                      >
                        <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-200 ${done ? "bg-[#1a1a2e] text-white" : "border-[1.5px] border-white/70"}`}>
                          <Check className={`h-3 w-3 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${done ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} strokeWidth={3} />
                        </span>
                        {done ? "Completed" : "Mark as complete"}
                      </button>
                    ) : null}
                    {prev || next ? (
                      <nav aria-label="Lessons either side" className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:ml-auto sm:max-w-[440px]">
                        <PagerCell side="prev" lesson={prev} alone={!next} onPick={() => goTo(prev, false)} />
                        <PagerCell side="next" lesson={next} alone={!prev} onPick={() => goTo(next, false)} />
                      </nav>
                    ) : null}
                  </div>
                </footer>
              </>
            ) : null}
            {data.contact !== false ? (
              <div className="px-4 pb-5 sm:px-6">
                <CreatorBlock data={data} lessonTitle={lesson?.title ?? null} emailsOff={emailsOff} onToggleEmails={keeps && data.access === "owner" ? toggleEmails : null} embedded />
              </div>
            ) : null}
          </article>

          {/* The lessons: beside the lesson from 1024px, sticking under the bar; under it below that, in the page. */}
          <aside className="sticky top-[calc(var(--community-top,65px)+20px)] hidden lg:block" aria-label="Lessons">
            <div className={panel}>
              <CurriculumHead summary={summary} keeps={keeps} />
              <div className="max-h-[min(560px,calc(100svh-var(--community-top,64px)-120px))] overflow-y-auto overscroll-contain">
                <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
              </div>
            </div>
          </aside>
        </div>

        {lessons.length > 1 ? (
          <section className={`${panel} mt-4 lg:hidden`} aria-label="Lessons" data-lessons-inline="">
            <CurriculumHead summary={summary} keeps={keeps} />
            <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div data-course-player={embedded ? "embedded" : ""} className={`pb-8 sm:pb-10 ${shell} ${embedded ? "mx-auto max-w-[1120px]" : ""}`}>
      {/* The course, who made it, how far through */}
      <div className="mb-4 flex items-start gap-3 sm:mb-5">
        <Link
          href={backHref}
          aria-label={backLabel}
          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e6e8ec] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06),0_6px_16px_-8px_rgba(16,24,40,0.18)] transition-[box-shadow,background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-x-0.5 hover:bg-[#f8f9fa] hover:shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_18px_-8px_rgba(16,24,40,0.22)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-x-0 sm:h-9 sm:w-9`}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-[19px] font-bold leading-tight text-[#1a1a2e] sm:text-[24px]">{data.title}</h1>
          <p className="mt-0.5 truncate text-[13px] text-[#6b7280] sm:text-[14px]">
            by{" "}
            {data.creator.storeHref ? (
              <Link href={data.creator.storeHref} className="font-medium text-[#4b5563] hover:text-[#1a1a2e]">
                {data.creator.name}
              </Link>
            ) : (
              <span className="font-medium text-[#4b5563]">{data.creator.name}</span>
            )}
          </p>
        </div>
        {keeps ? (
          embedded ? (
            <div className="mt-1 w-[104px] shrink-0 sm:w-[160px]" data-progress-label="">
              <p className="flex items-center justify-end gap-1.5 text-[12.5px] font-medium tabular-nums text-[#6b7280]">
                {summary.percent >= 100 ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#1a1a2e]" strokeWidth={2.5} />
                    <span className="text-[#1a1a2e]">Completed</span>
                  </>
                ) : (
                  `${summary.completed} of ${summary.total} done`
                )}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eceef1]" data-progress-bar="">
                <div
                  className="h-full origin-left rounded-full bg-[#1a1a2e] motion-safe:transition-[scale] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ scale: `${Math.max(0, Math.min(100, summary.percent)) / 100} 1` }}
                />
              </div>
            </div>
          ) : (
            <ProgressRing percent={summary.percent} />
          )
        ) : null}
      </div>

      <div className={grid}>
        <div className={`min-w-0 ${embedded ? "overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-16px_rgba(16,24,40,0.12)]" : ""}`}>
          {/* The lesson: edge to edge on a phone in the library; inset in a community */}
          <div className={embedded ? "" : "-mx-4 sm:mx-0"} data-lesson-stage="">
            {stage}
          </div>

          {lesson ? (
            <div className={embedded ? "px-4 py-4 sm:px-5" : "mt-4"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {lessons.length > 1 ? (
                    <p className="text-[12px] font-medium text-[#6b7280]">
                      Lesson {lessonNumber(outline, lesson.id)} of {lessons.length}
                    </p>
                  ) : null}
                  <h2 className="mt-0.5 text-[18px] font-bold leading-snug text-[#1a1a2e] sm:text-[20px]">{lesson.title}</h2>
                </div>
              </div>

              {/* Mark complete, previous and next */}
              <div className="mt-3 flex items-center gap-2">
                {keeps && !lesson.locked ? (
                  <button
                    type="button"
                    data-mark-complete
                    aria-pressed={done}
                    onClick={() => setComplete(lesson.id, !done)}
                    className={`${embedded ? (done ? INK_DONE : INK) : done ? `${BTN} border border-[#8b5cf6]/30 bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]` : PRIMARY} max-sm:flex-1`}
                  >
                    {embedded ? (
                      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-200 ${done ? "bg-[#1a1a2e] text-white" : "border-[1.5px] border-white/70"}`}>
                        <Check className={`h-3 w-3 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${done ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} strokeWidth={3} />
                      </span>
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {done ? "Completed" : "Mark as complete"}
                  </button>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => goTo(prev, false)} disabled={!prev} className={`${QUIET} w-10 px-0 disabled:opacity-40`} aria-label="Previous lesson">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => goTo(next, false)} disabled={!next} className={`${QUIET} max-sm:w-10 max-sm:px-0 disabled:opacity-40`} aria-label="Next lesson">
                    <span className="max-sm:hidden">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* On a phone and a tablet the curriculum is a sheet, opened from one full row */}
              <button
                type="button"
                onClick={() => setSheet(true)}
                data-open-lessons
                className={`mt-3 flex h-12 w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-left transition-colors duration-200 hover:bg-[#f8f9fa] active:bg-[#f1f2f4] motion-reduce:transition-none lg:hidden ${lessons.length < 2 ? "hidden" : ""}`}
              >
                <ListVideo className="h-4 w-4 shrink-0 text-[#6b7280]" />
                <span className="flex-1 text-[14px] font-semibold text-[#1a1a2e]">All lessons</span>
                <span className="text-[13px] tabular-nums text-[#6b7280]">{keeps ? `${summary.completed} of ${summary.total} done` : `${summary.total} lessons`}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              </button>

              {lesson.notes ? (
                <section className={notesWrap}>
                  <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
                    <FileText className="h-4 w-4 text-[#9ca3af]" />
                    Notes
                  </h3>
                  <Notes text={lesson.notes} />
                </section>
              ) : null}

              {lesson.attachments.length > 0 ? <Attachments lesson={lesson} embedded={embedded} /> : null}
            </div>
          ) : null}

          {data.contact !== false ? <CreatorBlock data={data} lessonTitle={lesson?.title ?? null} emailsOff={emailsOff} onToggleEmails={keeps && data.access === "owner" ? toggleEmails : null} embedded={embedded} /> : null}
        </div>

        {/* The curriculum: beside the lesson on a computer (community shell uses the wide middle column). */}
        <aside
          className={`sticky hidden ${embedded ? "top-[calc(var(--community-top,65px)+20px)]" : "top-4"} lg:block`}
          aria-label="Lessons"
        >
          <div className={panel}>
            <CurriculumHead summary={summary} keeps={keeps} />
            <div className="max-h-[min(520px,calc(100svh-var(--community-top,64px)-120px))] overflow-y-auto overscroll-contain">
              <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
            </div>
          </div>
        </aside>
      </div>

      <LessonSheet open={sheet} onClose={() => setSheet(false)}>
        <CurriculumHead summary={summary} keeps={keeps} />
        <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
      </LessonSheet>
    </div>
  )
}

/**
 * A NEW LESSON STARTS AT ITS TOP, without a trip (round 18). Only when the lesson's card is not already where it starts
 * under the community's bar: from the foot of a short lesson a glide up, from far down the list below it a jump, so
 * the member never watches the whole page roll past. Never for reduced motion.
 */
function toLessonTop(el: HTMLElement | null) {
  if (!el) return
  const bar = parseFloat(getComputedStyle(el).getPropertyValue("--community-top")) || 0
  const top = el.getBoundingClientRect().top
  if (top >= bar && top <= bar + 24) return
  const y = Math.max(0, window.scrollY + top - bar - 12)
  const far = Math.abs(top - bar) > window.innerHeight
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  window.scrollTo({ top: y, behavior: far || still ? ("instant" as ScrollBehavior) : "smooth" })
}

/** The way back to the program's shelf: the same raised square the community's pages use. */
function BackButton({ href, label, onBack }: { href: string; label: string; onBack?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={onBack}
      data-native-nav={onBack ? "" : undefined}
      data-lesson-back=""
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e6e8ec] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#f8f9fa] active:bg-[#f1f2f4] motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent]"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  )
}

function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[#eceef1] ${className}`} data-progress-bar="">
      <div
        className="h-full origin-left rounded-full bg-[#1a1a2e] motion-safe:transition-[scale] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ scale: `${Math.max(0, Math.min(100, percent)) / 100} 1` }}
      />
    </div>
  )
}

/**
 * One side of the lesson's foot: Previous or Next, with the lesson's title. Alone (the first lesson, the last) it takes
 * the whole row on a phone, so its title is not cut to a word, and keeps its own side on a computer.
 */
function PagerCell({ side, lesson, alone, onPick }: { side: "prev" | "next"; lesson: PlayerLesson | null; alone: boolean; onPick: () => void }) {
  if (!lesson) return null
  const next = side === "next"
  const place = alone ? (next ? "col-span-2 sm:col-span-1 sm:col-start-2" : "col-span-2 sm:col-span-1") : next ? "col-start-2" : ""
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={next ? "Next lesson" : "Previous lesson"}
      data-pager={side}
      className={`flex h-14 min-w-0 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-left transition-[background-color,border-color] duration-200 ease-out hover:border-[#d6d9de] hover:bg-[#f8f9fa] active:bg-[#f1f2f4] motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent] sm:h-12 ${place} ${next ? "flex-row-reverse text-right" : ""}`}
    >
      {next ? <ChevronRight className="h-4 w-4 shrink-0 text-[#6b7280]" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-[#6b7280]" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-[#6b7280]">{next ? "Next" : "Previous"}</span>
        <span className="block truncate text-[13.5px] font-semibold text-[#1a1a2e]">{lesson.title}</span>
      </span>
    </button>
  )
}

function Stage(props: {
  embedded?: boolean
  play: Play
  lesson: PlayerLesson | null
  productHref: string | null
  startAt: number
  autoPlay: boolean
  next: { title: string; number: number } | null
  renew: () => Promise<VideoSource | null>
  onPlace: (p: number, d: number) => void
  live: { current: { position: number; duration: number } }
  onNearEnd: () => void
  onNext: () => void
  onRetry: () => void
}) {
  const { play, lesson, embedded } = props
  /* In a community the lesson's card clips the stage to its own corners; in the library the stage is a card of its own. */
  const stageRound = embedded ? "" : "sm:rounded-2xl"
  if (!lesson) {
    return <Panel title="This course has no lessons yet" body="The creator is still adding them. They will be here when they are ready." />
  }
  /* A lesson that is words only has no stage: its text is the lesson, and it starts right under the title. */
  if (play.state === "text") return null
  if (play.state === "loading") {
    /*
      THE STILL (round 18): while the lesson's video is asked for, its own box, black like the video, at the 16:9 the video
      is drawn in, so nothing under it moves when the video arrives. It used to be the program's cover at 60%, then the
      cover again as the video's poster: the owner saw the program's picture before every lesson. A small spinner joins
      only past half a second (@starting-style, no script), so a lesson read ahead never flashes one.
    */
    return (
      <div className={`relative aspect-video w-full overflow-hidden bg-black ${stageRound}`} data-stage-loading="" data-stage-still="">
        <span className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity delay-500 duration-300 starting:opacity-0 motion-reduce:transition-none">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-label="Loading" />
        </span>
      </div>
    )
  }
  if (play.state === "locked") {
    return (
      <div className={`flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[#1a1a2e] px-6 text-center text-white ${stageRound}`}>
        <Lock className="h-6 w-6 text-white/70" />
        <p className="text-[15px] font-semibold">This lesson is part of the full course</p>
        {props.productHref ? (
          <Link href={props.productHref} className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
            Get the course
          </Link>
        ) : null}
      </div>
    )
  }
  if (play.state === "error") {
    return (
      <div className={`flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white ${stageRound}`}>
        <p className="text-[15px] font-semibold">{play.message}</p>
        <button type="button" onClick={props.onRetry} className="h-10 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
          Try again
        </button>
      </div>
    )
  }
  if (play.state === "video") {
    /* No poster: the program's cover is not this lesson's picture. The black box shows until the video's own first frame. */
    return (
      <LessonVideo
        key={lesson.id}
        source={play.source}
        startAt={props.startAt}
        autoPlay={props.autoPlay}
        poster={null}
        next={props.next}
        renew={props.renew}
        onPlace={props.onPlace}
        live={props.live}
        onNearEnd={props.onNearEnd}
        onNext={props.onNext}
        className={embedded ? "" : undefined}
      />
    )
  }
  return <ExternalStage key={lesson.id} url={play.embedUrl} title={lesson.title} round={stageRound} />
}

/** A YouTube or Vimeo lesson: its player fades in over the black box once it has loaded, never a white frame first. */
function ExternalStage({ url, title, round }: { url: string; title: string; round: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-black ${round}`}>
      <iframe
        src={url}
        title={title}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ease-out motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

function Panel({ title, body, icon }: { title: string; body: string; icon?: boolean }) {
  return (
    <div className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-[#eceef1] bg-[#fafbfb] px-6 py-10 text-center">
      {icon ? <FileText className="h-6 w-6 text-[#9ca3af]" /> : null}
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="max-w-[420px] text-[14px] text-[#6b7280]">{body}</p>
    </div>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-11 w-11 shrink-0" role="img" aria-label={`${percent}% complete`} data-progress-ring>
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#f0f1f3" strokeWidth="3.5" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[520ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-[#1a1a2e]">{percent}%</span>
    </div>
  )
}

function CurriculumHead({ summary, keeps }: { summary: ReturnType<typeof summarize>; keeps: boolean }) {
  const length = lengthInWords(summary.totalSeconds)
  const doneLabel = keeps ? `${summary.completed} of ${summary.total}` : `${summary.total}`
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">Lessons</p>
        <p className="text-[12.5px] tabular-nums text-[#6b7280]">
          {keeps ? `${doneLabel} done` : doneLabel}
          {length ? <span className="text-[#9ca3af]"> · {length}</span> : null}
        </p>
      </div>
      {keeps ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eceef1]" data-progress-bar>
          <div
            className="h-full origin-left rounded-full bg-[#1a1a2e] motion-safe:transition-[scale] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ scale: `${Math.max(0, Math.min(100, summary.percent)) / 100} 1` }}
          />
        </div>
      ) : null}
    </div>
  )
}

function Curriculum({ data, progress, currentId, onPick }: { data: PlayerData; progress: Map<string, LessonProgress>; currentId: string | null; onPick: (l: PlayerLesson) => void }) {
  const multiModule = data.modules.length > 1
  let n = 0
  return (
    <ol className="space-y-1 px-2 pb-3 pt-1" data-curriculum>
      {data.modules.map((m) => {
        const showModule = multiModule || m.lessons.length > 1
        const doneCount = m.lessons.filter((l) => isDone(progress.get(l.id))).length
        return (
          <li key={m.id}>
            {showModule ? (
              <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-3">
                <p className="min-w-0 truncate text-[12.5px] font-semibold text-[#6b7280]">{m.title}</p>
                {data.access !== "preview" && m.lessons.length > 1 ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-[#9ca3af]">{doneCount}/{m.lessons.length}</span>
                ) : null}
              </div>
            ) : null}
            <ol className="space-y-0.5">
              {m.lessons.map((l) => {
                n += 1
                const current = l.id === currentId
                const finished = isDone(progress.get(l.id))
                const number = n
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onPick(l)}
                      disabled={l.locked}
                      aria-current={current ? "true" : undefined}
                      data-lesson-row={l.id}
                      data-lesson-current={current ? "" : undefined}
                      className={`group/lesson flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none ${
                        current ? "bg-[#f3f4f6]" : "hover:bg-[#f8f9fa] active:bg-[#f3f4f6]"
                      } ${l.locked ? "cursor-default" : "cursor-pointer"}`}
                    >
                      {/* The lesson's place in the course: its number, a check once done, a lock while closed. */}
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors duration-200 ${
                          l.locked
                            ? "bg-[#f3f4f6] text-[#9ca3af]"
                            : finished
                              ? "bg-[#1a1a2e] text-white"
                              : current
                                ? "bg-white text-[#1a1a2e] shadow-[0_0_0_1.5px_#1a1a2e]"
                                : "bg-white text-[#6b7280] shadow-[0_0_0_1px_#e3e5e9]"
                        }`}
                        data-done={finished ? "" : undefined}
                      >
                        {l.locked ? <Lock className="h-3.5 w-3.5" /> : finished ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 text-[14px] leading-5 ${current ? "font-semibold text-[#1a1a2e]" : l.locked ? "text-[#9ca3af]" : "font-medium text-[#374151]"}`}>
                          {l.title}
                        </span>
                        {l.durationSeconds || (l.isPreview && data.access !== "owner") ? (
                          <span className="mt-0.5 block text-[12px] tabular-nums text-[#9ca3af]">
                            {l.durationSeconds ? clock(l.durationSeconds) : null}
                            {l.durationSeconds && l.isPreview && data.access !== "owner" ? " · " : null}
                            {l.isPreview && data.access !== "owner" ? "Preview" : null}
                          </span>
                        ) : null}
                      </span>
                      {current ? <Play className="h-3.5 w-3.5 shrink-0 text-[#1a1a2e]" fill="currentColor" aria-hidden /> : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          </li>
        )
      })}
    </ol>
  )
}

/** The curriculum as a sheet from the bottom, on a phone and a tablet. */
function LessonSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      html.style.overflow = before
    }
  }, [open, onClose])
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!mounted) return
    const id = requestAnimationFrame(() => setShown(open))
    return () => cancelAnimationFrame(id)
  }, [open, mounted])
  if (!mounted) return null
  return (
    /* Above the phone's tab bar, never over it (--buyer-tabs-h, app/globals.css): the bar stays a way out. */
    <div className="fixed inset-x-0 top-0 z-[80] lg:hidden" style={{ bottom: "var(--buyer-tabs-h, 0px)" }} role="dialog" aria-modal="true" aria-label="Lessons" data-lesson-sheet={shown ? "open" : "closed"}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[calc(82svh-var(--buyer-tabs-h,0px))] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-[translate] duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${shown ? "translate-y-0" : "translate-y-full"}`}
        /* The home indicator's inset is under the tab bar when there is one; only without it does the sheet keep its own. */
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px) - var(--buyer-tabs-h, 0px))" }}
        onTransitionEnd={() => !open && setMounted(false)}
      >
        <div className="relative flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-[#d1d5db]" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

/** The lesson's text: its own line breaks kept, and its web addresses made links. */
function Notes({ text }: { text: string }) {
  /* Written in the rich text editor: its cleaned HTML, laid out as written text. */
  if (looksLikeHtml(text)) return <div className="storelib-prose break-words text-[15px] leading-7 text-[#374151] [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2" dangerouslySetInnerHTML={{ __html: cleanStoredHtml(text) }} />
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g)
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#374151]">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[#6d28d9] underline decoration-[#c4b5fd] underline-offset-2">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  )
}

function size(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/**
 * A LESSON'S PICTURE OR VIDEO FILE OPENS IN THE PAGE (round 8): pressing its
 * name shows it in the community's viewer (components/community/member/
 * media-viewer.tsx, loaded only when pressed), from the same short lived
 * address the download uses, instead of a bare file in a new tab. Download
 * still saves it.
 */
async function viewAttachment(id: string, kind: "image" | "video"): Promise<string | null> {
  try {
    const res = await fetch(`/api/courses/attachments/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" })
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !body.url) return body.error || "The file could not be opened. Try again."
    const { openMediaViewer } = await import("@/components/community/member/media-viewer")
    openMediaViewer([kind === "image" ? { kind: "image", url: body.url, raw: true } : { kind: "clip", url: body.url }], 0, { autoplay: kind === "video" })
    return null
  } catch {
    return "The file could not be opened. Check your connection and try again."
  }
}

function Attachments({ lesson, embedded }: { lesson: PlayerLesson; embedded?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className={embedded ? "mt-6 max-w-[68ch]" : "mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5"} data-lesson-files="">
      {embedded ? (
        <h3 className="mb-1 text-[13px] font-semibold text-[#6b7280]">Files</h3>
      ) : (
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
          <Paperclip className="h-4 w-4 text-[#9ca3af]" />
          Files for this lesson
        </h3>
      )}
      <ul className={`divide-y divide-[#f0f0f2] ${embedded ? "border-y border-[#f0f0f2]" : ""}`}>
        {lesson.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5">
            {(() => {
              const kind = mediaKindOf(a.name)
              const label = (
                <>
                  <span className={`block truncate text-[14px] font-medium text-[#1a1a2e] ${kind ? "underline decoration-[#d1d5db] underline-offset-2" : ""}`}>{a.name}</span>
                  {a.size ? <span className="text-[12px] text-[#9ca3af]">{size(a.size)}</span> : null}
                </>
              )
              return kind ? (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(`view:${a.id}`)
                    setError(await viewAttachment(a.id, kind))
                    setBusy(null)
                  }}
                  className="min-h-10 min-w-0 flex-1 cursor-zoom-in text-left"
                  aria-label={`Open ${a.name}`}
                  data-attachment-view={kind}
                >
                  {label}
                </button>
              ) : (
                <span className="min-w-0 flex-1">{label}</span>
              )
            })()}
            <button
              type="button"
              onClick={async () => {
                setBusy(a.id)
                setError(await downloadAttachment(a.id))
                setBusy(null)
              }}
              className={`${QUIET} h-9 px-3`}
              aria-label={`Download ${a.name}`}
            >
              {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">Download</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-[13px] text-[#b91c1c]">{error}</p> : null}
    </section>
  )
}

function CreatorBlock({ data, lessonTitle, emailsOff, onToggleEmails, embedded }: { data: PlayerData; lessonTitle: string | null; emailsOff: boolean; onToggleEmails: (() => void) | null; embedded?: boolean }) {
  const [writing, setWriting] = useState(false)
  const [message, setMessage] = useState("")
  const [state, setState] = useState<{ sending: boolean; sent: boolean; error: string | null }>({ sending: false, sent: false, error: null })
  const canWrite = data.access === "owner"

  const send = async () => {
    setState({ sending: true, sent: false, error: null })
    const res = await fetch("/api/courses/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: data.productId, message, lessonTitle }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
    if (res?.ok) {
      setState({ sending: false, sent: true, error: null })
      setMessage("")
      setWriting(false)
    } else setState({ sending: false, sent: false, error: body?.error || "The message did not go out. Try again." })
  }

  return (
    <section className={embedded ? "mt-6 border-t border-[#f0f1f3] pt-6" : "mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5"} data-creator-block>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[200px] items-center gap-3">
          <AppAvatar src={data.creator.avatarUrl} name={data.creator.name} size={44} alt="" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{data.creator.name}</p>
            <p className="text-[13px] text-[#6b7280]">Made this course</p>
          </div>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full">
          {data.creator.storeHref ? (
            <Link href={data.creator.storeHref} className={`${QUIET} max-sm:flex-1`}>
              More from them
            </Link>
          ) : null}
          {canWrite ? (
            <button type="button" onClick={() => setWriting((w) => !w)} className={`${QUIET} max-sm:flex-1`} aria-expanded={writing}>
              <Mail className="h-4 w-4" />
              Contact
            </button>
          ) : null}
        </div>
      </div>

      {writing ? (
        <div className="mt-3" data-no-player-keys>
          <label htmlFor="course-message" className="sr-only">
            Your message
          </label>
          <textarea
            id="course-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={lessonTitle ? `A question about "${lessonTitle}"?` : "Your question"}
            className="w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-[16px] leading-6 text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 sm:text-[15px]"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#9ca3af]">Their reply comes to your email.</p>
            <button type="button" onClick={send} disabled={state.sending || message.trim().length < 2} className={`${PRIMARY} disabled:opacity-50`}>
              {state.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send
            </button>
          </div>
        </div>
      ) : null}
      {state.sent ? <p className="mt-2 text-[13px] font-medium text-[#047857]">Sent. {data.creator.name} will reply by email.</p> : null}
      {state.error ? <p className="mt-2 text-[13px] text-[#b91c1c]">{state.error}</p> : null}

      {onToggleEmails ? (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-[#f0f0f2] pt-3">
          <span className="text-[13px] text-[#4b5563]">Email me about my progress in this course</span>
          <input type="checkbox" checked={!emailsOff} onChange={onToggleEmails} className="h-4 w-4 shrink-0 accent-[#8b5cf6]" />
        </label>
      ) : null}
    </section>
  )
}
