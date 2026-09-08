/**
 * The document, as a project.
 *
 * ===========================================================================
 *  THIS FUNCTION IS THE WHOLE SYNCHRONISATION STORY
 * ===========================================================================
 * A colour picker writes a prop. The agent writes a prop. Both then arrive
 * here, and here is deterministic — the same document produces the same files,
 * byte for byte. There is no path by which the editor and the agent can hold
 * different opinions about the site, because neither of them holds an opinion:
 * they hold props, and the site is a function of the props.
 *
 * That is also why this is a pure function with no clock, no randomness and no
 * database in it. A render that varied would make every save a diff and every
 * publish a new deployment.
 *
 * ===========================================================================
 *  WHAT IT OWNS AND WHAT IT MUST NOT TOUCH
 * ===========================================================================
 * Owned, and overwritten on every render: `src/App.tsx`, `src/styles.css`, the
 * scaffold, and `src/sections/*` for the sections in use.
 *
 * Never touched: anything under `src/custom/`. That is where a section the
 * library does not have goes, and keeping it outside the generated set is what
 * stops one unusual request from taking the editable parts of a site with it.
 */

import { sectionSpec } from "./sections"
import type { Page, PropValue, SiteDocument, Theme } from "./schema"
import type { ProjectFiles } from "../types"

/** Files this renderer owns. Anything else in the project survives a render. */
export const GENERATED = ["src/App.tsx", "src/styles.css", "src/main.tsx", "index.html"]

/** Where code the library cannot express lives, and is never regenerated. */
export const CUSTOM_DIR = "src/custom/"

export function isGenerated(path: string): boolean {
  return GENERATED.includes(path) || path.startsWith("src/sections/")
}

/**
 * A JSX attribute value.
 *
 * A plain quoted attribute whenever the string is ordinary, because that is
 * what somebody reading the file expects to see, and a braced expression the
 * moment it contains anything a quoted attribute cannot carry — a quote, a
 * newline, a brace. JSON.stringify escapes for JavaScript, and JavaScript
 * escapes are NOT valid inside a JSX string attribute, so the two cases have
 * to be told apart rather than one used for both.
 */
