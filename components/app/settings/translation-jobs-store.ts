"use client"

/**
 * ===========================================================================
 *  TRANSLATE WITH AI, AS THE PAGE SEES IT
 * ===========================================================================
 * The server's background jobs (lib/markets/translation-jobs.ts), read and
 * kept in one place for every part of Settings that shows them: the
 * Languages list and the translation sheet both show the same progress, and
 * a job started in one is seen in the other. While one runs it is read again
 * every two seconds (only while the tab is in view); nothing here stops it.
 *
 * `ready` false: the database has no jobs table yet (SQL part 177), and the
 * caller presses round by round itself, as before.
 */
import { useEffect, useSyncExternalStore } from "react"
import { api } from "@/components/physical/ui"

export interface TranslationJob {
  locale: string
  status: "running" | "done" | "failed"
  done: number
  total: number
  drafted: number
  error: string | null
  startedAt: string
  updatedAt: string
}

interface State {
  /** null until first read. */
  ready: boolean | null
  jobs: Record<string, TranslationJob>
}

let state: State = { ready: null, jobs: {} }
const listeners = new Set<() => void>()
let timer: number | null = null
let reading: Promise<void> | null = null
/* Languages whose start is on its way: a read in between keeps their "Translating" rather than blinking it off. */
const starting = new Set<string>()

function set(next: State) {
  state = next
  for (const l of listeners) l()
  schedule()
}

const running = () => Object.values(state.jobs).some((j) => j.status === "running")

function schedule() {
  if (typeof window === "undefined") return
  if (timer !== null) window.clearTimeout(timer)
  timer = null
  if (!running() || listeners.size === 0) return
  timer = window.setTimeout(() => {
    timer = null
    if (document.visibilityState === "visible") void readJobs()
    else schedule()
  }, 2000)
}

/** Reads every language's job again; one read at a time. */
export function readJobs(): Promise<void> {
  if (reading) return reading
  reading = (async () => {
    const r = await api<{ ready: boolean; jobs: Record<string, TranslationJob> }>("/api/store/translations/jobs")
    if (r.ok) {
      /* An answer without jobs (an older server, a stub) is read as none. */
      const jobs = { ...(r.data.jobs && typeof r.data.jobs === "object" ? r.data.jobs : {}) }
      for (const l of starting) if (jobs[l]?.status !== "running" && state.jobs[l]) jobs[l] = state.jobs[l]
      const ready = r.data.ready !== false
      const same = JSON.stringify(jobs) === JSON.stringify(state.jobs) && ready === state.ready
      if (!same) set({ ready, jobs })
      else schedule()
    } else schedule()
  })().finally(() => {
    reading = null
  })
  return reading
}

export type StartAnswer = { ok: true; job: TranslationJob } | { ok: false; error: string } | { ok: false; fallback: true }

/** Starts translating a language in the background, or joins the job already running for it. */
export async function startTranslation(locale: string): Promise<StartAnswer> {
  /*
    AT ONCE. The press shows "Translating" in the same frame, before the
    server has answered (it reads the website's texts first, two or three
    seconds on a large one, during which the button used to look dead).
    The server's job replaces it, or a refusal takes it away again.
  */
  const before = state.jobs[locale]
  starting.add(locale)
  const now = new Date().toISOString()
  set({ ready: state.ready, jobs: { ...state.jobs, [locale]: { locale, status: "running", done: before?.done ?? 0, total: before?.total ?? 0, drafted: 0, error: null, startedAt: now, updatedAt: now } } })
  const undo = () => {
    const jobs = { ...state.jobs }
    if (before) jobs[locale] = before
    else delete jobs[locale]
    set({ ...state, jobs })
  }
  const r = await api<{ ready: boolean; job?: TranslationJob }>("/api/store/translations/jobs", { method: "POST", body: { locale } }).finally(() => starting.delete(locale))
  if (!r.ok) undo()
  if (!r.ok) {
    /* No jobs table yet (SQL part 177): the caller presses round by round. */
    if ((r as { data?: { ready?: unknown } }).data?.ready === false) {
      set({ ...state, ready: false })
      return { ok: false, fallback: true }
    }
    return { ok: false, error: r.error }
  }
  if (!r.data.ready || !r.data.job) {
    undo()
    return { ok: false, fallback: true }
  }
  set({ ready: true, jobs: { ...state.jobs, [locale]: r.data.job } })
  return { ok: true, job: r.data.job }
}

function subscribe(l: () => void) {
  listeners.add(l)
  schedule()
  return () => {
    listeners.delete(l)
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }
}

const SERVER: State = { ready: null, jobs: {} }

/** Every language's job, read on first use and kept fresh while one runs. */
export function useTranslationJobs(): State {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER)
  useEffect(() => {
    void readJobs()
    const again = () => {
      if (document.visibilityState === "visible") void readJobs()
    }
    document.addEventListener("visibilitychange", again)
    return () => document.removeEventListener("visibilitychange", again)
  }, [])
  return s
}
