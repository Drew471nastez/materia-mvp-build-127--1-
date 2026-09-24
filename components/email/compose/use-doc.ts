"use client"

/**
 * The email's blocks, with undo and redo.
 *
 * Typing in one block for a moment is one step, not one per letter: a
 * change marked `typing` to the same block within a second replaces the
 * last step instead of adding one. Anything structural (a new block, a
 * move, a style) is always its own step. A hundred steps are kept.
 */
import * as React from "react"
import type { Block } from "@/lib/email-campaigns/blocks"

const LIMIT = 100
const MERGE_MS = 1000

interface State {
  past: Block[][]
  present: Block[]
  future: Block[][]
  /** Bumped on undo, redo and reset, so editable text knows to take the new words. */
  version: number
}

export interface Doc {
  blocks: Block[]
  version: number
  set: (next: Block[] | ((prev: Block[]) => Block[]), o?: { typing?: string }) => void
  undo: () => void
  redo: () => void
  reset: (blocks: Block[]) => void
  canUndo: boolean
  canRedo: boolean
}

export function useDoc(initial: Block[]): Doc {
  const [state, setState] = React.useState<State>({ past: [], present: initial, future: [], version: 0 })
  const lastTyping = React.useRef<{ id: string; at: number } | null>(null)

  const set = React.useCallback<Doc["set"]>((next, o = {}) => {
    const now = Date.now()
    const continuing = !!o.typing && lastTyping.current?.id === o.typing && now - lastTyping.current.at < MERGE_MS
    lastTyping.current = o.typing ? { id: o.typing, at: now } : null
    setState((s) => {
      const value = typeof next === "function" ? next(s.present) : next
      if (value === s.present) return s
      const merge = continuing && s.past.length > 0
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: value,
        future: [],
        version: s.version,
      }
    })
  }, [])

  const undo = React.useCallback(() => {
    lastTyping.current = null
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], version: s.version + 1 } : s))
  }, [])

  const redo = React.useCallback(() => {
    lastTyping.current = null
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), version: s.version + 1 } : s))
  }, [])

  const reset = React.useCallback((blocks: Block[]) => {
    lastTyping.current = null
    setState((s) => ({ past: [], present: blocks, future: [], version: s.version + 1 }))
  }, [])

  return { blocks: state.present, version: state.version, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}
