import "server-only"

/**
 * Does the page actually render, or does it only compile?
 *
 * ---------------------------------------------------------------------------
 *  THE GAP THE OTHER TWO CHECKS LEAVE
 * ---------------------------------------------------------------------------
 * esbuild proves a project parses and that every import resolves. TypeScript
 * proves the types line up. Neither of them runs a single line of it, so
 * neither has an opinion about:
 *
 *     const items = null
 *     …
 *     {items.map(…)}
 *
 * That bundles, it typechecks under the project's own settings, and it throws
 * the instant the page is opened. The creator's first look at their own site
 * is a blank screen, and the run that produced it reported success.
 *
 * So the project is RENDERED, once, before a run is allowed to finish. It is
 * the difference between "this would compile" and "this works", and it is the
 * last thing standing between a green run and a white page.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS DOES NOT PRODUCE FALSE ALARMS ABOUT BROWSER APIs
 * ---------------------------------------------------------------------------
 * The obvious objection to server-rendering a browser page is that half of it
 * touches `window`. Two things answer that, and both were measured rather than
 * assumed:
 *
 *   1. `renderToStaticMarkup` DOES NOT RUN EFFECTS. Almost everything that
 *      reaches for a browser API in a React site does so in `useEffect`, and
 *      none of that executes here. Verified: a component reading
 *      `window.innerWidth` inside an effect renders clean.
 *
 *   2. What is left — module scope and render bodies — gets a small set of
 *      browser globals below. Verified: `window.innerWidth` in a render body,
 *      `localStorage.getItem` in a render body and `document.documentElement`
 *      at module scope all render clean with it, and the first attempt failed
 *      the module-scope one because ESM hoists imports above inline code. The
 *      shim is emitted as a BANNER for that reason — literally the first bytes
 *      of the file, before any require.
 *
 * A verdict of "could not check" is therefore always available and always
 * means exactly that. It never means clean.
 *
 * ---------------------------------------------------------------------------
 *  THIS EXECUTES CODE A MODEL WROTE, SO IT IS SANDBOXED
 * ---------------------------------------------------------------------------
 * Everywhere else, generated code runs in the creator's browser or in an
 * opaque-origin iframe. This is the first place it would run on our own
 * machine, which is a new surface and is treated like one:
 *
 *   - a SEPARATE PROCESS, so a crash or a hang is not ours
 *   - `--permission` with reads confined to the temporary project and the
 *     React packages: no repository, no /etc, no writes anywhere
 *   - AN EMPTY ENVIRONMENT. No SUPABASE_SERVICE_ROLE_KEY, no OPENAI_API_KEY,
 *     no anything. `process.env` inside is bare.
 *   - a hard timeout, because `while (true) {}` is a thing a model writes
 *   - a bounded output buffer
 *
 * If the runtime cannot enforce that — an older Node without `--permission` —
 * THE CHECK DOES NOT RUN. Degrading to silence is acceptable; degrading to
 * executing a model's code unsandboxed on a server holding service-role keys
 * is not, and "we would have caught a crash" is not worth that trade.
 */

import { entryPoint } from "./module-graph"
import { buildRepoMap } from "./agent/repo-map"
import type { ProjectFiles } from "./types"

export interface RenderFailure {
  message: string
  /** Project frames only. React's internals are noise the model cannot act on. */
  where: string
}

export type RenderResult =
  | { ran: true; ok: true }
  | { ran: true; ok: false; failure: RenderFailure }
  /** Could not check, which is NOT the same as checking and finding nothing. */
  | { ran: false; reason: string }

/** Long enough for a real page, short enough that a runaway loop is not a run. */
const TIMEOUT_MS = 8_000

/** A render that produces megabytes is a bug in itself. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

/**
 * The browser, in as few lines as will do.
 *
 * Not a DOM implementation and not trying to be — jsdom is a large dependency
 * to add for a check that must never be the reason a deploy is heavy. These
 * are the globals a marketing page touches outside an effect, and anything
 * beyond them is rare enough that "could not check" is the honest answer.
 */
