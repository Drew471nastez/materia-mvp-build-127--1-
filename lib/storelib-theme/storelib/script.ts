/**
 * ===========================================================================
 *  <script>: BEHAVIOUR, ON A LEASH
 * ===========================================================================
 * A section's script is ordinary JavaScript that runs against a context it
 * is handed and nothing it is not:
 *
 *   root      the section instance's root element
 *   settings  its resolved settings
 *   blocks    its resolved blocks
 *   theme     the theme's tokens
 *   page      what page this is
 *   storelib  the runtime: navigation, commerce, analytics — each one a
 *             declared capability, and only the declared ones are present
 *
 * There are two lines of defence, and this file is the first. It is STATIC:
 * the source is refused outright if it names anything from the list below.
 * `window`, `document` and `globalThis` are the doors out of the section;
 * `eval` and `Function` are ways to build a door at runtime; `fetch` and its
 * relatives are the network, which a section does not get by default; the
 * storage APIs and `location` are the visitor's data and the visitor's
 * page. A script that needs one of these needs a capability, and reaches it
 * through `storelib.*`, where it can be logged, limited and revoked.
 *
 * The second line is the sandbox, and it is the one that matters: the
 * compiled script runs inside an `<iframe sandbox="allow-scripts">` with an
 * opaque origin, against a copy of its own section's markup, so even a name
 * this list missed has nothing to reach. What it changes comes back to the
 * page as a short list of allowed edits. See lib/storelib-theme/sandbox/ and
 * components/website-builder/sections/section-sandbox.tsx.
 *
 * This list is kept even so. It turns "why does document.querySelector find
 * nothing?" into an error with a line number at save time, and it is what
 * keeps a section safe to place twice on one page: `root`, never the
 * document.
 *
 * This is not a JavaScript parser. It is a tokenizer good enough to find
 * identifiers outside strings and comments, which is what a name list
 * needs; the sandbox is what handles everything a tokenizer cannot.
 */
import { LIMITS, type Result, type ThemeError } from "../types"

export const FORBIDDEN_IDENTIFIERS = [
  "window", "document", "globalThis", "self", "top", "parent", "frames", "opener",
  "eval", "Function", "import", "require", "WebAssembly",
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "navigator", "sendBeacon",
  "localStorage", "sessionStorage", "indexedDB", "cookie", "location", "history",
  "postMessage", "Worker", "SharedWorker", "ServiceWorker",
  "setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask",
] as const

/** The names the script IS given. Anything else free at the top level is a mistake. */
export const SCRIPT_CONTEXT = ["root", "settings", "blocks", "theme", "page", "storelib"] as const

export const CAPABILITIES = ["navigation", "commerce", "analytics", "forms", "timers", "embed", "database"] as const
export type Capability = (typeof CAPABILITIES)[number]

/** A capability unlocks a name. `timers` is the one that returns a browser API. */
const CAPABILITY_UNLOCKS: Record<Capability, readonly string[]> = {
  navigation: [],
  commerce: [],
  analytics: [],
  forms: [],
  timers: ["setTimeout", "setInterval", "requestAnimationFrame"],
  /** Markup, not script: it lets the template open one allow-listed <iframe>. */
  embed: [],
  /** `storelib.database`, the site's own Supabase when one is connected: no browser API of its own. */
  database: [],
}

export interface ScriptOptions {
  file?: string
  line?: number
  capabilities?: string[]
}

export interface CheckedScript {
  /** The source, wrapped as a function body over the context names. Not executed here. */
  bundle: string
  /** What the script asked for that it will be given. */
  capabilities: Capability[]
}

/**
 * Identifiers in source order, skipping strings, template literals, comments
 * and regex-looking slashes. Each carries the line it was on.
 */
function identifiers(src: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = []
  let i = 0
  let line = 1
  const n = src.length
  const skipTo = (end: string, escape = true) => {
    for (;;) {
      const j = src.indexOf(end, i)
      if (j < 0) { i = n; return }
      // count lines in the skipped span
      line += (src.slice(i, j + end.length).match(/\n/g) ?? []).length
      const escaped = escape && src[j - 1] === "\\" && src[j - 2] !== "\\"
      i = j + end.length
      if (!escaped) return
    }
  }
  while (i < n) {
    const ch = src[i]
    const next = src[i + 1]
    if (ch === "\n") { line++; i++; continue }
    if (ch === "/" && next === "/") { const j = src.indexOf("\n", i); i = j < 0 ? n : j; continue }
    if (ch === "/" && next === "*") { i += 2; skipTo("*/", false); continue }
    if (ch === '"' || ch === "'" || ch === "`") { i++; skipTo(ch); continue }
    const m = src.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)
    if (m) {
      // `a.window` is a property, not the global. `.` before it means member access.
      let k = i - 1
      while (k >= 0 && /\s/.test(src[k])) k--
      const isMember = src[k] === "."
      if (!isMember) out.push({ name: m[0], line })
      i += m[0].length
      continue
    }
    i++
  }
  return out
}

export function checkScript(src: string, opts: ScriptOptions = {}): Result<CheckedScript> {
  const errors: ThemeError[] = []
  const base = (opts.line ?? 1) - 1
  const err = (message: string, line?: number) => errors.push({ stage: "script", file: opts.file, line: line !== undefined ? base + line : undefined, message })

  if (Buffer.byteLength(src, "utf8") > LIMITS.scriptBytes) err(`The script is over ${LIMITS.scriptBytes / 1024} KB`)

  const declared = (opts.capabilities ?? []).filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(c))
  for (const c of opts.capabilities ?? []) {
    if (!(CAPABILITIES as readonly string[]).includes(c)) err(`"${c}" is not a capability. Use one of: ${CAPABILITIES.join(", ")}`)
  }
  const unlocked = new Set(declared.flatMap((c) => CAPABILITY_UNLOCKS[c]))

  const seen = new Set<string>()
  for (const { name, line } of identifiers(src)) {
    if (!(FORBIDDEN_IDENTIFIERS as readonly string[]).includes(name)) continue
    if (unlocked.has(name)) continue
    const key = `${name}@${line}`
    if (seen.has(key)) continue
    seen.add(key)
    const hint =
      name === "fetch" || name === "XMLHttpRequest" || name === "WebSocket"
        ? " A section does not get the network; declare a capability and use storelib.*."
        : name === "setTimeout" || name === "setInterval" || name === "requestAnimationFrame"
          ? ' Declare the "timers" capability to use it.'
          : " Reach outside the section through storelib.* instead."
    err(`The script uses "${name}", which a section cannot reach.${hint}`, line)
  }

  if (errors.length) return { ok: false, errors }

  // Wrapped as a body over the context. Executed only inside the sandbox.
  const bundle = `"use strict";\n(function (${SCRIPT_CONTEXT.join(", ")}) {\n${src}\n})`
  return { ok: true, value: { bundle, capabilities: declared } }
}
