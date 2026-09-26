"use client"

/**
 * ===========================================================================
 *  THE PICTURES WAITING IN THE COMPOSER
 * ===========================================================================
 * A picture is somewhere to look the moment it is chosen: its thumbnail is
 * drawn from the file straight away, with a ring on it that fills as the
 * picture is made ready (read, shrunk, encoded: ask-attach-prepare.ts) and,
 * once sent, as the request carrying it goes up. A picture that could not
 * be made ready says so under the row and can be tried again or taken off.
 *
 * The ring's arc is drawn from the number it is given; with no number yet
 * it turns, on transform. The cross is 20px so it sits on the corner rather
 * than on the picture, with a 44px invisible box for a thumb.
 */

import * as React from "react"
import { Film, RotateCcw, TriangleAlert, X } from "lucide-react"

import type { AllowedImageType } from "@/lib/sites/agent/attachments"
import { progressLabel } from "@/lib/website-builder/ask-attach"
import { cn } from "@/lib/utils"

export interface ComposerPicture {
  id: string
  name: string
  state: "preparing" | "ready" | "failed"
  /** 0 to 1 while preparing. */
  progress: number
  mediaType: AllowedImageType
  /** Base64, empty until ready. */
  data: string
  /** What the thumbnail draws: the file itself at first, the prepared picture once ready. */
  url: string
  error?: string
  /** Kept so a failure can be tried again without choosing the file again. */
  source?: File
  /** A still taken from a video. */
  still?: boolean
}

export function ProgressRing({ fraction, size = 26, className }: { fraction: number | null; size?: number; className?: string }) {
  const r = size / 2 - 2.5
  const c = 2 * Math.PI * r
  const known = fraction !== null && Number.isFinite(fraction)
  const shown = known ? Math.max(0.04, Math.min(1, fraction as number)) : 0.28
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", !known && "ask-ring-turn", className)}
      data-ask-ring={known ? Math.round((fraction as number) * 100) : "turning"}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(26,26,46,0.14)" strokeWidth={2.5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1a1a2e"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown)}
      />
    </svg>
  )
}

/**
 * ===========================================================================
 *  A PICTURE THAT ARRIVES WITHOUT MOVING ANYTHING
 * ===========================================================================
 * Its box is its final size from the first frame, so nothing around it
 * shifts when the pixels come. Until they have been DECODED (not only
 * loaded: a loaded picture can still paint in a stripe at a time on a
 * phone) the box shows a neutral shimmer, and then the picture fades in
 * over it on opacity. A new `src` for the same box (the file, then the
 * prepared copy) keeps the old picture up until the new one is ready, which
 * is what the browser does for a swapped `src` anyway, so it does not blink.
 */
export function FadeImage({
  src,
  alt,
  className,
  imgClassName,
  lazy = false,
  onError,
}: {
  src: string
  alt: string
  /** The box: its size and shape. */
  className?: string
  imgClassName?: string
  lazy?: boolean
  onError?: () => void
}) {
  const ref = React.useRef<HTMLImageElement>(null)
  const [shown, setShown] = React.useState(false)
  const reveal = React.useCallback(() => {
    const img = ref.current
    if (!img) return
    const ready = typeof img.decode === "function" ? img.decode() : Promise.resolve()
    ready.catch(() => {}).then(() => setShown(true))
  }, [])
  /* Already in the cache, and so loaded before React was listening. */
  React.useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth > 0) reveal()
  }, [reveal])
  return (
    <span data-ask-image={shown ? "shown" : "loading"} className={cn("relative block overflow-hidden", !shown && "ask-shimmer", className)}>
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element -- the creator's own picture: bytes in hand, or a URL signed for this read. */
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          decoding="async"
          onLoad={reveal}
          onError={onError}
          className={cn(
            "relative block h-full w-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none",
            shown ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
    </span>
  )
}

export function PictureTray({
  items,
  onRemove,
  onRetry,
  onOpen,
}: {
  items: ComposerPicture[]
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onOpen: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div data-ask-attachments="" className="flex flex-wrap gap-2 px-3 pt-3">
      {items.map((item) => (
        <div
          key={item.id}
          data-ask-thumb=""
          data-state={item.state}
          className="group/att relative animate-in fade-in zoom-in-95 duration-200"
        >
          <button
            type="button"
            onClick={() => (item.state === "failed" && item.source ? onRetry(item.id) : onOpen(item.id))}
            aria-label={
              item.state === "failed"
                ? item.source
                  ? `Try ${item.name} again`
                  : item.name
                : item.state === "preparing"
                  ? `${item.name}, ${progressLabel("preparing", item.progress)}`
                  : `Open ${item.name}`
            }
            title={item.error}
            className={cn(
              "relative block h-14 w-14 overflow-hidden rounded-xl border bg-[#f8f9fa] transition-opacity hover:opacity-90",
              item.state === "failed" ? "border-[#b45309]/40" : "border-[#e5e7eb]",
            )}
          >
            {/* The creator's own file, drawn from memory: a shimmer at the thumbnail's size until it has decoded. */}
            <FadeImage src={item.url} alt="" className={cn("h-full w-full", item.state === "failed" && "opacity-40")} />
            {item.state === "preparing" && (
              <span data-ask-preparing="" className="ask-fade absolute inset-0 flex items-center justify-center bg-white/55">
                <ProgressRing fraction={item.progress > 0 ? item.progress : null} />
              </span>
            )}
            {item.state === "failed" && (
              <span className="absolute inset-0 flex items-center justify-center text-[#b45309]">
                {item.source ? <RotateCcw className="h-4 w-4" strokeWidth={2} /> : <TriangleAlert className="h-4 w-4" strokeWidth={2} />}
              </span>
            )}
            {item.still && item.state === "ready" && (
              <span aria-hidden className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-[5px] bg-black/55 text-white">
                <Film className="h-2.5 w-2.5" strokeWidth={2.25} />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] shadow-sm transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-[#1a1a2e]"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </div>
  )
}
