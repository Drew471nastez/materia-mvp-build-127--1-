"use client"

/**
 * A lesson's file, from the creator's browser to the private bucket
 * (app/api/courses/manage): the server picks the path and signs an upload
 * address for it, the bytes go in one PUT with real progress (sent again
 * after a dropped connection, see put below), then the server checks what
 * arrived and attaches it to the lesson. Answers with the course as it
 * now is.
 */
import type { EditorTree } from "./types"

export type LessonFileKind = "video" | "captions" | "attachment"

export class UploadStopped extends Error {}

async function manage(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/courses/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "That did not save. Try again.")
  return json
}

/** What went wrong with the PUT, in a sentence a creator can act on. */
export function putFailure(status: number, body: string): string {
  const text = body.toLowerCase()
  if (status === 413 || /"statuscode":\s*"413"|exceeded the maximum|payload too large|too large/.test(text)) {
    return "That file is larger than storage takes in one upload. Try a smaller or compressed export."
  }
  if (status === 401 || status === 403 || /expired|invalid signature|jwt/.test(text)) return "The upload took too long to start. Try again."
  return "The upload did not finish. Try again."
}

/** A PUT that storage already has: a second send after an answer that never arrived. */
function alreadyThere(status: number, body: string): boolean {
  return status === 409 || /"statuscode":\s*"409"|already exists|duplicate/i.test(body)
}

class Dropped extends Error {}

function putOnce(url: string, file: File, onProgress: (sent: number) => void, signal?: AbortSignal, retried = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => onProgress(e.loaded))
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      if (retried && alreadyThere(xhr.status, xhr.responseText || "")) return resolve()
      reject(new Error(putFailure(xhr.status, xhr.responseText || "")))
    })
    xhr.addEventListener("error", () => reject(new Dropped("The upload stopped. Check your connection and try again.")))
    xhr.addEventListener("abort", () => reject(new UploadStopped("Upload stopped")))
    if (signal?.aborted) return reject(new UploadStopped("Upload stopped"))
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.setRequestHeader("Cache-Control", "max-age=31536000")
    xhr.send(file)
  })
}

/** Tries after a dropped connection, and the wait before each. */
export const PUT_RETRY_DELAYS_MS = [1500, 5000, 15000] as const
/** How long a dropped upload waits for the connection to come back before it gives up. */
const OFFLINE_WAIT_MS = 120_000

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new UploadStopped("Upload stopped"))
    }, { once: true })
  })
}

function backOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(t)
      window.removeEventListener("online", done)
      resolve()
    }
    const t = setTimeout(done, OFFLINE_WAIT_MS)
    window.addEventListener("online", done)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      window.removeEventListener("online", done)
      reject(new UploadStopped("Upload stopped"))
    }, { once: true })
  })
}

/*
  A DROPPED CONNECTION IS TRIED AGAIN, NOT REPORTED. A two gigabyte lesson
  on a train loses its connection at some point, and "The upload stopped"
  after forty minutes, with a button to start over, is the worst answer. So
  a PUT that fails on the network (not one storage refused) waits for the
  connection to come back and is sent again, up to three more times, from
  the start of the file: the signed address takes one whole object, so
  there is no part to continue from here. The row says so while it waits
  (onRetry). A send whose answer was lost after storage kept the file comes
  back "already there", which is the file arriving, and the server checks
  its size and first bytes where it landed either way (upload-complete).
*/
async function put(url: string, file: File, onProgress: (percent: number, sent: number) => void, signal?: AbortSignal, onRetry?: (attempt: number) => void): Promise<void> {
  const report = (sent: number) => onProgress(file.size ? Math.min(100, Math.round((sent / file.size) * 100)) : 0, sent)
  for (let attempt = 0; ; attempt++) {
    try {
      await putOnce(url, file, report, signal, attempt > 0)
      report(file.size)
      return
    } catch (e) {
      if (!(e instanceof Dropped) || attempt >= PUT_RETRY_DELAYS_MS.length) throw e
      onRetry?.(attempt + 1)
      report(0)
      await backOnline(signal)
      await pause(PUT_RETRY_DELAYS_MS[attempt], signal)
    }
  }
}

export async function uploadLessonFile(input: {
  productId: string
  lessonId: string
  kind: LessonFileKind
  file: File
  /** How far, in percent and in bytes sent. */
  onProgress: (percent: number, sent: number) => void
  /** A dropped connection is being tried again (the attempt, from 1). */
  onRetry?: (attempt: number) => void
  signal?: AbortSignal
}): Promise<EditorTree> {
  const prepared = await manage({
    action: "upload-prepare",
    productId: input.productId,
    lessonId: input.lessonId,
    kind: input.kind,
    fileName: input.file.name,
    contentType: input.file.type,
    fileSize: input.file.size,
  })
  await put(String(prepared.signedUrl), input.file, input.onProgress, input.signal, input.onRetry)
  const done = await manage({
    action: "upload-complete",
    productId: input.productId,
    lessonId: input.lessonId,
    kind: input.kind,
    path: prepared.path,
    fileName: input.file.name,
    contentType: input.file.type,
  })
  return done.tree as EditorTree
}

export async function manageCourse(body: Record<string, unknown>): Promise<EditorTree> {
  return (await manage(body)).tree as EditorTree
}

/** A video's length, read in the browser from the file itself, or null. */
export function videoLength(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement("video")
      const done = (n: number | null) => {
        URL.revokeObjectURL(url)
        resolve(n)
      }
      v.preload = "metadata"
      v.muted = true
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null)
      v.onerror = () => done(null)
      setTimeout(() => done(null), 8000)
      v.src = url
    } catch {
      resolve(null)
    }
  })
}
