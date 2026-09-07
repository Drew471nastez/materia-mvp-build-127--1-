import "server-only"

/**
 * Does this project actually typecheck?
 *
 * ---------------------------------------------------------------------------
 *  WHAT `run_build` WAS NOT TELLING ANYONE
 * ---------------------------------------------------------------------------
 * The build is esbuild, and esbuild STRIPS types rather than checking them. It
 * catches a syntax error and an import that resolves nowhere, and it is
 * completely silent about a property that does not exist, a prop passed with
 * the wrong shape, or a function called with two arguments when it takes
 * three. So a green build meant "this parses", and the agent — told not to
 * finish on a failing build — could finish on a project that would throw the
 * moment somebody opened it.
 *
 * That is the worst shape a verification step can have: present, trusted, and
 * checking less than everyone assumes.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS SERVER-SIDE ONLY
 * ---------------------------------------------------------------------------
 * The editor's live preview compiles in a web worker with esbuild-wasm on
 * every keystroke, and it must stay instant. TypeScript is a different
 * proposition — it reads the whole program and the React type definitions —
 * so it runs where correctness matters more than latency: in the agent's
 * build, once per verification, before a run is allowed to finish.
 */

import type { ProjectFiles } from "./types"

export interface TypeError {
  file: string
  line: number
  column: number
  message: string
}

/** Enough to fix a run; past this the model is reading noise. */
const MAX_ERRORS = 25

/**
 * Type definitions the project's code refers to but does not contain.
 *
 * React's types come from this repository's own node_modules, which is correct
 * rather than convenient: a generated site imports the same React 19 that the
 * preview and the published bundle use, so checking it against a different
 * version's types would report errors that are not real.
 */
export type TypecheckResult =
  | { ran: true; ok: boolean; errors: TypeError[] }
  /**
   * Could not check, which is NOT the same as checking and finding nothing.
   * The caller must not report a project as verified on this.
   */
  | { ran: false; reason: string }

/**
 * A tiny project that is unambiguously correct.
 *
 * Used to ask the checker a question it must get right. If it reports errors
 * HERE, the type environment is producing noise — a missing definition, a JSX
 * namespace that did not resolve, a version this setup does not model — and
 * its opinion about a creator's project cannot be trusted either.
 */
