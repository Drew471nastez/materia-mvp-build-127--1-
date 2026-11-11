"use client"

import { useEffect, useRef, useState } from "react"
import { HERO_PHRASES, HERO_ROTATION_MS } from "@/lib/marketing/hero-video"

/** All phrases share a grid cell: the largest reserves space before hydration. */
export function HeroHeadline() {
  const ref = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState({ index: 0, previous: -1, animate: false })
  useEffect(() => {
    const heading = ref.current
    if (!heading) return
    const hero = heading.closest("[data-home-hero]")!
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    let visible = true
    let timer: ReturnType<typeof setInterval> | undefined
    const update = () => {
      clearInterval(timer)
      if (reduce.matches) setState({ index: 0, previous: -1, animate: false })
      else if (
        visible &&
        !document.hidden &&
        hero.getAttribute("data-motion-paused") !== "true"
      ) {
        timer = setInterval(
          () =>
            setState((old) => ({
              index: (old.index + 1) % HERO_PHRASES.length,
              previous: old.index,
              animate: true,
            })),
          HERO_ROTATION_MS,
        )
      }
    }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            update()
          })
        : null
    const mutation = new MutationObserver(update)
    observer?.observe(hero)
    mutation.observe(hero, {
      attributes: true,
      attributeFilter: ["data-motion-paused"],
    })
    reduce.addEventListener("change", update)
    document.addEventListener("visibilitychange", update)
    update()
    return () => {
      clearInterval(timer)
      observer?.disconnect()
      mutation.disconnect()
      reduce.removeEventListener("change", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  return (
    <h1 ref={ref} className="cinematic-heading">
      <span className="cinematic-sr-only">Build your website.</span>
      <span aria-hidden="true" className="cinematic-heading-fixed">
        Build your
      </span>
      <span
        aria-hidden="true"
        className="cinematic-phrases"
        data-animate={state.animate}
      >
        {HERO_PHRASES.map((phrase, index) => (
          <span
            key={phrase}
            className="cinematic-phrase"
            data-active={index === state.index}
            data-exiting={index === state.previous}
          >
            {phrase.slice(0, -1)}
            <span className="cinematic-period">.</span>
          </span>
        ))}
      </span>
    </h1>
  )
}