function attribute(name: string, value: PropValue): string | null {
  if (value === "" || value === undefined || value === null) return null
  if (value === false) return null
  if (value === true) return name

  if (typeof value === "string") {
    return /^[^"'{}\\\n<>]+$/.test(value) ? `${name}="${value}"` : `${name}={${JSON.stringify(value)}}`
  }
  return `${name}={${JSON.stringify(value)}}`
}

function renderSection(instance: { type: string; props: Record<string, PropValue> }, indent: string): string | null {
  const spec = sectionSpec(instance.type)
  if (!spec) return null

  const attributes: string[] = []
  for (const [name, prop] of Object.entries(spec.props)) {
    const value = instance.props[name] ?? prop.fallback
    // An empty list is the fallback, and a component's own default covers it.
    if (Array.isArray(value) && value.length === 0) continue
    const rendered = attribute(name, value)
    if (rendered) attributes.push(rendered)
  }

  if (attributes.length === 0) return `${indent}<${spec.component} />`
  return `${indent}<${spec.component}\n${attributes.map((a) => `${indent}  ${a}`).join("\n")}\n${indent}/>`
}

function renderPage(page: Page, indent: string): string {
  const body = page.sections
    .map((section) => renderSection(section, `${indent}    `))
    .filter(Boolean)
    .join("\n")
  return body || `${indent}    <div />`
}

function stylesheet(theme: Theme): string {
  return `:root {
  --bg: ${theme.background};
  --surface: ${theme.surface};
  --text: ${theme.text};
  --muted: ${theme.muted};
  --primary: ${theme.primary};
  --primary-text: ${theme.primaryText};
  --border: ${theme.border};
  --radius: ${theme.radius}px;
  --container: ${theme.container}px;
  --font-heading: ${theme.fontHeading};
  --font-body: ${theme.fontBody};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { font-family: var(--font-heading); line-height: 1.15; margin: 0; }
p { margin: 0; }

.container {
  width: 100%;
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 24px;
}

/*
 * Padding on the SECTION, never a margin on its first child. A child's top
 * margin escapes its parent and leaves a strip of page showing above a section
 * that has a background — the most common way a generated site looks broken.
 */
.section { padding: 88px 0; }

.section__heading { font-size: clamp(1.6rem, 3.2vw, 2.25rem); letter-spacing: -0.02em; }
.section__intro { color: var(--muted); margin-top: 12px; max-width: 62ch; }
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 14px;
}

.nav { border-bottom: 1px solid var(--border); background: var(--bg); }
.nav--sticky { position: sticky; top: 0; z-index: 20; }
.nav__inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; height: 64px; }
.nav__brand { font-weight: 600; text-decoration: none; color: inherit; letter-spacing: -0.01em; }
.nav__links { display: flex; gap: 24px; }
.nav__links a { color: var(--muted); text-decoration: none; font-size: 0.9rem; }
.nav__links a:hover { color: var(--text); }

.hero--split { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; }
.hero--centered { text-align: center; max-width: 760px; }
.hero--centered .section__intro, .hero--centered .hero__sub { margin-left: auto; margin-right: auto; }
.hero__heading { font-size: clamp(2.1rem, 5.2vw, 3.4rem); letter-spacing: -0.03em; }
.hero__sub { color: var(--muted); font-size: 1.075rem; margin-top: 18px; max-width: 56ch; }
.hero__actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.hero--centered .hero__actions { justify-content: center; }
.hero__media img { width: 100%; height: auto; border-radius: var(--radius); display: block; }

.grid { display: grid; gap: 20px; margin-top: 40px; }
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; background: var(--surface); }
.card__title { font-size: 1.0625rem; }
.card__body { color: var(--muted); margin-top: 8px; font-size: 0.9375rem; }
.quote blockquote { margin: 0; font-size: 1.0625rem; }
.quote figcaption { margin-top: 16px; font-size: 0.875rem; display: flex; flex-direction: column; gap: 2px; }
.quote figcaption span { color: var(--muted); }

.cta { display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 22px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--primary);
  color: var(--primary-text);
  font: inherit;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.button--ghost { background: transparent; color: var(--text); border-color: var(--border); }
.button--sm { padding: 8px 16px; font-size: 0.875rem; }

.footer { border-top: 1px solid var(--border); padding: 40px 0; }
.footer__inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.footer__brand { font-size: 0.875rem; color: var(--muted); }
.footer__note { margin-left: 10px; }
.footer__links { display: flex; gap: 20px; }
.footer__links a { color: var(--muted); text-decoration: none; font-size: 0.875rem; }

@media (max-width: 820px) {
  .section { padding: 60px 0; }
  .hero--split { grid-template-columns: 1fr; gap: 32px; }
  .grid { grid-template-columns: 1fr !important; }
  .nav__links { display: none; }
  .cta { flex-direction: column; align-items: flex-start; }
}
`
}

function appSource(doc: SiteDocument): string {
  const used = new Set<string>()
  for (const page of doc.pages) {
    for (const section of page.sections) {
      const spec = sectionSpec(section.type)
      if (spec) used.add(spec.component)
    }
  }

  const imports = [...used]
    .sort()
    .map((component) => `import ${component} from "./sections/${component}"`)
    .join("\n")

  const home = doc.pages.find((page) => page.path === "/") ?? doc.pages[0]
  const others = doc.pages.filter((page) => page !== home)

  /**
   * A hash router, because a published site is static files and a path route
   * would 404 on a hard refresh. It is also what the editor's preview can
   * follow — a hash change is a same-document navigation there.
   */
  const pageFns = doc.pages
    .map(
      (page) =>
        `function Page_${page.id.replace(/[^A-Za-z0-9_]/g, "_")}() {\n  return (\n    <>\n${renderPage(page, "  ")}\n    </>\n  )\n}`,
    )
    .join("\n\n")

  const routes = others
    .map(
      (page) =>
        `    if (route === ${JSON.stringify(page.path)}) return <Page_${page.id.replace(/[^A-Za-z0-9_]/g, "_")} />`,
    )
    .join("\n")

  return `${imports ? `${imports}\n\n` : ""}${
    others.length > 0 ? `import { useEffect, useState } from "react"\n\n` : ""
  }${pageFns}

export default function App() {${
    others.length === 0
      ? `\n  return <Page_${(home?.id ?? "home").replace(/[^A-Za-z0-9_]/g, "_")} />\n}`
      : `
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/")

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "/")
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const page = (() => {
${routes}
    return <Page_${(home?.id ?? "home").replace(/[^A-Za-z0-9_]/g, "_")} />
  })()

  return page
}`
  }
`
}

/**
 * The document as a whole project.
 *
 * `existing` is merged over rather than replaced: files the renderer does not
 * own — a custom section, a helper the agent wrote, an asset manifest — are the
 * part of the project this must never take with it.
 */
export function renderDocument(doc: SiteDocument, existing: ProjectFiles = {}): ProjectFiles {
  const files: ProjectFiles = { ...existing }

  const home = doc.pages.find((page) => page.path === "/") ?? doc.pages[0]

  files["index.html"] = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${(home?.title || home?.name || "Site").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

  files["src/main.tsx"] = `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`

  files["src/styles.css"] = stylesheet(doc.theme)
  files["src/App.tsx"] = appSource(doc)

  for (const page of doc.pages) {
    for (const section of page.sections) {
      const spec = sectionSpec(section.type)
      if (spec) files[spec.file.path] = spec.file.source
    }
  }

  return files
}
