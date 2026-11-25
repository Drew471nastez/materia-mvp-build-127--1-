/**
 * The sample text of every theme and template Storelib ships: the old native
 * themes' presets (lib/website-builder/theme-registry.ts) and every Materia
 * template's own pages (theme-packages/materia/templates/<template>). A
 * creator's website that still says one of these says Storelib's words,
 * not theirs (./content.ts). Read once per server.
 *
 * Node only (reads theme-packages with fs); no "server-only" so the tests
 * and the render check run it under plain node.
 */
import { CODE_PACKAGE_IDS, readTemplateLayer } from "@/lib/themes/template-packages"
import { THEME_REGISTRY, buildThemePreset } from "@/lib/website-builder/theme-registry"
import { sampleTextSet, stringsIn } from "./content"

let held: Set<string> | null = null

export function templateSampleText(): ReadonlySet<string> {
  if (held) return held
  const strings: string[] = []
  for (const def of THEME_REGISTRY) {
    stringsIn(def.sample, strings)
    stringsIn(buildThemePreset(def), strings)
  }
  for (const id of CODE_PACKAGE_IDS) {
    let layer: Map<string, Buffer>
    try {
      layer = readTemplateLayer(id, "overlay")
    } catch {
      continue
    }
    for (const [path, bytes] of layer) {
      if (!path.endsWith(".json")) continue
      try {
        stringsIn(JSON.parse(bytes.toString("utf8")), strings)
      } catch {
        /* A file that is not JSON names no sample text. */
      }
    }
  }
  held = sampleTextSet(strings)
  return held
}
