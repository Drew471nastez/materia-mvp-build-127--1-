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
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, ListVideo, Loader2, Lock, Mail, Play, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { LessonVideo, type VideoSource } from "./lesson-video"
import { CourseRing } from "./course-ring"
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

/*
  ROUND 29, ONE INK FOR THE LIBRARY AND A COMMUNITY (the owner: "there should be no orange accent"). Round 26's orange is
  gone from the course, the ring, the bars, the checks and the buttons. What moves you on is Storelib's near black
  (#1a1a2e), which the dark look draws as graphite for a button (its classes, app/theme-dark.css) and as light ink for a
  ring or a bar (--sl-course-ink and --sl-course-track, scripts/gen-theme-dark.mjs). A course in the library and a
  program in a community are the same player in the same ink; a community's violet was never its accent here either.

  The buttons: one radius, a colour change on hover and a small give when pressed (scale, never a move sideways).
*/
const BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 touch-manipulation [-webkit-tap-highlight-color:transparent]"
const QUIET = `${BTN} border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] active:bg-[#f1f2f4]`
const INK = `${BTN} bg-[#1a1a2e] text-white hover:bg-[#2a2a40] active:bg-[#0f0f1c]`
const INK_DONE = `${BTN} border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] active:bg-[#f1f2f4]`
/** The ink a ring, a bar or the current lesson's mark is drawn in: near black, light ink in the dark look. */
const INK_VAR = "var(--sl-course-ink, #1a1a2e)"
const TRACK_VAR = "var(--sl-course-track, #eceef1)"
/** A card on the page: the app's card, the same in the library and a community. */
const CARD_BOX = "rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-16px_rgba(16,24,40,0.12)]"

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
  const panel = `overflow-hidden ${CARD_BOX}`
  const moduleTitle = lesson && outline.length > 1 ? (outline.find((m) => m.id === lesson.moduleId)?.title ?? null) : null
  const stage = (
    <Stage
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
  const complete =
    lesson && keeps && !lesson.locked ? <CompleteButton done={done} onToggle={() => setComplete(lesson.id, !done)} className="h-11 w-full shrink-0 sm:mt-1 sm:h-10 sm:w-auto" /> : null
  const lessonBody = lesson ? (
    <>
      <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <LessonHead lesson={lesson} number={lessonNumber(outline, lesson.id)} total={lessons.length} moduleTitle={moduleTitle} complete={complete} />
        {!embedded && lessons.length > 1 ? (
          /* On a phone and a tablet the curriculum is a sheet, opened from one full row under the lesson's title. */
          <button
            type="button"
            onClick={() => setSheet(true)}
            data-open-lessons
            className="mt-4 flex h-12 w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-[#f8f9fa] active:scale-[0.99] active:bg-[#f1f2f4] motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent] lg:hidden"
          >
            <ListVideo className="h-4 w-4 shrink-0 text-[#6b7280]" />
            <span className="flex-1 text-[14px] font-semibold text-[#1a1a2e]">All lessons</span>
            <span className="text-[13px] tabular-nums text-[#6b7280]">{keeps ? `${summary.completed} of ${summary.total} done` : `${summary.total} lessons`}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
          </button>
        ) : null}
        {lesson.notes ? (
          <div className="mt-4 max-w-[68ch]" data-lesson-text="">
            <Notes text={lesson.notes} />
          </div>
        ) : lesson.kind === "text" && !lesson.locked ? (
          <p className="mt-3 text-[14px] text-[#6b7280]" data-lesson-text="">
            Nothing is written for this lesson yet.
          </p>
        ) : null}
        {lesson.attachments.length > 0 ? <Attachments lesson={lesson} /> : null}
      </div>
      {/* The foot: the lessons either side, named, across the card. */}
      {prev || next ? (
        <footer className="border-t border-[#eef0f2] px-4 py-4 sm:px-6" data-lesson-foot="">
          <nav aria-label="Lessons either side" className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
            <PagerCell side="prev" lesson={prev} alone={!next} onPick={() => goTo(prev, false)} />
            <PagerCell side="next" lesson={next} alone={!prev} onPick={() => goTo(next, false)} />
          </nav>
        </footer>
      ) : null}
    </>
  ) : null

  if (embedded) {
    /*
      A LESSON INSIDE A COMMUNITY (round 18). One card for the lesson: its video or embed across the top (none for a lesson
      that is text), then where it sits in the program, its title, its text at a reading width, its files, and at the foot
      the lessons either side named, so the next step is one press and says where it goes. The lessons stay beside it on
      a computer and sit under it on a phone, in the page, never in a sheet. The program's title and how far through it
      the member is head the page; on a computer the list beside carries the progress. Round 29: the library's player is
      now this same card, so the two read as one product.
    */
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
          <article ref={topRef} data-lesson-column="" className={`min-w-0 scroll-mt-[calc(var(--community-top,65px)+12px)] overflow-hidden ${CARD_BOX}`}>
            {stage ? <div data-lesson-stage="">{stage}</div> : null}
            {lessonBody}
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
              <LessonsScroll currentId={lessonId} className="max-h-[min(560px,calc(100svh-var(--community-top,64px)-120px))]">
                <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
              </LessonsScroll>
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

  /*
    THE LIBRARY'S PLAYER (round 29: the owner's "storelib better clean"). The course, who made it and the ring at the
    top; then the community's lesson card (above): the video across its top, the lesson's place, title and Mark as
    complete, its text and files, and the lessons either side at its foot. On a phone the card runs edge to edge, so the
    video does; the lessons are a sheet from "All lessons". From 1024px the lessons sit beside it, sticking.
  */
  return (
    <div data-course-player="" className="pb-8 sm:pb-10">
      <header className="mb-4 flex items-center gap-3 sm:mb-5">
        <BackButton href={backHref} label={backLabel} onBack={onBack} />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-[17px] font-bold leading-tight tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">{data.title}</h1>
          <p className="mt-0.5 truncate text-[13px] text-[#6b7280] sm:text-[14px]">
            by{" "}
            {data.creator.storeHref ? (
              <Link href={data.creator.storeHref} className="font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e]">
                {data.creator.name}
              </Link>
            ) : (
              <span className="font-medium text-[#4b5563]">{data.creator.name}</span>
            )}
          </p>
        </div>
        {keeps ? <CourseRing percent={summary.percent} label={`${summary.percent}% complete`} size={44} probe="player" /> : null}
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
        <div className="min-w-0">
          <article
            ref={topRef}
            data-lesson-column=""
            className="-mx-4 min-w-0 overflow-hidden border-y border-[#e6e8ec] bg-white sm:mx-0 sm:rounded-2xl sm:border sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-16px_rgba(16,24,40,0.12)]"
          >
            {stage ? <div data-lesson-stage="">{stage}</div> : null}
            {lessonBody}
          </article>
          {data.contact !== false ? (
            <div className={`mt-4 px-4 py-4 sm:px-5 ${CARD_BOX}`}>
              <CreatorBlock data={data} lessonTitle={lesson?.title ?? null} emailsOff={emailsOff} onToggleEmails={keeps && data.access === "owner" ? toggleEmails : null} />
            </div>
          ) : null}
        </div>

        {/* The curriculum: beside the lesson on a computer. */}
        <aside className="sticky top-6 hidden lg:block" aria-label="Lessons">
          <div className={panel}>
            <CurriculumHead summary={summary} keeps={keeps} />
            <LessonsScroll currentId={lessonId} className="max-h-[min(560px,calc(100svh-150px))]">
              <Curriculum data={data} progress={progress} currentId={lessonId} onPick={(l) => goTo(l, true)} />
            </LessonsScroll>
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

/**
 * The way back (round 29, the owner: the arrow "bumps left and right"). It used to slide half a pixel left on hover and
 * spring its shadow, and the library's and the community's were two different buttons. Now one, in both places: on
 * hover only its ground changes, on a press it gives a little (scale from its centre), and it never moves sideways.
 */
function BackButton({ href, label, onBack }: { href: string; label: string; onBack?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={onBack}
      data-native-nav={onBack ? "" : undefined}
      data-lesson-back=""
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e6e8ec] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-[background-color,border-color,scale] duration-150 ease-out hover:border-[#dcdfe4] hover:bg-[#f3f4f6] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent]"
    >
      <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
    </Link>
  )
}

/** A thin bar of how far through: ink on a faint track, drawn with a scale so it moves on the compositor. */
function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${className}`} style={{ backgroundColor: TRACK_VAR }} data-progress-bar="">
      <div
        data-ink=""
        className="h-full origin-left rounded-full motion-safe:transition-[scale] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ scale: `${Math.max(0, Math.min(100, percent)) / 100} 1`, backgroundColor: INK_VAR }}
      />
    </div>
  )
}

/** Mark as complete, and Completed with its check filled: the same button in the library and a community. */
function CompleteButton({ done, onToggle, className = "" }: { done: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" data-mark-complete aria-pressed={done} onClick={onToggle} className={`${done ? INK_DONE : INK} ${className}`}>
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-200 ${done ? "bg-[#1a1a2e] text-white" : "border-[1.5px] border-current/60"}`}>
        <Check className={`h-3 w-3 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${done ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} strokeWidth={3} />
      </span>
      {done ? "Completed" : "Mark as complete"}
    </button>
  )
}

/**
 * ROUND 27, THE LESSON'S HEAD: where it sits and how long it is, its title, and Mark as complete beside the title from
 * 640px (under it on a phone, the full width), so finishing a lesson is where the eye already is.
 */
function LessonHead({ lesson, number, total, moduleTitle, complete }: { lesson: PlayerLesson; number: number; total: number; moduleTitle: string | null; complete: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6" data-lesson-head="">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium tabular-nums text-[#6b7280]">
          {total > 1 ? `Lesson ${number} of ${total}` : "Lesson"}
          {moduleTitle ? <span className="text-[#9ca3af]"> · {moduleTitle}</span> : null}
          {lesson.durationSeconds ? <span className="text-[#9ca3af]"> · {lengthInWords(lesson.durationSeconds) || clock(lesson.durationSeconds)}</span> : null}
        </p>
        <h2 className="mt-1 text-[20px] font-bold leading-[1.25] tracking-[-0.015em] text-[#1a1a2e] sm:text-[23px]" data-lesson-title="">
          {lesson.title}
        </h2>
      </div>
      {complete}
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
      className={`flex h-14 min-w-0 items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-3 text-left transition-[background-color,border-color,scale] duration-150 ease-out hover:border-[#d6d9de] hover:bg-[#f8f9fa] active:scale-[0.99] active:bg-[#f1f2f4] motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent] sm:h-[52px] ${place} ${next ? "flex-row-reverse text-right" : ""}`}
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
  const { play, lesson } = props
  /*
    The lesson's card clips the stage to its own corners, in the library and in a community alike (round 29). The stage
    is the same in both looks: its black and its white buttons are written as rgb values, which the dark stylesheet
    does not remap (it turned bg-black into graphite and the video's white bar into charcoal), the same as the video's.
  */
  if (!lesson) {
    return (
      <div className="p-4 sm:p-6">
        <Panel title="This course has no lessons yet" body="The creator is still adding them. They will be here when they are ready." />
      </div>
    )
  }
  /* A lesson that is words only has no stage: its text is the lesson, and it starts right under the title. Round 33: its cover, when it has one, stands where a video would. */
  if (play.state === "text") {
    if (!lesson.coverUrl || lesson.locked) return null
    return (
      <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]" data-lesson-cover="">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lesson.coverUrl} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    )
  }
  if (play.state === "loading") {
    /*
      THE STILL (round 18): while the lesson's video is asked for, its own box, black like the video, at the 16:9 the video
      is drawn in, so nothing under it moves when the video arrives. It used to be the program's cover at 60%, then the
      cover again as the video's poster: the owner saw the program's picture before every lesson. A small spinner joins
      only past half a second (@starting-style, no script), so a lesson read ahead never flashes one.
    */
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-[rgb(0,0,0)]" data-stage-loading="" data-stage-still="">
        <span className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity delay-500 duration-300 starting:opacity-0 motion-reduce:transition-none">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-label="Loading" />
        </span>
      </div>
    )
  }
  if (play.state === "locked") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[rgb(17,17,19)] px-6 text-center text-white" data-keep-bright="">
        <Lock className="h-6 w-6 text-white/70" />
        <p className="text-[15px] font-semibold">This lesson is part of the full course</p>
        {props.productHref ? (
          <Link href={props.productHref} className="inline-flex h-10 items-center rounded-xl bg-[rgba(255,255,255,0.95)] px-4 text-[14px] font-semibold text-[rgb(17,17,19)] transition-[background-color,scale] duration-150 hover:bg-[rgb(255,255,255)] active:scale-[0.97]">
            Get the course
          </Link>
        ) : null}
      </div>
    )
  }
  if (play.state === "error") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[rgb(0,0,0)] px-6 text-center text-white" data-keep-bright="">
        <p className="text-[15px] font-semibold">{play.message}</p>
        <button type="button" onClick={props.onRetry} className="h-10 rounded-xl bg-[rgba(255,255,255,0.95)] px-4 text-[14px] font-semibold text-[rgb(17,17,19)] transition-[background-color,scale] duration-150 hover:bg-[rgb(255,255,255)] active:scale-[0.97]">
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
        className=""
      />
    )
  }
  return <ExternalStage key={lesson.id} url={play.embedUrl} title={lesson.title} />
}

