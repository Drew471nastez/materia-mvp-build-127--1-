"use client"

/**
 * ===========================================================================
 *  THE HERO AS THE PAGE SCROLLS, AND THE BAR THAT TAKES ITS PLACE (round AR)
 * ===========================================================================
 * The owner: with the header set to the full picture or video (not the
 * circle), scrolling should darken the picture gradually while the page's
 * content slides up over it, "very subtle, like Linktree's"; once the
 * profile area has gone, a slim bar fades in at the top with the creator's
 * picture or logo and name, in the page's own colours, and hides again as
 * the profile comes back.
 *
 *   THE PICTURE   app/globals.css [data-hero-scroll]: a CSS scroll timeline
 *                 on the hero's own box (view-timeline), so the compositor
 *                 draws it with the scroll and no script runs per frame.
 *                 The picture is held back (translate and scale) and a dark
 *                 layer over it fades in; the name over it fades out. Only
 *                 transform and opacity change. A browser without scroll
 *                 timelines gets the same curve (lib/onepage/feel heroScroll)
 *                 from a passive scroll listener, one write per frame, and
 *                 only while the hero is on screen.
 *   THE BAR       shown by an IntersectionObserver on the hero, never a
 *                 scroll listener: it fades and settles in over 220ms when
 *                 the hero's foot passes under it, and out when it comes
 *                 back. Out of the way of a finger while hidden.
 *
 * Drawn by the live page and the editor's preview frame alike (both are
 * components/onepage/public-onepage), on a phone and a computer.
 */
import { useEffect, useState, type CSSProperties } from "react"
import { heroScroll, topBarShown } from "@/lib/onepage/feel"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { fontStack } from "@/lib/onepage/fonts"

/** The bar's height below the safe area. */
export const TOP_BAR_PX = 56

function visibleHero(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-hero-scroll]"))
  return all.find((el) => el.getClientRects().length > 0) ?? null
}

function scrollTimelines(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")
  } catch {
    return false
  }
}

/*
  The CSS timeline follows the hero's nearest scroll container. Where a box between the hero and the page clips
  its overflow (overflow hidden or auto, which makes it a scroll container that never scrolls), the timeline would
  stand still: then the script draws it instead.
*/
function pageScrollsHero(hero: HTMLElement): boolean {
  for (let n = hero.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const boxes = (v: string) => v !== "visible" && v !== "clip"
    if (boxes(cs.overflowY) || boxes(cs.overflowX)) return false
  }
  return true
}

/**
 * The picture's scroll for a browser without scroll timelines. Nothing runs
 * where the CSS does it; elsewhere a passive listener writes the curve once a
 * frame, only while the hero is on screen.
 */
function useHeroFallback(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let hero: HTMLElement | null = null
    let frame = 0
    let near = true
    let on = false
    let tries = 0
    let timer = 0
    const write = () => {
      frame = 0
      hero = hero?.isConnected ? hero : visibleHero()
      if (!hero) return
      const r = hero.getBoundingClientRect()
      const s = heroScroll(-r.top, r.height)
      const shift = hero.querySelector<HTMLElement>("[data-hero-shift]")
      const scrim = hero.querySelector<HTMLElement>("[data-hero-scrim]")
      const title = hero.querySelector<HTMLElement>("[data-hero-title]")
      if (shift) {
        shift.style.translate = `0 ${s.shift}px`
        shift.style.scale = String(s.scale)
      }
      if (scrim) scrim.style.opacity = String(s.dim)
      if (title) title.style.opacity = String(Math.max(0, 1 - Math.max(0, -r.top / r.height - 0.3) * 2))
    }
    const onScroll = () => {
      if (near && !frame) frame = requestAnimationFrame(write)
    }
    let io: IntersectionObserver | null = null
    /* The header may draw a moment after the page (the layout is picked on the client): looked for a few times. */
    const attach = () => {
      hero = visibleHero()
      if (!hero) {
        if (tries++ < 20) timer = window.setTimeout(attach, 100)
        return
      }
      /* The compositor draws it (app/globals.css): nothing to do here. */
      if (scrollTimelines() && pageScrollsHero(hero)) return
      on = true
      if (typeof IntersectionObserver === "function") {
        io = new IntersectionObserver((e) => {
          near = e.some((x) => x.isIntersecting)
          /* Left the screen: drawn once more at its end, so a fast fling never leaves it halfway. */
          if (!near) write()
        })
        io.observe(hero)
      }
      write()
      window.addEventListener("scroll", onScroll, { passive: true })
    }
    attach()
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      io?.disconnect()
      if (on) window.removeEventListener("scroll", onScroll)
    }
  }, [enabled])
}

