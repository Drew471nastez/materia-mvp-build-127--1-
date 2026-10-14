"use client"

/**
 * The page root's scrolling and arriving, wired to React: ThemePage calls
 * this once, so the editor's canvas and every published route get the same
 * behaviour from the same code. The behaviour itself is in
 * lib/website-builder/section-motion.ts.
 */
import { useEffect, useRef, type RefObject } from "react"
import {
  headerOf,
  installReveal,
  installSectionLinks,
  publishAnchorOffset,
  type Reveal,
} from "@/lib/website-builder/section-motion"
import { isChromeType } from "@/lib/website-builder/section-anchors"
import { installMediaFade } from "@/lib/website-builder/media-fade"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export function useSiteMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  theme: ThemeSettingsValues,
  sections: SectionInstance[],
  inEditor: boolean,
): void {
  const t = theme as Record<string, unknown>
  const headerId = sections.find((s) => s.type === "header" && !s.hidden)?.id ?? ""
  const body = sections.filter((s) => !s.hidden && !isChromeType(s.type))
  const bodyIds = body.map((s) => s.id).join(" ")
  /*
    What the plan depends on: the theme's four settings and each section's
    own choice. Only the sections that made one are named, by id, so a
    section added, removed or moved in the builder is not a new plan (that
    stopped the reveal and armed again every section below the screen,
    those already played included); the rescan below takes it in.
  */
  const motionKey = JSON.stringify([
    t.animations_enabled ?? null,
    t.animation_style ?? null,
    t.animation_duration ?? null,
    t.animation_stagger ?? null,
    body.flatMap((s) => (s.settings?.animation == null ? [] : [[s.id, s.settings.animation]])),
  ])

  /* The header's height, measured and shared: the scroll lands under it, and
     the theme's scroll-margin-top reads the same number. */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const update = () => publishAnchorOffset(root)
    update()
    const header = headerOf(root)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    if (header) ro?.observe(header)
    window.addEventListener("resize", update)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [rootRef, headerId])

  /* Pictures and videos fade in as they load, never snap (lib/website-builder/media-fade.ts). */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return installMediaFade(root)
  }, [rootRef])

  /* Section links and an arriving hash: the live page only. */
  useEffect(() => {
    const root = rootRef.current
    if (!root || inEditor) return
    return installSectionLinks(root)
  }, [rootRef, inEditor])

  const reveal = useRef<Reveal | null>(null)
  const themeRef = useRef(t)
  themeRef.current = t

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let r: Reveal | null = null
    /* A frame later, once anything that moves the scroll as a page opens
       (the editor puts a new page at its top) has done so. */
    const frame = requestAnimationFrame(() => {
      r = installReveal(root, themeRef.current)
      reveal.current = r
    })
    return () => {
      cancelAnimationFrame(frame)
      r?.stop()
      if (reveal.current === r) reveal.current = null
    }
  }, [rootRef, motionKey])

  /*
    The sections changed under a running reveal: another page, or a section
    added, removed, moved or shown again on this one. Only boxes the reveal
    has not seen are planned (section-motion.ts installReveal): one put in
    below the screen arrives when it is scrolled to, as on the website, and
    nothing already painted hides or plays again. A setting typed into a
    section changes no id, so it never gets here at all.
  */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const frame = requestAnimationFrame(() => reveal.current?.rescan())
    return () => cancelAnimationFrame(frame)
  }, [rootRef, bodyIds])
}
