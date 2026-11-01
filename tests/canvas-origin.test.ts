/**
 * ===========================================================================
 *  THE CANVAS ON A SITE OF ITS OWN (lib/website-builder/canvas-origin.ts)
 * ===========================================================================
 * Off by default (NEXT_PUBLIC_CANVAS_ORIGIN unset). When on, the builder's
 * canvas frame loads a shell from storelib.me (another site, so Chrome gives
 * it a process of its own) and the page is drawn inside it, still sandboxed
 * with no origin. Pinned here without a browser:
 *
 *   A. the setting: only a bare http(s) origin turns it on
 *   B. the route's answer: 404 off, on another host, without the install's
 *      draft pass, for an editor that is not the builder; framed only by the
 *      one editor origin
 *   C. the OnePage host sends /__canvas/<uuid> to the route, GET only
 *   D. the shell: hears the editor only from its parent at the exact origin,
 *      draws the page in a frame with no origin, answers the editor's exact
 *      origin only
 *   E. the page and the editor: exact targets in this mode, unchanged srcdoc
 *      behaviour otherwise
 *
 * The browser half (an out-of-process frame, the page drawn, a pick heard,
 * draft assets with the pass): scripts/check-canvas-site-r3.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-canvas-origin"
delete process.env.NEXT_PUBLIC_CANVAS_ORIGIN

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail !== undefined ? `   ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  if (!ok) failed++
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ID = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

async function main() {
  const { canvasOriginFrom, CANVAS_ORIGIN, canvasFrameUrl } = await import("@/lib/website-builder/canvas-origin")
  const { canvasFrameAnswer, editorOrigins } = await import("@/lib/website-builder/canvas-frame")
  const { draftAssetPass } = await import("@/lib/website-builder/draft-asset-pass")
  const { onePageRoute } = await import("@/lib/onepage/host-route")
  const { canvasShellHtml, withShellOrigin, CANVAS_PAGE_SANDBOX } = await import("@/lib/storelib-theme/compat/canvas-shell")

  console.log("\nA. The setting")
  check("off by default", CANVAS_ORIGIN === null)
  check("a bare https origin turns it on", canvasOriginFrom("https://storelib.me") === "https://storelib.me" && canvasOriginFrom(" https://storelib.me/ ") === "https://storelib.me")
  check("http (a developer's mapped host) is taken as given", canvasOriginFrom("http://storelib.me:3000") === "http://storelib.me:3000")
  check("anything else leaves it off", [undefined, "", "storelib.me", "ftp://storelib.me", "https://storelib.me/x", "https://a:b@storelib.me", "https://storelib.me?x=1", "javascript:alert(1)"].every((v) => canvasOriginFrom(v) === null))
  check("the frame address carries the install, the pass and the editor", canvasFrameUrl("https://storelib.me", ID, "P".repeat(32), "https://storelib.com") === `https://storelib.me/__canvas/${ID}?pass=${"P".repeat(32)}&editor=https%3A%2F%2Fstorelib.com`)

  console.log("\nB. The route's answer")
  const pass = draftAssetPass(ID)
  const prod = { NODE_ENV: "production", NEXT_PUBLIC_MAIN_DOMAIN: "storelib.com" }
  const ask = (over: Partial<{ host: string | null; installId: string; pass: string | null; editor: string | null }>, env: Record<string, string | undefined> = prod, origin: string | null = "https://storelib.me") =>
    canvasFrameAnswer({ host: "storelib.me", installId: ID, pass, editor: "https://storelib.com", ...over }, env, origin)
  check("off: 404 whatever is asked", ask({}, prod, null).status === 404)
  const ok = ask({})
  check("on, from the builder, with the pass: the shell", ok.status === 200 && /^<!doctype html>/.test(ok.body), ok.status)
  check("  framed only by that editor origin", ok.headers["Content-Security-Policy"] === "frame-ancestors https://storelib.com")
  check("  nothing else in its policy (the page inside inherits it)", !/script-src|default-src|style-src/.test(ok.headers["Content-Security-Policy"]))
  check("  never in a shared cache, never indexed, the pass never in a referrer", ok.headers["Cache-Control"].startsWith("private") && /noindex/.test(ok.headers["X-Robots-Tag"]) && ok.headers["Referrer-Policy"] === "strict-origin")
  check("  holds nothing of the store", !ok.body.includes(ID) && !ok.body.includes(pass))
  check("on storelib.com (the route reached directly): 404", ask({ host: "storelib.com" }).status === 404 && ask({ host: null }).status === 404)
  check("on a look-alike host: 404", ask({ host: "storelib.me.evil.com" }).status === 404 && ask({ host: "www.storelib.me" }).status === 404)
  check("no pass: 404", ask({ pass: null }).status === 404 && ask({ pass: "" }).status === 404)
  check("another install's pass: 404", ask({ pass: draftAssetPass(OTHER) }).status === 404)
  check("not an install id: 404", ask({ installId: "../etc" }).status === 404)
  check("an editor that is not the builder: 404", ["https://evil.com", "https://storelib.com.evil.com", "https://x.vercel.app", "https://storelib.me", "null", "http://localhost:3000"].every((e) => ask({ editor: e }).status === 404))
  check("www and the app's own address are the builder", ask({ editor: "https://www.storelib.com" }).status === 200 && ask({ editor: "https://app.example.com" }, { ...prod, NEXT_PUBLIC_APP_URL: "https://app.example.com" }).status === 200)
  check("a preview's own address only, never any vercel.app", editorOrigins({ ...prod, VERCEL_URL: "storelib-abc.vercel.app" }).includes("https://storelib-abc.vercel.app") && ask({ editor: "https://other.vercel.app" }, { ...prod, VERCEL_URL: "storelib-abc.vercel.app" }).status === 404)
  check("localhost outside production only", ask({ editor: "http://localhost:3000", host: "storelib.me:3000" }, { NODE_ENV: "development" }, "http://storelib.me:3000").status === 200 && ask({ editor: "http://localhost:3000", host: "storelib.me:3000" }, prod, "http://storelib.me:3000").status === 404)
  const routeSrc = read("app/api/website-builder/canvas-frame/[installId]/route.ts")
  check("the route answers only through canvasFrameAnswer, with the request's own Host", /canvasFrameAnswer\(\{ host: request\.headers\.get\("host"\)/.test(routeSrc) && !/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc))
  const { GET } = await import("@/app/api/website-builder/canvas-frame/[installId]/route")
  const { NextRequest } = await import("next/server")
  const res = await GET(new NextRequest(`https://storelib.me/api/website-builder/canvas-frame/${ID}?pass=${pass}&editor=https%3A%2F%2Fstorelib.com`, { headers: { host: "storelib.me" } }), { params: Promise.resolve({ installId: ID }) })
  check("the route itself, with the setting unset: 404", res.status === 404, res.status)

  console.log("\nC. The OnePage host")
  const route = (host: string, pathname: string, method = "GET", search = "") => onePageRoute({ host, pathname, search, method, mainDomain: "storelib.com" })
  const r = route("storelib.me", `/__canvas/${ID}`, "GET", "?pass=x&editor=y")
  check("storelib.me/__canvas/<uuid> goes to the route, query and all", r?.kind === "rewrite" && r.path === `/api/website-builder/canvas-frame/${ID}?pass=x&editor=y`, r)
  check("  HEAD too", route("storelib.me", `/__canvas/${ID}`, "HEAD")?.kind === "rewrite")
  check("  never another method", route("storelib.me", `/__canvas/${ID}`, "POST")?.kind === "not-found")
  check("  never anything but an install id", ["/__canvas/x", `/__canvas/${ID}/more`, "/__canvas/", "/__canvas"].every((p) => route("storelib.me", p)?.kind === "not-found"))
  check("  the route's own path stays a 404 on storelib.me", route("storelib.me", `/api/website-builder/canvas-frame/${ID}`)?.kind === "not-found")
  check("  storelib.com is untouched", route("storelib.com", `/__canvas/${ID}`) === null)

  console.log("\nD. The shell")
  const EDITOR = "https://storelib.com"
  const html = canvasShellHtml(EDITOR)
  const script = html.slice(html.indexOf("<body><script>") + 14, html.lastIndexOf("</script></body>"))
  type Msg = { data: unknown; target: string }
  const toParent: Msg[] = []
  const toInner: Msg[] = []
  const listeners: ((e: { source: unknown; origin: string; data: unknown }) => void)[] = []
  const created: Record<string, unknown>[] = []
  const innerWin = { postMessage: (data: unknown, target: string) => toInner.push({ data, target }) }
  const parentWin = { postMessage: (data: unknown, target: string) => toParent.push({ data, target }) }
  const head: unknown[] = []
  const ctx = {
    location: { origin: "https://storelib.me" },
    parent: parentWin,
    URL,
    JSON,
    addEventListener: (t: string, f: (e: { source: unknown; origin: string; data: unknown }) => void) => { if (t === "message") listeners.push(f) },
    document: {
      head: { appendChild: (el: unknown) => head.push(el) },
      body: { appendChild: () => {} },
      createElement: (tag: string) => {
        const attrs: Record<string, string> = {}
        const el: Record<string, unknown> = { tag, attrs, setAttribute: (k: string, v: string) => { attrs[k] = v }, addEventListener: () => {}, contentWindow: innerWin }
        created.push(el)
        return el
      },
    },
  }
  vm.runInNewContext(script, ctx)
  const send = (source: unknown, origin: string, data: unknown) => listeners.forEach((f) => f({ source, origin, data }))
  check("it says it is ready, to the editor's exact origin", toParent.length === 1 && toParent[0].target === EDITOR && (toParent[0].data as { type?: string }).type === "shell-ready")
  send(parentWin, "https://evil.com", { storelib: 1, type: "doc", html: "<html><head></head><body>x</body></html>" })
  check("a page from another origin is not drawn", created.length === 0)
  send({}, EDITOR, { storelib: 1, type: "doc", html: "<html><head></head><body>x</body></html>" })
  check("nor one from a window that is not its parent", created.length === 0)
  send(parentWin, EDITOR, { storelib: 1, type: "doc", html: "<!doctype html><html><head><title>t</title></head><body>x</body></html>", base: "https://evil.com/x" })
  const frame = created.find((e) => e.tag === "iframe") as { attrs: Record<string, string>; srcdoc?: string } | undefined
  check("the editor's page is drawn in a frame", !!frame && typeof frame.srcdoc === "string")
  check("  sandboxed as the canvas always was: scripts, never an origin", frame?.attrs.sandbox === CANVAS_PAGE_SANDBOX && !/allow-same-origin/.test(CANVAS_PAGE_SANDBOX) && !/allow-top-navigation/.test(CANVAS_PAGE_SANDBOX))
  check("  told to answer this shell's origin only, first in its head", /^<!doctype html><html><head><script>window\.__slTo=window\.__slFrom="https:\/\/storelib\.me";<\/script><title>/.test(frame?.srcdoc ?? ""), frame?.srcdoc)
  check("  a base on another origin is not taken", head.length === 0)
  send(parentWin, EDITOR, { storelib: 1, type: "doc", html: "<html><head></head><body>again</body></html>" })
  check("  one page per frame: a second is ignored", created.filter((e) => e.tag === "iframe").length === 1)
  send(parentWin, EDITOR, { storelib: 1, type: "select", id: "a" })
  check("the editor's messages reach the page", toInner.length === 1 && (toInner[0].data as { type?: string }).type === "select")
  send(parentWin, "https://evil.com", { storelib: 1, type: "select", id: "b" })
  check("  never another origin's", toInner.length === 1)
  send(innerWin, "null", { storelib: 1, type: "pick", sectionId: "a" })
  check("the page's messages reach the editor, at its exact origin", toParent.length === 2 && toParent[1].target === EDITOR && (toParent[1].data as { type?: string }).type === "pick")
  send({}, "null", { storelib: 1, type: "pick", sectionId: "b" })
  check("  never another window's", toParent.length === 2)
  check("withShellOrigin keeps a page with no head valid", withShellOrigin("<p>x</p>", "https://storelib.me").startsWith("<script>window.__slTo="))
  check("the shell's own script cannot close early", (html.match(/<\/script>/g) ?? []).length === 1)

  console.log("\nE. The page and the editor")
  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  const network = read("lib/storelib-theme/compat/canvas-network.ts")
  check("the page posts to the shell's origin in this mode, to its parent as before otherwise", !/parent\.postMessage\([^)]*,\s*"\*"\)/.test(bridge + network) && (bridge.match(/window\.__slTo \|\| "\*"|window\.__slTo\|\|"\*"/g) ?? []).length === 3 && /typeof __slTo==="string"\?__slTo:"\*"/.test(network))
  check("the page hears only the shell's origin in this mode", (bridge.match(/if \(window\.__slFrom && e\.origin !== window\.__slFrom\) return;/g) ?? []).length === 2 && /if\(typeof __slFrom==="string"&&e\.origin!==__slFrom\)return;/.test(network))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the editor never posts to a canvas frame with a bare \"*\"", !/postMessage\([^\n]*"\*"\)/.test(canvas.replace(/win\.postMessage\(message, relayed\.get\(win\) \?\? "\*"\)/, "")))
  check("  a frame on the canvas origin is sent to that origin exactly", /win\.postMessage\(message, relayed\.get\(win\) \?\? "\*"\)/.test(canvas) && /relayed\.set\(el\.contentWindow, CANVAS_ORIGIN\)/.test(canvas))
  check("  and heard only from it", /if \(!heardFrom\(e\.source, e\.origin\)\) return/.test(canvas) && /if \(origin === undefined \|\| e\.origin !== origin\) return/.test(canvas))
  check("  the srcdoc frame is unchanged when the setting is off", /\{\.\.\.\(relay \? \{ src: relay \} : \{ srcDoc: slot\.html \}\)\}/.test(canvas) && /sandbox=\{relay \? "allow-scripts allow-same-origin allow-forms allow-popups" : "allow-scripts allow-forms allow-popups"\}/.test(canvas))
  check("  a shell frame is made only with the setting and the install's pass", /CANVAS_ORIGIN && pass && typeof window !== "undefined" \? canvasFrameUrl\(CANVAS_ORIGIN, installId, pass, window\.location\.origin\) : null/.test(canvas))
}

main().then(
  () => {
    console.log(failed ? `\n${failed} failed` : "\nall passed")
    process.exit(failed ? 1 : 0)
  },
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
