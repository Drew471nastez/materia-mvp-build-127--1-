/**
 * The Materia catalogue's input, read from the repository with fs: the
 * build script (scripts/build-materia-catalogue.ts) and the test that keeps
 * the generated file honest (tests/ai-materia-catalogue.test.ts) both read
 * it here, so they read the same thing. Never imported by the app: the app
 * reads the generated module, and the theme's files stay on the server.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "@/lib/themes/marketplace-shared"
import { SAMPLE_SHOPS } from "@/scripts/theme-templates/shops"
import type { CatalogueInput } from "./build"

function filesIn(dir: string, keep: (rel: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(dir)) return out
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = relative(dir, full).split("\\").join("/")
        if (keep(rel)) out[rel] = readFileSync(full, "utf8")
      }
    }
  }
  walk(dir)
  return out
}

export function readCatalogueInput(root = process.cwd()): CatalogueInput {
  const pkg = join(root, "theme-packages", CODE_THEME_PACKAGE)
  const templateFiles: CatalogueInput["templateFiles"] = {}
  for (const t of CODE_TEMPLATES) {
    templateFiles[t.template] = filesIn(join(pkg, "templates", t.template), (rel) => /^templates\/[^/]+\.json$/.test(rel) || /^sections\/[^/]+-group\.json$/.test(rel) || rel === "config/settings_data.json")
  }
  return {
    sections: filesIn(join(pkg, "base", "sections"), (rel) => rel.endsWith(".liquid")),
    blocks: filesIn(join(pkg, "base", "blocks"), (rel) => rel.endsWith(".liquid")),
    codeTemplates: CODE_TEMPLATES,
    marketplaceSharedText: readFileSync(join(root, "lib", "themes", "marketplace-shared.ts"), "utf8"),
    templateFiles,
    shops: SAMPLE_SHOPS as CatalogueInput["shops"],
  }
}
