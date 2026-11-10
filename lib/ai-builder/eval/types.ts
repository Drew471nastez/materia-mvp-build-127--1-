/**
 * Round R (R4): the evaluation suite's shapes. One EvalSite per scenario per
 * engine (what the engine made, read back from the database it wrote to),
 * the harness's own observations of it (render, browser, editor, publish),
 * and the checks over both. Pure types. Browser safe.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { VisualConcept } from "@/lib/storelib-ai/library/concept"
import type { Defect } from "@/lib/ai-builder/visual-critic/types"
import type { Measurements } from "@/lib/ai-builder/visual-critic/measure"
import type { EvalScenario } from "./scenarios"

export type EvalEngine = "agent" | "native"
export type CheckStatus = "pass" | "fail" | "warn" | "pending" | "skip"

export const CHECKS = [
  { id: "data.valid", label: "Valid Storelib data (validateSite, sanitizeSections)" },
  { id: "components.supported", label: "Only supported components" },
  { id: "render.ok", label: "Renders (template engine, every page)" },
  { id: "browser.desktop", label: "Real Chromium 1440, JS off" },
  { id: "browser.mobile", label: "Real Chromium 390, JS off" },
  { id: "browser.interactive", label: "JS on: hooks run, menu opens at 390" },
  { id: "images.ok", label: "No broken or empty images" },
  { id: "direction.fit", label: "Direction fits the business (O2)" },
  { id: "sections.relevant", label: "Relevant sections (O5 story)" },
  { id: "novelty.distinct", label: "Distinct from the other five (O3)" },
  { id: "tokens.coherent", label: "Coherent tokens" },
  { id: "editor.saved", label: "Edited and saved through the editor routes" },
  { id: "publish.ok", label: "Publish path unaffected" },
] as const

export type CheckId = (typeof CHECKS)[number]["id"]

export interface EvalCheck {
  id: CheckId
  status: CheckStatus
  detail: string
}

/** Picture files of a page, relative to the report folder. */
export interface EvalShot {
  page: string
  /** The whole page (capped), and the first screen. */
  desktop?: string
  mobile?: string
  desktopFold?: string
  mobileFold?: string
  /** The phone menu, opened with JS on. */
  mobileMenu?: string
}

export interface BrowserPage {
  page: string
  desktop: Measurements
  mobile: Measurements
  /** O4's measured defects for both viewports. */
  defects: Defect[]
}

export interface BrowserResult {
  /** Why nothing was drawn, when nothing was (never a pass). */
  unavailable?: string
  pages: BrowserPage[]
  /** JS on: the page's own hooks mounted by the real React runtime (tests/_headless probe). */
  interactive: { errors: string[]; menu: "opened" | "no-menu" | "did-not-open"; menuLinks: number; detail: string } | null
  shots: EvalShot[]
}

export interface EvalSite {
  engine: EvalEngine
  /** Which implementation answered, in words: "agent, template first", "native, classic pipeline". */
  engineLabel: string
  scenario: EvalScenario
  /** The job's end. "pending" when the engine is not there to run (e.g. the native JSON engine before R2 merges). */
  status: "complete" | "partial" | "failed" | "pending"
  why?: string
  installId?: string
  jobId?: string
  /** The draft as the editor reads it. */
  pages: { key: string; sections: SectionInstance[] }[]
  /** The website's own files (path → draft text). */
  sources: Record<string, string>
  settings: Record<string, unknown>
  concept?: VisualConcept | null
  template?: string | null
  capabilities: RuntimeCapabilities | null
  mode: "blank" | "theme"
  costUsd?: number
  modelCalls?: number
  notes: string[]
  /** The harness's own observations. */
  render?: { page: string; ok: boolean; errors: string[] }[]
  browser?: BrowserResult | null
  editor?: { ok: boolean; detail: string }
  publish?: { ok: boolean; detail: string }
  /** Before and after a refinement, when one ran (the template as applied → the adapted site; a native review's patches). */
  refinement?: { label: string; before: EvalShot | null; after: EvalShot | null; detail: string } | null
}

export interface EvalResult {
  site: EvalSite
  checks: EvalCheck[]
}
