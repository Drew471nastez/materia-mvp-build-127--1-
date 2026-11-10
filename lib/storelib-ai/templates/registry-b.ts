/**
 * P2b's six templates (round P). P2a's registry.ts (P2B list) imports
 * this list, so chooseTemplate, applyTemplate and the p2a test cover them.
 */
import type { SiteTemplate } from "./types"
import { saasOrbit } from "./saas-orbit/template"
import { estateCinema } from "./estate-cinema/template"
import { studioKinetic } from "./studio-kinetic/template"
import { courseCoach } from "./course-coach/template"
import { photoTrail } from "./photo-trail/template"
import { salonChair } from "./salon-chair/template"

export const TEMPLATES_B: readonly SiteTemplate[] = [saasOrbit, estateCinema, studioKinetic, courseCoach, photoTrail, salonChair]

export function templateBById(id: string): SiteTemplate | undefined {
  return TEMPLATES_B.find((t) => t.id === id)
}
