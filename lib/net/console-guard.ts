/**
 * ===========================================================================
 *  EVERY SERVER ERROR LINE: ONE JSON LINE, WITH ITS REQUEST, NOTHING PRIVATE
 * ===========================================================================
 * About 700 route handlers and many more server components log their own
 * failures with console.error(e) or console.warn("[x] ...", e). Editing each
 * one to use lib/net/log.ts is 400 files of churn, so this does it once, at
 * the console, from instrumentation.ts register() (Node runtime only):
 *
 *   console.error / console.warn on the server     one JSON line at the same level:
 *     {"evt":"log","level":"error","route":"/api/orders","method":"POST","rid":"iad1::abc","msg":"...","stack":"..."}
 *   a line that already is JSON (lib/net/log.ts)    kept, with route and rid added when missing
 *   every string in it                             through scrubSecrets (lib/net/scrub.ts)
 *   the same Error object a second time            dropped: Next prints an uncaught error and
 *                                                  onRequestError reports it, one line is enough
 *
 * `route` and `rid` come from Next's own request storage (the stores
 * next/headers reads), looked up when the line is written; outside a request
 * (a build, a module's top level) they are left out. console.log and
 * console.info are not touched: they are not failures.
 *
 * Never throws: when anything here fails, the original console call runs
 * with the scrubbed arguments. STORELIB_LOG_RAW=1 turns the JSON shape off
 * (lines are still scrubbed).
 */
import { formatWithOptions } from "node:util"
import { scrubSecrets } from "@/lib/net/scrub"
import { REQUEST_ID_HEADER, cleanRequestId } from "@/lib/net/request-id"
import { markLogged, wasLogged } from "@/lib/net/logged-once"

type Level = "error" | "warn"
type RequestContext = { route?: string | null; method?: string | null; rid?: string | null }
type ContextReader = () => RequestContext | null

const INSTALLED = Symbol.for("storelib.consoleGuard")
const MAX_MSG = 2_000

function stackOf(e: Error): string | null {
  return e.stack ? scrubSecrets(e.stack.split("\n").slice(0, 8).join("\n")) : null
}

/**
 * The JSON line for one console call. Pure apart from the logged-once set; exported for the
 * test. Returns null when the line should be dropped (an error already logged,
 * lib/net/logged-once).
 */
export function guardLine(level: Level, args: unknown[], ctx: RequestContext | null): string | null {
  const errors = args.filter((a): a is Error => a instanceof Error)
  if (errors.length && errors.every((e) => wasLogged(e))) return null
  for (const e of errors) markLogged(e)

  const extra: Record<string, unknown> = {}
  if (ctx?.route) extra.route = ctx.route
  if (ctx?.method) extra.method = ctx.method
  if (ctx?.rid) extra.rid = ctx.rid

  /* Already a structured line (lib/net/log.ts logEvent, a route's own JSON.stringify): keep its fields. */
  if (args.length === 1 && typeof args[0] === "string" && args[0].startsWith("{")) {
    try {
      const parsed = JSON.parse(scrubSecrets(args[0])) as Record<string, unknown>
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(extra)) if (parsed[k] === undefined || parsed[k] === null) parsed[k] = v
        return JSON.stringify(parsed)
      }
    } catch {
      /* not JSON after all: written as a message below */
    }
  }

  const msg = scrubSecrets(formatWithOptions({ depth: 4, breakLength: Infinity, colors: false }, ...args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : a)))).slice(0, MAX_MSG)
  const first = errors[0]
  const out: Record<string, unknown> = { evt: "log", level, ...extra, msg }
  if (first) {
    const digest = (first as { digest?: unknown }).digest
    if (typeof digest === "string") out.digest = digest
    const stack = stackOf(first)
    if (stack) out.stack = stack
  }
  return JSON.stringify(out)
}

/*
  Next's request stores, the same instances next/headers reads: the work
  store has the route ("/api/orders", "/[sellername]/[productSlug]"), the
  work unit store the request's headers. Internal modules, so every read is
  guarded, and a Next that moves them only loses route and rid, never a line.
*/
function nextContextReader(): ContextReader {
  let work: { getStore(): { route?: string } | undefined } | null = null
  let unit: { getStore(): { type?: string; headers?: { get(n: string): string | null }; url?: { pathname?: string } } | undefined } | null = null
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    work = require("next/dist/server/app-render/work-async-storage.external").workAsyncStorage
  } catch {
    work = null
  }
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    unit = require("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage
  } catch {
    unit = null
  }
  return () => {
    try {
      const w = work?.getStore()
      const u = unit?.getStore()
      const h = u && u.type === "request" ? u.headers : undefined
      const rid = h ? (cleanRequestId(h.get(REQUEST_ID_HEADER)) ?? cleanRequestId(h.get("x-vercel-id"))) : null
      if (!w?.route && !rid) return null
      return { route: w?.route ?? null, rid }
    } catch {
      return null
    }
  }
}

/*
  NEXT PRINTS AN UNCAUGHT ERROR BEFORE IT CALLS onRequestError. Measured on
  a production build (Next 16.1.7): a route handler that throws printed
  "⨯ Error: ..." first and onRequestError's error_report line second, two
  lines for one error. So Next's own print ("⨯" and the Error) is held for
  NEXT_PRINT_HOLD_MS; onRequestError marks the error (lib/net/logged-once)
  and the held line is dropped. If onRequestError never comes, the line is
  written when the hold ends: nothing is lost, only late.
*/
export const NEXT_PRINT_HOLD_MS = 1_500

/** Next's own print of an uncaught error: console.error("⨯", err) or ("⨯ ...", err). */
export function isNextUncaughtPrint(level: Level, args: unknown[]): boolean {
  return level === "error" && typeof args[0] === "string" && args[0].replace(/\x1b\[[0-9;]*m/g, "").trimStart().startsWith("⨯") && args.some((a) => a instanceof Error && !wasLogged(a))
}

/** Installs the guard once per process. Node runtime only (instrumentation.ts). */
export function installConsoleGuard(read: ContextReader = nextContextReader()): void {
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[INSTALLED]) return
  g[INSTALLED] = true
  const raw = process.env.STORELIB_LOG_RAW === "1"
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        if (raw) return original(...args.map((a) => (typeof a === "string" ? scrubSecrets(a) : a instanceof Error ? scrubSecrets(a.stack ?? a.message) : a)))
        const ctx = read()
        if (isNextUncaughtPrint(level, args)) {
          /* Held briefly: onRequestError writes the richer line for this error and marks it, and then this one is dropped. */
          const timer = setTimeout(() => {
            try {
              const line = guardLine(level, args, ctx)
              if (line !== null) original(line)
            } catch {
              /* never fails anything */
            }
          }, NEXT_PRINT_HOLD_MS)
          ;(timer as { unref?: () => void }).unref?.()
          return
        }
        const line = guardLine(level, args, ctx)
        if (line !== null) original(line)
      } catch {
        try {
          original(...args.map((a) => (typeof a === "string" ? scrubSecrets(a) : a)))
        } catch {
          /* logging is never what fails a request */
        }
      }
    }
  }
}
