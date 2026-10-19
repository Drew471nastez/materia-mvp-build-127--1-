"use client"

/**
 * ===========================================================================
 *  ONE THEME, AS A CARD: ITS HOME PAGE, ITS NAME, WHO MADE IT
 * ===========================================================================
 * The shape of Shopify's theme store: a large picture of the theme's home
 * page with nothing drawn around it, the name under it in bold, "by" its
 * author in grey, and the action at the end of that row.
 *
 * ON HOVER, THE PAGE SCROLLS. The cover is a full page screenshot cut to
 * the card's frame from its top. Under a mouse it slides up through the whole
 * page at a steady reading speed (a transform, so it is the compositor's
 * work and never drops a frame), and a Preview label comes up over it; the
 * pointer leaving brings it back to the top quicker than it went. The
 * distance is measured from the picture itself the moment the pointer
 * arrives, so a short page moves a little and a long one all the way.
 * Reduced motion: no slide, only the label. The label is shown by the
 * same pointer event as the slide, not by a hover media query, so the two
 * never disagree.
 *
 * ON A PHONE, A TAP IS THE PREVIEW. There is no hover on glass, so the
 * picture is a link to the theme's page, and the action stays in its row.
 *
 * A listing with no cover yet draws Storelib's own theme from its
 * definition (theme-cover.tsx), or its first screenshot.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { ThemeCover, coverSpecFromDefinition } from "@/components/website-builder/theme-cover"
import { getThemeDefinition } from "@/lib/website-builder/theme-registry"
import { tierLabel, type ThemeListing } from "@/lib/themes/marketplace-shared"
import { tt } from "@/lib/i18n/text"

/** Pixels a second the page slides at: about a screen of a long page in a second and a half. */
const PAN_SPEED = 260
const PAN_MIN_MS = 1400
const PAN_MAX_MS = 7000

export function ThemeCard({
  listing,
  href,
  newTab = false,
  action,
  className,
  priority = false,
}: {
  listing: ThemeListing
  /** Where the picture goes: the theme's page. */
  href: string
  newTab?: boolean
  /** Add, In library, Pro: the end of the name row. */
  action?: React.ReactNode
  className?: string
  priority?: boolean
}) {
  const frame = React.useRef<HTMLAnchorElement>(null)
  const shot = React.useRef<HTMLImageElement>(null)
  const [broken, setBroken] = React.useState(false)
  const picture = !broken ? listing.cover ?? listing.screenshots[0] ?? null : null
  const def = listing.builtinThemeId ? getThemeDefinition(listing.builtinThemeId) : null

  const pan = (on: boolean) => {
    const f = frame.current
    const img = shot.current
    /* The label follows the same mouse the slide does, so a laptop with a touch screen gets both or neither. */
    if (f) f.dataset.hover = on ? "on" : "off"
    if (!f || !img) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const distance = Math.max(0, img.getBoundingClientRect().height - f.getBoundingClientRect().height)
    const ms = on ? Math.min(PAN_MAX_MS, Math.max(PAN_MIN_MS, (distance / PAN_SPEED) * 1000)) : Math.min(900, Math.max(450, distance / 3))
    img.style.transitionDuration = `${Math.round(ms)}ms`
    img.style.transform = on ? `translate3d(0, ${-distance}px, 0)` : "translate3d(0, 0, 0)"
  }

  return (
    <article data-theme-card={listing.slug} className={cn("group/card min-w-0", className)}>
      <a
        ref={frame}
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener" : undefined}
        aria-label={tt("Preview {name}", { name: listing.name })}
        onPointerEnter={(e) => e.pointerType === "mouse" && pan(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && pan(false)}
        onFocus={() => pan(true)}
        onBlur={() => pan(false)}
        data-theme-card-frame=""
        className="group/frame relative block aspect-[4/3] overflow-hidden rounded-xl bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.04),0_8px_20px_-14px_rgba(17,24,39,0.16)] outline-none ring-offset-2 transition-shadow duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_2px_4px_rgba(17,24,39,0.05),0_14px_30px_-16px_rgba(17,24,39,0.22)] hover:duration-[420ms] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 motion-reduce:transition-none"
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={shot}
            src={picture}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            onError={() => setBroken(true)}
            data-theme-card-shot=""
            className="absolute inset-x-0 top-0 block h-auto min-h-full w-full select-none object-cover object-top [transition-property:transform] [transition-timing-function:cubic-bezier(0.37,0,0.25,1)] will-change-transform"
          />
        ) : def ? (
          <ThemeCover spec={coverSpecFromDefinition(def)} className="absolute inset-0 h-full w-full" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-semibold text-[#9ca3af]">{listing.name}</span>
        )}
        {/* The label, quiet: a white chip at the foot of the picture, under a mouse only. */}
        <span
          aria-hidden
          data-theme-card-preview=""
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-[opacity,translate] duration-200 ease-out [translate:0_6px] group-data-[hover=on]/frame:opacity-100 group-data-[hover=on]/frame:[translate:0_0] group-focus-within/card:opacity-100 group-focus-within/card:[translate:0_0]"
        >
          <span className="rounded-lg bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(17,24,39,0.45)]">{tt("Preview")}</span>
        </span>
      </a>
      <div className="mt-3 flex min-h-9 items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-[#1a1a2e]">{listing.name}</h3>
          <p className="mt-1 truncate text-[13px] leading-tight text-[#6b7280]">
            {tt("by {author}", { author: listing.author })}
            <span className="text-[#9ca3af]"> · </span>
            {tierLabel(listing)}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </article>
  )
}

/** The ninth card in the library: the rest of the themes, in the marketplace. */
export function ExploreThemesCard({ href, className }: { href: string; className?: string }) {
  return (
    <article data-theme-card="explore" className={cn("min-w-0", className)}>
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-xl bg-[#f6f7f8] px-6 text-center shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.05),0_10px_24px_-16px_rgba(17,24,39,0.18)]">
        <p className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Explore more themes")}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="inline-flex h-11 items-center rounded-lg bg-[#1a1a2e] px-4 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-[#2d2d44] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2"
        >
          {tt("Theme marketplace")}
        </a>
      </div>
    </article>
  )
}