const BROWSER_SHIM = `
if (typeof globalThis.window === "undefined") {
  var __noop = function () {}
  var __el = { style: {}, classList: { add: __noop, remove: __noop, toggle: __noop, contains: function () { return false } },
    appendChild: __noop, removeChild: __noop, setAttribute: __noop, getAttribute: function () { return null },
    addEventListener: __noop, removeEventListener: __noop, getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 } },
    querySelector: function () { return null }, querySelectorAll: function () { return [] }, focus: __noop, scrollIntoView: __noop }
  var __doc = { documentElement: __el, body: __el, head: __el, createElement: function () { return __el },
    createTextNode: function () { return __el }, getElementById: function () { return __el },
    querySelector: function () { return null }, querySelectorAll: function () { return [] },
    addEventListener: __noop, removeEventListener: __noop, cookie: "", title: "", readyState: "complete" }
  var __store = new Map()
  var __storage = { getItem: function (k) { return __store.has(k) ? __store.get(k) : null },
    setItem: function (k, v) { __store.set(k, String(v)) }, removeItem: function (k) { __store.delete(k) },
    clear: function () { __store.clear() }, key: function () { return null }, length: 0 }
  var __media = function () { return { matches: false, media: "", addEventListener: __noop, removeEventListener: __noop, addListener: __noop, removeListener: __noop } }
  var __win = { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800, devicePixelRatio: 1,
    scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0,
    location: { href: "https://example.com/", pathname: "/", search: "", hash: "", origin: "https://example.com", host: "example.com", protocol: "https:" },
    navigator: { userAgent: "Storelib", language: "en-US", languages: ["en-US"] },
    document: __doc, localStorage: __storage, sessionStorage: __storage,
    addEventListener: __noop, removeEventListener: __noop, scrollTo: __noop, scrollBy: __noop, alert: __noop,
    matchMedia: __media, getComputedStyle: function () { return { getPropertyValue: function () { return "" } } },
    requestAnimationFrame: __noop, cancelAnimationFrame: __noop, setTimeout: setTimeout, clearTimeout: clearTimeout }
  __win.window = __win
  __win.self = __win
  __win.top = __win
  __win.parent = __win
  globalThis.window = __win
  globalThis.document = __doc
  globalThis.localStorage = __storage
  globalThis.sessionStorage = __storage
  globalThis.matchMedia = __media
  globalThis.getComputedStyle = __win.getComputedStyle
  globalThis.requestAnimationFrame = __noop
  globalThis.cancelAnimationFrame = __noop
  var __Obs = function () {}
  __Obs.prototype.observe = __noop
  __Obs.prototype.unobserve = __noop
  __Obs.prototype.disconnect = __noop
  __Obs.prototype.takeRecords = function () { return [] }
  globalThis.ResizeObserver = __Obs
  globalThis.IntersectionObserver = __Obs
  globalThis.MutationObserver = __Obs
}
`

/**
 * A project that plainly renders, used to ask the checker a question it must
 * get right before its verdict is allowed to block anything. Same discipline
 * as the typechecker's, for the same reason: a checker that fails correct code
 * would refuse every run, and every creator would be told their working site
 * is broken.
 */
