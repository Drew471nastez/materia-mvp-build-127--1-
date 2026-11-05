/**
 * ===========================================================================
 *  A REQUEST THAT ENDS (lib/net/request.ts), AGAINST A SERVER THAT MISBEHAVES
 * ===========================================================================
 * A real HTTP server on this machine, and Node's own fetch, the same API the
 * browser has. Each case is a way production goes wrong: an answer that
 * never comes, headers then a body that stalls (a dropped phone connection),
 * a 500, a 401, a closed port, the caller leaving. Each must END, in its own
 * time, and say which of those it was. And what /admin/performance is told.
 */
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FAIL_COPY, WAIT_MS, failMessage, fetchWithDeadline, requestJson, settleWithin } from "@/lib/net/request"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

/* What the perf collector would have been handed (lib/perf/mark.ts queues onto window.__slPerf). */
const queued: unknown[][] = []
;(globalThis as Record<string, unknown>).window = { __slPerf: Object.assign([], { take: (i: unknown[]) => void queued.push(i) }) }
;(globalThis as Record<string, unknown>).location = { pathname: "/app/settings" }

function serve(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x")
    switch (u.pathname) {
      case "/ok":
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({ hello: "there" }))
      case "/never":
        return /* no answer at all */
      case "/stall-body":
        res.writeHead(200, { "content-type": "application/json" })
        return res.write('{"half": ')
      case "/500":
        res.writeHead(500, { "content-type": "application/json" })
        return res.end(JSON.stringify({ error: "boom_code" }))
      case "/401":
        res.writeHead(401, { "content-type": "application/json" })
        return res.end(JSON.stringify({ error: "sign_in" }))
      case "/422":
        res.writeHead(422, { "content-type": "application/json" })
        return res.end(JSON.stringify({ error: "That name is taken." }))
      case "/html":
        res.writeHead(502, { "content-type": "text/html" })
        return res.end("<html>Bad gateway</html>")
      case "/slow":
        return setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" })
          res.end("{}")
        }, 300)
    }
    res.writeHead(404)
    res.end()
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })))
}

async function timed<T>(p: Promise<T>): Promise<[T, number]> {
  const t = performance.now()
  const v = await p
  return [v, performance.now() - t]
}

