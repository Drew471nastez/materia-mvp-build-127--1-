/**
 * The starter project. Real files, laid out as a Vite project.
 *
 * WHY VITE'S SHAPE WHEN THE EDITOR DOES NOT RUN VITE. The editor bundles with
 * esbuild-wasm in a worker — no install, no container, no cost per keystroke
 * (see docs/storelib-sites.md §2). But the project on disk is a genuine Vite
 * project, with an index.html, a real package.json and a vite.config.ts, so
 * that Export and, later, GitHub sync hand a developer something they can
 * `npm install && npm run dev` without a translation step. A project format
 * that only Storelib can build is a lock-in this product does not need.
 *
 * THE DEPENDENCY SET IS FIXED, and that is the trade the in-browser bundler
 * asks for. React, react-dom and @storelib/site are pre-bundled and served as
 * ESM; the starter imports nothing else. Adding a dependency is a real feature
 * with a real answer later, not something to leave half-working now.
 *
 * The starter is deliberately plain. It is a base for the agent to work on and
 * a thing a person can read in a minute — not a showcase. Templates are what
 * carry design.
 */

import type { ProjectFiles } from "./types"

/** Files every project has, whatever it was started from. */
export const PROJECT_SCAFFOLD: ProjectFiles = {
  "package.json": JSON.stringify(
    {
      name: "storelib-site",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "^5.6.0",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  ),

  "vite.config.ts": `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
})
`,

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My site</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "src/main.tsx": `import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,

  /**
   * One stylesheet with the design tokens at the top.
   *
   * Tokens rather than values scattered through components, because "make the
   * whole site warmer" should be four lines for the agent to change, not forty
   * — and because a visual editor that can only reach a handful of properties
   * needs the rest to be reachable from one place.
   */
  "src/styles.css": `:root {
  --bg: #ffffff;
  --surface: #f6f6f7;
  --text: #111113;
  --muted: #6b6b72;
  --primary: #111113;
  --primary-text: #ffffff;
  --border: #e6e6e9;
  --radius: 10px;
  --container: 1080px;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.container {
  width: 100%;
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 20px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--primary);
  color: var(--primary-text);
  font: inherit;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}

.button--secondary {
  background: transparent;
  color: var(--text);
  border-color: var(--border);
}

section { padding: 72px 0; }

@media (max-width: 640px) {
  section { padding: 48px 0; }
}
`,
}

/** The blank site: a scaffold plus the least page that is still a page. */
export function blankProject(siteName: string): ProjectFiles {
  return {
    ...PROJECT_SCAFFOLD,
    "index.html": PROJECT_SCAFFOLD["index.html"].replace("<title>My site</title>", `<title>${escapeHtml(siteName)}</title>`),
    "src/App.tsx": `import Hero from "./components/Hero"
import Footer from "./components/Footer"

export default function App() {
  return (
    <>
      <Hero />
      <Footer />
    </>
  )
}
`,
    "src/components/Hero.tsx": `export default function Hero() {
  return (
    <section>
      <div className="container">
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.1, margin: "0 0 16px" }}>
          ${escapeJsxText(siteName)}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.125rem", maxWidth: "56ch", margin: "0 0 28px" }}>
          Say what you do in a sentence. Ask Storelib AI to rewrite this, add
          sections, or rebuild the page entirely.
        </p>
        <a className="button" href="#">
          Get started
        </a>
      </div>
    </section>
  )
}
`,
    "src/components/Footer.tsx": `export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "32px 0" }}>
      <div className="container" style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
        © {new Date().getFullYear()} ${escapeJsxText(siteName)}
      </div>
    </footer>
  )
}
`,
  }
}

/** `<` and `&` in a title become markup otherwise. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * A site called `Tom's {Studio}` would otherwise close the JSX expression it
 * is sitting in and produce a project that does not parse — before the user
 * has typed anything.
 */
function escapeJsxText(value: string): string {
  return value.replace(/[{}<>]/g, (c) => `{"${c}"}`)
}

/** Every file in a project, sorted, for a file tree. */
export function sortedPaths(files: ProjectFiles): string[] {
  return Object.keys(files).sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length
    return depth !== 0 ? depth : a.localeCompare(b)
  })
}
