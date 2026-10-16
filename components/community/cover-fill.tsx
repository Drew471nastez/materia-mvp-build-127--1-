"use client"

/**
 * THE GROUND WHERE A COMMUNITY HAS NO COVER (round 33): the gradient of its
 * name on the first frame (the same on the server and in the browser), then
 * the gradient of its icon's own colours once the icon has been read
 * (lib/communities/cover-gradient.ts), laid over it in 240ms. An icon read
 * before is there on the first frame after hydration, with no fade.
 *
 * Fills its parent (absolute inset 0). `className` adds to it; children sit
 * on top (a mark in the middle of an Explore card, say).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cachedIconPalette, coverGradient, nameCoverGradient, sampleIconPalette, type Palette } from "@/lib/communities/cover-gradient"

export function useIconPalette(iconUrl: string | null | undefined): { palette: Palette | null; fresh: boolean } {
  const [state, setState] = React.useState<{ palette: Palette | null; fresh: boolean }>({ palette: null, fresh: false })
  React.useLayoutEffect(() => {
    if (!iconUrl) return setState({ palette: null, fresh: false })
    const known = cachedIconPalette(iconUrl)
    if (known !== undefined) return setState({ palette: known, fresh: false })
    let live = true
    /* A small copy from the image optimizer when it can make one: the same origin, so the canvas can be read. */
    void sampleIconPalette(iconUrl, optimizedImageUrl(iconUrl, 24)).then((p) => {
      if (live) setState({ palette: p, fresh: true })
    })
    return () => {
      live = false
    }
  }, [iconUrl])
  return state
}

export function CoverFill({ name, iconUrl, className, children, ...rest }: { name: string; iconUrl?: string | null; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { palette, fresh } = useIconPalette(iconUrl)
  const over = React.useRef<HTMLDivElement>(null)
  /* Read just now (not from the cache): laid over the name's gradient on the compositor, unless motion is reduced. */
  React.useLayoutEffect(() => {
    const el = over.current
    if (!el || !fresh || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" })
  }, [palette, fresh])
  return (
    <div {...rest} aria-hidden={children ? undefined : true} data-cover-fill={palette ? "icon" : "name"} className={cn("absolute inset-0 overflow-hidden", className)} style={{ backgroundImage: nameCoverGradient(name), ...rest.style }}>
      {palette ? <div ref={over} aria-hidden className="absolute inset-0" style={{ backgroundImage: coverGradient(palette) }} /> : null}
      {children ? <div className="relative h-full w-full">{children}</div> : null}
    </div>
  )
}
