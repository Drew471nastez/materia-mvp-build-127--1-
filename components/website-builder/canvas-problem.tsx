"use client"

import { useEffect, useState } from "react"
import { tt } from "@/lib/i18n/text"

/**
 * WHEN THE CANVAS CANNOT SHOW THE PAGE, IT SAYS SO, with the one thing to do
 * about it. Before, a canvas that could not load sat on its grey outline (or
 * its loader) with nothing to say and nothing to press, which reads as the
 * builder being broken. Laid over the canvas: the editor's own page
 * (app/website-builder/editor) and an imported theme's frame
 * (components/website-builder/compat/compat-canvas.tsx) both use it.
 */
export function CanvasProblem({
  kind,
  title,
  body,
  onRetry,
  busy = false,
}: {
  /** A hook for probes and tests: what went wrong, in a word. */
  kind: string
  title: string
  body: string
  onRetry: () => void
  /** A try is under way: the button waits rather than being pressed twice. */
  busy?: boolean
}) {
  return (
    <div data-canvas-problem={kind} role="status" className="absolute inset-x-0 top-[22%] z-[2] flex justify-center px-4">
      <div className="flex max-w-[320px] flex-col items-center rounded-2xl border border-[#e5e7eb]/80 bg-white px-6 py-5 text-center shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)]">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
        <p className="mt-1 text-[13.5px] text-[#6b7280]">{body}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="mt-4 h-9 rounded-lg bg-[#1a1a2e] px-4 text-[13.5px] font-medium text-white transition-[opacity,scale] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
        >
          {busy ? tt("Trying again") : tt("Try again")}
        </button>
      </div>
    </div>
  )
}

/**
 * The outline of a page (a header, a large picture, a row of cards) in the
 * builder's lightest grey, not pulsing: what the canvas shows while an
 * imported theme's first page is on its way (compat-canvas.tsx,
 * CanvasPlaceholder, and CompatCanvasWaiting below).
 */
export function PageOutline() {
  const bar = "rounded-md bg-[#f1f2f4]"
  return (
    <>
      <div className="flex h-16 items-center gap-6 border-b border-[#f3f4f6] px-[4%]">
        <div className={`${bar} h-5 w-24`} />
        <div className="hidden gap-4 sm:flex">
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-14`} />
        </div>
        <div className="ml-auto flex gap-3">
          <div className={`${bar} h-5 w-5 rounded-full`} />
          <div className={`${bar} h-5 w-5 rounded-full`} />
        </div>
      </div>
      <div className="px-[4%] pt-6">
        <div className={`${bar} h-[42vh] max-h-[460px] min-h-[220px] w-full rounded-xl`} />
        <div className={`${bar} mt-8 h-5 w-48`} />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className={`${bar} aspect-[4/5] w-full rounded-lg`} />
              <div className={`${bar} mt-3 h-3 w-3/4`} />
              <div className={`${bar} mt-2 h-3 w-1/3`} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/** How long the canvas's own code may take to arrive before the outline offers to reload. */
export const CANVAS_CODE_SLOW_MS = 15_000

/**
 * WHILE AN IMPORTED THEME'S CANVAS CODE IS ON ITS WAY. The canvas is loaded
 * on its own (the editor's `dynamic` import), and until it arrives the
 * canvas showed nothing at all: once the editor's loader stepped aside, a
 * white page, for as long as a slow connection took. Now it is the outline
 * the canvas itself starts with, and a wait that goes on offers a reload.
 */
export function CompatCanvasWaiting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), CANVAS_CODE_SLOW_MS)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div data-canvas-placeholder="up" aria-busy className="relative w-full overflow-hidden bg-white" style={{ height: "max(320px, 100cqh)" }}>
      <PageOutline />
      {slow ? (
        <CanvasProblem kind="code" title={tt("This is taking longer than usual")} body={tt("The editor is still loading your theme.")} onRetry={() => window.location.reload()} />
      ) : null}
    </div>
  )
}
