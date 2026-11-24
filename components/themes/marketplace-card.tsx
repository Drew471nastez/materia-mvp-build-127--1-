"use client"

/**
 * ===========================================================================
 *  ONE TEMPLATE ON STORELIB.COM/THEMES: ITS HOME PAGE, NAME AND PRICE
 * ===========================================================================
 * Round 58, after the big theme stores: the picture is the template's home
 * page as it opens, cut to 4:5 (scripts/build-theme-seo-images.mjs, about
 * 30 KB), in a rounded frame; the name under it and the price under that
 * (round 23, the owner: "name, price or Free below"). The whole card is one
 * link to the template's page, so a crawler and a keyboard reach the same
 * address a finger does.
 *
 * The box is drawn at its shape before the picture arrives (width, height
 * and aspect ratio), so nothing below it moves when it does.
 *
 * ON HOVER THE PAGE SCROLLS (round 23, the owner: "on hover the screenshot
 * plays, like a slow scroll through the page; no bump, no jump, smooth").
 * The whole home page is a second picture, the same page at 640 wide
 * (<template>-scroll.webp, scripts/build-theme-seo-images.mjs), asked for
 * only when a mouse arrives. Its top is the card's picture exactly (both are
 * the page's top at the frame's width), so it is put over the card the
 * moment it is decoded and nothing visibly changes; then it slides up
 * through the page at a steady reading speed.
 *
 * ONE MOTION, BOTH WAYS (marketplace round 24, the owner: "on hover-out it
 * snaps back very fast and glitchy; make both directions smooth and
 * proportional, from wherever it is, never jumps, no glitch when I hover
 * again mid way"). The slide is no longer two CSS transitions handed to the
 * browser one after the other: a transition that is replaced mid way starts
 * the new one at zero speed with a new curve, and the old return (420 to
 * 850ms whatever the distance) threw a long page back in under a second.
 * Now the picture has a position and a speed, and each frame moves the
 * position toward where it is going (the page's end under the mouse, the
 * top after it leaves) with a limited acceleration (glide): it speeds up
 * gently, keeps a cruising speed, and slows down to stop exactly at the
 * end. Leaving or coming back mid way only changes where it is going, so
 * the speed it has carries on and turns round smoothly; the position is
 * never set, only moved, so it can never jump. The way back cruises at a
 * speed picked from the distance left (returnSpeedFor): a second's hover
 * comes back in about half a second, a whole page in about a second and a
 * half. Each frame writes one transform on the picture's own layer, the
 * compositor's work: nothing is laid out or painted while it runs, and
 * nothing around the card moves. With reduced motion it does not slide,
 * and the picture is never asked for. A touch is a tap on the link, never
 * a slide.
 *
 * NOT A ".group". app/globals.css takes every transform off the children of
 * a .group under (hover: none), for taps that linger as hovers; a laptop
 * whose main pointer is its touch screen still has a mouse, and the slide
 * is that mouse's. Nothing here needs group-hover.
 */
import * as React from "react"
import Link from "next/link"

import type { MarketplaceCard as Card } from "@/lib/themes/theme-seo"
import { CARD_PAN_SPEED, PAN_ACCEL, RETURN_RAMP_S, glide, returnSpeedFor, type Glide } from "@/components/themes/card-glide"

/**
 * The whole home page for the hover: the built template's scroll picture, or
 * an uploaded listing's own full page cover (its card picture is already
 * that cover). Null when there is none.
 */
export function scrollPictureOf(card: Pick<Card, "image">): string | null {
  const src = card.image?.src
  if (!src) return null
  const cut = /^(.*)-card-\d+\.webp$/.exec(src)
  if (cut) return `${cut[1]}-scroll.webp`
  return card.image?.srcSet ? null : src
}

