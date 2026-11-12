"use client"

import { useCallback, useMemo } from "react"
import { useKeenSlider } from "keen-slider/react.js"
import type { KeenSliderPlugin } from "keen-slider"

/* Cruise speed of the quiet autoplay, in slider widths per millisecond. */
const CRUISE = 0.9 / 16000
/* Autoplay eases in over RAMP_MS (t² reaches cruise speed exactly at its end,
   so the join into the linear cruise has no velocity step), and a resting
   mouse eases it out over GLIDE_MS (1-(1-t)² leaves at cruise speed). */
const RAMP_MS = 5200
const GLIDE_MS = 1100

/** Keen's native free-mode drag/inertia, with quiet continuous autoplay. */
const showcaseActivity: KeenSliderPlugin = (slider) => {
  const el = slider.container
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let visible = false,
    dragging = false,
    paused = false,
    keyboard = false
  let automatic = false,
    cruising = false,
    hovering = false,
    resumeAt = 0,
    disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    automatic = false
    cruising = false
    slider.animator.stop()
  }
  const eligible = () =>
    !disposed &&
    visible &&
    !document.hidden &&
    !reduce.matches &&
    !dragging &&
    !paused &&
    !hovering &&
    !(keyboard && el.matches(":focus-within"))
  const schedule = (delay = 0) => {
    clearTimeout(timer)
    if (!eligible()) return
    timer = setTimeout(
      () => {
        if (!eligible()) return
        if (performance.now() < resumeAt) {
          schedule(resumeAt - performance.now())
          return
        }
        if (slider.animator.active) {
          schedule(250)
          return
        }
        const resume = !cruising
        automatic = true
        cruising = true
        // A gentle start, then a long linear drift (one restart every ~3 min
        // instead of every 16 s); Free Mode owns release physics.
        slider.animator.start([
          ...(resume
            ? [{ distance: (CRUISE * RAMP_MS) / 2, duration: RAMP_MS, easing: (t: number) => t * t }]
            : []),
          { distance: CRUISE * 180000, duration: 180000, easing: (t: number) => t },
        ])
      },
      Math.max(delay, resumeAt - performance.now(), 0),
    )
  }
  /* A mouse resting on the gallery glides it to a stop instead of halting. */
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    hovering = true
    clearTimeout(timer)
    if (automatic && cruising && !reduce.matches) {
      automatic = false
      cruising = false
      slider.animator.start([
        { distance: (CRUISE * GLIDE_MS) / 2, duration: GLIDE_MS, easing: (t) => 1 - (1 - t) * (1 - t) },
      ])
    }
  }
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    hovering = false
    schedule(450)
  }
  const interact = () => {
    resumeAt = performance.now() + 8000
    stop()
  }
  const release = () => {
    if (!dragging) {
      delete el.dataset.dragging
      schedule()
    }
  }
  const pointer = () => {
    el.dataset.dragging = "true"
    keyboard = false
    interact()
  }
  const wheel = (event: WheelEvent) => {
    const deltaX = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
    if (!event.shiftKey && Math.abs(deltaX) <= Math.abs(event.deltaY)) return
    event.preventDefault()
    keyboard = false
    interact()
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? slider.size : 1
    slider.track.add((deltaX * unit) / slider.size)
    schedule()
  }
  const key = (event: KeyboardEvent) => {
    if (![" ", "ArrowRight", "ArrowLeft", "Home"].includes(event.key)) return
    event.preventDefault()
    keyboard = true
    interact()
    if (event.key === " ") {
      paused = !paused
      el.dataset.autoplayPaused = String(paused)
    } else {
      const next =
        event.key === "Home"
          ? 0
          : slider.track.details.abs + (event.key === "ArrowRight" ? 1 : -1)
      slider.moveToIdx(next, true, {
        duration: reduce.matches ? 0 : 650,
        easing: (t) => 1 - Math.pow(1 - t, 4),
      })
    }
    schedule()
  }
  const blur = () => {
    keyboard = false
    schedule()
  }
  const sync = () => {
    if (document.hidden || reduce.matches) stop()
    else schedule(1000)
  }
  let revealed = false
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          ([entry]) => {
            visible = entry.intersectionRatio >= 0.5
            if (entry.isIntersecting) {
              revealed = true
              el.parentElement?.style.setProperty("--showcase-enter", "1")
            } else if (!revealed)
              el.parentElement?.style.setProperty("--showcase-enter", "0")
            if (visible) schedule(1000)
            else stop()
          },
          { threshold: [0.1, 0.5] },
        )
      : null
  const fallbackVisibility = () => {
    const rect = el.getBoundingClientRect()
    visible = rect.bottom > 0 && rect.top < innerHeight
    if (visible) schedule(1000)
    else stop()
  }
  slider.on("created", () => {
    observer?.observe(el)
    if (!observer) {
      fallbackVisibility()
      window.addEventListener("scroll", fallbackVisibility, { passive: true })
    }
    el.addEventListener("pointerdown", pointer, { passive: true })
    el.addEventListener("pointerenter", enter, { passive: true })
    el.addEventListener("pointerleave", leave, { passive: true })
    el.addEventListener("pointerup", release, { passive: true })
    el.addEventListener("pointercancel", release, { passive: true })
    el.addEventListener("wheel", wheel, { passive: false })
    el.addEventListener("keydown", key)
    el.addEventListener("blur", blur)
    document.addEventListener("visibilitychange", sync)
    reduce.addEventListener("change", sync)
  })
  slider.on("dragStarted", () => {
    dragging = true
    el.dataset.dragging = "true"
    interact()
  })
  slider.on("dragEnded", () => {
    dragging = false
    delete el.dataset.dragging
    resumeAt = performance.now() + 8000
    if (reduce.matches)
      queueMicrotask(() => {
        if (!disposed) slider.animator.stop()
      })
    schedule()
  })
  slider.on("animationEnded", () => {
    const wasAutomatic = automatic
    automatic = false
    if (!wasAutomatic) cruising = false
    schedule(wasAutomatic ? 0 : Math.max(0, resumeAt - performance.now()))
  })
  slider.on("animationStopped", () => {
    automatic = false
    cruising = false
  })
  slider.on("updated", () => {
    stop()
    schedule(1000)
  })
  slider.on("destroyed", () => {
    disposed = true
    clearTimeout(timer)
    observer?.disconnect()
    window.removeEventListener("scroll", fallbackVisibility)
    el.removeEventListener("pointerdown", pointer)
    el.removeEventListener("pointerenter", enter)
    el.removeEventListener("pointerleave", leave)
    el.removeEventListener("pointerup", release)
    el.removeEventListener("pointercancel", release)
    el.removeEventListener("wheel", wheel)
    el.removeEventListener("keydown", key)
    el.removeEventListener("blur", blur)
    document.removeEventListener("visibilitychange", sync)
    reduce.removeEventListener("change", sync)
  })
}

