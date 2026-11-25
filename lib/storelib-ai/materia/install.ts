/**
 * Whether a website is built on Materia: the Materia section types its own
 * files define (an imported Materia template stores the theme's sections as
 * sections/<type>.storelib in compat form). Shared by the website agent
 * (lib/ai-builder/agent/materia.ts) and the editor's Ask AI
 * (lib/website-builder/agent/materia-context.ts). Pure.
 */
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { isMateriaType } from "./catalogue"

/** An install with at least this many of Materia's own section files is a Materia site. */
export const MATERIA_INSTALL_MIN = 12

export function materiaInstallTypes(files: readonly { path: string; text: string }[] | Record<string, string> | undefined): string[] {
  if (!files) return []
  const list = Array.isArray(files) ? files : Object.entries(files).map(([path, text]) => ({ path, text }))
  const out: string[] = []
  for (const f of list) {
    const m = /^sections\/([A-Za-z0-9_-]+)\.storelib$/.exec(f.path)
    if (m && isMateriaType(m[1]) && isCompatSource(f.text)) out.push(m[1])
  }
  return out
}

export function isMateriaInstall(files: Parameters<typeof materiaInstallTypes>[0]): boolean {
  return materiaInstallTypes(files).length >= MATERIA_INSTALL_MIN
}
