/**
 * Module resolution for the compiled push-test suites.
 *
 * ===========================================================================
 *  WHY THIS EXISTS INSTEAD OF A FEW REGEXES
 * ===========================================================================
 *
 * The runner used to fix up the emitted JS by rewriting its text: `@/lib/x` to
 * a relative path, and `from "./x"` to `from "./x.js"`, because tsc emits the
 * specifier verbatim and Node needs a real extension.
 *
 * That rewrite could not tell code from data. tests/sites.test.ts imports the
 * Sites STARTER PROJECT, whose files are template literals containing lines
 * like `import App from "./App"` — and the regex rewrote the fixture, so the
 * suite was handed a project whose entry imported "./App.js", a file that does
 * not exist. Two assertions failed against code that was correct, and the
 * bundler was verified in a real browser before the harness was believed.
 *
 * A regex over source text will always be able to do that. A resolver hook
 * cannot: it only ever sees specifiers Node is actually resolving, so a string
 * inside a template literal is never a candidate.
 *
 * Registered by scripts/run-push-tests.mjs, which passes the compile output
 * directory in PUSH_TEST_OUT.
 */
import { existsSync, statSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const OUT = process.env.PUSH_TEST_OUT

/** `server-only` is a bundler marker; outside one it is nothing. */
const EMPTY_MODULE = "data:text/javascript,export{}"

/**
 * NEXT'S OWN SUBPATHS, which only a bundler can resolve.
 *
 * `next/link` and `next/navigation` are not files you can import from Node —
 * they resolve through export conditions the framework's compiler sets. A
 * suite that renders a component does not need Next; it needs those two
 * modules to exist and behave, which is all these do.
 *
 * `next/link` becomes the anchor it renders. `usePathname` reads a global the
 * suite sets, so a test can render the same component "on" different routes
 * without a router.
 *
 * Written to disk rather than handed back as a `data:` URL: a data module
 * cannot resolve a bare specifier, and the Link stub has to import React.
 * They land in the compile output, which already has node_modules linked.
 */
const NEXT_STUB_SOURCE = {
  "next/link": `import { createElement } from "react"
export default function Link({ href, children, ...rest }) {
  return createElement("a", { href, ...rest }, children)
}

export const useLinkStatus = () => ({ pending: false })
`,
  /**
   * Enough of next/headers that a module importing lib/supabase/server loads.
   * A suite that reached for a real cookie would get an empty jar and fail
   * loudly, which is correct: there is no request here to read one from.
   */
  "next/headers": `const held = () => globalThis.__PUSH_TEST_NEXT_HEADERS__
export const cookies = async () => (held() ? held().cookies() : {
  getAll: () => [],
  get: () => undefined,
  set() {},
})
export const headers = async () => (held() ? held().headers() : new Map())
export const draftMode = async () => ({ isEnabled: false })
`,
  /**
   * next/cache: a cached function is the function, and revalidation has
   * nothing to revalidate. lib/seo/sitemaps wraps its reads in
   * unstable_cache, and its pure helpers are what the suites test.
   *
   * A suite that is ABOUT the cache (tests/perf-speed18.test.ts: one site's
   * cached page never holds another's, a publish purges its own) sets
   * globalThis.__PUSH_TEST_NEXT_CACHE__ to a cache kept the way Next keeps
   * it (scripts/speed18/shims/next-cache.ts), and every call goes there.
   * Unset, nothing changes for anybody else. next/headers above has the
   * same hook (__PUSH_TEST_NEXT_HEADERS__), for a suite whose visits carry
   * their own cookies.
   */
  "next/cache": `const held = () => globalThis.__PUSH_TEST_NEXT_CACHE__
export const unstable_cache = (fn, keys, options) => (held() ? held().unstable_cache(fn, keys, options) : fn)
export const revalidatePath = (...a) => held()?.revalidatePath(...a)
export const revalidateTag = (...a) => held()?.revalidateTag(...a)
export const updateTag = (...a) => held()?.updateTag?.(...a)
export const unstable_noStore = () => {}
`,
  /**
   * next/server: enough for a module that builds responses or schedules work
   * after the answer to load. `after` drops its task: there is no response
   * here to run it after, and a suite that needs the task runs it itself
   * (tests/_journey sets globalThis.__PUSH_TEST_AFTER__ to collect them and
   * runs each once the route has answered, as Next does).
   */
  "next/server": `class NextURL extends URL {
  clone() { return new NextURL(this.href) }
}
/* A cookie jar over headers, as Next's RequestCookies and ResponseCookies read and write them: enough for proxy.ts. */
const jar = (read) => ({
  get(name) {
    for (const part of (read() ?? "").split(";")) {
      const at = part.indexOf("=")
      if (at > 0 && part.slice(0, at).trim() === name) return { name, value: decodeURIComponent(part.slice(at + 1).trim()) }
    }
    return undefined
  },
  has(name) { return this.get(name) !== undefined },
  getAll() { return (read() ?? "").split(";").map((p) => p.trim()).filter(Boolean).map((p) => ({ name: p.split("=")[0], value: p.slice(p.indexOf("=") + 1) })) },
})
export class NextResponse extends Response {
  static json(body, init) {
    const headers = new Headers(init?.headers)
    if (!headers.has("content-type")) headers.set("content-type", "application/json")
    return new NextResponse(JSON.stringify(body), { ...init, headers })
  }
  static redirect(url, init) {
    const status = typeof init === "number" ? init : init?.status ?? 307
    return new NextResponse(null, { status, headers: { location: String(url) } })
  }
  static next() { return new NextResponse(null) }
  /* A rewrite as Next writes it for the server: the address in x-middleware-rewrite, and the request's headers, when given, as overrides. */
  static rewrite(url, init) {
    const r = new NextResponse(null)
    r.headers.set("x-middleware-rewrite", String(url))
    const sent = init?.request?.headers
    if (sent) {
      const names = []
      for (const [k, v] of new Headers(sent).entries()) {
        names.push(k)
        r.headers.set("x-middleware-request-" + k, v)
      }
      r.headers.set("x-middleware-override-headers", names.join(","))
    }
    return r
  }
  get cookies() {
    const headers = this.headers
    return {
      set(name, value, opts) {
        const o = typeof name === "object" ? name : { name, value, ...(opts ?? {}) }
        const parts = [o.name + "=" + encodeURIComponent(o.value ?? "")]
        if (o.path) parts.push("Path=" + o.path)
        if (o.maxAge !== undefined) parts.push("Max-Age=" + o.maxAge)
        if (o.sameSite) parts.push("SameSite=" + o.sameSite)
        if (o.secure) parts.push("Secure")
        if (o.httpOnly) parts.push("HttpOnly")
        headers.append("set-cookie", parts.join("; "))
      },
      delete(name) { headers.append("set-cookie", name + "=; Path=/; Max-Age=0") },
      get() { return undefined },
      getAll() { return [] },
    }
  }
}
export class NextRequest extends Request {
  get nextUrl() { return (this._nextUrl ??= new NextURL(this.url)) }
  get cookies() { return jar(() => this.headers.get("cookie")) }
}
export const after = (task) => globalThis.__PUSH_TEST_AFTER__?.(task)
`,
  /**
   * next/image, next/dynamic and next/script, so a suite can import a page
   * whose components use them (tests/perf-speed18.test.ts imports Explore's
   * to read what its server half hands the grid). Nothing is drawn: an image
   * is the img it renders, a dynamic component draws nothing, a script tag
   * runs nothing.
   */
  "next/image": `import { createElement } from "react"
export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest })
}
export const getImageProps = () => ({ props: {} })
`,
  "next/dynamic": `export default function dynamic() {
  return function Nothing() { return null }
}
`,
  "next/script": `export default function Script() { return null }
`,
  "next/navigation": `export const usePathname = () => globalThis.__PUSH_TEST_PATHNAME__ ?? "/"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => globalThis.__PUSH_TEST_PARAMS__ ?? {}
export const redirect = (url) => { globalThis.__PUSH_TEST_REDIRECTS__?.push(String(url)) }
export const notFound = () => {}
export const permanentRedirect = () => {}
export const RedirectType = { push: "push", replace: "replace" }
`,
}

function nextStub(specifier) {
  if (!OUT) return null
  const dir = join(OUT, "__next-stubs__")
  const file = join(dir, `${specifier.split("/")[1]}.mjs`)
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, NEXT_STUB_SOURCE[specifier])
  }
  return pathToFileURL(file).href
}