export function HeroTopBar({
  enabled,
  name,
  avatarUrl,
  logoUrl,
  background,
  ink,
  fontFamily,
}: {
  /** A full picture or video hero is drawn (lib/onepage/feel heroScrollEffect). */
  enabled: boolean
  name: string
  avatarUrl: string | null
  /** The title drawn as a logo: the bar shows the logo in place of the picture and the name. */
  logoUrl?: string | null
  /** The page's ground (lib/onepage/page-frame pageCanvasColour) and its title colour; the title's font family, as the theme names it. */
  background: string
  ink: string
  fontFamily?: string
}) {
  const [shown, setShown] = useState(false)
  useHeroFallback(enabled)

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver !== "function") return
    let io: IntersectionObserver | null = null
    let tries = 0
    let timer = 0
    const attach = () => {
      const hero = visibleHero()
      if (!hero) {
        /* The header may draw a moment after the page (the layout is picked on the client). */
        if (tries++ < 20) timer = window.setTimeout(attach, 100)
        return
      }
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1]
          if (!e) return
          setShown(!e.isIntersecting && topBarShown(e.boundingClientRect.bottom, TOP_BAR_PX))
        },
        { rootMargin: `-${TOP_BAR_PX}px 0px 0px 0px`, threshold: 0 },
      )
      io.observe(hero)
    }
    attach()
    return () => {
      window.clearTimeout(timer)
      io?.disconnect()
    }
  }, [enabled])

  if (!enabled) return null
  const logo = logoUrl ? onePageImageSrc(logoUrl, 320) : null
  const face = avatarUrl ? onePageImageSrc(avatarUrl, 96) : null
  const style: CSSProperties = {
    backgroundColor: background,
    color: ink,
    fontFamily: fontFamily ? fontStack(fontFamily) : undefined,
    opacity: shown ? 1 : 0,
    translate: shown ? "0 0" : "0 -8px",
    pointerEvents: shown ? "auto" : "none",
    boxShadow: `0 1px 0 color-mix(in srgb, ${ink} 10%, transparent)`,
  }
  return (
    <div
      aria-hidden={!shown}
      data-op-topbar={shown ? "shown" : "hidden"}
      className="fixed inset-x-0 top-0 z-[19] pt-[env(safe-area-inset-top)] transition-[opacity,translate] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={style}
    >
      <button
        type="button"
        tabIndex={shown ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className="mx-auto flex max-w-[min(70vw,420px)] items-center justify-center gap-2.5 px-3 outline-none focus-visible:underline"
        style={{ height: TOP_BAR_PX }}
        data-op-topbar-button=""
      >
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logo} alt={name} className="max-h-7 w-auto max-w-[180px] object-contain" />
        ) : (
          <>
            {face ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={face} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" onError={(e) => { const img = e.currentTarget; if (avatarUrl && img.dataset.raw === undefined) { img.dataset.raw = ""; img.src = avatarUrl } else img.style.display = "none" }} />
            ) : null}
            <span className="min-w-0 truncate text-[15px] font-semibold">{name}</span>
          </>
        )}
      </button>
    </div>
  )
}