const still = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function MarketplaceCard({ card, priority = false, hidden = false }: { card: Card; priority?: boolean; hidden?: boolean }) {
  const frame = React.useRef<HTMLDivElement>(null)
  const strip = React.useRef<HTMLImageElement>(null)
  const over = React.useRef(false)
  /* Asked for on the first hover, then kept: a second hover slides at once. */
  const [asked, setAsked] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const scroll = scrollPictureOf(card)

  /* Where the picture is and how fast it moves; where it is going; the frame that moves it. */
  const motion = React.useRef<Glide>({ y: 0, v: 0 })
  const goal = React.useRef<{ to: number; cruise: number; accel: number; lo: number }>({ to: 0, cruise: 0, accel: PAN_ACCEL, lo: 0 })
  const raf = React.useRef(0)
  const last = React.useRef(0)

  const step = React.useCallback((now: number) => {
    const img = strip.current
    if (!img) {
      raf.current = 0
      return
    }
    /* A frame late by a tab switch moves as if it were one frame, never a leap. */
    const dt = last.current ? Math.min(0.05, Math.max(0, (now - last.current) / 1000)) : 1 / 60
    last.current = now
    const g = goal.current
    const done = glide(motion.current, g.to, g.cruise, g.accel, dt, g.lo, 0)
    img.style.transform = `translate3d(0, ${motion.current.y.toFixed(2)}px, 0)`
    if (done) {
      raf.current = 0
      last.current = 0
      img.dataset.marketCardMotion = "still"
      return
    }
    raf.current = requestAnimationFrame(step)
  }, [])

  const pan = React.useCallback((on: boolean) => {
    const f = frame.current
    const img = strip.current
    if (!f || !img) return
    const distance = Math.max(0, img.getBoundingClientRect().height - f.getBoundingClientRect().height)
    if (on) {
      if (distance < 1) return
      goal.current = { to: -distance, cruise: CARD_PAN_SPEED, accel: PAN_ACCEL, lo: -distance }
    } else {
      /* From where it is now: the distance left to the top sets the speed, so a short hover comes back quickly and a long one smoothly. */
      const cruise = returnSpeedFor(Math.abs(motion.current.y))
      goal.current = { to: 0, cruise, accel: cruise / RETURN_RAMP_S, lo: Math.min(goal.current.lo, -distance) }
    }
    img.dataset.marketCardMotion = on ? "down" : "up"
    if (!raf.current) {
      last.current = 0
      raf.current = requestAnimationFrame(step)
    }
  }, [step])

  React.useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /* The picture decoded while the mouse is still over the card: put it up and slide. */
  const onStripLoad = React.useCallback(() => {
    const img = strip.current
    const f = frame.current
    if (!img || !f) return
    /* A page no taller than the card has nothing to scroll through: the card's own picture stays. */
    if (img.naturalHeight * f.clientWidth <= img.naturalWidth * f.clientHeight + 1) return
    const go = () => {
      setReady(true)
      /* Two frames: the picture is on its layer at the top before the slide is given its end. */
      requestAnimationFrame(() => requestAnimationFrame(() => over.current && pan(true)))
    }
    if (typeof img.decode === "function") img.decode().then(go, go)
    else go()
  }, [pan])

  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !scroll || still()) return
    over.current = true
    if (!asked) setAsked(true)
    else if (ready) pan(true)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    over.current = false
    if (ready) pan(false)
  }

  return (
    <article data-market-card={card.slug} hidden={hidden} className="min-w-0">
      <Link
        href={card.href}
        prefetch={false}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className="block rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-4"
      >
        <div
          ref={frame}
          data-market-card-frame=""
          className="relative isolate aspect-[4/5] overflow-hidden rounded-[14px] bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.07),0_1px_2px_rgba(17,24,39,0.04),0_10px_24px_-18px_rgba(17,24,39,0.28)]"
        >
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- already cut to size and WebP; the optimizer would only resize it again
            <img
              src={card.image.src}
              srcSet={card.image.srcSet || undefined}
              sizes="(min-width: 1280px) 320px, (min-width: 1024px) 30vw, (min-width: 520px) 46vw, 92vw"
              width={card.image.width}
              height={card.image.height}
              alt={card.alt}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-cover object-top"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-semibold text-[#9ca3af]">{card.name}</span>
          )}
          {asked && scroll ? (
            // eslint-disable-next-line @next/next/no-img-element -- the whole page, asked for on a hover only
            <img
              ref={strip}
              src={scroll}
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
              onLoad={onStripLoad}
              data-market-card-scroll={ready ? "ready" : "loading"}
              className="pointer-events-none absolute inset-x-0 top-0 block h-auto w-full select-none [backface-visibility:hidden] [transform:translate3d(0,0,0)] [will-change:transform] motion-reduce:hidden"
              style={{ opacity: ready ? 1 : 0 }}
            />
          ) : null}
        </div>
        <h3 className="mt-3.5 truncate text-[16px] font-semibold leading-6 text-[#111114]">{card.name}</h3>
        <p data-market-price="" className="truncate text-[15px] leading-6 tabular-nums text-[#6b7280]">
          {card.price}
        </p>
      </Link>
    </article>
  )
}
