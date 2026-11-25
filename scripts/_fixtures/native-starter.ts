/**
 * The native registry preset rows a starter website was made of before round
 * 63 (lib/website-builder/starter-website.ts now imports the Materia Storelib
 * Default instead). Kept here only as fixture data for the speed and visitor
 * probes that seed a store with the native theme; the app no longer uses it.
 */
import { buildThemePreset, getThemeDefinition, STORELIB_DEFAULT_ID } from "@/lib/website-builder/theme-registry"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export interface StarterRows {
  install: { creator_id: string; theme_id: string; name: string; status: "draft"; is_custom: false; sort_order: number }
  settings: ThemeSettingsValues
  pages: { page_key: "home" | "product"; sections: SectionInstance[] }[]
}

export function starterRows(creatorId: string): StarterRows | null {
  const def = getThemeDefinition(STORELIB_DEFAULT_ID)
  if (!def) return null
  const preset = buildThemePreset(def)
  return {
    install: { creator_id: creatorId, theme_id: def.id, name: def.name, status: "draft", is_custom: false, sort_order: 0 },
    settings: preset.settings,
    pages: [
      { page_key: "home", sections: preset.pages.home },
      { page_key: "product", sections: preset.pages.product },
    ],
  }
}
