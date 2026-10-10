"use client"

/**
 * ===========================================================================
 *  WHAT A FINGER ON A SLIDER CHANGES, BEFORE THE EDITOR HEARS OF IT
 * ===========================================================================
 * The owner, round 25: "if I drag the slider for a heading's font size, the
 * change on the canvas is very laggy and not smooth, and the same with
 * padding top or bottom".
 *
 * Measured on the real editor (scripts/check-slider-latency.mjs): every
 * value a slider sent went into the editor's state, the whole editor (some
 * ten thousand lines of sidebar, canvas and panels) rendered again, and the
 * section's stylesheet was written out whole, which restyled every element
 * on the page. A padding drag: 57 values, 13 to 18 of them drawn, the
 * canvas 100ms behind the thumb at full speed and four times that on a
 * slowed CPU.
 *
 * So a drag is two things kept apart, the way Shopify's and Figma's editors
 * keep them:
 *
 *   LIVE      every value goes here, and only the section it belongs to (or,
 *             for a theme setting, the canvas) renders again with it.
 *             Nothing in the sidebar, the undo stack or the save knows yet.
 *   COMMIT    when the finger lifts, the last value of each setting the drag
 *             moved is handed to the editor once: one undo step from where
 *             the drag began to where it ended, one autosave, the page
 *             marked unsaved once.
 *
 * A control says a gesture has begun with `beginLive()` and that it is over
 * with `endLive()`; the editor's setting writers ask `isLive()` and, while it
 * is, call `deferLive()` with their own commit instead of committing. A
 * value is let go of by the section once the editor's own copy says the same
 * (`useLiveSection` below), never before, so no frame shows the old value
 * between the drag and its commit.
 */

import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { BlockInstance, SectionInstance, ThemeSettingsValues } from "./types"
import { parsePath, updateAt } from "./block-tree"
import { sameSettingValue } from "./same-setting"

type Overrides = {
  settings?: Record<string, unknown>
  /** Block path (block-tree's `a/b/c`) to its settings. */
  blocks?: Record<string, Record<string, unknown>>
}

let depth = 0
const sections = new Map<string, Overrides>()
let theme: Record<string, unknown> | null = null
const commits = new Map<string, () => void>()
const listeners = new Set<() => void>()

