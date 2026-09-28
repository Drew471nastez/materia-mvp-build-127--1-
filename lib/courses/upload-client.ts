"use client"

/**
 * A lesson's file, from the creator's browser to the private bucket
 * (app/api/courses/manage): the server picks the path and signs an upload
 * address for it, the bytes go in one PUT with real progress, then the
 * server checks what arrived and attaches it to the lesson. Answers with
 * the course as it now is.
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

function put(url: string, file: File, onProgress: (p: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100)))
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload did not finish. Try again."))))
    xhr.addEventListener("error", () => reject(new Error("The upload stopped. Check your connection and try again.")))
    xhr.addEventListener("abort", () => reject(new UploadStopped("Upload stopped")))
    signal?.addEventListener("abort", () => xhr.abort())
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.setRequestHeader("Cache-Control", "max-age=31536000")
    xhr.send(file)
  })
}

export async function uploadLessonFile(input: {
  productId: string
  lessonId: string
  kind: LessonFileKind
  file: File
  onProgress: (percent: number) => void
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
  await put(String(prepared.signedUrl), input.file, input.onProgress, input.signal)
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
