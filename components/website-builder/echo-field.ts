"use client"

import { startTransition, useCallback, useLayoutEffect, useRef, useState } from "react"

/**
 * ===========================================================================
 *  THE LETTER APPEARS NOW; THE PAGE CATCHES UP
 * ===========================================================================
 * A field in the builder is controlled by the editor, and the editor is one
 * very large component: every keystroke rendered all of it before the
 * letter could appear in the box. On a slow phone that is a box that types
 * a word behind the thumb.
 *
 * So the field keeps its own copy of what is typed and shows it at once, and
 * tells the editor inside a transition, which React may interrupt and redo
 * with the newer text when the next key arrives. The canvas already follows
 * the editor at low priority (see "THE CONTROL ANSWERS THE FINGER" in the
 * editor), so nothing is lost: the preview still catches up.
 *
 * What comes back from the editor is compared with what was sent. An echo of
 * our own text is ignored (it may be a key or two behind); anything else,
 * an undo or a reset, replaces what the field shows.
 */
/*
  Not only text. A switch, a select or a segmented choice in the sidebar is
  one press, and it rendered the whole editor before the switch could move:
  measured on a 44 section page (scripts/check-editor-live-edit.mjs, "toggle
  switch"), 100 to 140ms from the press to the next frame at 1x CPU and
  670ms at 4x. They take the same path now: the control moves in its own
  frame, the section it belongs to draws its echo at once
  (lib/website-builder/live-settings.ts), and the editor follows.
*/
export function useEchoedValue<T = string>(value: T, onChange: (value: T) => void): [T, (value: T) => void] {
  const [local, setLocal] = useState(value)
  const sent = useRef<T[]>([])
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => { onChangeRef.current = onChange })

  useLayoutEffect(() => {
    const i = sent.current.indexOf(value)
    if (i >= 0) {
      sent.current = sent.current.slice(i + 1)
      return
    }
    sent.current = []
    setLocal(value)
  }, [value])

  const set = useCallback((next: T) => {
    setLocal(next)
    sent.current.push(next)
    /* A parent that never answers must not make this grow for ever. */
    if (sent.current.length > 64) sent.current.shift()
    startTransition(() => onChangeRef.current(next))
  }, [])

  return [local, set]
}
