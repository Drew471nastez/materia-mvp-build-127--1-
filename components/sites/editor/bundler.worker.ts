/**
 * The bundler, in a web worker.
 *
 * WHY A WORKER. esbuild-wasm instantiates a ~12MB WebAssembly module and then
 * does real work on every change. On the main thread that is a visibly janky
 * editor; here the UI stays responsive and a build that takes 400ms costs
 * nothing but 400ms.
 *
 * WHY esbuild-wasm AND NOT A SERVER BUILD. See docs/storelib-sites.md §2: a
 * container per user is the cost model the brief rules out, and WebContainers
 * need site-wide cross-origin isolation that would change every existing
 * Storelib page. The price is a fixed dependency set, which
 * lib/sites/module-graph enforces and reports on.
 *
 * The BUILD ITSELF is lib/sites/bundle.ts, shared with the agent's `run_build`
 * tool. Two implementations would mean the agent could verify its work against
 * a different bundler than the preview uses, and confidently report green for
 * a page the creator sees broken.
 */

import * as esbuild from "esbuild-wasm"

import { bundleProject } from "@/lib/sites/bundle"
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

let ready: Promise<void> | null = null

function start(): Promise<void> {
  if (!ready) {
    ready = esbuild.initialize({
      // Copied out of node_modules by scripts/build-sites-assets.mjs at build
      // time. Served from our own origin on purpose: the bundler is not an
      // enhancement that can degrade, and a CDN outage would mean nobody can
      // edit their website today.
      wasmURL: "/sites/esbuild.wasm",
    })
  }
  return ready
}

self.onmessage = async (event: MessageEvent<BundleRequest>) => {
  const { id, files } = event.data
  await start()
  const result = await bundleProject(esbuild as never, files)
  const response: BundleResponse = { id, ...result }
  self.postMessage(response)
}
