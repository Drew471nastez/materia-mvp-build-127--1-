/**
 * Bundling a project — the one implementation, used from two places.
 *
 * The editor runs this in a web worker with browser esbuild-wasm; the agent's
 * `run_build` tool runs it in a Node route with the same package. They MUST be
 * the same code: an agent that verifies its work against a different bundler
 * than the preview uses will confidently report a green build for a page the
 * creator sees broken, which is worse than not checking at all.
 *
 * `esbuild` is a parameter rather than an import for exactly that reason — the
 * two callers supply different builds of the same library, and neither one is
 * importable from the other's environment.
 */

import {
  EXTERNAL_MODULES,
  entryPoint,
  isBareSpecifier,
  loaderFor,
  resolveSpecifier,
  unavailableDependencies,
} from "./module-graph"
import type { BuildError, BuildResult, ProjectFiles } from "./types"

const NAMESPACE = "storelib-project"

/** The slice of esbuild's API this needs, in either environment. */
export interface EsbuildLike {
  build(options: Record<string, unknown>): Promise<{
    outputFiles?: Array<{ path: string; text: string }>
    warnings: ReadonlyArray<EsbuildMessage>
  }>
}

interface EsbuildMessage {
  text: string
  location?: { file?: string; line?: number; column?: number } | null
}

function toBuildErrors(messages: ReadonlyArray<EsbuildMessage>): BuildError[] {
  return messages.map((m) => ({
    file: m.location?.file || undefined,
    line: m.location?.line,
    column: m.location?.column,
    message: m.text,
  }))
}

export async function bundleProject(
  esbuild: EsbuildLike,
  files: ProjectFiles,
): Promise<BuildResult> {
  const startedAt = Date.now()
  const done = (r: Partial<BuildResult>): BuildResult => ({
    ok: false,
    errors: [],
    warnings: [],
    durationMs: Date.now() - startedAt,
    ...r,
  })

  const entry = entryPoint(files)
  if (!entry) {
    return done({
      errors: [{ message: "No entry point. Add src/main.tsx, or point index.html at one." }],
    })
  }

  /**
   * Checked BEFORE esbuild runs. esbuild's answer to an import it cannot
   * resolve describes a virtual filesystem the author does not have; this one
   * names the package and says what is actually true about it.
   */
  const unavailable = unavailableDependencies(files)
  if (unavailable.length > 0) {
    return done({
      errors: unavailable.map((name) => ({
        message: `"${name}" is not available. Sites can import ${EXTERNAL_MODULES.join(", ")} — adding packages is not supported yet.`,
      })),
    })
  }

  /** The project, as a filesystem esbuild can walk. */
  const virtualFiles = {
    name: "storelib-project-files",
    setup(build: {
      onResolve(opts: { filter: RegExp }, fn: (args: { path: string; importer: string; kind: string }) => unknown): void
      onLoad(opts: { filter: RegExp; namespace: string }, fn: (args: { path: string }) => unknown): void
    }) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return { path: entry, namespace: NAMESPACE }
        if (isBareSpecifier(args.path)) return { path: args.path, external: true }

        const resolved = resolveSpecifier(args.path, args.importer, files)
        if (!resolved) {
          return { errors: [{ text: `Could not find "${args.path}" (imported by ${args.importer})` }] }
        }
        return { path: resolved, namespace: NAMESPACE }
      })

      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
        contents: files[args.path] ?? "",
        loader: loaderFor(args.path),
        // Relative imports resolve against the importer, and the importer's
        // directory only means anything if the loader is told where it is.
        resolveDir: args.path.includes("/") ? args.path.slice(0, args.path.lastIndexOf("/")) : "",
      }))
    },
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      /**
       * Nothing is written — but an imported stylesheet becomes its own output
       * file, and esbuild refuses to plan one without somewhere to put it:
       * "Cannot import … into a JavaScript file without an output path
       * configured". The path is never touched; it exists so the CSS comes
       * back in outputFiles alongside the JS.
       */
      outdir: "/storelib-build",
      format: "esm",
      target: "es2020",
      jsx: "automatic",
      // A preview is for looking at, and a readable stack when it throws is
      // worth more than the bytes. Publishing minifies; this does not.
      minify: false,
      sourcemap: false,
      external: [...EXTERNAL_MODULES],
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
      plugins: [virtualFiles],
    })

    let code = ""
    let css = ""
    for (const out of result.outputFiles ?? []) {
      if (out.path.endsWith(".css")) css += out.text
      else code += out.text
    }

    return done({ ok: true, code, css, warnings: toBuildErrors(result.warnings) })
  } catch (error) {
    const failure = error as { errors?: EsbuildMessage[]; warnings?: EsbuildMessage[] }
    const errors = failure?.errors?.length
      ? toBuildErrors(failure.errors)
      : [{ message: error instanceof Error ? error.message : "The build failed." }]
    return done({ errors, warnings: toBuildErrors(failure?.warnings ?? []) })
  }
}

/** One line per problem, for the agent to read. */
export function formatBuildErrors(result: BuildResult): string {
  if (result.ok) {
    const warnings = result.warnings.length
    return warnings === 0
      ? "Build succeeded with no warnings."
      : `Build succeeded with ${warnings} warning(s):\n` +
          result.warnings.map(formatOne).join("\n")
  }
  return `Build FAILED with ${result.errors.length} error(s):\n` + result.errors.map(formatOne).join("\n")
}

function formatOne(error: BuildError): string {
  const where = error.file ? `${error.file}${error.line ? `:${error.line}` : ""}: ` : ""
  return `  ${where}${error.message}`
}