async function main() {
  const { server, base } = await serve()

  out("\nAn answer")
  {
    const [r] = await timed(requestJson<{ hello: string }>(`${base}/ok`))
    check("ok, with its JSON", r.ok && r.status === 200 && r.data.hello === "there" && r.kind === undefined, r)
  }

  out("\nNo answer at all: ends at its deadline, as a timeout")
  {
    const [r, ms] = await timed(requestJson(`${base}/never`, { timeoutMs: 400 }))
    check("ends", r.ok === false && r.status === 0 && r.kind === "timeout", r)
    check(`at the deadline (${ms.toFixed(0)}ms for 400ms)`, ms >= 380 && ms < 1500, ms)
    check("and says so in words a person can act on", failMessage(r) === FAIL_COPY.timeout)
  }

  out("\nHeaders, then a body that stalls (a dropped phone connection)")
  {
    const [r, ms] = await timed(requestJson(`${base}/stall-body`, { timeoutMs: 400 }))
    check("the body is under the same deadline: ends as a timeout", r.ok === false && r.kind === "timeout", r)
    check(`in time (${ms.toFixed(0)}ms)`, ms < 1500, ms)
  }

  out("\nThe server's own answers are answers")
  {
    const r500 = await requestJson(`${base}/500`)
    check("500 is server, and a bare code is not shown to anybody", r500.kind === "server" && failMessage(r500) === FAIL_COPY.server, { r500, msg: failMessage(r500) })
    const r401 = await requestJson(`${base}/401`)
    check("401 is auth", r401.kind === "auth" && r401.status === 401)
    const r422 = await requestJson(`${base}/422`)
    check("a refusal keeps the server's own sentence", r422.kind === "refused" && failMessage(r422) === "That name is taken.")
    const html = await requestJson(`${base}/html`)
    check("an HTML error page is a server error with no words of its own", html.kind === "server" && html.status === 502 && failMessage(html) === FAIL_COPY.server)
  }

  out("\nNobody listening")
  {
    const closed = await serve()
    const at = closed.base
    await new Promise((r) => closed.server.close(r))
    const [r, ms] = await timed(requestJson(`${at}/ok`, { timeoutMs: 5_000 }))
    check("a closed port is network, at once, not a wait for the deadline", r.kind === "network" && ms < 2_000, { r, ms })
  }

  out("\nThe caller leaving")
  {
    const ctl = new AbortController()
    setTimeout(() => ctl.abort(), 100)
    let threw = ""
    try {
      await requestJson(`${base}/never`, { signal: ctl.signal, timeoutMs: 5_000 })
    } catch (e) {
      threw = (e as Error).name
    }
    check("throws the caller's abort, as fetch does, so a stale request is dropped rather than shown", threw === "AbortError", threw)
  }

  out("\nfetchWithDeadline: the Response itself, body included")
  {
    let kind = ""
    const [, ms] = await timed(
      fetchWithDeadline(`${base}/stall-body`, {}, 400)
        .then((r) => r.json())
        .catch((e) => (kind = (e as Error).name)),
    )
    check("a stalled body is given up on", kind !== "" && ms < 1500, { kind, ms })
    const ok = await fetchWithDeadline(`${base}/ok`, {}, 2_000).then((r) => r.json())
    check("an answer is read as usual", (ok as { hello?: string }).hello === "there")
  }

  out("\nsettleWithin: what a page would like but must not wait for")
  {
    const [v, ms] = await timed(settleWithin(new Promise<string>(() => {}), 200, "ordinary"))
    check("a promise that never settles gives the fallback at the deadline", v === "ordinary" && ms < 600, { v, ms })
    check("a rejection gives the fallback", (await settleWithin(Promise.reject(new Error("x")), 1_000, "ordinary")) === "ordinary")
    check("an answer in time is the answer", (await settleWithin(Promise.resolve("mine"), 1_000, "ordinary")) === "mine")
  }

  out("\nWhat /admin/performance was told")
  {
    queued.length = 0
    await requestJson(`${base}/ok`)
    await requestJson(`${base}/never`, { timeoutMs: 150 })
    await requestJson(`${base}/500`)
    await requestJson(`${base}/422`)
    check("an answer is a step under the page's area", queued.some((q) => q[0] === "step" && q[1] === "/step/net/app"), queued)
    check("a timeout is a fail with the code timeout", queued.some((q) => q[0] === "fail" && q[1] === "/step/net/app" && q[3] === "timeout"), queued)
    check("a 500 is a fail with the code server", queued.some((q) => q[0] === "fail" && q[3] === "server"), queued)
    check("a refusal is not a failure of the request: counted as a step", queued.filter((q) => q[0] === "fail").length === 2, queued)
    check("nothing about the address or the answer goes with it", queued.every((q) => !JSON.stringify(q).includes("127.0.0.1")), queued)
  }

  out("\nThe deadlines and where they are used")
  {
    check("a read gives up before a write, a write before a payment", WAIT_MS.read < WAIT_MS.write && WAIT_MS.write < WAIT_MS.pay)
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
    check("the settings panels' api() goes through it", /requestJson<Record<string, unknown>>\(path,/.test(read("components/physical/ui.tsx")))
    check("the community screens' api() goes through it", /requestJson<Record<string, unknown>>\(url,/.test(read("components/community/member/api.ts")))
    const checkout = read("app/(storelib)/checkout/checkout-client.tsx")
    check("checkout's calls go through it, with the payment deadline", /requestJson<T & \{ error\?: string; field\?: string \}>\(url, \{ method: "POST", json: body, timeoutMs: WAIT_MS\.pay \}\)/.test(checkout))
    check("a card confirm with no answer asks the server what the payment did, never says nothing was charged",
      /* Changed on purpose (rel-commerce): a 5xx or "unknown" is treated as no answer too, the intent is kept for the next press, and the words are the checking ones (lib/checkout/confirm-outcome). */
      /"\/api\/checkout\/confirm-payment", \{ paymentIntentId: held\.paymentIntentId, clientSecret: held\.clientSecret \}/.test(checkout) && /if \(confirmOutcomeUnknown\(confirmed\)\) \{/.test(checkout) && /throw new Error\(confirmed\?\.data\.status === "unknown" \? confirmed\.data\.error \|\| CHECKING_MESSAGE : CHECKING_MESSAGE\)/.test(checkout))
    check("Pay is released when Back restores the page from the browser's cache", /useBackFromCache\(\(\) => setBusy\(false\)\)/.test(checkout))
  }

  server.closeAllConnections?.()
  server.close()
  out(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) out(`  - ${f}`); process.exit(1) }
  process.exit(0)
}
main()
