/**
 * The native engine's JSON (round R, R2): a whole website as Storelib's own
 * section instances, before it is placed. Plain data, kept on the job's plan
 * (job.plan.native) so a resumed job places exactly what was generated.
 */
import type { ImageBrief } from "../../agent/site-plan"
import type { NativeRegistry } from "./registry"
import type { Capabilities } from "../capabilities"

export interface NativeTheme {
  /** A design preset id: the tested base (schemes, text styles) the tokens adjust. */
  preset: string
  /** Hex colours under the palette keys the registry lists; empty when the preset's palette is kept. */
  palette: Record<string, string>
  fonts: { heading: string; body: string }
  /** Theme settings over the preset (button shape, corners, spacing...), checked. */
  settings: Record<string, unknown>
}

export interface NativeBlock {
  id: string
  type: string
  settings: Record<string, unknown>
}

export type NativeScheme = "light" | "dark" | "alt"

export interface NativeSection {
  id: string
  type: string
  purpose: string
  scheme: NativeScheme
  settings: Record<string, unknown>
  blocks: NativeBlock[]
  /** Picture slots briefed for the photo step: a setting id, or "block:<type>". */
  images: ImageBrief[]
}

export interface NativePage {
  key: string
  title: string
  purpose: string
  sections: NativeSection[]
}

export interface NativeSite {
  /** The prompt and registry versions it was generated with. */
  version: string
  brand: { name: string; tagline: string }
  voice: string
  audience: string
  conversion: string
  imagery: string
  theme: NativeTheme
  pages: NativePage[]
}

/** A problem the model can fix: where, and exactly what. Sent back verbatim in a repair turn. */
export interface NativeIssue {
  path: string
  message: string
}

/** Something the output asked for that Storelib does not have, and what became of it. */
export interface NativeMapping {
  path: string
  from: string
  /** What it became, or null when it was left out. */
  to: string | null
  why: string
}

export interface NativeImage {
  url: string
  alt: string
}

export interface NativeForm {
  /** The address native_form's form_url takes. */
  url: string
  name: string
  id?: string
}

export interface NativeLimits {
  maxPages: number
  homeMinSections: number
  homeMaxSections: number
  pageMaxSections: number
  maxBlocks: number
  /** Characters of model output read at most. */
  maxOutputChars: number
}

export const NATIVE_LIMITS: NativeLimits = {
  maxPages: 6,
  homeMinSections: 6,
  homeMaxSections: 12,
  pageMaxSections: 8,
  maxBlocks: 12,
  maxOutputChars: 240_000,
}

/** Everything validation needs: the registry and THIS creator's real things. */
export interface NativeContext {
  registry: NativeRegistry
  caps: Capabilities
  /** The creator's own pictures (P1 generated or uploaded) an image setting may take. */
  images: NativeImage[]
  forms: NativeForm[]
  /** The creator's words: numbers it states are real. */
  prompt: string
  /** Makes ids: the job's id, so the same output gets the same ids. */
  seed: string
  limits?: Partial<NativeLimits>
}

export interface NativeValidation {
  /** The site with every invalid value taken out (always safe to place). */
  site: NativeSite
  /** What the model should fix. Empty: valid. */
  issues: NativeIssue[]
  mapped: NativeMapping[]
  /** Values the validator changed itself (clamped, trimmed, cleaned). */
  notes: string[]
}
