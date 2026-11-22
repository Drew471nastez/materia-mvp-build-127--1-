"use client"

/**
 * ===========================================================================
 *  A TEMPLATE, AS A CARD: ITS HOME PAGE, ITS NAME, WHO MADE IT, WHAT IT COSTS
 * ===========================================================================
 * One card for both places a creator meets a template in /app: the Browse
 * themes grid on the Website page (size "sm", a 4:3 cover) and the theme
 * marketplace popup (size "lg", a 5:4 cover). Both draw the same parts in
 * the same places: the cover, then the name, who made it and what it costs,
 * with the one action at the end of that line.
 *
 * ONE ACTION, ITS STATES IN ONE PLACE. Add to library (Add on the small
 * card) is the dark button; it turns into Adding with a spinner, then into
 * a quiet In library with a check, all in the same box so the line does not
 * jump. With the library full it reads Library full and still answers a
 * press, with the full library sheet. A theme with a price or a plan has
 * View instead, to the page that says its terms.
 *
 * PREVIEW IS THE COVER. A press on the picture opens the template's preview
 * over the page (app/(storelib)/app/website-builder/themes/theme-preview.tsx).
 * Under a mouse a white Preview label rises onto the cover while the page
 * slides; on a touch screen the label is there all the time, smaller, so a
 * finger knows the picture is a button.
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
  sm: "(min-width: 1200px) 368px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 100vw",
} as const

export type TemplateCardState = "add" | "adding" | "in-library" | "full"

const FRAME =
  "group/frame relative block w-full overflow-hidden rounded-xl bg-[#eef0f3] text-left shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.04),0_8px_20px_-14px_rgba(17,24,39,0.16)] outline-none transition-shadow duration-300 pointer-fine:hover:shadow-[0_0_0_1px_rgba(17,24,39,0.09),0_2px_4px_rgba(17,24,39,0.05),0_16px_32px_-16px_rgba(17,24,39,0.24)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** Every state of the action shares this box: the same height, the same corners, the colour eased between them. */
const ACTION =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold outline-none transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.33,1,0.68,1)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

const PRIMARY =
  "bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-fine:hover:bg-[#2d2d44] active:bg-[#383852] pointer-fine:active:bg-[#383852] disabled:cursor-default"

const QUIET = "bg-[#f1f2f4] text-[#3f3f46]"

const SECONDARY =
  "bg-white text-[#1a1a2e] shadow-[0_0_0_1px_rgba(17,24,39,0.1),0_1px_2px_rgba(16,24,40,0.05)] pointer-fine:hover:bg-[#f8f9fa] active:bg-[#f1f2f4] pointer-fine:active:bg-[#f1f2f4]"

/**
 * The action of a template, in every state: the card's and the preview's top
 * bar's, so the two can never disagree. `long` says Add to library where
 * there is room, Add where there is not.
 */
export function TemplateAction({
  state,
  viewHref = null,
  waiting = false,
  onAdd,
  long = true,
  className,
}: {
  state: TemplateCardState
  viewHref?: string | null
  waiting?: boolean
  onAdd: () => void
  /** Add to library, or Add; "md" says Add on a phone and Add to library from 768px. */
  long?: boolean | "md"
  className?: string
}) {
  if (state === "in-library") {
    return (
      <span data-template-action="in-library" className={cn(ACTION, QUIET, className)}>
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        {tt("In library")}
      </span>
    )
  }
  if (viewHref) {
    return (
      <a href={viewHref} target="_blank" rel="noopener" data-template-action="view" className={cn(ACTION, SECONDARY, className)}>
        {tt("View")}
      </a>
    )
  }
  if (state === "full") {
    /* Never dead: the press says why, with the full library sheet. */
    return (
      <button type="button" onClick={onAdd} aria-haspopup="dialog" data-template-action="full" className={cn(ACTION, SECONDARY, "text-[#6b7280]", className)}>
        {tt("Library full")}
      </button>
    )
  }
  const adding = state === "adding"
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={adding || waiting}
      aria-busy={adding || undefined}
      data-template-action={adding ? "adding" : "add"}
      className={cn(ACTION, PRIMARY, waiting && !adding && "opacity-60", className)}
    >
      {adding ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="h-4 w-4" strokeWidth={2.25} />}
      {adding ? (
        tt("Adding")
      ) : long === "md" ? (
        <>
          <span className="md:hidden">{tt("Add")}</span>
          <span className="max-md:hidden">{tt("Add to library")}</span>
        </>
      ) : long ? (
        tt("Add to library")
      ) : (
        tt("Add")
      )}
    </button>
  )
}