/** Bumped on every change, for a reader of the whole store (useLiveSections). */
let version = 0
function notify() {
  version++
  for (const l of listeners) l()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** A gesture on a control has begun: what it sends is live until `endLive`. */
export function beginLive(): void {
  depth++
}

/** Whether a setting written now is part of a gesture still under a finger. */
export function isLive(): boolean {
  return depth > 0
}

/**
 * The gesture is over: every setting it moved is committed, once, in the
 * order it was first moved. Runs in the caller's task, so React batches the
 * commits into one render.
 */
export function endLive(): void {
  if (depth > 0) depth--
  if (depth > 0) return
  const all = [...commits.values()]
  commits.clear()
  /*
    As a transition: the commit renders the whole editor (the sidebar, the
    undo stack, the save), which on a phone is a frame or several. Urgent, it
    froze the thumb's settle glide and the next touch; as a transition React
    renders it in slices between frames, and the canvas already shows the
    value, held by the live layer until the editor's copy catches up.
  */
  startTransition(() => {
    for (const run of all) {
      try { run() } catch (e) { console.error(e) }
    }
  })
  /* A commit the editor dropped or changed on the way (a value it clamps, a section deleted meanwhile) would leave a live value drawn over the truth forever: after a moment, whatever is still live is let go of. */
  setTimeout(() => {
    if (depth > 0 || commits.size > 0 || (sections.size === 0 && theme === null)) return
    sections.clear()
    theme = null
    notify()
  }, 1500)
}

/**
 * A begin and an end that always pair, for a control whose press and
 * release are separate handlers: an end with no begin, or a second begin
 * before the end, is a no-op.
 */
export function liveGesture(): { begin: () => void; end: () => void } {
  let on = false
  return {
    begin() { if (!on) { on = true; beginLive() } },
    end() { if (on) { on = false; endLive() } },
  }
}

/** Keep `run` as this setting's commit for when the gesture ends; a later one for the same `key` replaces it. */
export function deferLive(key: string, run: () => void): void {
  commits.delete(key)
  commits.set(key, run)
}

/** A section's setting, drawn now. */
export function setLiveSectionSetting(sectionId: string, key: string, value: unknown): void {
  const cur = sections.get(sectionId) ?? {}
  sections.set(sectionId, { ...cur, settings: { ...cur.settings, [key]: value } })
  notify()
}

/** A block's setting, drawn now. `path` is the block's path or bare id, as the editor's writers take it. */
export function setLiveBlockSetting(sectionId: string, path: string, key: string, value: unknown): void {
  const cur = sections.get(sectionId) ?? {}
  const blocks = { ...cur.blocks, [path]: { ...cur.blocks?.[path], [key]: value } }
  sections.set(sectionId, { ...cur, blocks })
  notify()
}

/** A theme setting, drawn now. */
export function setLiveThemeSetting(key: string, value: unknown): void {
  theme = { ...theme, [key]: value }
  notify()
}

/** Everything live forgotten without committing: for a test, or an editor that is closing. */
export function resetLive(): void {
  depth = 0
  sections.clear()
  theme = null
  commits.clear()
  notify()
}

/* ── Reading it ───────────────────────────────────────────────────────── */

function blockPathIn(list: readonly BlockInstance[] | undefined, key: string): string[] | null {
  const path = parsePath(key)
  if (path.length > 1) return path
  /* A bare id: the first block with it, anywhere in the tree. */
  const find = (l: readonly BlockInstance[] | undefined, trail: string[]): string[] | null => {
    for (const b of l ?? []) {
      if (b.id === key) return [...trail, b.id]
      const inner = find(b.blocks, [...trail, b.id])
      if (inner) return inner
    }
    return null
  }
  return find(list, [])
}

/** `section` with what is live for it laid over; the same object when nothing is. */
export function withLive(section: SectionInstance, o: Overrides | undefined): SectionInstance {
  if (!o) return section
  let out = section
  if (o.settings && Object.keys(o.settings).some((k) => !sameSettingValue(section.settings?.[k], o.settings![k]))) {
    out = { ...out, settings: { ...out.settings, ...o.settings } }
  }
  for (const [key, values] of Object.entries(o.blocks ?? {})) {
    const path = blockPathIn(out.blocks, key)
    if (!path) continue
    out = { ...out, blocks: updateAt(out.blocks, path, (b) => ({ ...b, settings: { ...b.settings, ...values } })) }
  }
  return out
}

/** Whether every live value for a section is already what the editor holds. */
function settled(section: SectionInstance, o: Overrides): boolean {
  for (const [k, v] of Object.entries(o.settings ?? {})) if (!sameSettingValue(section.settings?.[k], v)) return false
  for (const [key, values] of Object.entries(o.blocks ?? {})) {
    const path = blockPathIn(section.blocks, key)
    if (!path) continue
    let list = section.blocks
    let hit: BlockInstance | undefined
    for (const id of path) {
      hit = list?.find((b) => b.id === id)
      list = hit?.blocks
    }
    for (const [k, v] of Object.entries(values)) if (!sameSettingValue(hit?.settings?.[k], v)) return false
  }
  return true
}

/**
 * The section to draw: the editor's copy, with what a finger is moving laid
 * over it. Only the section whose values change renders again on a move.
 * Once the editor's copy has caught up, the live values are let go of.
 */
export function useLiveSection(section: SectionInstance): SectionInstance {
  const o = useSyncExternalStore(subscribe, () => sections.get(section.id), () => undefined)
  const out = useMemo(() => withLive(section, o), [section, o])
  useLayoutEffect(() => {
    if (!o || depth > 0 || sections.get(section.id) !== o) return
    if (settled(section, o)) {
      /* Quietly: what is drawn is already this. */
      sections.delete(section.id)
    }
  }, [section, o])
  return out
}

/**
 * A whole page's sections with what a finger is changing laid over them: for
 * a canvas that draws the page from one list rather than a component per
 * section (components/website-builder/compat/compat-canvas.tsx). A section
 * no finger is on is the same object, so a reader can tell which changed.
 */
export function useLiveSections<T extends SectionInstance>(list: readonly T[]): T[] {
  const at = useSyncExternalStore(subscribe, () => version, () => 0)
  /* Let go of a value once the editor's own copy says the same, as useLiveSection does: an Undo after a drag is then the Undo that is drawn. */
  useLayoutEffect(() => {
    if (depth > 0) return
    for (const s of list) {
      const o = sections.get(s.id)
      if (o && settled(s, o)) sections.delete(s.id)
    }
  }, [list, at])
  return useMemo(() => {
    void at
    return list.map((s) => {
      const o = sections.get(s.id)
      return o ? (withLive(s, o) as T) : s
    })
  }, [list, at])
}

/**
 * The theme to draw, with a theme setting under a finger laid over it; the
 * same object when none is.
 *
 * A theme setting reaches every section on the page, and each section's
 * template reads the theme (its `theme.*` tokens, its scheme, its type
 * styles), so all of them render again. That cannot be done on every move
 * of a finger on a slow phone (scripts/check-slider-latency.mjs, 4x CPU: a
 * frame of 200ms per value). So it comes in two parts:
 *
 *   `patch`   called on every move, before any render, with the theme as
 *             it now is: for what can be written straight onto the page
 *             (the theme's CSS variables on the canvas's root), which the
 *             browser shows on the next frame.
 *   render    the sections, as a transition: React renders them between
 *             frames, and a newer value arriving meanwhile replaces the one
 *             being rendered rather than queueing behind it.
 *
 * `patch` is also called after every render with the theme that was drawn,
 * so what was written by hand never outlives the value it was written for.
 */
export function useLiveTheme<T extends ThemeSettingsValues>(base: T, patch?: (theme: T) => void): T {
  const [o, setO] = useState<Record<string, unknown> | null>(() => theme)
  const baseRef = useRef(base)
  const patchRef = useRef(patch)
  useLayoutEffect(() => {
    baseRef.current = base
    patchRef.current = patch
  })
  const seen = useRef(theme)
  useEffect(() => subscribe(() => {
    const cur = theme
    /* A section's value moving says nothing new about the theme. */
    if (cur === seen.current) return
    seen.current = cur
    patchRef.current?.((cur ? { ...baseRef.current, ...cur } : baseRef.current) as T)
    startTransition(() => setO(cur))
  }), [])
  const out = useMemo(() => {
    if (!o) return base
    const b = base as Record<string, unknown>
    return Object.keys(o).some((k) => !sameSettingValue(b[k], o[k])) ? ({ ...base, ...o } as T) : base
  }, [base, o])
  useLayoutEffect(() => {
    patchRef.current?.(out)
    if (!o || depth > 0 || theme !== o) return
    const b = base as Record<string, unknown>
    if (Object.keys(o).every((k) => sameSettingValue(b[k], o[k]))) theme = null
  }, [base, o, out])
  return out
}
