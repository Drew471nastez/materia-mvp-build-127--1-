/**
 * ===========================================================================
 *  A SESSION TOKEN CHECKED WITHOUT SUPABASE AUTH, AND NEVER A FORGED ONE
 * ===========================================================================
 * Round rel3-auth. The project signs with the legacy shared secret (HS256,
 * an empty JWKS), so the claims fallback in lib/auth/current-user.ts never
 * worked in production. lib/auth/verify-token.ts checks HS256 with
 * SUPABASE_JWT_SECRET and ES256 with the JWKS, then exp, nbf, iss, aud,
 * role and sub. This drives it with real HMAC and ECDSA signatures.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createHmac } from "node:crypto"
import { verifyAccessToken, canVerifyLocally, forgetSigningKeys, userFromClaims, JWT_SECRET_ENV } from "@/lib/auth/verify-token"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

const URL_ = "https://abcd.supabase.co"
const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
const b64url = (b: ArrayBuffer | Uint8Array | string) => Buffer.from(typeof b === "string" ? b : b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")
const now = () => Math.floor(Date.now() / 1000)

function hs256(payload: Record<string, unknown>, secret = SECRET, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }) {
  const h = b64url(JSON.stringify(header))
  const p = b64url(JSON.stringify(payload))
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`
}

const claims = (over: Record<string, unknown> = {}) => ({ sub: "u1", aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: now() + 3600, iat: now(), email: "a@example.test", ...over })

async function main() {
  const calls: string[] = []
  globalThis.fetch = (async (u: string | URL) => { calls.push(String(u)); return new Response(JSON.stringify({ keys: [] }), { status: 200 }) }) as typeof fetch

  console.log("\nNo secret set: nothing is verified here, so callers ask Supabase Auth as before")
  delete process.env[JWT_SECRET_ENV]
  check("a good HS256 token is not a yes without the secret", (await verifyAccessToken(hs256(claims()), URL_)) === null)
  check("canVerifyLocally is false on an empty JWKS and no secret", (await canVerifyLocally(URL_)) === false)

  console.log("\nThe secret set")
  process.env[JWT_SECRET_ENV] = SECRET
  forgetSigningKeys()
  const good = await verifyAccessToken(hs256(claims()), URL_)
  check("a good token: its claims", good?.sub === "u1" && good?.email === "a@example.test")
  check("canVerifyLocally", await canVerifyLocally(URL_))
  check("userFromClaims: the id and email, nothing invented", (() => { const u = userFromClaims(good!); return u.id === "u1" && u.email === "a@example.test" && u.created_at === "" })())

  const refused: Array<[string, string]> = [
    ["signed with another secret", hs256(claims(), "another-secret-of-enough-length-0123456789")],
    ["claims altered after signing", (() => { const [h, , s] = hs256(claims()).split("."); return `${h}.${b64url(JSON.stringify(claims({ sub: "someone-else" })))}.${s}` })()],
    ["expired", hs256(claims({ exp: now() - 120 }))],
    ["no exp", hs256(claims({ exp: undefined }))],
    ["not yet valid (nbf)", hs256(claims({ nbf: now() + 600 }))],
    ["another project's issuer", hs256(claims({ iss: "https://other.supabase.co/auth/v1" }))],
    ["audience not authenticated", hs256(claims({ aud: "anon" }))],
    ["the anon key's role", hs256(claims({ role: "anon" }))],
    ["the service role", hs256(claims({ role: "service_role" }))],
    ["no sub", hs256(claims({ sub: "" }))],
    ["alg none", (() => { const t = hs256(claims(), SECRET, { alg: "none", typ: "JWT" }).split("."); return `${t[0]}.${t[1]}.` })()],
    ["alg HS512 header", hs256(claims(), SECRET, { alg: "HS512", typ: "JWT" })],
    ["garbage", "a.b.c"],
    ["two parts", "a.b"],
  ]
  for (const [label, token] of refused) check(`refused: ${label}`, (await verifyAccessToken(token, URL_)) === null)
  check("a token 10s past exp passes within the 30s skew", (await verifyAccessToken(hs256(claims({ exp: now() - 10 })), URL_)) !== null)
  check("a secret shorter than 32 characters is ignored", await (async () => { process.env[JWT_SECRET_ENV] = "short"; forgetSigningKeys(); const r = await verifyAccessToken(hs256(claims(), "short"), URL_); process.env[JWT_SECRET_ENV] = SECRET; forgetSigningKeys(); return r === null })())

  console.log("\nAsymmetric keys (after the owner migrates): no secret needed")
  delete process.env[JWT_SECRET_ENV]
  forgetSigningKeys()
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  const kid = "k1"
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "ES256" }
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as typeof fetch
  const es = async (payload: Record<string, unknown>, key = pair.privateKey) => {
    const h = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }))
    const p = b64url(JSON.stringify(payload))
    return `${h}.${p}.${b64url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${h}.${p}`)))}`
  }
  check("a good ES256 token", (await verifyAccessToken(await es(claims()), URL_))?.sub === "u1")
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  check("refused: ES256 signed by another key", (await verifyAccessToken(await es(claims(), other.privateKey), URL_)) === null)
  check("refused: ES256 expired", (await verifyAccessToken(await es(claims({ exp: now() - 120 })), URL_)) === null)
  check("refused: an HS256 token when only public keys exist (no alg confusion)", (await verifyAccessToken(hs256(claims(), JSON.stringify(jwk)), URL_)) === null)

  console.log("\nThe secret stays on the server")
  const root = process.cwd()
  const src = readFileSync(join(root, "lib/auth/verify-token.ts"), "utf8")
  check("verify-token is a server-only module", /^import "server-only"/m.test(src))
  check("never NEXT_PUBLIC_", !/NEXT_PUBLIC_SUPABASE_JWT|NEXT_PUBLIC_JWT/.test(src))
  check("never logs", !/console\.(log|warn|error|info)/.test(src))
  const clientImporters: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) {
        const text = readFileSync(p, "utf8")
        if (/^\s*["']use client["']/.test(text) && /verify-token|SUPABASE_JWT_SECRET/.test(text)) clientImporters.push(p)
      }
    }
  }
  for (const d of ["app", "components", "lib", "hooks"]) { try { walk(join(root, d)) } catch {} }
  check("no 'use client' file imports it or names the secret", clientImporters.length === 0, clientImporters)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
}
main()
