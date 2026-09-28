"use client"

import { useSyncExternalStore } from "react"

/**
 * ===========================================================================
 *  WHAT EVERY DOWNLOAD ON THIS PAGE IS DOING, IN ONE PLACE
 * ===========================================================================
 * lib/downloads/download-file.ts writes here and the buttons read from here:
 * a row's own button says "34%", and the tray at the bottom of the screen
 * (components/downloads/download-tray.tsx) shows the file, its bar and the
 * one thing left to press. Neither has to be handed the other, so a Download
 * on the receipt, in the library and on a product page all report the same
 * way without any of them mounting anything.
 *
 * A job is keyed by what was asked for: the asset id, or the address for a
 * file with no asset (an invoice). Pressing the same file twice finds the
 * job that is already running instead of starting a second one.
 */

export type DownloadPhase =
  /** Asking the server for the file's short lived address. */
  | "preparing"
  /** Bytes arriving, with a number to show when the size is known. */
  | "downloading"
  /** In memory on an iPhone, waiting for a tap on Save to Files (a share needs a fresh tap). */
  | "ready"
  /** On the phone: in Downloads on Android, handed to the share sheet on iOS. */
  | "saved"
  /** Given to Safari or Chrome, which save it themselves. */
  | "handoff"
  | "failed"

/** How the file is travelling, which decides what the tray offers. */
export type DownloadRoute = "web" | "app" | "share" | "system"

export interface DownloadJob {
  key: string
  fileName: string
  phase: DownloadPhase
  route: DownloadRoute
  platform: "ios" | "android" | "web"
  /** Bytes so far and in all. `total` is 0 when nobody said. */
  loaded: number
  total: number
  /** The sentence under the name once there is one to say. */
  message?: string
  /** The file itself, only on the iPhone share route and only until it is saved. */
  file?: File
  /** The signed address, kept only for the few minutes it lives, for "Open in Safari" when a share fails. */
  url?: string
  /** The app's own id for the download, for Open and Share again. */
  nativeId?: string
  /** Stops the transfer, where there is one to stop. */
  cancel?: () => void
  /** For ordering the tray, newest at the bottom. */
  startedAt: number
}

type Listener = () => void

let jobs: ReadonlyArray<DownloadJob> = []
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function downloadJobs(): ReadonlyArray<DownloadJob> {
  return jobs
}

export function downloadJob(key: string): DownloadJob | undefined {
  return jobs.find((j) => j.key === key)
}

/** A new job, replacing a finished one with the same key. */
export function startJob(job: Omit<DownloadJob, "startedAt" | "loaded" | "total"> & Partial<Pick<DownloadJob, "loaded" | "total">>): DownloadJob {
  const next: DownloadJob = { loaded: 0, total: 0, ...job, startedAt: Date.now() }
  jobs = [...jobs.filter((j) => j.key !== job.key), next]
  emit()
  return next
}

export function patchJob(key: string, patch: Partial<DownloadJob>): void {
  let changed = false
  jobs = jobs.map((j) => {
    if (j.key !== key) return j
    changed = true
    return { ...j, ...patch }
  })
  if (changed) emit()
}

export function removeJob(key: string): void {
  const before = jobs.length
  jobs = jobs.filter((j) => j.key !== key)
  if (jobs.length !== before) emit()
}

/** A job that is still moving, so a second press waits for it instead. */
export function isBusy(job: DownloadJob | undefined): boolean {
  return !!job && (job.phase === "preparing" || job.phase === "downloading")
}

/** 0 to 100, or null when the size is not known and a bar would lie. */
export function percentOf(job: Pick<DownloadJob, "loaded" | "total"> | undefined): number | null {
  if (!job || !job.total || job.total <= 0) return null
  return Math.max(0, Math.min(100, Math.floor((job.loaded / job.total) * 100)))
}

const EMPTY: ReadonlyArray<DownloadJob> = []

/** Every job, for the tray. */
export function useDownloadJobs(): ReadonlyArray<DownloadJob> {
  return useSyncExternalStore(subscribeDownloads, downloadJobs, () => EMPTY)
}

/** One job, for the button that started it. */
export function useDownloadJob(key: string | null | undefined): DownloadJob | undefined {
  return useSyncExternalStore(
    subscribeDownloads,
    () => (key ? downloadJob(key) : undefined),
    () => undefined,
  )
}