const REFERENCE: ProjectFiles = {
  "index.html": `<div id="root"></div><script type="module" src="/src/main.tsx"></script>`,
  "src/main.tsx": `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

createRoot(document.getElementById("root")).render(
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
  "src/components/Hero.tsx": `export default function Hero({ title }) {
  return <h1>{title}</h1>
}
`,
}

/**
 * WHICH FLAG THIS NODE SPELLS THE SANDBOX WITH.
 *
 * The permission model is `--experimental-permission` on Node 20 and
 * `--permission` from 22. Guessing wrong is not a small thing: an unknown
 * option makes the child exit before it prints anything, which reads as "could
 * not check" — so the whole feature would be quietly dead on half the runtimes
 * it might be deployed to. That is the same failure as shipping a checker
 * whose compiler is a devDependency, and it is found the same way: by asking
 * the runtime instead of assuming.
 *
 * Resolved once, and to null when neither works — which disables the check
 * rather than running a model's code unsandboxed.
 */
let sandboxFlag: Promise<string | null> | null = null

export async function permissionFlag(): Promise<string | null> {
  sandboxFlag ??= (async () => {
    const { execFile } = await import("node:child_process")
    for (const flag of ["--permission", "--experimental-permission"]) {
      const ok = await new Promise<boolean>((resolve) => {
        execFile(
          process.execPath,
          [flag, "--allow-fs-read=*", "-e", "process.stdout.write('ok')"],
          { timeout: 5_000, env: { NODE_ENV: "production" } },
          (error, stdout) => resolve(!error && stdout.includes("ok")),
        )
      })
      if (ok) return flag
    }
    console.error(
      "[render-check] disabled — this Node has no permission model, and a page " +
        "is not rendered outside a sandbox just to check it.",
    )
    return null
  })()
  return sandboxFlag
}

let selfCheck: Promise<boolean> | null = null

async function environmentIsTrustworthy(): Promise<boolean> {
  selfCheck ??= (async () => {
    const result = await run(REFERENCE).catch(() => null)
    if (!result || !result.ran) {
      console.error(
        "[render-check] disabled —",
        result && !result.ran ? result.reason : "the reference project could not be rendered",
      )
      return false
    }
    if (!result.ok) {
      console.error(
        "[render-check] disabled — the reference project failed to render, so this " +
          "environment's verdicts cannot be trusted:",
        result.failure.message,
      )
      return false
    }
    return true
  })()
  return selfCheck
}

export async function renderCheck(files: ProjectFiles): Promise<RenderResult> {
  if (!(await environmentIsTrustworthy())) {
    return { ran: false, reason: "This environment cannot render-check reliably." }
  }
  return run(files)
}

/**
 * The component the page actually mounts.
 *
 * Read from the project rather than assumed, because `src/App.tsx` is a
 * convention and not a rule — a run that renamed it would otherwise report
 * "could not check" forever. The entry renders exactly one thing; the map
 * already knows which file exports it.
 */
export function rootComponent(files: ProjectFiles): { module: string; name: string } | null {
  const entry = entryPoint(files)
  if (!entry) return null

  const map = buildRepoMap(files)
  const entryFile = map.files.find((f) => f.path === entry)
  if (!entryFile) return null

  for (const rendered of entryFile.renders) {
    for (const path of entryFile.dependsOn) {
      const symbol = map.files
        .find((f) => f.path === path)
        ?.exports.find((e) => e.name === rendered || (e.isDefault && e.name === "default"))
      if (symbol) return { module: path, name: symbol.isDefault ? "default" : symbol.name }
    }
  }

  // Nothing rendered by name — a page whose entry mounts an inline element.
  // Not a failure, just not something this can check.
  return null
}

async function run(files: ProjectFiles): Promise<RenderResult> {
  const root = rootComponent(files)
  if (!root) {
    return { ran: false, reason: "Could not tell which component this page mounts." }
  }

  const sources = Object.keys(files).filter((p) => p.startsWith("src/"))
  if (sources.length === 0) return { ran: false, reason: "No source files." }

  const { mkdtemp, mkdir, writeFile, symlink, rm } = await import("node:fs/promises")
  const { join, dirname } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const { execFile } = await import("node:child_process")

  let esbuild: { build(options: Record<string, unknown>): Promise<unknown> }
  try {
    esbuild = (await import("esbuild")) as never
  } catch {
    return { ran: false, reason: "esbuild is not available in this environment." }
  }

  const flag = await permissionFlag()
  if (!flag) return { ran: false, reason: "This runtime cannot sandbox a render." }

  const modules = join(process.cwd(), "node_modules")
  const dir = await mkdtemp(join(tmpdir(), "storelib-render-"))

  try {
    for (const path of sources) {
      const full = join(dir, path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, files[path], "utf8")
    }

    /**
     * The import is written against the module's path with its extension
     * dropped, so the bundler resolves it exactly as the project's own imports
     * are resolved.
     */
    const specifier = `./${root.module.replace(/\.(tsx|ts|jsx|js)$/, "")}`
    const importLine =
      root.name === "default"
        ? `import Root from ${JSON.stringify(specifier)}`
        : `import { ${root.name} as Root } from ${JSON.stringify(specifier)}`

    await writeFile(
      join(dir, "__render.tsx"),
      `${importLine}
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

try {
  renderToStaticMarkup(createElement(Root))
  console.log("__STORELIB__" + JSON.stringify({ ok: true }))
} catch (thrown) {
  const error = thrown as { message?: string; stack?: string }
  console.log(
    "__STORELIB__" +
      JSON.stringify({ ok: false, message: String(error?.message ?? thrown), stack: String(error?.stack ?? "") }),
  )
}
`,
      "utf8",
    )

    // React resolves from the repository's own node_modules, so a project is
    // rendered against the same React the preview and the published site use.
    await symlink(modules, join(dir, "node_modules")).catch(() => {})

    await esbuild.build({
      entryPoints: [join(dir, "__render.tsx")],
      outfile: join(dir, "__render.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      jsxImportSource: "react",
      external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
      /**
       * A stylesheet has nothing to say about whether a component throws, and
       * esbuild would otherwise try to make CSS into JavaScript.
       */
      loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".jpg": "empty" },
      /**
       * A BANNER, not a line in the entry file. ESM hoists imports above
       * anything written beside them, so a shim in the source runs AFTER every
       * module's top-level code — and `const x = document.body` at module
       * scope failed against exactly that. The banner is the first bytes of
       * the emitted file, before any require.
       */
      banner: { js: BROWSER_SHIM },
      logLevel: "silent",
    })

    const output = await new Promise<{ stdout: string; stderr: string; timedOut: boolean; failed: boolean }>(
      (resolve) => {
        execFile(
          process.execPath,
          [
            /**
             * The sandbox. Reads confined to the temporary project and the
             * React packages; no writes anywhere; nothing else on the disk.
             */
            flag,
            `--allow-fs-read=${dir}/*`,
            `--allow-fs-read=${modules}/*`,
            join(dir, "__render.cjs"),
          ],
          {
            cwd: dir,
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT_BYTES,
            /** Bare. Not one secret this process holds is visible in there. */
            env: { NODE_ENV: "production" },
          },
          (error, stdout, stderr) => {
            const killed = !!error && ((error as { killed?: boolean }).killed ?? false)
            resolve({ stdout, stderr, timedOut: killed, failed: !!error })
          },
        )
      },
    )

    if (output.timedOut) {
      return {
        ran: true,
        ok: false,
        failure: {
          message: `Rendering did not finish within ${TIMEOUT_MS / 1000} seconds — the page is stuck in a loop.`,
          where: "",
        },
      }
    }

    const line = output.stdout
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("__STORELIB__"))

    if (!line) {
      /**
       * No verdict. Usually the sandbox refusing an option this Node does not
       * have, which must disable the check rather than pass it — running a
       * model's code without the sandbox is not a trade worth making for a
       * crash report.
       */
      return {
        ran: false,
        reason: firstLine(output.stderr) || "The render produced no answer.",
      }
    }

    const verdict = JSON.parse(line.slice("__STORELIB__".length)) as {
      ok: boolean
      message?: string
      stack?: string
    }

    if (verdict.ok) return { ran: true, ok: true }

    return {
      ran: true,
      ok: false,
      failure: {
        message: verdict.message ?? "The page threw while rendering.",
        where: projectFrames(verdict.stack ?? "", dir),
      },
    }
  } catch (thrown) {
    return { ran: false, reason: thrown instanceof Error ? thrown.message : "Could not render." }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.slice(0, 200) ?? ""
}

