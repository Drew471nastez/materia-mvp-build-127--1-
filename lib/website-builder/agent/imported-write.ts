/**
 * ===========================================================================
 *  A NEW SECTION FOR AN IMPORTED THEME IS A STORELIB SECTION
 * ===========================================================================
 * The production log: a request for a new section on a theme imported from
 * Shopify called create_section, was told "A new section of an imported
 * theme is not written here. Change one of its own sections instead.", and
 * the run gave up and asked the creator.
 *
 * The engine has drawn Storelib's own sections inside an imported theme since
 * round AH (lib/storelib-theme/compat/theme.ts, renderNative): a native
 * .storelib file (`<template>`, `<style>`, `<schema>`) is compiled by
 * Storelib's compiler and drawn by its renderer, wrapped like one of the
 * theme's sections, in the theme's fonts, width and colour schemes. The
 * section writer already writes those. So the page assistant writes them
 * too, on the same terms:
 *
 *   NATIVE, not Liquid. A new file in the theme's own template language would
 *   have no Shopify schema behind it to make its panel from.
 *   NO <script>. A section's script runs in Storelib's sandbox host, which an
 *   imported theme's page does not run, so it would silently do nothing.
 *   Motion goes in CSS.
 *   A NEW TYPE. One the theme has is changed in place, never replaced.
 *
 * Pure: the route stages what this accepts (./code-journal).
 */

import { compileSection } from "@/lib/storelib-theme"
import { isCompatSource, isNativeSectionSource } from "@/lib/storelib-theme/compat/theme"
import { SECTION_TYPE } from "./selected-section"

/** The website runs a theme imported from Shopify. */
export function isImportedTheme(sources: Record<string, string> | undefined): boolean {
  return isCompatSource(sources?.["layout/theme.storelib"])
}

/** A `<script>` block at the start of a line: the section's own script, which an imported theme's page never runs. */
const SCRIPT_BLOCK = /^\s*<script[\s>]/m

/** What is wrong with a new file for an imported theme before it is even compiled, or null. */
export function importedSourceProblem(source: string): string | null {
  if (isCompatSource(source) || !isNativeSectionSource(source)) {
    return `A new section of this imported theme is written as a Storelib section: <template> (no compat attribute), then <style>, then <schema> with "name", "settings" and "presets". Storelib draws it inside the theme in the theme's own fonts and colour schemes. Send create_section again with that file.`
  }
  if (SCRIPT_BLOCK.test(source)) {
    return "This website runs an imported theme, where a section's <script> does not run. Leave the <script> block out, keep any motion in CSS (transitions, keyframes, :hover, animation-timeline), and send the whole file again."
  }
  return null
}

export function importedSectionWrite(
  sectionType: string,
  source: string,
  sources: Record<string, string>,
): { ok: true } | { ok: false; error: string } {
  if (!SECTION_TYPE.test(sectionType) || sectionType === "header" || sectionType === "footer") return { ok: false, error: "That is not a section type." }
  const path = `sections/${sectionType}.storelib`
  if (sources[path] !== undefined) return { ok: false, error: `${path} already exists in this theme. Change it in place with edit_section_code.` }
  const problem = importedSourceProblem(source)
  if (problem) return { ok: false, error: problem }
  const compiled = compileSection(source, { file: path, expectType: sectionType })
  if (compiled.ok === false) return { ok: false, error: `${path} did not compile: ${(compiled as { errors: { line?: number; message: string }[] }).errors.slice(0, 3).map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("; ")}` }
  return { ok: true }
}
