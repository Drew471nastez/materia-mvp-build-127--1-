/**
 * next/headers, next/navigation and next/server for the speed harness: what
 * a route reads of its request comes from the visit it runs in
 * (../context.ts), and notFound() or a redirect throws, as in Next, so a
 * route stops where it would stop in production.
 */
import { current } from "../context"

export const cookies = async () => {
  const jar = current()?.cookies ?? new Map<string, string>()
  return {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    has: (name: string) => jar.has(name),
    set() {},
    delete() {},
  }
}

export const headers = async () => {
  const h = current()?.headers ?? new Map<string, string>()
  return new Headers([...h.entries()])
}

export const draftMode = async () => ({ isEnabled: false })

export class NavigationStop extends Error {
  constructor(public kind: string, public to?: string) {
    super(`${kind}${to ? ` ${to}` : ""}`)
  }
}

export const notFound = (): never => {
  throw new NavigationStop("not-found")
}
export const redirect = (to: string): never => {
  throw new NavigationStop("redirect", to)
}
export const permanentRedirect = (to: string): never => {
  throw new NavigationStop("permanent-redirect", to)
}
export const forbidden = (): never => {
  throw new NavigationStop("forbidden")
}
export const unauthorized = (): never => {
  throw new NavigationStop("unauthorized")
}
export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const RedirectType = { push: "push", replace: "replace" }

/* next/server */
export const after = (task: (() => unknown) | Promise<unknown>) => {
  const state = current()
  const run = typeof task === "function" ? task : () => task
  if (state) state.after.push(run)
  else void run()
}
export const connection = async () => {}
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers)
    if (!headers.has("content-type")) headers.set("content-type", "application/json")
    return new NextResponse(JSON.stringify(body), { ...init, headers })
  }
  static redirect(url: string | URL, init?: number | ResponseInit) {
    const status = typeof init === "number" ? init : init?.status ?? 307
    return new NextResponse(null, { status, headers: { location: String(url) } })
  }
  static next() {
    return new NextResponse(null)
  }
  static rewrite(url: string | URL) {
    return new NextResponse(null, { headers: { "x-rewrite": String(url) } })
  }
}
export class NextRequest extends Request {}