/** A YouTube or Vimeo lesson: its player fades in over the black box once it has loaded, never a white frame first. */
function ExternalStage({ url, title }: { url: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[rgb(0,0,0)]">
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

function CurriculumHead({ summary, keeps }: { summary: ReturnType<typeof summarize>; keeps: boolean }) {
  const length = lengthInWords(summary.totalSeconds)
  return (
    <div className="border-b border-[#f0f1f3] px-4 pb-3.5 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">Lessons</p>
        <p className="text-[12.5px] tabular-nums text-[#6b7280]">
          {keeps ? `${summary.completed} of ${summary.total} done` : `${summary.total}`}
          {length ? <span className="text-[#9ca3af]"> · {length}</span> : null}
        </p>
      </div>
      {keeps ? <ProgressBar percent={summary.percent} className="mt-3 h-1" /> : null}
    </div>
  )
}

/** Brings the current lesson's row into view inside its own list (never the page): at once on open, gliding after. */
function revealCurrent(box: HTMLElement | null, smooth: boolean) {
  const row = box?.querySelector<HTMLElement>("[data-lesson-current]")
  if (!box || !row) return
  const b = box.getBoundingClientRect()
  const r = row.getBoundingClientRect()
  if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  box.scrollTo({ top: Math.max(0, box.scrollTop + (r.top - b.top) - b.height / 3), behavior: smooth && !still ? "smooth" : ("instant" as ScrollBehavior) })
}

/** The list beside the lesson scrolls on its own, and keeps the lesson being watched in view as it changes. */
function LessonsScroll({ currentId, className, children }: { currentId: string | null; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRef(false)
  useEffect(() => {
    revealCurrent(ref.current, seen.current)
    seen.current = true
  }, [currentId])
  return (
    <div ref={ref} className={`overflow-y-auto overscroll-contain ${className}`}>
      {children}
    </div>
  )
}

/*
  ROUND 29, THE LESSONS LIST (the owner: "cleaner, smoother, more modern"). One quiet row per lesson: a small round mark,
  the title and its length. The mark says the state on its own: the number while it waits, filled ink with a check once
  done, an ink ring with a play mark for the lesson being watched, a lock while closed. The lesson being watched also
  sits on a soft grey ground; nothing else is coloured. A module is its title and its count over a hairline.
*/
function Curriculum({ data, progress, currentId, onPick }: { data: PlayerData; progress: Map<string, LessonProgress>; currentId: string | null; onPick: (l: PlayerLesson) => void }) {
  const multiModule = data.modules.length > 1
  let n = 0
  return (
    <ol className="px-2 pb-2 pt-1" data-curriculum>
      {data.modules.map((m, mi) => {
        const showModule = multiModule || m.lessons.length > 1
        const doneCount = m.lessons.filter((l) => isDone(progress.get(l.id))).length
        return (
          <li key={m.id} className={mi > 0 ? "mt-1 border-t border-[#f0f1f3] pt-1" : undefined}>
            {showModule ? (
              <div className="flex items-baseline justify-between gap-3 px-2.5 pb-1.5 pt-3">
                <p className="min-w-0 truncate text-[12.5px] font-semibold text-[#4b5563]">{m.title}</p>
                {data.access !== "preview" && m.lessons.length > 1 ? (
                  <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-[#9ca3af]" data-module-progress="">
                    {doneCount}/{m.lessons.length}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ol className="space-y-px">
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
                      className={`flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                        current ? "bg-[#f3f4f6]" : l.locked ? "" : "hover:bg-[#f8f9fa] active:bg-[#f3f4f6]"
                      } ${l.locked ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <LessonMark number={number} locked={l.locked} finished={finished} current={current} />
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 text-[13.5px] leading-5 ${current ? "font-semibold text-[#1a1a2e]" : l.locked ? "text-[#9ca3af]" : finished ? "font-medium text-[#6b7280]" : "font-medium text-[#374151]"}`}>
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

/** A lesson's place in the course: its number, a check once done, a play mark while it is the one open, a lock while closed. */
function LessonMark({ number, locked, finished, current }: { number: number; locked: boolean; finished: boolean; current: boolean }) {
  const base = "mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-200"
  if (locked)
    return (
      <span className={`${base} bg-[#f3f4f6] text-[#9ca3af]`}>
        <Lock className="h-3 w-3" />
      </span>
    )
  if (finished)
    return (
      <span className={`${base} bg-[#1a1a2e] text-white`} data-done="">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    )
  if (current)
    return (
      <span className={`${base} text-[#1a1a2e]`} style={{ boxShadow: `inset 0 0 0 1.5px ${INK_VAR}` }}>
        <Play className="ml-px h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
      </span>
    )
  return (
    <span className={`${base} text-[#6b7280]`} style={{ boxShadow: "inset 0 0 0 1px var(--sl-course-line, #e3e5e9)" }}>
      {number}
    </span>
  )
}

/** The curriculum as a sheet from the bottom, on a phone and a tablet. */
function LessonSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const listRef = useRef<HTMLDivElement>(null)
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
    const id = requestAnimationFrame(() => {
      setShown(open)
      /* Opened on the lesson being watched, wherever it is in the list. */
      if (open) revealCurrent(listRef.current, false)
    })
    return () => cancelAnimationFrame(id)
  }, [open, mounted])
  if (!mounted) return null
  return (
    /* Above the phone's tab bar, never over it (--buyer-tabs-h, app/globals.css): the bar stays a way out. */
    <div className="fixed inset-x-0 top-0 z-[80] lg:hidden" style={{ bottom: "var(--buyer-tabs-h, 0px)" }} role="dialog" aria-modal="true" aria-label="Lessons" data-lesson-sheet={shown ? "open" : "closed"}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[calc(82svh-var(--buyer-tabs-h,0px))] flex-col rounded-t-[20px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-[translate] duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${shown ? "translate-y-0" : "translate-y-full"}`}
        /* The home indicator's inset is under the tab bar when there is one; only without it does the sheet keep its own. */
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px) - var(--buyer-tabs-h, 0px))" }}
        onTransitionEnd={() => !open && setMounted(false)}
      >
        <div className="relative flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-[#d1d5db]" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition-[background-color,scale] duration-150 hover:bg-[#f3f4f6] active:scale-[0.94]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
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
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-[3px] transition-colors hover:decoration-[#1a1a2e]">
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

/** The lesson's files, under its text in the same card: a name to open (a picture or a video) and Download beside it. */
function Attachments({ lesson }: { lesson: PlayerLesson }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="mt-6 max-w-[68ch]" data-lesson-files="">
      <h3 className="mb-1 text-[13px] font-semibold text-[#6b7280]">Files</h3>
      <ul className="divide-y divide-[#f0f0f2] border-y border-[#f0f0f2]">
        {lesson.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280]" aria-hidden>
              <FileText className="h-4 w-4" />
            </span>
            {(() => {
              const kind = mediaKindOf(a.name)
              const label = (
                <>
                  <span className={`block truncate text-[14px] font-medium text-[#1a1a2e] ${kind ? "underline decoration-[#d1d5db] underline-offset-2" : ""}`}>{a.name}</span>
                  {a.size ? <span className="text-[12px] tabular-nums text-[#9ca3af]">{size(a.size)}</span> : null}
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
              className={`${QUIET} h-9 rounded-[10px] px-3 max-sm:w-9 max-sm:px-0`}
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

/** Who made it, a way to write to them (a buyer only), and the reminder emails. In a community it closes the lesson's card. */
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
    <section className={embedded ? "mt-1 border-t border-[#f0f1f3] pt-5" : ""} data-creator-block>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[200px] items-center gap-3">
          <AppAvatar src={data.creator.avatarUrl} name={data.creator.name} size={40} alt="" />
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
            className="w-full resize-y rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[16px] leading-6 text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#9ca3af] focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[15px]"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#9ca3af]">Their reply comes to your email.</p>
            <button type="button" onClick={send} disabled={state.sending || message.trim().length < 2} className={`${INK} disabled:opacity-50`}>
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
          <input type="checkbox" checked={!emailsOff} onChange={onToggleEmails} className="h-4 w-4 shrink-0" style={{ accentColor: INK_VAR }} />
        </label>
      ) : null}
    </section>
  )
}