const REFERENCE: ProjectFiles = {
  "src/main.tsx": `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  "src/App.tsx": `import Hero from "./components/Hero"

export default function App() {
  return <Hero title="Hello" />
}
`,
  "src/components/Hero.tsx": `export default function Hero({ title }: { title: string }) {
  return <h1>{title}</h1>
}
`,
}

/**
 * Whether this environment can typecheck at all, decided once per process.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE CHECKER HAS TO PROVE ITSELF
 * ---------------------------------------------------------------------------
 * A typechecker that reports errors on correct code is worse than none: the
 * completion gate would refuse to let ANY run finish, and every creator would
 * be told their working site is broken. Type environments are assembled from
 * whatever versions happen to be installed, and this one builds React's
 * definitions by hand rather than through a package manager — so "it works on
 * my machine" is not something to assume on somebody else's deployment.
 *
 * So before its verdict is allowed to block anything, it is asked about a
 * project known to be correct. If it gets THAT wrong, every result becomes
 * "could not check" — the feature degrades to silence rather than to
 * obstruction.
 */
let selfCheck: Promise<boolean> | null = null

async function environmentIsTrustworthy(
  run: (files: ProjectFiles) => Promise<TypecheckResult>,
): Promise<boolean> {
  selfCheck ??= (async () => {
    const result = await run(REFERENCE).catch(() => null)
    if (!result || !result.ran) return false
    if (!result.ok) {
      console.error(
        "[typecheck] disabled — the reference project reported errors, so this " +
          "environment's type definitions cannot be trusted:",
        result.errors.slice(0, 3).map((e) => `${e.file}:${e.line} ${e.message}`).join(" | "),
      )
      return false
    }
    return true
  })()
  return selfCheck
}

export async function typecheckProject(files: ProjectFiles): Promise<TypecheckResult> {
  const trustworthy = await environmentIsTrustworthy(runTypecheck)
  if (!trustworthy) {
    return { ran: false, reason: "This environment cannot typecheck reliably." }
  }
  return runTypecheck(files)
}

async function runTypecheck(files: ProjectFiles): Promise<TypecheckResult> {
  let ts: typeof import("typescript")
  try {
    /**
     * TypeScript is CommonJS, so a dynamic import hands back a namespace whose
     * real exports sit under `.default`. Reading `ts.JsxEmit` off the wrapper
     * gives undefined — and the failure surfaces as a TypeError deep inside
     * option building rather than as "TypeScript is missing", which is a much
     * worse thing to debug.
     */
    const mod = (await import("typescript")) as unknown as {
      default?: typeof import("typescript")
    } & typeof import("typescript")
    ts = mod.default ?? mod
    if (!ts?.JsxEmit) {
      return { ran: false, reason: "TypeScript loaded but its API was not usable." }
    }
  } catch {
    return { ran: false, reason: "TypeScript is not available in this environment." }
  }

  /**
   * THE CREATOR'S CODE ONLY.
   *
   * `vite.config.ts` imports `vite` and `@vitejs/plugin-react`, whose types we
   * deliberately do not ship — so checking it reports two errors on every
   * project, about scaffold nobody wrote and nobody can fix. Build
   * configuration is not the thing being verified here; the site is.
   */
  const sources = Object.keys(files).filter((p) => p.startsWith("src/") && /\.(ts|tsx)$/.test(p))
  if (sources.length === 0) return { ran: true, ok: true, errors: [] }

  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
  const { join, dirname } = await import("node:path")
  const { tmpdir } = await import("node:os")

  /**
   * WRITTEN TO DISK, AND CHECKED THE WAY TYPESCRIPT NORMALLY CHECKS THINGS.
   *
   * The first version of this built a virtual CompilerHost and resolved every
   * import by hand. It never worked: React 19's JSX namespace lives in
   * `react/jsx-runtime`, that file imports "./" to reach it, and getting a
   * hand-written resolver to satisfy that chain produced a checker that
   * reported "'StrictMode' cannot be used as a JSX component" on a project
   * that is plainly correct — the tell that TypeScript had fallen back to
   * legacy JSX checking because it could not find `JSX.ElementType`.
   *
   * Reimplementing module resolution to check three files is the wrong trade.
   * A temporary directory next to this repository's real node_modules lets
   * TypeScript resolve exactly as it does for any project, which is both
   * simpler and the only version that is correct.
   */
  const dir = await mkdtemp(join(tmpdir(), "storelib-typecheck-"))

  try {
    for (const path of sources) {
      const full = join(dir, path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, files[path], "utf8")
    }

    const options: import("typescript").CompilerOptions = {
      noEmit: true,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "react",
      strict: false,
      target: ts.ScriptTarget.ES2022,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      allowJs: true,
      esModuleInterop: true,
      // `@/` is the alias the generated project uses for its own src.
      baseUrl: dir,
      paths: { "@/*": ["src/*"] },
      // Resolve bare imports against THIS repository's node_modules, so a
      // generated site is checked against the same React it will run on.
      typeRoots: [join(process.cwd(), "node_modules", "@types")],
    }

    const host = ts.createCompilerHost(options, true)
    /**
     * Bare specifiers resolve from the repository root rather than from the
     * temporary directory, which has no node_modules of its own.
     */
    const originalResolve = host.resolveModuleNames?.bind(host)
    host.resolveModuleNames = (names, containingFile) =>
      names.map((name) => {
        const from = name.startsWith(".") || name.startsWith("@/") ? containingFile : join(process.cwd(), "index.ts")
        return ts.resolveModuleName(name, from, options, host).resolvedModule
      })
    void originalResolve
    
    const program = ts.createProgram(sources.map((p) => join(dir, p)), options, host)

    const diagnostics = [
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ]

    const errors: TypeError[] = []
    for (const d of diagnostics) {
      if (d.category !== ts.DiagnosticCategory.Error) continue
      if (!d.file || !d.file.fileName.startsWith(dir)) continue

      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0)
      errors.push({
        file: d.file.fileName.slice(dir.length + 1),
        line: line + 1,
        column: character + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, " "),
      })
      if (errors.length >= MAX_ERRORS) break
    }

    return { ran: true, ok: errors.length === 0, errors }
  } catch (thrown) {
    return { ran: false, reason: thrown instanceof Error ? thrown.message : "Could not run TypeScript." }
  } finally {
    // The directory is ours and disposable; failing to remove it would leak a
    // copy of somebody's project into /tmp on every build.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** The errors as the model should read them. */
export function formatTypeErrors(result: TypecheckResult): string {
  if (!result.ran) return ""
  if (result.ok) return ""
  return (
    `${result.errors.length} type error${result.errors.length === 1 ? "" : "s"}:\n` +
    result.errors.map((e) => `  ${e.file}:${e.line}:${e.column} — ${e.message}`).join("\n")
  )
}
