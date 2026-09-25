"use client"

/**
 * ===========================================================================
 *  PRESS A SCHEME, SEE THE PAGE IN IT
 * ===========================================================================
 * The client half of lib/store-builder/scheme-preview. `show` does three
 * things, in this order, all on the press:
 *
 *   1. Turns on the colour transition for the page (`cp-scheme-shift`), so
 *      every colour that changes from here on eases over 340ms instead of
 *      cutting.
 *   2. Paints the page's root with the new scheme's surface, type and tokens,
 *      which the server prepared for exactly this. That is the page, its
 *      text and everything drawn from the tokens, changing on the press.
 *   3. Asks the router for the page drawn in that scheme (`?scheme=`), which
 *      brings the cards, bars and sections, through the same transition. A
 *      scheme already fetched in the last five minutes comes back from the
 *      router's cache at once, and one the pointer is resting on is fetched
 *      before it is pressed (`prefetch`).
 *
 * `reset` puts the saved scheme back the same way, for a Cancel. `settle`
 * forgets the preview after a Save, when the scheme on the page IS the saved
 * one and only the address still says otherwise.
 *
 * Nothing here is written anywhere. Save does that, with the rest of the form.
 */

import * as React from "react"
import { useRouter } from "next/navigation"

import { SCHEME_PREVIEW_PARAM, type RootPaint } from "@/lib/store-builder/scheme-preview"

const SHIFT_CLASS = "cp-scheme-shift"
/** The transition in globals.css, and a margin for the last frame of it. */
const SHIFT_HOLD_MS = 340 + 140
/** However the render goes, the transition is not left on the page for good. */
const SHIFT_CEILING_MS = 8000

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function paintRoot(paint: RootPaint | undefined) {
  if (!paint || typeof document === "undefined") return
  const root = document.querySelector<HTMLElement>("[data-storefront-root]")
  if (!root) return
  root.style.background = paint.background
  root.style.color = paint.color
  for (const [name, value] of Object.entries(paint.tokens)) root.style.setProperty(name, value)
}

export function useSchemePreview(saved: string, roots?: Record<string, RootPaint>) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  /** The scheme the page is drawn in right now. */
  const shownRef = React.useRef(saved)
  const savedRef = React.useRef(saved)
  const rootsRef = React.useRef(roots)
  React.useEffect(() => {
    rootsRef.current = roots
  })
  /* A save moved what "saved" means; with no preview running, that is what is shown. */
  React.useEffect(() => {
    if (shownRef.current === savedRef.current) shownRef.current = saved
    savedRef.current = saved
  }, [saved])

  const shifting = React.useRef(false)
  const ceiling = React.useRef<number | null>(null)
  const endShift = React.useCallback(() => {
    shifting.current = false
    if (ceiling.current != null) window.clearTimeout(ceiling.current)
    ceiling.current = null
    document.documentElement.classList.remove(SHIFT_CLASS)
  }, [])
  const beginShift = React.useCallback(() => {
    if (reducedMotion()) return
    shifting.current = true
    document.documentElement.classList.add(SHIFT_CLASS)
    if (ceiling.current != null) window.clearTimeout(ceiling.current)
    ceiling.current = window.setTimeout(endShift, SHIFT_CEILING_MS)
  }, [endShift])

  /* The render has landed: let its colours finish easing, then take the transition off. */
  React.useEffect(() => {
    if (pending || !shifting.current) return
    const t = window.setTimeout(endShift, SHIFT_HOLD_MS)
    return () => window.clearTimeout(t)
  }, [pending, endShift])
  React.useEffect(() => endShift, [endShift])

  const urlFor = React.useCallback((preset: string) => {
    const url = new URL(window.location.href)
    if (preset === savedRef.current) url.searchParams.delete(SCHEME_PREVIEW_PARAM)
    else url.searchParams.set(SCHEME_PREVIEW_PARAM, preset)
    return `${url.pathname}${url.search}${url.hash}`
  }, [])

  const show = React.useCallback((preset: string) => {
    if (typeof window === "undefined" || preset === shownRef.current) return
    shownRef.current = preset
    beginShift()
    paintRoot(rootsRef.current?.[preset])
    const href = urlFor(preset)
    startTransition(() => router.replace(href, { scroll: false }))
  }, [beginShift, router, urlFor])

  const prefetch = React.useCallback((preset: string) => {
    if (typeof window === "undefined" || preset === shownRef.current) return
    try {
      router.prefetch(urlFor(preset), { kind: "full" as never })
    } catch {
      /* A router that will not prefetch still navigates. */
    }
  }, [router, urlFor])

  const reset = React.useCallback(() => show(savedRef.current), [show])

  /**
   * After a Save the page is already in the scheme that is now saved; only
   * the address still carries it. It is taken off without a navigation (the
   * router follows history.replaceState), so the refresh that follows the
   * save re-reads the plain address.
   */
  const settle = React.useCallback((nowSaved: string) => {
    savedRef.current = nowSaved
    shownRef.current = nowSaved
    const url = new URL(window.location.href)
    if (!url.searchParams.has(SCHEME_PREVIEW_PARAM)) return
    url.searchParams.delete(SCHEME_PREVIEW_PARAM)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [])

  return { show, prefetch, reset, settle }
}