const EXTENSIONS = [".js", ".mjs", ".cjs"]

/** The first of `p`, `p.js`, `p/index.js` that is on disk. */
function existingFile(path) {
  // A bare path that names a directory is a barrel import (`lib/x` for
  // `lib/x/index.ts`), not a file: fall through to the index lookup below,
  // or Node reads the directory and dies with EISDIR.
  if (existsSync(path) && !path.endsWith("/") && statSync(path).isFile()) return path
  for (const ext of EXTENSIONS) if (existsSync(path + ext)) return path + ext
  for (const ext of EXTENSIONS) if (existsSync(join(path, `index${ext}`))) return join(path, `index${ext}`)
  return null
}

/**
 * JSON, without the import attribute Node now insists on.
 *
 * lib/website-builder/section-schemas.ts imports forty-nine section schemas as
 * JSON — `import faq from "…/faq.json"` — which a bundler handles and Node 22
 * refuses without `with { type: "json" }`. Adding that attribute to the
 * production module to satisfy a test runner would be the tail wagging the
 * dog, and it is the kind of syntax that breaks a build for reasons nobody
 * remembers a year later.
 *
 * Handing the file back as a module with a default export is exactly what a
 * bundler does with it, so the code under test sees precisely what it sees in
 * production — and the workaround stays inside the harness, where it belongs.
 */
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = readFileSync(new URL(url), "utf8")
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${source};`,
    }
  }
  return nextLoad(url, context)
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true }
  /* A stylesheet a component imports for its side effect (components/onepage/themes/theme-skin-scene.tsx): the bundler injects it; a suite under Node only needs the import to resolve. */
  if (/\.css(\?.*)?$/.test(specifier)) return { url: EMPTY_MODULE, shortCircuit: true }
  if (specifier in NEXT_STUB_SOURCE) {
    const stub = nextStub(specifier)
    if (stub) return { url: stub, shortCircuit: true }
  }

  /**
   * A `?query` suffix is the standard way to ask Node for a FRESH instance of
   * a module — which a test needs when the module reads an environment
   * variable once, at construction. It has to come off before the path is
   * looked up on disk and go back on the resolved URL, or the second import
   * returns the cached first one and the test silently checks nothing.
   */
  const query = specifier.includes("?") ? specifier.slice(specifier.indexOf("?")) : ""
  const bare = query ? specifier.slice(0, specifier.indexOf("?")) : specifier

  // The project's own alias. tsc resolves `@/…` for type checking and then
  // emits it untouched, so Node would look for a package called "@/lib".
  if (bare.startsWith("@/") && OUT) {
    const found = existingFile(join(OUT, bare.slice(2)))
    if (found) return { url: pathToFileURL(found).href + query, shortCircuit: true }
  }

  // A relative .json import resolves straight to the file; `existingFile`
  // would find it too, but only because it exists — being explicit keeps a
  // future extension guess from turning `x.json` into `x.json.js`.
  if (bare.startsWith(".") && bare.endsWith(".json") && context.parentURL?.startsWith("file:")) {
    const candidate = new URL(bare, new URL(".", context.parentURL))
    if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
  }

  // Extensionless relative imports, which is how tsc emits them.
  if (bare.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = new URL(".", context.parentURL)
    const candidate = new URL(bare, parentDir)
    /* The file's own path, not the URL's: a route folder such as [token] is percent encoded in a URL's pathname. */
    const found = existingFile(fileURLToPath(candidate))
    if (found) return { url: pathToFileURL(found).href + query, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
