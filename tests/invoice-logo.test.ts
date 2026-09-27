/**
 * ===========================================================================
 *  THE ORDER INVOICE CARRIES ITS MARK, AND IS MADE WITHOUT ONE (app/api/invoice)
 * ===========================================================================
 * "[Invoice] Logo fetch/convert failed: Error: Cannot find module 'sharp'":
 * the route turned an SVG into a PNG with `sharp`, which is not a dependency
 * of this project and so not in the function. Since d19ff6b3 the mark is a
 * PNG that pdfkit draws as it is (lib/brand/logo STORELIB_LOGO_PNG since the
 * new logo), and nothing here asks for sharp.
 *
 * The real route handler runs here, with the database, the session and
 * Stripe as stand-ins and pdfkit real: once with the mark served, once with
 * it missing, once with something that is not a PNG. Each is a PDF, and only
 * the first has a picture in it.
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import { STORELIB_LOGO_PNG } from "@/lib/brand/logo"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

const ORDER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const USER = "66666666-6666-4666-8666-666666666666"

const S: any = ((globalThis as any).__invoiceStubs = { admin: null, user: { id: USER } })
const dir = mkdtempSync(join(tmpdir(), "invoice-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__invoiceStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__invoiceStubs.user }, error: null }) } })\n`),
  "@/lib/stripe": stub("stripe", `export const stripe = { paymentIntents: { retrieve: async () => ({ metadata: {} }) } }\n`),
  "@/lib/orders/owned": stub(
    "owned",
    `export const ownedOrderLines = async (_a, creatorId, orderId) => creatorId === "${CREATOR}" && orderId === "${ORDER}" ? [{
  id: "${ORDER}", product_id: "p1", status: "paid", created_at: "2026-09-20T10:00:00Z", amount_cents: 2900, tip_cents: 0, fee_cents: 0,
  buyer_email: "buyer@example.com", buyer_first_name: "Ana", buyer_last_name: "Pop", receipt_token: null, stripe_session_id: "cs_1",
  stripe_payment_intent_id: "pi_1", card_brand: "visa", card_last4: "4242", currency: "usd", product: { title: "Portrait presets" } }] : null
`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundleRoute(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__invoice-route__", "route.mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)], outfile: out, bundle: true, format: "esm", platform: "node", target: "node20",
    logLevel: "error", alias: { "@": process.cwd() }, packages: "external",
    plugins: [{ name: "stand-ins", setup(b) { const names = new Set(Object.keys(stubs)); b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"], loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

const PNG = readFileSync(join(process.cwd(), "public", STORELIB_LOGO_PNG))
const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length

async function main() {
  const url = await bundleRoute("app/api/invoice/route.ts")
  const requests: string[] = []
  let logo: "png" | "missing" | "html" = "png"
  globalThis.fetch = (async (u: URL | string) => {
    requests.push(String(u))
    if (logo === "missing") return new Response("not found", { status: 404 })
    if (logo === "html") return new Response("<html>oops</html>", { status: 200 })
    return new Response(new Uint8Array(PNG), { status: 200, headers: { "Content-Type": "image/png" } })
  }) as typeof fetch
  S.admin = fakeDb({ creators: [{ id: CREATOR, user_id: USER, username: "astrid", support_email: "help@astrid.test" }], profiles: [{ id: USER, display_name: "Astrid Studio" }] })

  const ask = async (v: string) => {
    /* A module instance each, so the mark kept by one is not the next one's. */
    const route = (await import(`${url}?${v}`)) as any
    const res: Response = await route.GET(new Request(`https://storelib.com/api/invoice?orderId=${ORDER}&tz=Europe/Bucharest`))
    return { res, pdf: Buffer.from(await res.arrayBuffer()) }
  }

  console.log("\nWith the mark")
  {
    const { res, pdf } = await ask("png")
    check("200, a PDF", res.status === 200 && res.headers.get("content-type") === "application/pdf" && pdf.subarray(0, 5).toString() === "%PDF-", res.status)
    check("the mark was fetched from the site, as a PNG", requests.some((r) => r.endsWith(STORELIB_LOGO_PNG)), requests)
    /* Two image objects for one mark: the picture and its transparency (the PNG is RGBA). */
    check("and drawn: the PDF holds the picture", images(pdf) >= 1, images(pdf))
  }

  console.log("\nWithout it")
  for (const [v, what] of [["missing", "the mark is not there (404)"], ["html", "the answer is not a PNG"]] as const) {
    logo = v
    const { res, pdf } = await ask(v)
    check(`${what}: still 200, a PDF`, res.status === 200 && pdf.subarray(0, 5).toString() === "%PDF-", res.status)
    check(`${what}: with no picture in it`, images(pdf) === 0, images(pdf))
  }

  console.log("\nNothing asks for sharp")
  {
    const route = readFileSync(join(process.cwd(), "app/api/invoice/route.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    check("the route does not import it", !/["']sharp["']/.test(route))
    const bundled = readFileSync(new URL(url), "utf8")
    check("and neither does anything it bundles", !/(import|require)\(\s*["']sharp["']\s*\)|from\s*["']sharp["']/.test(bundled))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
}
main()
