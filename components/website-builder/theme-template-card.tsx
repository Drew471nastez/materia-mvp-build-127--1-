"use client"

/**
 * ===========================================================================
 *  A TEMPLATE, AS A CARD: ITS HOME PAGE, ITS NAME, WHO MADE IT, WHAT IT COSTS
 * ===========================================================================
 * One card for both places a creator meets a template in /app: the Browse
 * themes row on the Website page (size "sm", the action at the end of the
 * name row) and the theme marketplace popup (size "lg", Preview and Add to
 * library as two buttons under the name).
 *
 * THE COVER IS THE PAGE, FROM ITS TOP. A listing's cover is a tall full page
 * screenshot. The frame keeps a fixed shape, so nothing under it moves when
 * the picture arrives, and shows the top of the page. Under a mouse the
 * picture slides up through the page at reading speed and comes back when
 * the pointer leaves: a transform and nothing else, so it is the
 * compositor's work. Reduced motion: it stays where it is.
 *
 * THE PICTURE IS ASKED FOR AT THE SIZE IT IS DRAWN. It goes through the
 * optimizer (lib/images/optimized-url.ts) with the widths a card can have
 * and a `sizes` that says which, and it is lazy unless the card says it is
 * on the first screen. A cover the optimizer will not fetch loads as it is.
 *
 * A listing with no picture draws Storelib's own theme from its definition
 * (./theme-cover.tsx), or says the theme's name on the plain frame.
 */
