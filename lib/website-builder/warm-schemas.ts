/**
 * ===========================================================================
 *  EVERY SECTION'S SCHEMA, READ A FEW AT A TIME (round 68)
 * ===========================================================================
 * The owner: "sometimes it tells me that Storelib takes too much to respond".
 *
 * The editor's library, kinds and paste checks come from every section
 * source the install has (customSectionSchemas): each file's schema read and
 * checked. On a Materia website that is 330 files, and it was read in one go
 * in the render that took them: 2.7 s of one 7.4 s task at a quarter speed
 * (scripts/check-editor-open-r68.mjs PROFILE=1), with the page unable to
 * answer a click for all of it.
 *
 * Now, when many files are new to this browser, they are read a few at a
 * time between frames (nextTask), and the editor keeps the schemas it had
 * until they are all in. A handful (a save, a push) is still read at once, in
 * the render that brings them, as before: what is placed right after a
 * change finds its schema.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { customSectionSchemas, schemaFromStorelib, schemaHeld } from "@/lib/website-builder/storelib-schemas"
import { kindLookup } from "@/lib/storelib-theme/section-groups"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import type { SectionSchema } from "@/lib/website-builder/types"

/** Up to this many files not yet read are read in the render that brings them. */
export const READ_AT_ONCE = 24
/** A stretch of reading between two frames, at most. */
const SLICE_MS = 12

const SECTION_FILE = /^sections\/([a-z0-9_-]+)\.storelib$/

/** The section files of these sources whose schema has not been read yet. */
export function unreadSections(sources: Record<string, string>): [string, string][] {
  const out: [string, string][] = []
  for (const [path, source] of Object.entries(sources)) {
    if (!SECTION_FILE.test(path) || path in DEFAULT_THEME_SOURCES) continue
    if (!schemaHeld(source)) out.push([path, source])
  }
  return out
}

/** The next task: what input is waiting runs first. */
function yieldToInput(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Reads each file's schema (and its kind, which the library asks next), a slice at a time; false when told to stop. */
export async function readInSlices(files: [string, string][], stop: () => boolean, now: () => number = () => performance.now()): Promise<boolean> {
  const kinds = kindLookup(Object.fromEntries(files))
  let start = now()
  for (const [path, source] of files) {
    if (stop()) return false
    schemaFromStorelib(source, path)
    kinds(SECTION_FILE.exec(path)![1])
    if (now() - start > SLICE_MS) {
      await yieldToInput()
      start = now()
    }
  }
  return !stop()
}

/**
 * customSectionSchemas(sources), with a theme's worth of new files read a few at a time. `warm` is false while they
 * are being read; the schemas are the ones from before until then ({} on the first open).
 */
export function useCustomSchemas(sources: Record<string, string>): { schemas: Record<string, SectionSchema>; warm: boolean } {
  const unread = useMemo(() => unreadSections(sources), [sources])
  const [readFor, setReadFor] = useState<Record<string, string> | null>(null)
  const last = useRef<Record<string, SectionSchema>>({})
  const atOnce = unread.length <= READ_AT_ONCE || readFor === sources
  const schemas = useMemo(() => (atOnce ? customSectionSchemas(sources) : last.current), [atOnce, sources])
  last.current = schemas
  useEffect(() => {
    if (atOnce) return
    let stopped = false
    void readInSlices(unread, () => stopped).then((done) => {
      if (done) setReadFor(sources)
    })
    return () => {
      stopped = true
    }
  }, [atOnce, unread, sources])
  return { schemas, warm: atOnce }
}
