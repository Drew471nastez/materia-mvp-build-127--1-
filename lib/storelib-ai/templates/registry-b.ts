/**
 * P2b's six templates (round P). P2a owns the main registry and imports
 * this list; nothing else here so the two lanes never edit one file.
 */
import type { SiteTemplate } from "./types-b"
import { saasOrbit } from "./saas-orbit/template"

export const TEMPLATES_B: readonly SiteTemplate[] = [saasOrbit]

export function templateBById(id: string): SiteTemplate | undefined {
  return TEMPLATES_B.find((t) => t.id === id)
}
