/**
 * P2b's six templates (round P). P2a owns the main registry and imports
 * this list; nothing else here so the two lanes never edit one file.
 */
import type { SiteTemplate } from "./types-b"
import { saasOrbit } from "./saas-orbit/template"
import { estateCinema } from "./estate-cinema/template"
import { studioKinetic } from "./studio-kinetic/template"
import { courseCoach } from "./course-coach/template"
import { photoTrail } from "./photo-trail/template"

export const TEMPLATES_B: readonly SiteTemplate[] = [saasOrbit, estateCinema, studioKinetic, courseCoach, photoTrail]

export function templateBById(id: string): SiteTemplate | undefined {
  return TEMPLATES_B.find((t) => t.id === id)
}
