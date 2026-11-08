/**
 * ===========================================================================
 *  STUB — KEEP THE `design` AGENT'S VERSION OF THIS FILE AT MERGE
 * ===========================================================================
 * The real design-preset library lands on branch claude/w5-design. This stub
 * exists only so the Start with AI generator (lib/website-builder/ai-site/*)
 * compiles and can be tested against the agreed contract before that branch
 * merges:
 *
 *   DesignPreset { id; name; mood: string[]; settings: Partial<ThemeSettingsValues>; sectionRhythm: string[] }
 *   DESIGN_PRESETS, presetById(id)
 *
 * Two presets only. Every value below is a real Theme settings id
 * (lib/website-builder/theme-settings-schema.ts) with a value its control
 * accepts; the generator checks them again before writing.
 */
import type { ThemeSettingsValues } from "./types"

export interface DesignPreset {
  id: string
  name: string
  mood: string[]
  settings: Partial<ThemeSettingsValues>
  sectionRhythm: string[]
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "editorial_warm",
    name: "Editorial warm",
    mood: ["calm", "crafted", "warm", "editorial", "natural"],
    settings: {
      font_heading: "Fraunces",
      font_body: "Inter",
      button_shape: "rounded",
      button_border_radius: 6,
      border_radius: 6,
      image_border_radius: 4,
      page_width: 1240,
      spacing_scale: 1.2,
    } as Partial<ThemeSettingsValues>,
    sectionRhythm: ["hero_split", "text_image", "product_grid", "multirow", "faq_accordion", "cta_simple"],
  },
  {
    id: "modern_bold",
    name: "Modern bold",
    mood: ["confident", "modern", "energetic", "clean", "direct"],
    settings: {
      font_heading: "Space Grotesk",
      font_body: "Inter",
      button_shape: "rounded",
      button_border_radius: 8,
      border_radius: 10,
      image_border_radius: 10,
      page_width: 1320,
      spacing_scale: 1,
    } as Partial<ThemeSettingsValues>,
    sectionRhythm: ["hero_centered", "features_grid", "media_collage", "pricing_table", "faq_columns", "cta_banner"],
  },
]

export function presetById(id: string): DesignPreset | undefined {
  return DESIGN_PRESETS.find((p) => p.id === id)
}
