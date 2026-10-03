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
  /* What the plan depends on: the theme's four settings and each section's own choice. */
  const motionKey = JSON.stringify([
    t.animations_enabled ?? null,
    t.animation_style ?? null,
    t.animation_duration ?? null,
    t.animation_stagger ?? null,
    body.map((s) => s.settings?.animation ?? null),
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

  /* Section links and an arriving hash: the live page only. */
  useEffect(() => {
    const root = rootRef.current
    if (!root || inEditor) return
    return installSectionLinks(root)
  }, [rootRef, inEditor])

  const reveal = useRef<Reveal | null>(null)
  const lastIds = useRef<string>("")
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
      lastIds.current = rootRef.current ? currentIds(rootRef.current) : ""
    })
    return () => {
      cancelAnimationFrame(frame)
      r?.stop()
      if (reveal.current === r) reveal.current = null
    }
  }, [rootRef, motionKey])

  /*
    The sections changed under a running reveal. A different page (nothing in
    common with the last) is planned afresh; a section added, removed or moved
    on the same page is left on screen, never hidden.
  */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const frame = requestAnimationFrame(() => {
      const r = reveal.current
      if (!r) return
      const now = currentIds(root)
      const before = new Set(lastIds.current.split(" ").filter(Boolean))
      const fresh = !now.split(" ").some((id) => id && before.has(id))
      lastIds.current = now
      r.rescan(fresh)
    })
    return () => cancelAnimationFrame(frame)
  }, [rootRef, bodyIds])
}

function currentIds(root: HTMLElement): string {
  return Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-section-box]:not([data-chrome])"))
    .map((b) => b.dataset.sectionKey ?? "")
    .join(" ")
}
