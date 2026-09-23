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
export function useEchoedValue(value: string, onChange: (value: string) => void): [string, (value: string) => void] {
  const [local, setLocal] = useState(value)
  const sent = useRef<string[]>([])
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

  const set = useCallback((next: string) => {
    setLocal(next)
    sent.current.push(next)
    /* A parent that never answers must not make this grow for ever. */
    if (sent.current.length > 64) sent.current.shift()
    startTransition(() => onChangeRef.current(next))
  }, [])

  return [local, set]
}
