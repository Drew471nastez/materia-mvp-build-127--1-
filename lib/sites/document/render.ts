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

/* ==========================================================================
   The content sections. Every rule below belongs to a section in
   ./sections-content, and every one of them puts its padding on the SECTION
   rather than a margin on a first child — see the note above .section.
   ========================================================================== */

.section--tight { padding: 48px 0; }
.container--narrow { max-width: 760px; }

.banner { background: var(--surface); border-bottom: 1px solid var(--border); font-size: 0.875rem; }
.banner__inner { display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 10px; padding-bottom: 10px; flex-wrap: wrap; }
.banner__action { color: inherit; font-weight: 500; }

.services { list-style: none; margin: 40px 0 0; padding: 0; }
.services__row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--border); }
.services__row:last-child { border-bottom: 0; }
.services__main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.services__name { font-weight: 500; }
.services__desc { color: var(--muted); font-size: 0.9375rem; }
.services__meta { display: flex; align-items: baseline; gap: 16px; white-space: nowrap; }
.services__duration { color: var(--muted); font-size: 0.875rem; }
.services__price { font-weight: 600; }

.pricing__tier { display: flex; flex-direction: column; gap: 10px; }
.pricing__tier--featured { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.pricing__name { font-weight: 600; font-size: 0.9375rem; }
.pricing__price { font-family: var(--font-heading); font-size: 2rem; letter-spacing: -0.02em; }
.pricing__period { color: var(--muted); font-size: 0.9375rem; font-weight: 400; margin-left: 4px; }
.pricing__features { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.9375rem; color: var(--muted); }
.pricing__features li { padding-left: 20px; position: relative; }
.pricing__features li::before { content: "✓"; position: absolute; left: 0; color: var(--primary); }
.pricing__action { margin-top: auto; }

.faq { margin-top: 36px; border-top: 1px solid var(--border); }
.faq__item { border-bottom: 1px solid var(--border); }
.faq__question { cursor: pointer; padding: 18px 0; font-weight: 500; list-style: none; }
.faq__question::-webkit-details-marker { display: none; }
.faq__question::after { content: "+"; float: right; color: var(--muted); font-weight: 400; }
.faq__item[open] .faq__question::after { content: "−"; }
.faq__answer { color: var(--muted); padding-bottom: 20px; max-width: 68ch; }

.gallery__item { margin: 0; }
.gallery__item img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius); display: block; }
.gallery__item figcaption { color: var(--muted); font-size: 0.875rem; margin-top: 8px; }

.team__person { display: flex; flex-direction: column; gap: 4px; }
.team__photo { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: var(--radius); display: block; margin-bottom: 12px; }
.team__name { font-weight: 600; }
.team__role { color: var(--muted); font-size: 0.875rem; }

.stats { display: grid; gap: 24px; }
.stats__item { display: flex; flex-direction: column; gap: 4px; }
.stats__value { font-family: var(--font-heading); font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -0.03em; }
.stats__label { color: var(--muted); font-size: 0.875rem; }

.steps { list-style: none; margin: 40px 0 0; padding: 0; display: grid; gap: 28px; }
.steps__item { display: flex; gap: 18px; align-items: flex-start; }
.steps__number { flex: none; width: 34px; height: 34px; border-radius: 999px; background: var(--primary); color: var(--primary-text); display: inline-flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 600; }
.steps__title { font-weight: 500; }

.hours { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; align-items: start; }
.hours__address { white-space: pre-line; margin-bottom: 16px; }
.hours__contact { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; font-size: 0.9375rem; }
.hours__contact a { color: var(--muted); text-decoration: none; }
.hours__contact a:hover { color: var(--text); }
.hours__table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
.hours__table th { text-align: left; font-weight: 400; color: var(--muted); padding: 10px 0; }
.hours__table td { text-align: right; padding: 10px 0; }
.hours__table tr { border-bottom: 1px solid var(--border); }
.hours__table tr:last-child { border-bottom: 0; }

.form { display: flex; flex-direction: column; gap: 18px; margin-top: 36px; }
.form__field { display: flex; flex-direction: column; gap: 6px; }
.form__field span { font-size: 0.875rem; color: var(--muted); }
.form__field input, .form__field textarea {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  width: 100%;
  resize: vertical;
}
.form__field input:focus, .form__field textarea:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
.form button { align-self: flex-start; }
.form__note { color: var(--muted); font-size: 0.8125rem; }

.prose { display: flex; flex-direction: column; gap: 18px; }
.prose p { color: var(--muted); }
.prose--center { text-align: center; align-items: center; }

.logos__heading { text-align: center; color: var(--muted); font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 24px; }
.logos { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 40px; }
.logos img { height: 28px; width: auto; opacity: 0.65; }
.logos__word { color: var(--muted); font-weight: 600; letter-spacing: -0.01em; }

.cards__card { display: flex; flex-direction: column; gap: 6px; }
.cards__card--link { text-decoration: none; color: inherit; transition: border-color 0.15s ease; }
.cards__card--link:hover { border-color: var(--primary); }
.cards__image { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: calc(var(--radius) - 4px); display: block; margin-bottom: 10px; }
.cards__meta { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }

@media (max-width: 820px) {
  .section { padding: 60px 0; }
  .section--tight { padding: 36px 0; }
  .hours { grid-template-columns: 1fr; gap: 32px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .services__row { flex-direction: column; gap: 6px; }
  .services__meta { gap: 12px; }
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