import * as React from "react"
import { Check, Loader2, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ThemeCover, coverSpecFromDefinition } from "@/components/website-builder/theme-cover"
import { getThemeDefinition } from "@/lib/website-builder/theme-registry"
import { tierLabel, type ThemeListing } from "@/lib/themes/marketplace-shared"
import { SITE_PICTURE_QUALITY, isOptimizableImage, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"

/** Pixels a second the page slides at: about a screen of a long page in a second and a half. */
const PAN_SPEED = 240
const PAN_MIN_MS = 1600
const PAN_MAX_MS = 9000

/** The widths a cover is ever drawn at, times two for a dense screen. All are sizes the optimizer accepts. */
const COVER_WIDTHS = [384, 640, 750, 828, 1080]

/** How wide a card is at each window width: the popup's grid, and the page's row. */
export const TEMPLATE_CARD_SIZES = {
  lg: "(min-width: 1280px) 356px, (min-width: 1024px) 31vw, (min-width: 768px) 46vw, 100vw",
  sm: "(min-width: 1024px) 272px, (min-width: 640px) 46vw, 100vw",
} as const

export type TemplateCardState = "add" | "adding" | "in-library"

const FRAME =
  "group/frame relative block w-full overflow-hidden rounded-xl bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.04),0_8px_20px_-14px_rgba(17,24,39,0.16)] outline-none ring-offset-2 transition-shadow duration-300 pointer-fine:hover:shadow-[0_0_0_1px_rgba(17,24,39,0.09),0_2px_4px_rgba(17,24,39,0.05),0_16px_32px_-16px_rgba(17,24,39,0.24)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 motion-reduce:transition-none"

const SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-colors duration-150 pointer-fine:hover:border-[#d1d5db] pointer-fine:hover:bg-[#f8f9fa] active:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"

const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1a1a2e] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#2d2d44] active:bg-[#2d2d44] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"

const IN_LIBRARY = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f1f2f4] font-medium text-[#3f3f46]"

export function ThemeTemplateCard({
  listing,
  size = "lg",
  state,
  previewHref = null,
  viewHref = null,
  waiting = false,
  priority = false,
  onAdd,
  className,
}: {
  listing: ThemeListing
  /** "lg" in the marketplace popup, "sm" in the Browse themes row. */
  size?: "sm" | "lg"
  state: TemplateCardState
  /** The theme's own page with its live preview, in a new tab. Absent: the picture is not a link and there is no Preview. */
  previewHref?: string | null
  /** A theme that cannot be added here (a price, a plan): where its terms are, instead of Add. */
  viewHref?: string | null
  /** Another website is being made: Add waits for it. */
  waiting?: boolean
  /** On the first screen: fetched at once rather than when it scrolls near. */
  priority?: boolean
  onAdd: () => void
  className?: string
}) {
  const frame = React.useRef<HTMLElement | null>(null)
  const shot = React.useRef<HTMLImageElement>(null)
  const [broken, setBroken] = React.useState(false)
  const picture = !broken ? (listing.cover ?? listing.screenshots[0] ?? null) : null
  const def = listing.builtinThemeId ? getThemeDefinition(listing.builtinThemeId) : null
  const lg = size === "lg"

  const pan = (on: boolean) => {
    const f = frame.current
    const img = shot.current
    if (!f || !img) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const distance = Math.max(0, img.getBoundingClientRect().height - f.getBoundingClientRect().height)
    const ms = on ? Math.min(PAN_MAX_MS, Math.max(PAN_MIN_MS, (distance / PAN_SPEED) * 1000)) : Math.min(900, Math.max(450, distance / 3))
    img.style.transitionDuration = `${Math.round(ms)}ms`
    img.style.transform = on ? `translate3d(0, ${-Math.round(distance)}px, 0)` : "translate3d(0, 0, 0)"
  }

  const frameProps = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") pan(true)
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") pan(false)
    },
    "data-template-frame": "",
    /* The shape is the frame's own, so the row under it is where it will be before any picture has come. */
    className: cn(FRAME, lg ? "aspect-[5/4]" : "aspect-[4/3]"),
  }

  const cover = picture ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={shot}
      src={optimizedImageUrl(picture, lg ? 414 : 320, SITE_PICTURE_QUALITY)}
      srcSet={isOptimizableImage(picture) ? optimizedSrcSet(picture, COVER_WIDTHS, SITE_PICTURE_QUALITY) : undefined}
      sizes={isOptimizableImage(picture) ? TEMPLATE_CARD_SIZES[size] : undefined}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      data-template-shot=""
      className="absolute inset-x-0 top-0 block h-auto min-h-full w-full select-none object-cover object-top [transition-property:transform] [transition-timing-function:cubic-bezier(0.37,0,0.25,1)] will-change-transform"
    />
  ) : def ? (
    <ThemeCover spec={coverSpecFromDefinition(def)} className="absolute inset-0 h-full w-full" />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-semibold text-[#9ca3af]">{listing.name}</span>
  )

  const action = (() => {
    const box = lg ? "h-11 px-3.5 text-[14px] md:h-10 md:text-[13.5px]" : "h-11 shrink-0 px-3.5 text-[13px] sm:h-9"
    if (state === "in-library") {
      return (
        <span data-template-action="in-library" className={cn(IN_LIBRARY, lg ? "h-11 px-3 text-[13.5px] md:h-10" : "h-9 px-3 text-[12.5px]")}>
          <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
          {tt("In library")}
        </span>
      )
    }
    if (viewHref) {
      return (
        <a href={viewHref} target="_blank" rel="noopener" data-template-action="view" className={cn(SECONDARY, box)}>
          {tt("View")}
        </a>
      )
    }
    const adding = state === "adding"
    return (
      <button type="button" onClick={onAdd} disabled={adding || waiting} aria-busy={adding || undefined} data-template-action={adding ? "adding" : "add"} className={cn(PRIMARY, box)}>
        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.25} />}
        {lg ? (adding ? tt("Adding") : tt("Add to library")) : tt("Add")}
      </button>
    )
  })()

  return (
    <article data-template-card={listing.slug} data-size={size} className={cn("min-w-0", className)}>
      {previewHref ? (
        <a
          {...frameProps}
          ref={(node) => {
            frame.current = node
          }}
          href={previewHref}
          target="_blank"
          rel="noopener"
          aria-label={tt("Preview {name}", { name: listing.name })}
          onFocus={() => pan(true)}
          onBlur={() => pan(false)}
        >
          {cover}
        </a>
      ) : (
        <div
          {...frameProps}
          ref={(node) => {
            frame.current = node
          }}
        >
          {cover}
        </div>
      )}

      {lg ? (
        <div className="mt-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-semibold leading-tight text-[#1a1a2e]">{listing.name}</h3>
              <p className="mt-1 truncate text-[13px] leading-tight text-[#6b7280]">{tt("by {author}", { author: listing.author })}</p>
            </div>
            <span data-template-price="" className="shrink-0 pt-px text-[14px] font-semibold leading-tight text-[#1a1a2e]">
              {tt(tierLabel(listing))}
            </span>
          </div>
          <div className={cn("mt-3 grid gap-2", previewHref ? "grid-cols-2" : "grid-cols-1")}>
            {previewHref ? (
              <a href={previewHref} target="_blank" rel="noopener" data-template-action="preview" className={cn(SECONDARY, "h-11 px-3 text-[14px] md:h-10 md:text-[13.5px]")}>
                {tt("Preview")}
              </a>
            ) : null}
            {action}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex min-h-9 items-start justify-between gap-3">
          <div className="min-w-0 pt-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-[#1a1a2e]">{listing.name}</h3>
            <p className="mt-1 truncate text-[13px] leading-tight text-[#6b7280]">
              {tt("by {author}", { author: listing.author })}
              <span className="text-[#9ca3af]"> · </span>
              {tt(tierLabel(listing))}
            </p>
          </div>
          <div className="shrink-0">{action}</div>
        </div>
      )}
    </article>
  )
}

/** The last card of the Browse themes row: the rest of the themes, in the popup. */
export function MoreThemesCard({ onOpen, className }: { onOpen: (opener: HTMLElement) => void; className?: string }) {
  return (
    <article data-template-card="explore" className={cn("min-w-0", className)}>
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-xl bg-[#f1f2f4] px-6 text-center shadow-[0_0_0_1px_rgba(17,24,39,0.05)]">
        <p className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Explore more themes")}</p>
        <button type="button" aria-haspopup="dialog" data-theme-marketplace-open="card" onClick={(e) => onOpen(e.currentTarget)} className={cn(PRIMARY, "h-11 px-4 text-[13.5px] sm:h-10")}>
          {tt("Theme marketplace")}
        </button>
      </div>
    </article>
  )
}
