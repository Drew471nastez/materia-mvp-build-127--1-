// ============================================================
// Website Builder: Virtual theme file tree
// Defines the canonical file structure of a Storelib theme
// ============================================================
import type { ThemeFileNode } from "./types"

export function buildThemeFileTree(customizedPaths: string[] = []): ThemeFileNode[] {
  const isCustomized = (path: string) => customizedPaths.includes(path)

  const file = (path: string, lang?: string): ThemeFileNode => ({
    path,
    name: path.split("/").pop()!,
    type: "file",
    isCustomized: isCustomized(path),
    language: lang ?? detectLanguage(path),
  })

  const folder = (name: string, children: ThemeFileNode[]): ThemeFileNode => ({
    path: name,
    name,
    type: "folder",
    children,
  })

  return [
    file("theme.json", "json"),
    folder("config", [
      file("config/settings_schema.json", "json"),
      file("config/settings_data.json", "json"),
    ]),
    folder("templates", [
      file("templates/home.json", "json"),
      file("templates/product.json", "json"),
      file("templates/about.json", "json"),
      file("templates/contact.json", "json"),
    ]),
    folder("sections", [
      file("sections/header.json", "json"),
      file("sections/footer.json", "json"),
      file("sections/hero.json", "json"),
      file("sections/rich_text.json", "json"),
      file("sections/image_banner.json", "json"),
      file("sections/product_list.json", "json"),
      file("sections/feature_grid.json", "json"),
      file("sections/testimonials.json", "json"),
      file("sections/stats.json", "json"),
      file("sections/faq.json", "json"),
      file("sections/cta.json", "json"),
      file("sections/logo_bar.json", "json"),
      file("sections/gallery.json", "json"),
      file("sections/pricing.json", "json"),
    ]),
    folder("assets", [
      file("assets/styles.css", "css"),
      file("assets/theme.js", "javascript"),
    ]),
    folder("snippets", [
      file("snippets/button.json", "json"),
      file("snippets/product-card.json", "json"),
    ]),
  ]
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop() ?? ""
  const map: Record<string, string> = {
    json: "json",
    css: "css",
    js: "javascript",
    ts: "typescript",
    tsx: "typescriptreact",
    html: "html",
    md: "markdown",
  }
  return map[ext] ?? "plaintext"
}

// ── Default content for each file ────────────────────────────
export function getDefaultFileContent(path: string, themeName: string = "Storelib Default"): string {
  const defaults: Record<string, () => string> = {
    "theme.json": () => JSON.stringify({
      name: themeName,
      version: "1.0.0",
      author: "Storelib",
      description: "A Storelib theme",
      engine: "storelib-1",
      supports: {
        pages: ["home", "product", "about", "contact"],
        sections: ["hero", "rich_text", "image_banner", "product_list", "feature_grid",
          "testimonials", "stats", "faq", "cta", "logo_bar", "gallery", "pricing", "header", "footer"],
      },
    }, null, 2),

    "config/settings_schema.json": () => JSON.stringify([
      { id: "colors", label: "Colors", settings: [
        { id: "primary_color", type: "color", label: "Primary color", default: "#6366f1" },
      ]},
    ], null, 2),

    "config/settings_data.json": () => JSON.stringify({
      current: { primary_color: "#6366f1" },
    }, null, 2),

    "templates/home.json": () => JSON.stringify({
      layout: "default",
      sections: { order: ["header", "hero", "feature_grid", "product_list", "cta", "footer"] },
    }, null, 2),

    "templates/product.json": () => JSON.stringify({
      layout: "default",
      sections: { order: ["header", "footer"] },
    }, null, 2),

    "templates/about.json": () => JSON.stringify({
      layout: "default",
      sections: { order: ["header", "rich_text", "footer"] },
    }, null, 2),

    "templates/contact.json": () => JSON.stringify({
      layout: "default",
      sections: { order: ["header", "rich_text", "footer"] },
    }, null, 2),

    "assets/styles.css": () => `/* Theme custom styles */
:root {
  --theme-primary: #6366f1;
  --theme-secondary: #8b5cf6;
}

.section-wrapper {
  width: 100%;
}
`,
    "assets/theme.js": () => `// Theme JavaScript (runs in store preview)
// Keep this minimal — heavy logic should be in sections
console.log('Storelib theme loaded');
`,
  }

  if (defaults[path]) return defaults[path]()

  // Sections default to empty schema
  if (path.startsWith("sections/") && path.endsWith(".json")) {
    const sectionType = path.replace("sections/", "").replace(".json", "")
    return JSON.stringify({
      type: sectionType,
      name: sectionType.replace(/_/g, " "),
      schema: { fields: [] },
    }, null, 2)
  }

  if (path.startsWith("snippets/") && path.endsWith(".json")) {
    return JSON.stringify({ type: "snippet", fields: [] }, null, 2)
  }

  return "// No default content"
}
