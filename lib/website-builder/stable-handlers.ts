import { useRef } from "react"

/**
 * ===========================================================================
 *  HANDLERS THAT KEEP THEIR IDENTITY AND ALWAYS CALL THE NEWEST
 * ===========================================================================
 * The editor writes its handlers inline (`onRemove={() => removeSection(id)}`),
 * a new function on every render, so a memoized child given them draws again
 * every time the editor does: the section toolbar and its six tooltips on
 * every key typed and every edit an agent made (scripts/check-editor-perf.mjs,
 * OWNERS=1). These stand in for them: one function per name for the life of
 * the component, each calling the one passed by the latest render. A handler
 * only ever runs from an event, after that render, so it is never one behind.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handlers = Record<string, ((...args: any[]) => unknown) | undefined>

export function useStableHandlers<T extends Handlers>(handlers: T): T {
  const latest = useRef(handlers)
  latest.current = handlers
  const stable = useRef<Partial<T>>({})
  const out = {} as T
  for (const name of Object.keys(handlers) as (keyof T)[]) {
    if (typeof handlers[name] !== "function") continue
    if (!stable.current[name]) {
      stable.current[name] = ((...args: unknown[]) => latest.current[name]?.(...args)) as T[keyof T]
    }
    out[name] = stable.current[name] as T[keyof T]
  }
  return out
}
