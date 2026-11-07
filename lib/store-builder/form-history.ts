"use client"

/**
 * ===========================================================================
 *  UNDO INSIDE AN OPEN SHEET (round 50)
 * ===========================================================================
 * Edit profile, Arrange and the bar's sheet each hold a form, and until it is
 * saved nothing about it is on the server. So their undo is the form's own:
 * every change is a step, and Cmd+Z (Ctrl+Z), Shift+Cmd+Z and Ctrl+Y walk
 * it, as do the two arrows in the sheet's title row (EditorSheet `history`).
 *
 * TYPING IS GROUPED. A burst of typing into one field is one step: a change
 * to the same text field within GROUP_MS of the last one joins it. A pause,
 * another field, a switch, a picture or a scheme starts a new step.
 *
 * Once the sheet is saved the page's history (lib/store-builder/editor-history)
 * has the whole save as one step; the form's history starts again on open.
 *
 * The reducer is pure (tests/creator-editor-r50); the hook wires it up.
 */
import * as React from "react"
import { historyKey } from "@/lib/store-builder/editor-history"

export const GROUP_MS = 800

export interface FormHistory<T> {
  states: T[]
  at: number
  /** The field the last step typed into, and when, for grouping. */
  typing: { key: string; at: number } | null
}

export function startForm<T>(value: T): FormHistory<T> {
  return { states: [value], at: 0, typing: null }
}

/** The one key that differs and holds text, or null. */
function typedKey<T>(a: T, b: T): string | null {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return null
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
  let only: string | null = null
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]
    const y = (b as Record<string, unknown>)[k]
    if (JSON.stringify(x) === JSON.stringify(y)) continue
    if (only !== null) return null
    if (typeof x === "string" && typeof y === "string") {
      only = k
      continue
    }
    /* A text field inside a group (a social link). */
    if (x && y && typeof x === "object" && typeof y === "object") {
      const inner = typedKey(x, y)
      if (inner === null) return null
      only = `${k}.${inner}`
      continue
    }
    return null
  }
  return only
}

export function recordForm<T>(h: FormHistory<T>, next: T, now: number): FormHistory<T> {
  const current = h.states[h.at]
  if (JSON.stringify(current) === JSON.stringify(next)) return h
  const key = typedKey(current, next)
  /* Still typing into the same field: the step grows instead of a new one starting. */
  if (key && h.typing && h.typing.key === key && now - h.typing.at < GROUP_MS && h.at > 0) {
    const states = [...h.states.slice(0, h.at), next]
    return { states, at: h.at, typing: { key, at: now } }
  }
  const states = [...h.states.slice(0, h.at + 1), next].slice(-100)
  return { states, at: states.length - 1, typing: key ? { key, at: now } : null }
}

export const formCanUndo = <T,>(h: FormHistory<T>) => h.at > 0
export const formCanRedo = <T,>(h: FormHistory<T>) => h.at < h.states.length - 1
export const formUndo = <T,>(h: FormHistory<T>): FormHistory<T> => (formCanUndo(h) ? { ...h, at: h.at - 1, typing: null } : h)
export const formRedo = <T,>(h: FormHistory<T>): FormHistory<T> => (formCanRedo(h) ? { ...h, at: h.at + 1, typing: null } : h)

export interface SheetHistory {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

/**
 * `value` is the form as it is now, `apply` puts a remembered form back.
 * Starts again every time `open` becomes true.
 */
export function useFormHistory<T>(open: boolean, value: T, apply: (v: T) => void): SheetHistory {
  const [h, setH] = React.useState<FormHistory<T>>(() => startForm(value))
  const hRef = React.useRef(h)
  hRef.current = h
  const applying = React.useRef<T | null>(null)
  const applyRef = React.useRef(apply)
  applyRef.current = apply
  const signature = JSON.stringify(value)

  /* A fresh history each time the sheet opens, from the form as it opened. */
  const wasOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !wasOpen.current) setH(startForm(value))
    wasOpen.current = open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    if (!open) return
    /* The change an undo or redo just made is not a new step. */
    if (applying.current !== null && JSON.stringify(applying.current) === signature) {
      applying.current = null
      return
    }
    setH((cur) => recordForm(cur, value, Date.now()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, open])

  const go = React.useCallback((dir: "undo" | "redo") => {
    const cur = hRef.current
    const next = dir === "undo" ? formUndo(cur) : formRedo(cur)
    if (next === cur) return
    const target = next.states[next.at]
    applying.current = target
    setH(next)
    applyRef.current(target)
  }, [])
  const undo = React.useCallback(() => go("undo"), [go])
  const redo = React.useCallback(() => go("redo"), [go])

  /* The keys, while the sheet is open, in any field of it: the form's own steps, typing grouped. */
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const action = historyKey(e)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      go(action)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, go])

  return { canUndo: formCanUndo(h), canRedo: formCanRedo(h), undo, redo }
}