/**
 * The stack, reduced to what somebody can act on.
 *
 * React's server renderer contributes a dozen frames of its own internals to
 * every throw, and none of them is where the bug is. What is left is the
 * component names, which is the whole useful content of a render stack.
 */
export function projectFrames(stack: string, dir: string): string {
  const names: string[] = []
  for (const line of stack.split("\n")) {
    const match = line.match(/^\s*at\s+([A-Za-z_$][\w$]*)\s/)
    if (!match) continue
    if (line.includes("node_modules")) continue
    if (dir && !line.includes(dir) && !line.includes("__render")) continue
    if (!names.includes(match[1])) names.push(match[1])
    if (names.length >= 6) break
  }
  return names.join(" ← ")
}

/**
 * The failure a result carries, or null.
 *
 * Narrowed with `in` rather than on `ok`, because the push-test harness
 * compiles with `strictNullChecks: false` and TypeScript will not use a
 * boolean literal as a discriminant without it — so `if (!result.ok)` narrows
 * nothing there even though it narrows fine under the project's own config.
 */
export function renderFailure(result: RenderResult): RenderFailure | null {
  return "failure" in result ? result.failure : null
}

/** The failure as the model should read it. */
export function formatRenderFailure(result: RenderResult): string {
  const failure = renderFailure(result)
  if (!failure) return ""
  return (
    `THE PAGE THREW WHILE RENDERING — it compiles, but opening it shows nothing.\n` +
    `  ${failure.message}` +
    (failure.where ? `\n  in: ${failure.where}` : "") +
    `\nFix this before you finish. A site that does not render is not a finished edit.`
  )
}
