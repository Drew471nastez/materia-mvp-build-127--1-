"use client"

import { useCallback, useMemo } from "react"
import { useKeenSlider } from "keen-slider/react.js"
import type { KeenSliderPlugin } from "keen-slider"

/** Native drag and snap; autoplay advances complete desktop compositions. */
const showcaseActivity: KeenSliderPlugin = (slider) => {
  const el = slider.container
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let visible = false,
    dragging = false,
    paused = false,
    keyboard = false,
    disposed = false
  let resumeAt = 0,
    wheelTotal = 0,
    wheelUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const animation = () => ({
    duration: reduce.matches ? 0 : 600,
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
  })
  const section = el.closest<HTMLElement>("[data-build-showcase]")
  const browsing = (active: boolean) => {
    section?.toggleAttribute("data-showcase-browsing", active)
    if (active) section?.removeAttribute("data-showcase-pristine")
  }
  const eligible = () =>
    !disposed &&
    visible &&
    !document.hidden &&
    !reduce.matches &&
    !dragging &&
    !paused &&
    !(keyboard && el.matches(":focus-within"))
  const schedule = () => {
    clearTimeout(timer)
    if (!eligible()) return
    timer = setTimeout(
      () => {
        if (!eligible()) return
        if (slider.animator.active) {
          schedule()
          return
        }
        slider.moveToIdx(slider.track.details.abs + 1, true, {
          duration: 1100,
          // Start and stop gently during autoplay; direct dragging keeps Keen's
          // velocity-aware release, without imposing this easing on the hand.
          easing: (t: number) => t * t * t * (t * (t * 6 - 15) + 10),
        })
      },
      Math.max(5000, resumeAt - performance.now()),
    )
  }
  const stop = () => {
    clearTimeout(timer)
    slider.animator.stop()
  }
  const settle = () => {
    slider.moveToIdx(slider.track.details.abs, true, animation())
  }
  const interact = () => {
    resumeAt = performance.now() + 8000
    stop()
  }
  const pointer = () => {
    keyboard = false
    el.dataset.dragging = "true"
    interact()
    browsing(true)
  }
  const release = () => {
    if (!dragging) {
      delete el.dataset.dragging
      settle()
      browsing(false)
      schedule()
    }
  }
  const wheel = (event: WheelEvent) => {
    const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
    if (!event.shiftKey && Math.abs(x) <= Math.abs(event.deltaY)) return
    event.preventDefault()
    keyboard = false
    if (performance.now() < wheelUntil) {
      wheelUntil = performance.now() + 250
      return
    }
    wheelTotal += x * (event.deltaMode === 1 ? 16 : 1)
    if (Math.abs(wheelTotal) < 45) return
    interact()
    slider.moveToIdx(
      slider.track.details.abs + (wheelTotal > 0 ? 1 : -1),
      true,
      animation(),
    )
    wheelTotal = 0
    wheelUntil = performance.now() + 250
    schedule()
  }
  const key = (event: KeyboardEvent) => {
    if (![" ", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return
    event.preventDefault()
    keyboard = true
    interact()
    if (event.key === " ") {
      paused = !paused
      el.dataset.autoplayPaused = String(paused)
    } else
      slider.moveToIdx(
        event.key === "Home"
          ? 0
          : slider.track.details.abs + (event.key === "ArrowRight" ? 1 : -1),
        true,
        animation(),
      )
    schedule()
  }
  const blur = () => {
    keyboard = false
    schedule()
  }
  const sync = () => {
    if (!eligible()) stop()
    else {
      settle()
      schedule()
    }
  }
  const observe =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.target !== el) {
                if (entry.isIntersecting)
                  el.closest("[data-build-showcase]")?.setAttribute(
                    "data-showcase-entered",
                    "",
                  )
                continue
              }
              const wasVisible = visible
              visible = entry.intersectionRatio >= 0.5
              if (entry.isIntersecting)
                el.parentElement?.setAttribute("data-showcase-entered", "")
              if (visible) {
                if (!wasVisible) settle()
                schedule()
              } else stop()
            }
          },
          { threshold: [0.1, 0.5] },
        )
      : null
  const fallback = () => {
    const rect = el.getBoundingClientRect()
    visible = rect.bottom > 0 && rect.top < innerHeight
    sync()
  }
  slider.on("created", () => {
    observe?.observe(el)
    const heading = el
      .closest("[data-build-showcase]")
      ?.querySelector(".build-showcase-top")
    if (heading) observe?.observe(heading)
    if (!observe) {
      fallback()
      window.addEventListener("scroll", fallback, { passive: true })
    }
    el.addEventListener("pointerdown", pointer, { passive: true })
    el.addEventListener("pointerup", release, { passive: true })
    el.addEventListener("pointercancel", release, { passive: true })
    el.addEventListener("wheel", wheel, { passive: false })
    el.addEventListener("keydown", key)
    el.addEventListener("blur", blur)
    document.addEventListener("visibilitychange", sync)
    reduce.addEventListener("change", sync)
    el.dataset.showcaseIndex = String(slider.track.details.rel)
  })
  slider.on("dragStarted", () => {
    dragging = true
    interact()
    el.dataset.dragging = "true"
    browsing(true)
  })
  slider.on("dragEnded", () => {
    dragging = false
    delete el.dataset.dragging
    resumeAt = performance.now() + 8000
    if (!slider.animator.active) browsing(false)
    // Keen retains its measured release velocity and settles without a second
    // stop/restart animation or a forced slow-start easing curve.
    schedule()
  })
  slider.on("slideChanged", () => {
    el.dataset.showcaseIndex = String(slider.track.details.rel)
  })
  slider.on("animationStarted", () => browsing(true))
  slider.on("animationEnded", () => {
    browsing(false)
    schedule()
  })
  slider.on("animationStopped", () => {
    if (!dragging) browsing(false)
  })
  slider.on("beforeOptionsChanged", () => {
    for (const node of el.querySelectorAll<HTMLElement>(
      ".build-showcase-group,.build-showcase-slide",
    )) {
      for (const name of ["min-width", "max-width", "transform"])
        node.style.removeProperty(name)
    }
  })
  slider.on("updated", () => {
    stop()
    schedule()
  })
  slider.on("destroyed", () => {
    disposed = true
    browsing(false)
    clearTimeout(timer)
    observe?.disconnect()
    window.removeEventListener("scroll", fallback)
    el.removeEventListener("pointerdown", pointer)
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
      mode: "snap" as const,
      renderMode: "precision" as const,
      rubberband: false,
      dragSpeed: 1,
      selector: ".build-showcase-group",
      slides: { perView: 1, spacing: 24 },
      breakpoints: {
        "(max-width: 767px)": {
          selector: ".build-showcase-slide",
          slides: (size: number, slides: HTMLElement[]) => {
            // Preserve the same wide/portrait ratio at a common measured height.
            const cardHeight = slides[0]?.getBoundingClientRect().height || 220
            const gutter = Math.min(96, Math.max(22, innerWidth * 0.06))
            return slides.map((slide) => ({
              origin: gutter / size,
              size:
                (cardHeight *
                  (slide.dataset.format === "portrait" ? 9 / 16 : 4 / 3)) /
                size,
              spacing: 12 / size,
            }))
          },
        },
      },
      defaultAnimation: {
        duration: 600,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      },
    }),
    [],
  )
  const [attach] = useKeenSlider<HTMLDivElement>(options, [showcaseActivity])
  return useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        node.scrollLeft = 0
        node.removeAttribute("data-keen-slider-disabled")
        node.dataset.keenReady = "true"
      }
      attach(node)
    },
    [attach],
  )
}
