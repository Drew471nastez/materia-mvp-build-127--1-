"use client"

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
          {busy ? "Trying again" : "Try again"}
        </button>
      </div>
    </div>
  )
}
