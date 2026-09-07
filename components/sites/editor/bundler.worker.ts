/**
 * The bundler, in a web worker.
 *
 * WHY A WORKER. esbuild-wasm instantiates a ~9MB WebAssembly module and then
 * does real work on every keystroke-ish change. On the main thread that is a
 * visibly janky editor; here the UI stays responsive and a build that takes
 * 400ms costs nothing but 400ms.
 *
 * WHY esbuild-wasm AND NOT A SERVER BUILD. See docs/storelib-sites.md §2: a
 * container per user is the cost model the brief rules out, and WebContainers
 * need site-wide cross-origin isolation that would change every existing
 * Storelib page. The price is a fixed dependency set, which lib/sites/module-graph
 * enforces and reports on.
 *
 * This file must not import anything from the app beyond pure modules —
 * a worker has no DOM, no window, and no Supabase client, and reaching for one
 * fails at instantiation rather than at the call.
 */

import * as esbuild from "esbuild-wasm"

import {
  EXTERNAL_MODULES,
  entryPoint,
  isBareSpecifier,
  loaderFor,
  resolveSpecifier,
  unavailableDependencies,
} from "@/lib/sites/module-graph"
import type { BuildError, ProjectFiles } from "@/lib/sites/types"

export interface BundleRequest {
  id: number
  files: ProjectFiles
}

export interface BundleResponse {
  id: number
  ok: boolean
  code?: string
  css?: string
  errors: BuildError[]
  warnings: BuildError[]
  durationMs: number
}

const NAMESPACE = "storelib-project"

let ready: Promise<void> | null = null

function start(): Promise<void> {
  if (!ready) {
    ready = esbuild.initialize({
      // Copied out of node_modules by scripts/copy-esbuild-wasm.mjs at build
      // time. Served from our own origin on purpose: the bundler is not an
      // enhancement that can degrade, and a CDN outage would mean nobody can
      // edit their website today.
      wasmURL: "/sites/esbuild.wasm",
    })
  }
  return ready
}

/** esbuild's own message shape, flattened to something the UI can render. */
function toBuildErrors(messages: readonly esbuild.Message[]): BuildError[] {
  return messages.map((m) => ({
    file: m.location?.file || undefined,
    line: m.location?.line,
    column: m.location?.column,
    message: m.text,
  }))
}

async function bundle(files: ProjectFiles): Promise<Omit<BundleResponse, "id">> {
  const startedAt = Date.now()
  const done = (r: Partial<Omit<BundleResponse, "id">>): Omit<BundleResponse, "id"> => ({
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
   * resolve describes a filesystem the author does not have; this one names the
   * package and says what is actually true about it.
   */
  const unavailable = unavailableDependencies(files)
  if (unavailable.length > 0) {
    return done({
      errors: unavailable.map((name) => ({
        message: `"${name}" is not available. Sites can import ${EXTERNAL_MODULES.join(", ")} — adding packages is not supported yet.`,
      })),
    })
  }

  await start()

  /** The project, as a filesystem esbuild can walk. */
  const virtualFiles: esbuild.Plugin = {
    name: "storelib-project-files",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return { path: entry, namespace: NAMESPACE }
        if (isBareSpecifier(args.path)) return { path: args.path, external: true }

        const resolved = resolveSpecifier(args.path, args.importer, files)
        if (!resolved) {
          return {
            errors: [{ text: `Could not find "${args.path}" (imported by ${args.importer})` }],
          }
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
       * configured". The path is never touched; it just has to exist for the
       * CSS to come back in outputFiles alongside the JS.
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

    return done({
      ok: true,
      code,
      css,
      warnings: toBuildErrors(result.warnings),
    })
  } catch (error) {
    const failure = error as esbuild.BuildFailure
    const errors = failure?.errors?.length
      ? toBuildErrors(failure.errors)
      : [{ message: error instanceof Error ? error.message : "The build failed." }]
    return done({ errors, warnings: toBuildErrors(failure?.warnings ?? []) })
  }
}

self.onmessage = async (event: MessageEvent<BundleRequest>) => {
  const { id, files } = event.data
  const result = await bundle(files)
  const response: BundleResponse = { id, ...result }
  self.postMessage(response)
}
