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

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, ListVideo, Loader2, Lock, Mail, Paperclip, Play, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { LessonVideo, type VideoSource } from "./lesson-video"
import { downloadAttachment } from "./download-attachment"
import { clock, isDone, lengthInWords, lessonNumber, progressMap, resumeAt, summarize, type LessonProgress } from "@/lib/courses/progress"
import type { PlayerData, PlayerLesson } from "@/lib/courses/types"

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
export function CoursePlayer({ data, backHref = "/library/courses", backLabel = "All courses" }: { data: PlayerData; backHref?: string; backLabel?: string }) {
  const lessons = useMemo(() => data.modules.flatMap((m) => m.lessons), [data.modules])
  const outline = data.modules
  const keeps = data.access !== "preview"
  const [progress, setProgress] = useState<Map<string, LessonProgress>>(() => progressMap(data.progress))
  const [lessonId, setLessonId] = useState<string | null>(data.initialLessonId)
  const [autoPlay, setAutoPlay] = useState(false)
  const [play, setPlay] = useState<Play>({ state: "loading" })
  const [sheet, setSheet] = useState(false)
  const [emailsOff, setEmailsOff] = useState(data.emailsOff)
  const live = useRef({ position: 0, duration: 0 })

  const lesson = lessons.find((l) => l.id === lessonId) ?? null
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
    setPlay({ state: "loading" })
    live.current = { position: 0, duration: 0 }
    if (lesson.locked) {
      setPlay({ state: "locked" })
      return
    }
    void fetchPlay(lesson.id).then((p) => !cancelled && setPlay(p))
    if (keeps) void sendPlace({ lessonId: lesson.id, opened: true })
    const url = new URL(window.location.href)
    if (url.searchParams.get("lesson") !== lesson.id) {
      url.searchParams.set("lesson", lesson.id)
      window.history.replaceState(window.history.state, "", url.toString())
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

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

  const goTo = useCallback((l: PlayerLesson | null, withPlay: boolean) => {
    if (!l) return
    setAutoPlay(withPlay)
    setLessonId(l.id)
    setSheet(false)
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

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
    const p = await fetchPlay(lesson.id)
    return p.state === "video" ? p.source : null
  }, [lesson])

  const toggleEmails = async () => {
    const off = !emailsOff
    setEmailsOff(off)
    const res = await fetch("/api/courses/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: data.productId, emailsOff: off }) }).catch(() => null)
    if (!res?.ok) setEmailsOff(!off)
  }

  const nextInfo = next ? { title: next.title, number: lessonNumber(outline, next.id) } : null

  return (
    <div data-course-player className="pb-10">
      {/* The course, who made it, how far through */}
      <div className="mb-4 flex items-start gap-3 sm:mb-5">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]"
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
        {keeps ? <ProgressRing percent={summary.percent} /> : null}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {/* The lesson: edge to edge on a phone */}
          <div className="-mx-4 sm:mx-0">
            <Stage
              play={play}
              lesson={lesson}
              productHref={data.productHref}
              poster={data.thumbnailUrl}
              startAt={startRef.current.at}
              autoPlay={autoPlay}
              next={nextInfo}
              renew={renew}
              onPlace={onPlace}
              live={live}
              onNearEnd={onNearEnd}
              onNext={() => goTo(next, true)}
              onRetry={() => lesson && void fetchPlay(lesson.id).then(setPlay)}
            />
          </div>

          {lesson ? (
            <div className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8b5cf6]">
                    Lesson {lessonNumber(outline, lesson.id)} of {lessons.length}
                  </p>
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
                    className={`${done ? `${BTN} border border-[#8b5cf6]/30 bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]` : PRIMARY} max-sm:flex-1`}
                  >
                    <Check className="h-4 w-4" />
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
                className="mt-3 flex h-12 w-full items-center gap-3 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-left hover:bg-[#f8f9fa] lg:hidden"
              >
                <ListVideo className="h-4 w-4 shrink-0 text-[#6b7280]" />
                <span className="flex-1 text-[14px] font-semibold text-[#1a1a2e]">All lessons</span>
                <span className="text-[13px] tabular-nums text-[#6b7280]">{keeps ? `${summary.completed} of ${summary.total} done` : `${summary.total} lessons`}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              </button>

              {lesson.notes ? (
                <section className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5 sm:py-5">
                  <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
                    <FileText className="h-4 w-4 text-[#9ca3af]" />
                    Notes
                  </h3>
                  <Notes text={lesson.notes} />
                </section>
              ) : null}

              {lesson.attachments.length > 0 ? <Attachments lesson={lesson} /> : null}
            </div>
          ) : null}

          <CreatorBlock data={data} lessonTitle={lesson?.title ?? null} emailsOff={emailsOff} onToggleEmails={keeps && data.access === "owner" ? toggleEmails : null} />
        </div>

        {/* The curriculum: beside the lesson on a computer */}
        <aside className="hidden lg:sticky lg:top-4 lg:block" aria-label="Lessons">
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <CurriculumHead summary={summary} keeps={keeps} />
            <div className="max-h-[calc(100svh-180px)] overflow-y-auto overscroll-contain">
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

function Stage(props: {
  play: Play
  lesson: PlayerLesson | null
  productHref: string | null
  poster: string | null
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
  const { play, lesson } = props
  if (!lesson) {
    return <Panel title="This course has no lessons yet" body="The creator is still adding them. They will be here when they are ready." />
  }
  if (play.state === "loading") {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black sm:rounded-2xl">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading" />
      </div>
    )
  }
  if (play.state === "locked") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[#1a1a2e] px-6 text-center text-white sm:rounded-2xl">
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
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white sm:rounded-2xl">
        <p className="text-[15px] font-semibold">{play.message}</p>
        <button type="button" onClick={props.onRetry} className="h-10 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#1a1a2e]">
          Try again
        </button>
      </div>
    )
  }
  if (play.state === "video") {
    return (
      <LessonVideo
        key={lesson.id}
        source={play.source}
        startAt={props.startAt}
        autoPlay={props.autoPlay}
        poster={props.poster}
        next={props.next}
        renew={props.renew}
        onPlace={props.onPlace}
        live={props.live}
        onNearEnd={props.onNearEnd}
        onNext={props.onNext}
      />
    )
  }
  if (play.state === "external") {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-2xl">
        <iframe
          key={lesson.id}
          src={play.embedUrl}
          title={lesson.title}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }
  /* A lesson that is words only: its notes are the lesson, just below. */
  return <Panel title={lesson.title} body={lesson.notes ? "This lesson is to read. It is below." : "This lesson has no video."} icon />
}

function Panel({ title, body, icon }: { title: string; body: string; icon?: boolean }) {
  return (
    <div className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 border-y border-[#e5e7eb] bg-white px-6 py-10 text-center sm:rounded-2xl sm:border">
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
        <circle cx="22" cy="22" r={r} fill="none" stroke="#ede9fe" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-[#1a1a2e]">{percent}%</span>
    </div>
  )
}

function CurriculumHead({ summary, keeps }: { summary: ReturnType<typeof summarize>; keeps: boolean }) {
  const length = lengthInWords(summary.totalSeconds)
  return (
    <div className="border-b border-[#f0f0f2] px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">Lessons</p>
        <p className="text-[13px] tabular-nums text-[#6b7280]">
          {keeps ? `${summary.completed} of ${summary.total} done` : `${summary.total} lessons`}
          {length ? ` · ${length}` : ""}
        </p>
      </div>
      {keeps ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#ede9fe]" data-progress-bar>
          <div className="h-full rounded-full bg-[#8b5cf6] motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${summary.percent}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function Curriculum({ data, progress, currentId, onPick }: { data: PlayerData; progress: Map<string, LessonProgress>; currentId: string | null; onPick: (l: PlayerLesson) => void }) {
  let n = 0
  return (
    <ol className="pb-2" data-curriculum>
      {data.modules.map((m, mi) => {
        const doneCount = m.lessons.filter((l) => isDone(progress.get(l.id))).length
        return (
          <li key={m.id}>
            <div className="flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-4">
              <p className="min-w-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">
                <span className="text-[#9ca3af]">{mi + 1}.</span> {m.title}
              </p>
              {data.access !== "preview" ? <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{doneCount}/{m.lessons.length}</span> : null}
            </div>
            <ol>
              {m.lessons.map((l) => {
                n += 1
                const current = l.id === currentId
                const finished = isDone(progress.get(l.id))
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onPick(l)}
                      disabled={l.locked}
                      aria-current={current ? "true" : undefined}
                      data-lesson-row={l.id}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${current ? "bg-[#f5f3ff]" : "hover:bg-[#f8f9fa]"} ${l.locked ? "cursor-default" : ""}`}
                    >
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center">
                        {l.locked ? (
                          <Lock className="h-3.5 w-3.5 text-[#9ca3af]" />
                        ) : finished ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8b5cf6] text-white" data-done>
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : current ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#8b5cf6]">
                            <Play className="ml-px h-2.5 w-2.5 text-[#8b5cf6]" fill="currentColor" />
                          </span>
                        ) : (
                          <span className="h-5 w-5 rounded-full border-2 border-[#d1d5db]" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 text-[14px] leading-5 ${current ? "font-semibold text-[#1a1a2e]" : l.locked ? "text-[#9ca3af]" : "text-[#374151]"}`}>
                          {n}. {l.title}
                        </span>
                        {l.isPreview && data.access !== "owner" ? <span className="mt-0.5 block text-[12px] font-medium text-[#8b5cf6]">Free preview</span> : null}
                      </span>
                      {l.durationSeconds ? <span className="mt-px shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{clock(l.durationSeconds)}</span> : null}
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
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[calc(82svh-var(--buyer-tabs-h,0px))] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-[translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${shown ? "translate-y-0" : "translate-y-full"}`}
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

function Attachments({ lesson }: { lesson: PlayerLesson }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5">
      <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
        <Paperclip className="h-4 w-4 text-[#9ca3af]" />
        Files for this lesson
      </h3>
      <ul className="divide-y divide-[#f0f0f2]">
        {lesson.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{a.name}</span>
              {a.size ? <span className="text-[12px] text-[#9ca3af]">{size(a.size)}</span> : null}
            </span>
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

function CreatorBlock({ data, lessonTitle, emailsOff, onToggleEmails }: { data: PlayerData; lessonTitle: string | null; emailsOff: boolean; onToggleEmails: (() => void) | null }) {
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
    <section className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5" data-creator-block>
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
