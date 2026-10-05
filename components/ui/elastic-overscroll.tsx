"use client"

/**
 * Turns the rubber band back on for the buyer's pages and tells the
 * stylesheet what colour the page's own foot is, so the band at the bottom
 * reveals the page rather than a strip of the header's colour or of white.
 *
 * The reasoning, the two reasons the bounce was refused and how both are
 * still met, is in lib/ui/elastic-overscroll.ts. The CSS is in
 * app/globals.css under `html.elastic-scroll`.
 *
 * It measures after every move, and once more a short time later: a footer
 * can stream in after the page commits (app/account/layout.tsx draws the
 * footer inside a Suspense boundary), and the foot of the page is then a
 * different element than it was on the frame the navigation landed.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import {
  ELASTIC_CLASS,
  ELASTIC_SELECTOR,
  GROUND_VAR,
  type GroundProbe,
  bottomSurface,
  groundColor,
} from "@/lib/ui/elastic-overscroll"

/** A footer that arrives after the page did. One re-read, not a loop. */
const SETTLE_MS = 450

export function ElasticOverscroll() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof document === "undefined") return
    const html = document.documentElement

    const probe: GroundProbe = {
      background: (el) => {
        try {
          return window.getComputedStyle(el).backgroundColor
        } catch {
          return "transparent"
        }
      },
      position: (el) => {
        try {
          return window.getComputedStyle(el).position
        } catch {
          return "static"
        }
      },
      height: (el) => el.getBoundingClientRect().height,
    }

    function apply() {
      const surface = document.querySelector(ELASTIC_SELECTOR)
      if (!surface) {
        /* Not a buyer page: whatever refused the bounce before still does. */
        html.classList.remove(ELASTIC_CLASS)
        html.style.removeProperty(GROUND_VAR)
        return
      }
      const ground = groundColor(bottomSurface(surface, probe), probe)
      if (ground) html.style.setProperty(GROUND_VAR, ground)
      else html.style.removeProperty(GROUND_VAR)
      /* The class last, so the ground is in place on the frame it turns on. */
      html.classList.add(ELASTIC_CLASS)
    }

    apply()
    const settle = window.setTimeout(apply, SETTLE_MS)
    return () => window.clearTimeout(settle)
  }, [pathname])

  return null
}
