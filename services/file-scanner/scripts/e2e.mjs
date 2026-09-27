/**
 * End to end check against a running scanner (local Docker or production):
 *
 *   SCANNER_URL=http://localhost:8080 CLAMAV_SERVICE_SECRET=... node scripts/e2e.mjs
 *
 * Health, a wrong secret, a clean file, the EICAR test file, and a 50 MB
 * random file for speed. Exits 1 if anything is not what it should be.
 */
import { randomBytes } from "node:crypto"

const base = (process.env.SCANNER_URL || "http://localhost:8080").replace(/\/+$/, "")
const secret = process.env.CLAMAV_SERVICE_SECRET || ""
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("")
let failed = 0

function check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`)
  if (!ok) failed++
}

async function scan(body, auth = secret) {
  const t0 = Date.now()
  const res = await fetch(`${base}/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/octet-stream" },
    body,
  })
  return { status: res.status, body: await res.json(), ms: Date.now() - t0 }
}

const health = await fetch(`${base}/health`)
const h = await health.json()
check("health is 200", health.status === 200, JSON.stringify(h))

const wrong = await scan("hello", "not-the-secret")
check("wrong secret is 401", wrong.status === 401)

const clean = await scan("Storelib says hello. This is a clean file.")
check("clean file is clean", clean.status === 200 && clean.body.status === "clean", JSON.stringify(clean.body))

const eicar = await scan(EICAR)
check("EICAR is infected", eicar.status === 200 && eicar.body.status === "infected", JSON.stringify(eicar.body))

const big = randomBytes(50 * 1024 * 1024)
const large = await scan(big)
check("50 MB random file is clean", large.status === 200 && large.body.status === "clean", `${large.ms} ms, scan ${large.body.durationMs} ms`)

process.exit(failed ? 1 : 0)
