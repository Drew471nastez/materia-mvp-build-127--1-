/**
 * ===========================================================================
 *  KEYS THAT CHANGE ONLY WHEN WHAT THEY STAND FOR CHANGES
 * ===========================================================================
 * Measured in the real editor (scripts/check-editor-perf.mjs): a memo that
 * lists the page's whole `sections` array as a dependency is worked out
 * again on every key typed in a heading, because each key is a new array.
 * When the memo only needs one fact about the sections (which types sit in
 * the Overlay group), it depends on that fact as a string instead, and a
 * key typed changes nothing it reads.
 */

import type { SectionInstance } from "./types"

const SEP = "\u0000"

/** The types of the sections in the Overlay group, in page order, as one string (the memo key). */
export function overlayTypesOf(sections: readonly Pick<SectionInstance, "type" | "group">[]): string {
  let out = ""
  for (const s of sections) {
    if (s.group !== "overlay") continue
    out = out ? out + SEP + s.type : s.type
  }
  return out
}

/** The list back from a key made by overlayTypesOf. */
export function splitTypesKey(key: string): string[] {
  return key ? key.split(SEP) : []
}
