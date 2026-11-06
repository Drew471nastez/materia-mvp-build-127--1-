/** Exercise the actual endpoint, replacing only auth, rate limits and remote IO. */
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
const root = process.cwd(),
  dir = mkdtempSync(join(root, ".onepage-link-route-"))
try {
  const outfile = join(dir, "route.cjs")
  await build({
    entryPoints: [join(root, "app/api/onepage/link-preview/route.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": root },
    plugins: [
      {
        name: "boundaries",
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({
            path: "empty",
            namespace: "fixture",
          }))
          b.onResolve(
            {
              filter:
                /^@\/lib\/(auth\/route-user|api\/rate-limit|api\/public-fetch)$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          )
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents:
              path === "empty"
                ? ""
                : path.endsWith("route-user")
                  ? `export const routeUser=async()=>globalThis.__previewWho;export const authUnavailableResponse=()=>new Response('{}',{status:503})`
                  : path.endsWith("rate-limit")
                    ? `export const rateLimit=async()=>globalThis.__previewLimited;export const addressSubject=()=>"fixture"`
                    : `export {publicUrlProblem} from ${JSON.stringify(join(root, "lib/api/public-fetch.ts"))};export const fetchPublic=async(url,options)=>{globalThis.__previewCalls.push({url,options});if(globalThis.__previewFail)throw Error('timeout');return globalThis.__previewResponse}`,
            loader: "ts",
            resolveDir: root,
          }))
        },
      },
    ],
  })
  const { GET } = createRequire(import.meta.url)(outfile)
  const request = (url) =>
    new Request(
      "https://storelib.com/api/onepage/link-preview?url=" +
        encodeURIComponent(url),
    )
  globalThis.__previewCalls = []
  globalThis.__previewWho = { kind: "anonymous" }
  assert.equal((await GET(request("https://example.com/a"))).status, 401)
  globalThis.__previewWho = { kind: "unavailable" }
  assert.equal((await GET(request("https://example.com/a"))).status, 503)
  globalThis.__previewWho = { kind: "user", user: { id: "owner" } }
  for (const url of [
    "http://localhost/a",
    "http://169.254.169.254/latest",
    "file:///etc/passwd",
    "https://example.com/" + "x".repeat(2100),
  ])
    assert.equal((await GET(request(url))).status, 400)
  assert.equal(globalThis.__previewCalls.length, 0)
  globalThis.__previewLimited = new Response("{}", { status: 429 })
  assert.equal((await GET(request("https://example.com/a"))).status, 429)
  globalThis.__previewLimited = null
  globalThis.__previewResponse = new Response(
    '<title>Plan</title><meta property="og:image" content="cover.jpg">',
    { headers: { "content-type": "text/html" } },
  )
  Object.defineProperty(globalThis.__previewResponse, "url", {
    value: "https://example.com/final/page",
  })
  const response = await GET(request("https://example.com/old"))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(
    (await response.json()).image,
    "https://example.com/final/cover.jpg",
  )
  assert.equal(globalThis.__previewCalls[0].options.maxBytes, 524288)
  assert.equal((await GET(request("https://example.com/old"))).status, 200)
  assert.equal(
    globalThis.__previewCalls.length,
    1,
    "Cached metadata avoids repeated remote fetches",
  )
  globalThis.__previewResponse = new Response("{}", {
    headers: { "content-type": "application/json" },
  })
  assert.equal((await GET(request("https://example.com/json"))).status, 422)
  globalThis.__previewFail = true
  assert.equal((await GET(request("https://example.com/timeout"))).status, 422)
  console.log(
    "Link preview endpoint passed: auth, outage, rate limits, private URLs, bounded fetch, redirects, cache and failures",
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
