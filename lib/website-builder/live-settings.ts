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
/** `version` as it was when no gesture was under way: what a reader that draws live values itself renders on (useLiveSections, quietWhileLive). */
let settledVersion = 0
function notify() {
  version++
  if (depth === 0) settledVersion = version
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

/* ── Echoes: a committed change, drawn before the canvas's deferred copy has it ── */

/**
 * ===========================================================================
 *  A WORD TYPED IS ON THE CANVAS IN ITS OWN FRAME, ON A SLOW PHONE TOO
 * ===========================================================================
 * Outside a gesture a setting is committed at once: the editor's state
 * takes it, and the canvas draws from a deferred copy of that state
 * (`useDeferredValue` in the editor), so the sidebar answers first and the
 * page follows. The deferred pass renders the whole editor again at low
 * priority, and each new key throws it away and starts it over. On a
 * phone's CPU it never finished while somebody typed: measured typing a
 * heading at 4x (docs/audits/website-builder-engine-2026-10.md, N2), 24
 * keys, and the canvas drew once, after the last, 1.2 to 2.1 seconds behind.
 *
 * So every committed section or block setting is also echoed here, and the
 * one section it belongs to draws it straight away, as a slider's value is
 * drawn (useLiveSection), while the editor and the deferred canvas catch up
 * behind it. An echo is only ever what the editor already holds:
 *
 *   it is let go of, quietly, once the canvas's own copy says the same
 *   (the section is then drawn from that copy, unchanged)
 *   the editor checks every echo against its current state after each of
 *   its renders (reconcileEchoes), and one the editor no longer holds (an
 *   Undo, an AI edit, the section deleted) is dropped at once, so an echo
 *   can never draw over a newer truth.
 */
const echoes = new Map<string, Overrides>()

/** A committed section setting, drawn by its section now. */
export function echoSectionSetting(sectionId: string, key: string, value: unknown): void {
  const cur = echoes.get(sectionId) ?? {}
  echoes.set(sectionId, { ...cur, settings: { ...cur.settings, [key]: value } })
  notify()
}

/**
 * ===========================================================================
 *  A THEME SETTING CHOSEN IS ON THE SECTIONS ON SCREEN FIRST
 * ===========================================================================
 * Outside a gesture a theme setting (a switch, a choice, a font, a word, a
 * number typed) is committed at once, and the canvas draws it from its
 * deferred copy: every section on the page renders again with the new
 * theme, at low priority, before any of them is shown. On a long page and a
 * slow phone that is a wait the size of the page for a change on screen
 * (scripts/check-editor-live.mjs, "currency code": 325ms at 4x on nine
 * sections). Echoed here, a reader that asks for echoes (the Storelib
 * canvas) draws the sections on screen with it first, as it draws a value
 * under a finger, and the rest follow with the commit. Like a section's
 * echo it is only ever what the editor holds: reconcileThemeEcho drops one
 * the editor no longer says (an Undo), and the reader lets it go once its
 * own copy agrees.
 */
let themeEcho: Record<string, unknown> | null = null

/** A committed theme setting, drawn on the sections on screen now. */
export function echoThemeSetting(key: string, value: unknown): void {
  themeEcho = { ...themeEcho, [key]: value }
  notify()
}

/** The theme echo checked against the editor's own settings after each of its renders: one it no longer holds is dropped. */
export function reconcileThemeEcho(current: Record<string, unknown>): void {
  const e = themeEcho
  if (!e || Object.keys(e).every((k) => sameSettingValue(current[k], e[k]))) return
  themeEcho = null
  notify()
}

/** What is echoed for the theme now, if anything: for a test, or a probe. */
export function themeEchoNow(): Record<string, unknown> | null {
  return themeEcho
}

/** A committed block setting, drawn by its section now. `path` as the editor's writers take it. */
export function echoBlockSetting(sectionId: string, path: string, key: string, value: unknown): void {
  const cur = echoes.get(sectionId) ?? {}
  echoes.set(sectionId, { ...cur, blocks: { ...cur.blocks, [path]: { ...cur.blocks?.[path], [key]: value } } })
  notify()
}

/** What is echoed for a section now, if anything: for a test, or a probe. */
export function echoOf(sectionId: string): Overrides | undefined {
  return echoes.get(sectionId)
}

/**
 * Every echo checked against the editor's own current sections: one whose
 * section is gone, or which no longer says what the editor holds, is
 * dropped. Called by the editor after each of its renders.
 */
export function reconcileEchoes(current: (sectionId: string) => SectionInstance | undefined): void {
  if (echoes.size === 0) return
  let dropped = false
  for (const [id, o] of echoes) {
    const now = current(id)
    if (!now || !settled(now, o)) {
      echoes.delete(id)
      dropped = true
    }
  }
  if (dropped) notify()
}

/**
 * Told of every live value as it is set, before any render: for a canvas
 * that draws a value itself, in the frame the value arrived in, rather than
 * after React has rendered it and an effect has run (compat-canvas.tsx: two
 * frames later, at best). Returns the unsubscribe.
 */
export function onLiveChange(listener: () => void): () => void {
  return subscribe(listener)
}

/** `section` as it should be drawn now: what was committed and echoed, with what a finger is moving over it. The same object when nothing is. */
export function liveSectionNow<T extends SectionInstance>(section: T): T {
  return withLive(withLive(section, echoes.get(section.id)), sections.get(section.id)) as T
}

/** The theme settings a finger is moving now, or null: for a canvas that writes them itself (compat-canvas.tsx). */
export function liveThemeNow(): Record<string, unknown> | null {
  return theme
}

/** Everything live forgotten without committing: for a test, or an editor that is closing. */
export function resetLive(): void {
  depth = 0
  sections.clear()
  echoes.clear()
  theme = null
  themeEcho = null
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
  const e = useSyncExternalStore(subscribe, () => echoes.get(section.id), () => undefined)
  /* The echo of what was committed, then what a finger is moving over it. */
  const out = useMemo(() => withLive(withLive(section, e), o), [section, e, o])
  useLayoutEffect(() => {
    /* Quietly, both: what is drawn is already this. */
    if (e && echoes.get(section.id) === e && settled(section, e)) echoes.delete(section.id)
    if (!o || depth > 0 || sections.get(section.id) !== o) return
    if (settled(section, o)) {
      sections.delete(section.id)
    }
  }, [section, o, e])
  return out
}

/**
 * A whole page's sections with what a finger is changing laid over them: for
 * a canvas that draws the page from one list rather than a component per
 * section (components/website-builder/compat/compat-canvas.tsx). A section
 * no finger is on is the same object, so a reader can tell which changed.
 */
export function useLiveSections<T extends SectionInstance>(list: readonly T[], opts: { quietWhileLive?: boolean } = {}): T[] {
  /*
    QUIET WHILE LIVE: for a canvas that draws a live value itself the moment
    it is set (onLiveChange, liveSectionNow), a render per value is only
    cost (compat-canvas.tsx, round 35: the canvas and its effects, every
    value, 10 to 18ms with the CPU slowed 4x). It renders again once the
    gesture is over, or for anything else that changes meanwhile.
  */
  const quiet = opts.quietWhileLive === true
  const at = useSyncExternalStore(subscribe, () => (quiet ? settledVersion : version), () => 0)
  /* Let go of a value once the editor's own copy says the same, as useLiveSection does: an Undo after a drag is then the Undo that is drawn. */
  useLayoutEffect(() => {
    for (const s of list) {
      const e = echoes.get(s.id)
      if (e && settled(s, e)) echoes.delete(s.id)
    }
    if (depth > 0) return
    for (const s of list) {
      const o = sections.get(s.id)
      if (o && settled(s, o)) sections.delete(s.id)
    }
  }, [list, at])
  return useMemo(() => {
    void at
    return list.map((s) => {
      const e = echoes.get(s.id)
      const o = sections.get(s.id)
      return e || o ? (withLive(withLive(s, e), o) as T) : s
    })
  }, [list, at])
}

/** How long a theme value being drawn may hold the next one back before the next is drawn anyway. */
export const DRAW_WAIT_MS = 400

/**
 * One draw at a time, and the newest value next (useLiveTheme below). `start`
 * begins drawing a value and says whether there was anything to draw; the
 * caller says `drawn` when a value is on screen. A value offered while one
 * is being drawn waits, replacing any value already waiting: values in
 * between are skipped, never queued. A draw that has not come back after
 * `waitMs` holds nothing up (a render React dropped, a component gone).
 *
 * AND A SHARE OF THE THREAD, NOT ALL OF IT. The waiting value is drawn after
 * a pause as long as the last draw took, so the drawing has at most half of
 * the main thread and the browser keeps the rest for the frames: the theme's
 * CSS variables (patched on every move) and the layout they cause. Drawn
 * back to back, a page width dragged on a 44 section page ran more frames
 * over 33ms than when most draws were thrown away (scripts/check-editor-
 * live-edit.mjs). The same rule as use-frame-commit.ts, for the same reason.
 */
export function oneDrawInFlight<V>(
  start: (value: V) => boolean,
  opts: { now?: () => number; later?: (run: () => void, ms: number) => unknown; cancel?: (handle: unknown) => void; waitMs?: number } = {},
): { offer: (value: V) => void; drawn: (value: V) => void; stop: () => void } {
  const now = opts.now ?? (() => Date.now())
  const later = opts.later ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const cancel = opts.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const waitMs = opts.waitMs ?? DRAW_WAIT_MS
  let inFlight: { value: V; at: number } | null = null
  let waiting: { value: V } | null = null
  let timer: unknown = null
  /* Between a draw coming back and the next one starting: a render of the same value meanwhile says nothing. */
  let pausing = false
  const begin = (value: V) => {
    pausing = false
    if (timer !== null) { cancel(timer); timer = null }
    if (!start(value)) {
      inFlight = null
      return
    }
    inFlight = { value, at: now() }
    /* Whatever is waiting when the draw should have come back is drawn then. */
    timer = later(() => {
      timer = null
      if (!inFlight || now() - inFlight.at < waitMs) return
      inFlight = null
      const next = waiting
      waiting = null
      if (next) begin(next.value)
    }, waitMs)
  }
  return {
    offer(value) {
      if (inFlight && now() - inFlight.at < waitMs) {
        waiting = { value }
        return
      }
      waiting = null
      begin(value)
    },
    drawn(value) {
      if (pausing || !inFlight || inFlight.value !== value) return
      const cost = Math.max(0, now() - inFlight.at)
      if (timer !== null) { cancel(timer); timer = null }
      if (!waiting || waiting.value === value) {
        inFlight = null
        waiting = null
        return
      }
      /* Still "in flight" through the pause, so a value offered meanwhile waits too and replaces this one. */
      inFlight = { value, at: now() }
      pausing = true
      timer = later(() => {
        timer = null
        pausing = false
        inFlight = null
        const next = waiting
        waiting = null
        if (next) begin(next.value)
      }, Math.min(cost, waitMs))
    },
    stop() {
      if (timer !== null) { cancel(timer); timer = null }
      pausing = false
      inFlight = null
      waiting = null
    },
  }
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
export function useLiveTheme<T extends ThemeSettingsValues>(base: T, patch?: (theme: T) => void, opts: { echoes?: boolean } = {}): T {
  /* What this reader draws over the theme: a value under a finger, or (for a reader that asks) a committed setting's echo. */
  const withEchoes = opts.echoes === true
  const storeNow = () => theme ?? (withEchoes ? themeEcho : null)
  const [o, setO] = useState<Record<string, unknown> | null>(storeNow)
  const baseRef = useRef(base)
  const patchRef = useRef(patch)
  useLayoutEffect(() => {
    baseRef.current = base
    patchRef.current = patch
  })
  const seen = useRef(storeNow())
  const storeRef = useRef(storeNow)
  storeRef.current = storeNow
  /*
    ONE DRAW IN FLIGHT, AND THE NEWEST VALUE NEXT. A transition is thrown
    away and started again when a newer value arrives before it finishes, and
    a finger on a colour sends one every frame: a render longer than a frame
    never finished at all, and the canvas drew once, after the finger lifted
    (scripts/check-editor-live-edit.mjs, a scheme colour: one draw for 61
    values). So a value that arrives while one is still being drawn waits,
    the draw finishes, and the newest waiting value is drawn next. Values in
    between are skipped, never queued. `patch` still runs on every move.
  */
  const oRef = useRef(o)
  const [drawing] = useState(() =>
    oneDrawInFlight<Record<string, unknown> | null>((value) => {
      /* Already what is drawn: nothing to wait for. */
      if (value === oRef.current) return false
      startTransition(() => setO(value))
      return true
    }),
  )
  useEffect(() => subscribe(() => {
    const cur = storeRef.current()
    /* A section's value moving says nothing new about the theme. */
    if (cur === seen.current) return
    seen.current = cur
    patchRef.current?.((cur ? { ...baseRef.current, ...cur } : baseRef.current) as T)
    drawing.offer(cur)
  }), [drawing])
  useLayoutEffect(() => {
    oRef.current = o
    drawing.drawn(o)
  }, [o, drawing])
  useEffect(() => () => drawing.stop(), [drawing])
  const out = useMemo(() => {
    if (!o) return base
    const b = base as Record<string, unknown>
    return Object.keys(o).some((k) => !sameSettingValue(b[k], o[k])) ? ({ ...base, ...o } as T) : base
  }, [base, o])
  useLayoutEffect(() => {
    const store = storeNow()
    patchRef.current?.(themeToPatch(base, o, out, store))
    /* An echo the editor's copy has caught up with is nothing to draw. */
    if (withEchoes && themeEcho && themeEcho !== o && drawnSettled(themeEcho, base, themeEcho, 0)) themeEcho = null
    if (!drawnSettled(o, base, store, depth)) return
    /*
      LET GO OF HERE TOO, NOT ONLY IN THE STORE (round 1022). The store's
      copy was let go of and this one kept: the last value a finger drew
      stayed laid over the theme for good, and the next change to that
      setting made any other way (Undo, a number typed into the box, a
      switch in an imported theme's settings, which are all one object) was
      drawn under it, so the canvas kept the dragged value until a refresh
      (scripts/check-editor-live.mjs, "undo theme radius", "currency code"
      after a drag). Nothing is drawn differently for letting go: the
      editor's copy says the same.
    */
    if (store === theme) theme = null
    if (store !== null && store === themeEcho) themeEcho = null
    drawing.stop()
    oRef.current = null
    seen.current = null
    setO(null)
    /* An echo still waiting behind the value just let go of is drawn next. */
    const next = storeNow()
    if (next) {
      seen.current = next
      drawing.offer(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, o, out, drawing])
  return out
}

/**
 * What the canvas's variables are written from after a render: the theme
 * drawn, or, when the store already holds a newer value than the one this
 * render drew, that one (round 1022). A render can finish with a value the
 * finger has passed (one draw in flight, the newest waiting), and patching
 * with it wrote the older value back over the newer one the move had
 * written: on a slow phone the canvas stepped back and forth under the
 * finger, and after the release showed an older radius, then the last.
 */
export function themeToPatch<T extends ThemeSettingsValues>(base: T, drawn: Record<string, unknown> | null, out: T, store: Record<string, unknown> | null): T {
  return store && store !== drawn ? ({ ...base, ...store } as T) : out
}

/**
 * Whether the theme a canvas drew from a finger can be let go of: no
 * gesture is under way, no newer value is on its way (the store holds this
 * one, or already let go), and the editor's own copy says the same.
 */
export function drawnSettled(drawn: Record<string, unknown> | null, base: ThemeSettingsValues, store: Record<string, unknown> | null, gestures: number): boolean {
  if (!drawn || gestures > 0 || (store !== drawn && store !== null)) return false
  const b = base as Record<string, unknown>
  return Object.keys(drawn).every((k) => sameSettingValue(b[k], drawn[k]))
}