export function ThemeTemplateCard({
  listing,
  size = "lg",
  state,
  onPreview,
  viewHref = null,
  waiting = false,
  priority = false,
  onAdd,
  className,
}: {
  listing: ThemeListing
  /** "lg" in the marketplace popup, "sm" in the Browse themes grid. */
  size?: "sm" | "lg"
  state: TemplateCardState
  /** Opens the template's preview over the page; given the cover, which takes the focus back after. Absent: the cover is only a picture. */
  onPreview?: ((opener: HTMLElement) => void) | null
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
    /* The shape is the frame's own, so the line under it is where it will be before any picture has come. */
    className: cn(FRAME, lg ? "aspect-[5/4]" : "aspect-[4/3]"),
  }

  const cover = picture ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={shot}
      src={optimizedImageUrl(picture, lg ? 414 : 368, SITE_PICTURE_QUALITY)}
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

  return (
    <article data-template-card={listing.slug} data-size={size} className={cn("min-w-0", className)}>
      {onPreview ? (
        <button
          {...frameProps}
          ref={(node) => {
            frame.current = node
          }}
          type="button"
          aria-haspopup="dialog"
          aria-label={tt("Preview {name}", { name: listing.name })}
          data-template-preview=""
          onClick={(e) => onPreview(e.currentTarget)}
          onFocus={() => pan(true)}
          onBlur={() => pan(false)}
        >
          {cover}
          {/* A faint dim under a mouse, so the label reads on a white page as well as a dark one. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[#1a1a2e]/0 transition-colors duration-200 pointer-fine:group-hover/frame:bg-[#1a1a2e]/[0.05] motion-reduce:transition-none" />
          <span
            aria-hidden
            data-template-hint=""
            className={cn(
              "pointer-events-none absolute z-[2] inline-flex items-center rounded-full bg-white/95 font-semibold text-[#1a1a2e] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_6px_16px_-6px_rgba(17,24,39,0.35)] [backface-visibility:hidden]",
              "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
              /* A finger: always there, small, in the corner. */
              "bottom-2.5 right-2.5 h-8 px-3 text-[12.5px]",
              /* A mouse: centred at the foot of the cover, risen into place on hover or a key's focus. */
              "pointer-fine:bottom-3.5 pointer-fine:left-1/2 pointer-fine:right-auto pointer-fine:h-9 pointer-fine:-translate-x-1/2 pointer-fine:translate-y-1.5 pointer-fine:px-4 pointer-fine:text-[13.5px] pointer-fine:opacity-0 pointer-fine:group-hover/frame:translate-y-0 pointer-fine:group-hover/frame:opacity-100 pointer-fine:group-focus-visible/frame:translate-y-0 pointer-fine:group-focus-visible/frame:opacity-100",
            )}
          >
            {tt("Preview")}
          </span>
        </button>
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

      <div className={cn("flex items-center justify-between gap-3", lg ? "mt-3.5" : "mt-3")}>
        <div className="min-w-0">
          <h3 className={cn("truncate font-semibold leading-tight text-[#1a1a2e]", lg ? "text-[16px]" : "text-[15px]")}>{listing.name}</h3>
          <p className="mt-1 truncate text-[13px] leading-tight text-[#6b7280]">
            {tt("by {author}", { author: listing.author })}
            <span className="text-[#c4c8cf]"> · </span>
            <span data-template-price="">{tt(tierLabel(listing))}</span>
          </p>
        </div>
        <TemplateAction
          state={state}
          viewHref={viewHref}
          waiting={waiting}
          onAdd={onAdd}
          long={lg}
          className={lg ? "h-11 px-4 text-[14px] md:h-10 md:text-[13.5px]" : "h-11 px-4 text-[13.5px] sm:h-9 sm:px-3.5 sm:text-[13px]"}
        />
      </div>
    </article>
  )
}