export function useShowcaseMotion() {
  const options = useMemo(
    () => ({
      loop: true,
      mode: "free" as const,
      renderMode: "precision" as const,
      rubberband: false,
      slides: (size: number, slides: HTMLElement[]) => {
        if (!size || !slides.length) return []
        const gap =
          parseFloat(
            getComputedStyle(
              slides[0]?.parentElement as HTMLElement,
            ).getPropertyValue("--showcase-gap"),
          ) || 0
        const height = (
          slides[0].parentElement as HTMLElement
        ).getBoundingClientRect().height
        return slides.map((slide) => ({
          size:
            (height *
              (slide.dataset.format === "portrait" ? 9 / 16 : 16 / 10)) /
            size,
          spacing: gap / size,
        }))
      },
    }),
    [],
  )
  const [attach, instance] = useKeenSlider<HTMLDivElement>(options, [
    showcaseActivity,
  ])
  return useCallback(
    (node: HTMLDivElement | null) => {
      const nativeOffset = node?.scrollLeft || 0
      if (node) {
        // Server markup remains a native scrollable gallery before hydration.
        node.scrollLeft = 0
        node.removeAttribute("data-keen-slider-disabled")
        node.dataset.keenReady = "true"
      }
      attach(node)
      if (nativeOffset && instance.current)
        instance.current.track.add(nativeOffset / instance.current.size)
    },
    [attach, instance],
  )
}
