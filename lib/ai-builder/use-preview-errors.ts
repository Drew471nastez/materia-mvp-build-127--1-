"use client"

/**
 * The editor's half of the preview error bridge (./preview-errors.ts): while
 * an AI job is building this website, a section script that throws in the
 * canvas is posted to the job, at most every couple of seconds, each error
 * once. With no job, nothing listens and nothing is sent.
 */
import { useEffect, useRef } from "react"
import { PREVIEW_ERROR_EVENT, PREVIEW_ERROR_LIMITS, PreviewErrorQueue, acceptPreviewError } from "./preview-errors"

export function usePreviewErrorBridge(input: { jobId: string | null; installId: string; page: string; typeOf: (sectionId: string) => string | null }): void {
  const ref = useRef(input)
  ref.current = input
  const jobId = input.jobId
  useEffect(() => {
    if (!jobId) return
    const queue = new PreviewErrorQueue()
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      const errors = queue.take()
      if (!errors.length) return
      void fetch(`/api/website-builder/ai-jobs/${encodeURIComponent(jobId)}/preview-errors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ errors }),
        keepalive: true,
      }).catch(() => {})
      if (queue.size) timer = setTimeout(flush, PREVIEW_ERROR_LIMITS.flushMs)
    }
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ sectionId?: unknown; message?: unknown }>).detail ?? {}
      const sectionId = typeof detail.sectionId === "string" ? detail.sectionId : ""
      const { installId, page, typeOf } = ref.current
      const e = acceptPreviewError({ sectionId, type: typeOf(sectionId) ?? "", page, message: detail.message }, { installId })
      if (!e || !queue.add(e)) return
      if (!timer) timer = setTimeout(flush, PREVIEW_ERROR_LIMITS.flushMs)
    }
    window.addEventListener(PREVIEW_ERROR_EVENT, onError)
    return () => {
      window.removeEventListener(PREVIEW_ERROR_EVENT, onError)
      if (timer) clearTimeout(timer)
      flush()
    }
  }, [jobId])
}
