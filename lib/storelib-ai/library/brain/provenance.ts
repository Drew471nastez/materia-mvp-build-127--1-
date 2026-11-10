/**
 * Provenance helpers for the brain's records. Loupe (MIT) was read at the
 * commit below on 2026-11-10; records that learned an idea from it name the
 * file. No text is copied: every record is written in Storelib's words.
 * The licence text is in ./NOTICE.md.
 */
import type { BrainProvenance } from "./types"

export const LOUPE = {
  project: "winchxyz/loupe",
  url: "https://github.com/winchxyz/loupe",
  licence: "MIT",
  commit: "1e9c3d78ffab46af10102d8c9e65aaa227f7876c",
} as const

const ADDED = "2026-11-10"

/** Storelib's own record. */
export const own = (): BrainProvenance => ({ origin: "storelib", inspiredBy: null, addedAt: ADDED })

/** An idea learned from a Loupe file, restated. */
export const loupe = (path: string): BrainProvenance => ({ origin: "adapted", inspiredBy: { ...LOUPE, path }, addedAt: ADDED })
