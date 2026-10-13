/**
 * "Translate with AI": a press drafts its batches side by side, stops
 * starting new ones at its deadline, and keeps what came back when one batch
 * fails. Against a real HTTP server standing in for the model, answering each
 * batch after a delay, so the timings are the code's and not a guess.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const DELAY_MS = 1_500
let open = 0
let mostAtOnce = 0
let calls = 0

function answer(req: IncomingMessage, res: ServerResponse) {
  let raw = ""
  req.on("data", (c) => { raw += c })
  req.on("end", () => {
    calls++
    open++
    mostAtOnce = Math.max(mostAtOnce, open)
    setTimeout(() => {
      open--
      const body = JSON.parse(raw) as { input: { content: { text: string }[] }[] }
      const items = (JSON.parse(body.input[0].content[0].text) as { items: { key: string; text: string }[] }).items
      if (items.some((i) => i.key.startsWith("fail"))) {
        res.writeHead(400, { "content-type": "application/json" })
        return res.end(JSON.stringify({ error: { message: "bad batch", type: "invalid_request_error" } }))
      }
      const text = JSON.stringify({ translations: items.map((i) => ({ key: i.key, text: `DE ${i.text}` })) })
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({
        id: `resp_${calls}`, object: "response", created_at: 0, status: "completed", model: "test",
        output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
      }))
    }, DELAY_MS)
  })
}

const items = (n: number, prefix = "k") => Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i}`, source: `Text ${i}` }))

async function main() {
  const server = createServer(answer)
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  process.env.OPENAI_API_KEY = "test-key"
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  const { draftTranslations } = await import("../lib/markets/translate-ai")

  console.log("\nA press of 160 texts (four batches)")
  let t = Date.now()
  const all = await draftTranslations(items(160), "en", "de", "Shop", { deadlineAt: Date.now() + 85_000 })
  const took = Date.now() - t
  check("every text comes back drafted", all.drafts.size === 160 && all.drafts.get("k7") === "DE Text 7", `${all.drafts.size} drafted`)
  check("in about one batch's time, not four", took < DELAY_MS * 2, `${took}ms for four batches of ${DELAY_MS}ms`)
  check("four at once", mostAtOnce === 4, `${mostAtOnce} at once`)

  console.log("\nEight batches, still at most four at a time")
  mostAtOnce = 0
  t = Date.now()
  const many = await draftTranslations(items(320), "en", "de", "Shop", { deadlineAt: Date.now() + 85_000 })
  check("all 320 drafted", many.drafts.size === 320)
  check("never more than four calls open", mostAtOnce === 4, `${mostAtOnce}`)
  check("two rounds of four", Date.now() - t < DELAY_MS * 3, `${Date.now() - t}ms`)

  console.log("\nOne batch fails")
  const mixed = [...items(40, "fail"), ...items(80)]
  const some = await draftTranslations(mixed, "en", "de", "Shop", { deadlineAt: Date.now() + 85_000 })
  check("the other batches are kept", some.drafts.size === 80 && some.drafts.has("k0") && !some.drafts.has("fail0"), `${some.drafts.size} drafted`)
  check("and the press is not called unavailable", some.unavailable === false)

  console.log("\nNo time left")
  calls = 0
  t = Date.now()
  const late = await draftTranslations(items(80), "en", "de", "Shop", { deadlineAt: Date.now() + 5_000 })
  check("no batch starts past the deadline", calls === 0 && late.drafts.size === 0 && Date.now() - t < 500, `${calls} calls`)
  check("and it is not an outage, so the rest is left for the next press", late.unavailable === false)

  server.close()

  console.log("\nThe route and the sheet")
  const route = read("app/api/store/translations/draft/route.ts")
  check("the route hands the press its deadline, inside its own limit", /deadlineAt: started \+ DRAFT_WINDOW_MS/.test(route) && /const DRAFT_WINDOW_MS = 85_000/.test(route) && /export const maxDuration = 120/.test(route))
  check("one whole Translate everything fits in the hour", /limit: 12, seconds: 3600/.test(route))
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("the sheet waits for the press, not the 25s a save gets", /timeoutMs: DRAFT_WAIT_MS/.test(sheet) && /const DRAFT_WAIT_MS = 125_000/.test(sheet))
  check("and cannot press twice", /disabled=\{!!busy\} data-translate-ai/.test(sheet))
  const texts = read("lib/markets/server.ts")
  check("the texts' independent reads start together", /const menusRead = storeMenusOrNull/.test(texts) && /await productsRead/.test(texts) && /await collectionsRead/.test(texts))
  check("and beside the languages in the sheet's read", /const textsRead = asked && /.test(read("app/api/store/translations/route.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
